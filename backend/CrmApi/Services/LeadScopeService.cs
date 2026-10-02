using CrmApi.Data;
using CrmApi.Models;
using Microsoft.EntityFrameworkCore;

namespace CrmApi.Services;

/// <summary>
/// Applies per-user data scope to lead queries. A user only sees leads whose
/// City / Area / PropertyType fall inside the sets assigned to them. Scope is
/// per-USER (not per-role) and applies to every NON-ADMIN role. The Admin role
/// is exempt: it administers the other users, and a static scope list would
/// hide any city added after seeding.
///
///   - No scope set at all (all three dimensions empty) -> sees NOTHING
///     (empty = blocked), so an unconfigured user is locked out.
///   - Otherwise each dimension that HAS assignments narrows the results
///     (City AND Area AND Type); a dimension left empty is simply not
///     restricted. So "city = Indore" alone shows every Indore lead, and
///     adding an area/type narrows within that.
/// </summary>
public interface ILeadScopeService
{
    Task<IQueryable<Lead>> ApplyAsync(IQueryable<Lead> query, int userId, int roleId);
}

public class LeadScopeService(CrmDbContext db) : ILeadScopeService
{
    public async Task<IQueryable<Lead>> ApplyAsync(IQueryable<Lead> query, int userId, int roleId)
    {
        // Admin sees everything, always.
        var isAdmin = await db.Roles.AsNoTracking()
            .AnyAsync(r => r.RoleId == roleId && r.RoleName == "Admin");
        if (isAdmin) return query;

        var cities = await db.UserCities.AsNoTracking()
            .Where(x => x.UserId == userId).Select(x => x.City).ToListAsync();
        var areaIds = await db.UserAreas.AsNoTracking()
            .Where(x => x.UserId == userId).Select(x => x.AreaId).ToListAsync();
        var types = await db.UserPropertyTypes.AsNoTracking()
            .Where(x => x.UserId == userId).Select(x => x.PropertyType).ToListAsync();

        // No scope configured at all -> blocked entirely.
        if (cities.Count == 0 && areaIds.Count == 0 && types.Count == 0)
            return query.Where(_ => false);

        // Each dimension that HAS assignments narrows the results. A lead whose
        // value for that dimension is NULL (e.g. no area recorded) isn't blocked by
        // it - only leads that HAVE a value the user wasn't granted are excluded.
        // So assigning cities restricts by city, and leads without an area still
        // show as long as their city/type are allowed.
        if (cities.Count > 0)
            query = query.Where(l => l.City == null || cities.Contains(l.City));
        if (areaIds.Count > 0)
            query = query.Where(l => l.AreaId == null || areaIds.Contains(l.AreaId.Value));
        if (types.Count > 0)
            query = query.Where(l => l.PropertyType == null || types.Contains(l.PropertyType));

        return query;
    }
}
