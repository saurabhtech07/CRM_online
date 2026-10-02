using Microsoft.EntityFrameworkCore;

namespace CrmApi.Data;

/// <summary>
/// A correct BCrypt hash can only be produced by the BCrypt library itself, so the SQL
/// seed script stores the sentinel below instead of a real hash. On startup we swap any
/// sentinel for a freshly computed hash of the documented default password.
/// Real user passwords are never touched.
/// </summary>
public static class PasswordSeeder
{
    public const string DefaultPassword = "123";

    /// <summary>Marker written by 03_SeedData.sql - never a valid BCrypt hash.</summary>
    public const string Sentinel = "SEED_DEFAULT_PASSWORD";

    public static async Task EnsureSeedPasswordsAsync(CrmDbContext db, ILogger logger)
    {
        var pending = await db.Users
            .Where(u => u.PasswordHash == Sentinel || u.PasswordHash == "")
            .ToListAsync();

        if (pending.Count == 0) return;

        foreach (var user in pending)
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(DefaultPassword);
            user.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
        logger.LogWarning(
            "Set {Count} seeded user password(s) to the default '{Password}'. Change them before production use.",
            pending.Count, DefaultPassword);
    }
}
