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
if (string.IsNullOrWhiteSpace(jwt.Key) || jwt.Key.Length < 32)
    throw new InvalidOperationException(
        "Jwt signing key is missing or too short (need >= 32 characters). " +
        "Set it on the host as an environment variable:  Jwt__Key=\"<32+ random chars>\" " +
        "Do NOT commit it to appsettings*.json - this repository is public. " +
        "Generate one with:  openssl rand -base64 48");

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
var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
if (corsOrigins.Length == 0)
    corsOrigins = ["http://localhost:3100", "http://127.0.0.1:3100", "http://localhost:3000"];

builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p => p
    .WithOrigins(corsOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

/* ---------- Give seeded users a usable password ---------- */
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CrmDbContext>();
    if (await db.Database.CanConnectAsync())
        await PasswordSeeder.EnsureSeedPasswordsAsync(db, app.Logger);
    else
        app.Logger.LogError("Cannot reach the database. Check ConnectionStrings:Default.");
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
        corsOrigins,
        environment = app.Environment.EnvironmentName,
        timeUtc = DateTime.UtcNow
    });
});

app.Run();
