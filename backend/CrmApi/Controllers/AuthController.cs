using CrmApi.Data;
using CrmApi.Models.Dtos;
using CrmApi.Security;
using CrmApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrmApi.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(CrmDbContext db, ITokenService tokens) : ControllerBase
{
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest req)
    {
        var user = await db.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Username == req.Username || u.Email == req.Username);

        // Same message either way so the endpoint can't be used to enumerate usernames.
        if (user is null || !VerifyPassword(req.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid username or password." });

        if (!user.IsActive)
            return Unauthorized(new { message = "This account has been deactivated. Contact your administrator." });

        user.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var (token, expiresAt) = tokens.Create(user);

        return Ok(new LoginResponse
        {
            Token = token,
            ExpiresAt = expiresAt,
            User = await BuildAuthUser(user.UserId)
        });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<AuthUserDto>> Me()
    {
        var dto = await BuildAuthUser(User.GetUserId());
        return dto is null ? Unauthorized() : Ok(dto);
    }

    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest req)
    {
        var user = await db.Users.FindAsync(User.GetUserId());
        if (user is null) return Unauthorized();

        if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
            return BadRequest(new { message = "Current password is incorrect." });

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { message = "Password changed successfully." });
    }

    /// <summary>
    /// BCrypt.Verify throws on a malformed stored hash (e.g. the seed sentinel before
    /// PasswordSeeder has run). Treat that as a failed login rather than a 500.
    /// </summary>
    private static bool VerifyPassword(string password, string storedHash)
    {
        try
        {
            return BCrypt.Net.BCrypt.Verify(password, storedHash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }

    private async Task<AuthUserDto> BuildAuthUser(int userId)
    {
        var user = await db.Users.Include(u => u.Role).AsNoTracking()
            .FirstAsync(u => u.UserId == userId);

        // Menu + capabilities come from the user's own permissions, not their role.
        var perms = await db.UserPermissions
            .Include(p => p.Module)
            .Where(p => p.UserId == user.UserId)
            .AsNoTracking()
            .OrderBy(p => p.Module!.SortOrder)
            .Select(p => new ModulePermissionDto
            {
                ModuleId = p.ModuleId,
                ModuleKey = p.Module!.ModuleKey,
                ModuleName = p.Module.ModuleName,
                SortOrder = p.Module.SortOrder,
                CanView = p.CanView,
                CanCreate = p.CanCreate,
                CanEdit = p.CanEdit,
                CanDelete = p.CanDelete,
                CanExport = p.CanExport
            })
            .ToListAsync();

        return new AuthUserDto
        {
            UserId = user.UserId,
            FullName = user.FullName,
            Username = user.Username,
            Email = user.Email,
            RoleId = user.RoleId,
            RoleName = user.Role?.RoleName ?? "",
            Permissions = perms
        };
    }
}
