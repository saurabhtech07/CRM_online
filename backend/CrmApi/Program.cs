using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using CrmApi.Data;
using CrmApi.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

/* ---------- Database ---------- */
builder.Services.AddDbContext<CrmDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

/* ---------- JWT ---------- */
var jwt = builder.Configuration.GetSection("Jwt").Get<JwtSettings>() ?? new JwtSettings();

// Preferred source is the Jwt__Key environment variable (or Jwt:Key in
// appsettings). If neither is usable, fall back to a key file next to the app
// so a self-hosted deploy is not blocked, generating one on first run.
//
// The fallback is safe on its own terms: the key is random, is written outside
// the source tree, is git-ignored, and persists across restarts so sessions
// are not invalidated. It is NOT as good as an operator-supplied secret, so it
// is logged loudly whenever it is the thing that saved the boot.
var jwtKeySource = "Jwt__Key environment variable / appsettings Jwt:Key";
var jwtKeyIsFallback = false;

if (string.IsNullOrWhiteSpace(jwt.Key) || jwt.Key.Length < 32)
{
    var keyFile = Path.Combine(AppContext.BaseDirectory, "jwt.key");

    if (File.Exists(keyFile))
    {
        jwt.Key = File.ReadAllText(keyFile).Trim();
        jwtKeySource = keyFile;
        jwtKeyIsFallback = true;
    }

    if (string.IsNullOrWhiteSpace(jwt.Key) || jwt.Key.Length < 32)
    {
        jwt.Key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        try
        {
            File.WriteAllText(keyFile, jwt.Key);
            jwtKeySource = $"generated on first start and saved to {keyFile}";
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                "No JWT signing key is configured and jwt.key could not be created in '" +
                AppContext.BaseDirectory + "'. Either grant write access to that folder, or set the " +
                "Jwt__Key environment variable to at least 32 characters. Underlying error: " + ex.Message,
                ex);
        }
        jwtKeyIsFallback = true;
    }
}

builder.Services.AddSingleton(jwt);
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddScoped<ILeadScopeService, LeadScopeService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization();

/* ---------- MVC + JSON ---------- */
builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

// Turn model-validation failures into the same { message } shape the UI shows in alerts.
builder.Services.Configure<ApiBehaviorOptions>(o =>
{
    o.InvalidModelStateResponseFactory = ctx =>
    {
        var msg = ctx.ModelState
            .Where(kv => kv.Value?.Errors.Count > 0)
            .SelectMany(kv => kv.Value!.Errors.Select(e => e.ErrorMessage))
            .FirstOrDefault() ?? "The submitted data is not valid.";
        return new BadRequestObjectResult(new { message = msg });
    };
});

builder.Services.AddEndpointsApiExplorer();

/* ---------- CORS ---------- */
// Origins come from Cors:Origins, which on a deploy host is set through
// Cors__Origins__0, Cors__Origins__1, ... Falling back to localhost keeps
// `dotnet run` working with no configuration at all.
const string CorsPolicy = "CrmFrontend";
var corsOrigins = (builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    // A blank entry (e.g. Cors__Origins__0 left empty) matches nothing useful,
    // so drop it rather than passing "" to WithOrigins.
    .Where(o => !string.IsNullOrWhiteSpace(o))
    // Browsers send the origin without a trailing slash, so "https://x.com/"
    // would never match and CORS would fail for a reason that is invisible.
    .Select(o => o.Trim().TrimEnd('/'))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();
if (corsOrigins.Length == 0)
    corsOrigins = ["http://localhost:3100", "http://127.0.0.1:3100", "http://localhost:3000"];

builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p => p
    .WithOrigins(corsOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

// Make it obvious when the app saved itself with a generated key instead of an
// operator-supplied one. A second instance would generate a different key and
// tokens would not validate across them.
if (jwtKeyIsFallback)
    app.Logger.LogWarning(
        "JWT signing key came from {Source}, not from Jwt__Key. That is fine for a single " +
        "instance, but a load-balanced deployment must set Jwt__Key so every instance shares one key. " +
        "Back up 'jwt.key'; deleting it logs every user out.",
        jwtKeySource);

/* ---------- Give seeded users a usable password ---------- */
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();

    // Bounded so an unreachable database cannot hold the process in "starting"
    // for the length of the SQL connect timeout. IIS serves 500.30 when the app
    // does not come up in time, and a stalled first request looks identical to a
    // crash. The seeder is retried on the next start once the database is back.
    using var startupTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(
        builder.Configuration.GetValue("Database:StartupCheckTimeoutSeconds", 5)));

    try
    {
        if (await db.Database.CanConnectAsync(startupTimeout.Token))
            await PasswordSeeder.EnsureSeedPasswordsAsync(db, app.Logger);
        else
            app.Logger.LogError("Cannot reach the database. Check ConnectionStrings:Default.");
    }
    catch (OperationCanceledException)
    {
        app.Logger.LogError(
            "Database did not respond within {Seconds}s. Starting anyway so the API can answer " +
            "requests; queries will fail until ConnectionStrings:Default is correct and reachable.",
            builder.Configuration.GetValue("Database:StartupCheckTimeoutSeconds", 5));
    }
}

/* ---------- Global error handler -> consistent { message } ---------- */
app.UseExceptionHandler(errApp => errApp.Run(async ctx =>
{
    var ex = ctx.Features.Get<IExceptionHandlerFeature>()?.Error;
    app.Logger.LogError(ex, "Unhandled exception on {Path}", ctx.Request.Path);

    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
    ctx.Response.ContentType = "application/json";
    await ctx.Response.WriteAsJsonAsync(new
    {
        message = app.Environment.IsDevelopment()
            ? ex?.Message ?? "Unexpected server error."
            : "Something went wrong. Please try again."
    });
}));

// TLS handling is opt-in via Http:ForceHttps. It defaults to OFF on purpose:
// when a reverse proxy terminates TLS and forwards plain HTTP to this process,
// a forced redirect bounces the request back out to the proxy and can loop.
// Only turn it on when this app terminates TLS itself.
var forceHttps = builder.Configuration.GetValue("Http:ForceHttps", false);
if (!app.Environment.IsDevelopment() && forceHttps)
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

// Loud warning for the two mistakes that make a deploy look "broken" while the
// process is actually healthy.
if (!app.Environment.IsDevelopment())
{
    if (corsOrigins.Any(o => o.Contains("localhost", StringComparison.OrdinalIgnoreCase)
                          || o.Contains("127.0.0.1", StringComparison.OrdinalIgnoreCase)))
        app.Logger.LogWarning(
            "CORS is still limited to localhost origins {Origins}. A deployed frontend on a real " +
            "domain will be blocked. Set Cors__Origins__0=https://your-frontend-domain.com on the host.",
            corsOrigins);

    if (string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString("Default")))
        app.Logger.LogError(
            "ConnectionStrings:Default is empty. Set ConnectionStrings__Default on the host, " +
            "otherwise every query will fail.");
}

app.UseCors(CorsPolicy);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Unauthenticated by design so a load balancer / deploy check can verify the
// process is up. Reports config health only - never echoes any secret value.
app.MapGet("/api/health", async (CrmDbContext db) =>
{
    var canConnect = await db.Database.CanConnectAsync();
    return Results.Ok(new
    {
        status = canConnect ? "healthy" : "degraded",
        database = canConnect ? "connected" : "unreachable",
        // Booting at all proves the JWT key is present and >= 32 chars.
        jwtKeyConfigured = !string.IsNullOrWhiteSpace(jwt.Key) && jwt.Key.Length >= 32,
        // True when the key was generated into jwt.key rather than supplied via
        // Jwt__Key. Deliberately reports a boolean, not the file path, so the
        // unauthenticated endpoint does not disclose the server's layout.
        jwtKeyIsGeneratedFallback = jwtKeyIsFallback,
        corsOrigins,
        environment = app.Environment.EnvironmentName,
        timeUtc = DateTime.UtcNow
    });
});

app.Run();
