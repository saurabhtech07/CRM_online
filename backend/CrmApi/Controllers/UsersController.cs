using CrmApi.Data;
using CrmApi.Models;
using CrmApi.Models.Dtos;
using CrmApi.Security;
using CrmApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrmApi.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController(CrmDbContext db) : ControllerBase
{
    [HttpGet]
    [RequirePermission("users", PermAction.View)]
    public async Task<ActionResult<PagedResult<UserDto>>> Search(
        [FromQuery] string? search = null,
        [FromQuery] int? roleId = null,
        [FromQuery] bool? isActive = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = db.Users.AsNoTracking().Include(u => u.Role).AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(u => u.FullName.Contains(s) || u.Username.Contains(s)
                          || u.Email.Contains(s) || (u.Phone != null && u.Phone.Contains(s)));
        }
        if (roleId.HasValue) q = q.Where(u => u.RoleId == roleId);
        if (isActive.HasValue) q = q.Where(u => u.IsActive == isActive);

        var total = await q.CountAsync();
        var items = await q.OrderBy(u => u.FullName)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(u => MapUser(u)).ToListAsync();

        return Ok(new PagedResult<UserDto> { Items = items, Page = page, PageSize = pageSize, TotalCount = total });
    }

    [HttpGet("{id:int}")]
    [RequirePermission("users", PermAction.View)]
    public async Task<ActionResult<UserDto>> GetById(int id)
    {
        if (!await db.Users.AnyAsync(u => u.UserId == id))
            return NotFound(new { message = $"User {id} was not found." });
        return Ok(await LoadUserDtoAsync(id));
    }

    [HttpPost]
    [RequirePermission("users", PermAction.Create)]
    public async Task<ActionResult<UserDto>> Create(CreateUserRequest req)
    {
        if (await db.Users.AnyAsync(u => u.Username == req.Username))
            return Conflict(new { message = $"Username '{req.Username}' is already taken." });
        if (await db.Users.AnyAsync(u => u.Email == req.Email))
            return Conflict(new { message = $"Email '{req.Email}' is already registered." });
        if (!await db.Roles.AnyAsync(r => r.RoleId == req.RoleId))
            return BadRequest(new { message = "The selected role does not exist." });

        var user = new User
        {
            FullName = req.FullName.Trim(),
            Email = req.Email.Trim(),
            Username = req.Username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Phone = req.Phone,
            RoleId = req.RoleId,
            IsActive = req.IsActive,
            CreatedAt = DateTime.UtcNow
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        await SaveScopeAsync(user.UserId, req.Cities, req.AreaIds, req.PropertyTypes, req.AgentUserIds);

        // Seed the new user's module authority from the chosen role's defaults.
        // It can then be tuned per-user in the Users & Authority pane.
        var roleDefaults = await db.RolePermissions.AsNoTracking()
            .Where(p => p.RoleId == req.RoleId).ToListAsync();
        foreach (var rp in roleDefaults)
            db.UserPermissions.Add(new UserPermission
            {
                UserId = user.UserId, ModuleId = rp.ModuleId,
                CanView = rp.CanView, CanCreate = rp.CanCreate, CanEdit = rp.CanEdit,
                CanDelete = rp.CanDelete, CanExport = rp.CanExport
            });
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = user.UserId }, await LoadUserDtoAsync(user.UserId));
    }

    [HttpPut("{id:int}")]
    [RequirePermission("users", PermAction.Edit)]
    public async Task<ActionResult<UserDto>> Update(int id, UpdateUserRequest req)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound(new { message = $"User {id} was not found." });

        if (await db.Users.AnyAsync(u => u.Email == req.Email && u.UserId != id))
            return Conflict(new { message = $"Email '{req.Email}' is already registered to another user." });
        if (!await db.Roles.AnyAsync(r => r.RoleId == req.RoleId))
            return BadRequest(new { message = "The selected role does not exist." });

        // Don't let an admin lock themselves out of the system.
        if (user.UserId == User.GetUserId() && !req.IsActive)
            return BadRequest(new { message = "You cannot deactivate your own account." });

        user.FullName = req.FullName.Trim();
        user.Email = req.Email.Trim();
        user.Phone = req.Phone;
        user.RoleId = req.RoleId;
        user.IsActive = req.IsActive;
        user.UpdatedAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(req.NewPassword))
        {
            if (req.NewPassword.Length < 6)
                return BadRequest(new { message = "Password must be at least 6 characters." });
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        }

        await db.SaveChangesAsync();

        // Data scope is managed by the /permissions endpoint (Users & Authority
        // pane), so the basic-details update leaves it untouched.
        return Ok(await LoadUserDtoAsync(id));
    }

    /// <summary>Rewrite a user's data scope (cities / areas / property types).</summary>
    [HttpPut("{id:int}/scope")]
    [RequirePermission("users", PermAction.Edit)]
    public async Task<IActionResult> SaveScope(int id, SaveUserScopeRequest req)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound(new { message = $"User {id} was not found." });

        await SaveScopeAsync(id, req.Cities, req.AreaIds, req.PropertyTypes, req.AgentUserIds);
        return Ok(new { message = $"Data access for {user.FullName} saved." });
    }

    /// <summary>Rewrite a user's whole module-authority matrix (Users & Authority pane).</summary>
    [HttpPut("{id:int}/permissions")]
    [RequirePermission("users", PermAction.Edit)]
    public async Task<IActionResult> SavePermissions(int id, SaveUserPermissionsRequest req)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound(new { message = $"User {id} was not found." });

        db.UserPermissions.RemoveRange(db.UserPermissions.Where(p => p.UserId == id));
        await db.SaveChangesAsync();

        var validModuleIds = await db.Modules.Select(m => m.ModuleId).ToListAsync();
        foreach (var p in req.Permissions.Where(p => validModuleIds.Contains(p.ModuleId)))
            db.UserPermissions.Add(new UserPermission
            {
                UserId = id, ModuleId = p.ModuleId,
                // Any create/edit/delete/export grant is meaningless without view.
                CanView = p.CanView || p.CanCreate || p.CanEdit || p.CanDelete || p.CanExport,
                CanCreate = p.CanCreate, CanEdit = p.CanEdit, CanDelete = p.CanDelete,
                CanExport = p.CanExport
            });
        await db.SaveChangesAsync();

        return Ok(new { message = $"Permissions for {user.FullName} saved." });
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("users", PermAction.Delete)]
    public async Task<IActionResult> Delete(int id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound(new { message = $"User {id} was not found." });

        if (user.UserId == User.GetUserId())
            return BadRequest(new { message = "You cannot delete your own account." });

        // Leads reference users, so deactivate rather than hard delete.
        user.IsActive = false;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { message = $"User '{user.FullName}' has been deactivated." });
    }

    /// <summary>Rewrites a user's data-scope sets (cities / areas / property types / agents).</summary>
    private async Task SaveScopeAsync(int userId, List<string> cities, List<int> areaIds,
                                      List<string> types, List<int> agentIds)
    {
        db.UserCities.RemoveRange(db.UserCities.Where(x => x.UserId == userId));
        db.UserAreas.RemoveRange(db.UserAreas.Where(x => x.UserId == userId));
        db.UserPropertyTypes.RemoveRange(db.UserPropertyTypes.Where(x => x.UserId == userId));
        db.UserAgents.RemoveRange(db.UserAgents.Where(x => x.UserId == userId));
        await db.SaveChangesAsync();

        var validAreaIds = await db.Areas.Select(a => a.AreaId).ToListAsync();
        var validUserIds = await db.Users.Select(u => u.UserId).ToListAsync();

        foreach (var c in cities.Select(c => c.Trim()).Where(c => c.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase))
            db.UserCities.Add(new UserCity { UserId = userId, City = c });

        foreach (var aid in areaIds.Where(validAreaIds.Contains).Distinct())
            db.UserAreas.Add(new UserArea { UserId = userId, AreaId = aid });

        foreach (var t in types.Select(t => t.Trim()).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase))
            db.UserPropertyTypes.Add(new UserPropertyType { UserId = userId, PropertyType = t });

        foreach (var gid in agentIds.Where(validUserIds.Contains).Distinct())
            db.UserAgents.Add(new UserAgent { UserId = userId, AgentUserId = gid });

        await db.SaveChangesAsync();
    }

    private async Task<UserDto> LoadUserDtoAsync(int id)
    {
        var u = await db.Users.AsNoTracking().Include(x => x.Role).FirstAsync(x => x.UserId == id);
        return MapUser(u) with
        {
            Cities = await db.UserCities.AsNoTracking().Where(x => x.UserId == id)
                .Select(x => x.City).OrderBy(c => c).ToListAsync(),
            AreaIds = await db.UserAreas.AsNoTracking().Where(x => x.UserId == id)
                .Select(x => x.AreaId).ToListAsync(),
            PropertyTypes = await db.UserPropertyTypes.AsNoTracking().Where(x => x.UserId == id)
                .Select(x => x.PropertyType).OrderBy(t => t).ToListAsync(),
            AgentUserIds = await db.UserAgents.AsNoTracking().Where(x => x.UserId == id)
                .Select(x => x.AgentUserId).ToListAsync(),
            Permissions = await db.UserPermissions.AsNoTracking().Include(p => p.Module)
                .Where(p => p.UserId == id).OrderBy(p => p.Module!.SortOrder)
                .Select(p => new ModulePermissionDto
                {
                    ModuleId = p.ModuleId, ModuleKey = p.Module!.ModuleKey,
                    ModuleName = p.Module.ModuleName, SortOrder = p.Module.SortOrder,
                    CanView = p.CanView, CanCreate = p.CanCreate, CanEdit = p.CanEdit,
                    CanDelete = p.CanDelete, CanExport = p.CanExport
                }).ToListAsync(),
        };
    }

    private static UserDto MapUser(User u) => new()
    {
        UserId = u.UserId, FullName = u.FullName, Email = u.Email, Username = u.Username,
        Phone = u.Phone, RoleId = u.RoleId, RoleName = u.Role != null ? u.Role.RoleName : "",
        IsActive = u.IsActive, LastLoginAt = u.LastLoginAt, CreatedAt = u.CreatedAt
    };
}

/* ================= Roles & authority matrix ================= */

[ApiController]
[Route("api/roles")]
[Authorize]
public class RolesController(CrmDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<RoleDto>>> GetAll()
    {
        var roles = await db.Roles.AsNoTracking()
            .OrderBy(r => r.RoleId)
            .Select(r => new RoleDto
            {
                RoleId = r.RoleId, RoleName = r.RoleName, Description = r.Description,
                IsSystem = r.IsSystem, IsActive = r.IsActive,
                UserCount = db.Users.Count(u => u.RoleId == r.RoleId),
                Permissions = db.RolePermissions.Where(p => p.RoleId == r.RoleId)
                    .OrderBy(p => p.Module!.SortOrder)
                    .Select(p => new ModulePermissionDto
                    {
                        ModuleId = p.ModuleId, ModuleKey = p.Module!.ModuleKey,
                        ModuleName = p.Module.ModuleName, SortOrder = p.Module.SortOrder,
                        CanView = p.CanView, CanCreate = p.CanCreate,
                        CanEdit = p.CanEdit, CanDelete = p.CanDelete,
                        CanExport = p.CanExport
                    }).ToList()
            }).ToListAsync();

        return Ok(roles);
    }

    [HttpGet("modules")]
    public async Task<ActionResult<List<Module>>> Modules()
        => Ok(await db.Modules.AsNoTracking().OrderBy(m => m.SortOrder).ToListAsync());

    [HttpPost]
    [RequirePermission("users", PermAction.Create)]
    public async Task<ActionResult<RoleDto>> Create(SaveRoleRequest req)
    {
        if (await db.Roles.AnyAsync(r => r.RoleName == req.RoleName))
            return Conflict(new { message = $"A role named '{req.RoleName}' already exists." });

        var role = new Role
        {
            RoleName = req.RoleName.Trim(), Description = req.Description,
            IsActive = req.IsActive, IsSystem = false, CreatedAt = DateTime.UtcNow
        };
        db.Roles.Add(role);
        await db.SaveChangesAsync();

        await SavePermissions(role.RoleId, req.Permissions);
        return Ok(new { message = $"Role '{role.RoleName}' created.", roleId = role.RoleId });
    }

    /// <summary>Update a role and rewrite its whole authority matrix.</summary>
    [HttpPut("{id:int}")]
    [RequirePermission("users", PermAction.Edit)]
    public async Task<IActionResult> Update(int id, SaveRoleRequest req)
    {
        var role = await db.Roles.FindAsync(id);
        if (role is null) return NotFound(new { message = $"Role {id} was not found." });

        if (await db.Roles.AnyAsync(r => r.RoleName == req.RoleName && r.RoleId != id))
            return Conflict(new { message = $"Another role named '{req.RoleName}' already exists." });

        if (!role.IsSystem)
        {
            role.RoleName = req.RoleName.Trim();
            role.IsActive = req.IsActive;
        }
        role.Description = req.Description;
        await db.SaveChangesAsync();

        await SavePermissions(id, req.Permissions);
        return Ok(new { message = $"Permissions for '{role.RoleName}' saved." });
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("users", PermAction.Delete)]
    public async Task<IActionResult> Delete(int id)
    {
        var role = await db.Roles.FindAsync(id);
        if (role is null) return NotFound(new { message = $"Role {id} was not found." });
        if (role.IsSystem) return BadRequest(new { message = $"'{role.RoleName}' is a system role and cannot be deleted." });

        var inUse = await db.Users.CountAsync(u => u.RoleId == id);
        if (inUse > 0)
            return BadRequest(new { message = $"{inUse} user(s) are assigned to this role. Reassign them first." });

        db.Roles.Remove(role);
        await db.SaveChangesAsync();
        return Ok(new { message = $"Role '{role.RoleName}' deleted." });
    }

    private async Task SavePermissions(int roleId, List<PermissionInput> perms)
    {
        var existing = await db.RolePermissions.Where(p => p.RoleId == roleId).ToListAsync();
        db.RolePermissions.RemoveRange(existing);
        await db.SaveChangesAsync();

        var validModuleIds = await db.Modules.Select(m => m.ModuleId).ToListAsync();

        var rows = perms
            .Where(p => validModuleIds.Contains(p.ModuleId))
            .Select(p => new RolePermission
            {
                RoleId = roleId, ModuleId = p.ModuleId,
                // Any create/edit/delete/export grant is meaningless without view.
                CanView = p.CanView || p.CanCreate || p.CanEdit || p.CanDelete || p.CanExport,
                CanCreate = p.CanCreate, CanEdit = p.CanEdit, CanDelete = p.CanDelete,
                CanExport = p.CanExport
            });

        db.RolePermissions.AddRange(rows);
        await db.SaveChangesAsync();
    }
}

/* ================= Lookups for dropdowns ================= */

[ApiController]
[Route("api/lookups")]
[Authorize]
public class LookupsController(CrmDbContext db, ILeadScopeService scope) : ControllerBase
{
    [HttpGet("sources")]
    public async Task<ActionResult<List<LookupDto>>> Sources()
        => Ok(await db.Sources.AsNoTracking().Where(s => s.IsActive)
            .OrderBy(s => s.SourceName)
            .Select(s => new LookupDto { Id = s.SourceId, Name = s.SourceName }).ToListAsync());

    [HttpGet("projects")]
    public async Task<ActionResult<List<LookupDto>>> Projects()
        => Ok(await db.Projects.AsNoTracking().Where(p => p.IsActive)
            .OrderBy(p => p.ProjectName)
            .Select(p => new LookupDto { Id = p.ProjectId, Name = p.ProjectName }).ToListAsync());

    /// <summary>Distinct cities that appear on leads - drives the user-scope city tag box.</summary>
    [HttpGet("cities")]
    public async Task<ActionResult<List<string>>> Cities()
        => Ok(await db.Leads.AsNoTracking()
            .Where(l => l.City != null && l.City != "")
            .Select(l => l.City!).Distinct().OrderBy(c => c).ToListAsync());

    [HttpGet("areas")]
    public async Task<ActionResult<List<LookupDto>>> Areas()
        => Ok(await db.Areas.AsNoTracking().Where(a => a.IsActive)
            .OrderBy(a => a.AreaName)
            .Select(a => new LookupDto { Id = a.AreaId, Name = a.AreaName }).ToListAsync());

    [HttpGet("propertytypes")]
    public async Task<ActionResult<List<LookupDto>>> PropertyTypes()
        => Ok(await db.PropertyTypes.AsNoTracking().Where(p => p.IsActive)
            .OrderBy(p => p.TypeName)
            .Select(p => new LookupDto { Id = p.PropertyTypeId, Name = p.TypeName }).ToListAsync());

    [HttpGet("agents")]
    public async Task<ActionResult<List<LookupDto>>> Agents()
        => Ok(await db.Users.AsNoTracking().Where(u => u.IsActive)
            .OrderBy(u => u.FullName)
            .Select(u => new LookupDto { Id = u.UserId, Name = u.FullName }).ToListAsync());

    /// <summary>
    /// Leads worth visiting - still in the pipeline (New/Contacted/Qualified), so
    /// converted and rejected ones are excluded. Scoped to the caller. Carries a
    /// ready-made purpose ("Site visit for {project/type} - {name}") for the visit form.
    /// </summary>
    [HttpGet("visit-leads")]
    public async Task<ActionResult<List<VisitLeadDto>>> VisitLeads()
    {
        var scoped = await scope.ApplyAsync(
            db.Leads.AsNoTracking().Include(l => l.Project)
                .Where(l => l.IsActive && LeadStatus.Pending.Contains(l.Status)),
            User.GetUserId(), User.GetRoleId());

        return Ok(await scoped
            .OrderByDescending(l => l.LeadDate)
            .Select(l => new VisitLeadDto
            {
                Id = l.LeadId,
                Name = $"{l.FullName} — {l.LeadCode}",
                Purpose = "Site visit"
                    + (l.Project != null ? $" — {l.Project.ProjectName}" : "")
                    + (l.PropertyType != null ? $" ({l.PropertyType})" : "")
            })
            .ToListAsync());
    }

    [HttpGet("statuses")]
    public ActionResult<List<string>> Statuses() => Ok(LeadStatus.All.ToList());

    /// <summary>
    /// Find-or-create a source by name. The lead form's combo box calls this when
    /// the user types a name that isn't in the list yet, so the master list grows
    /// as they work instead of needing a separate admin screen.
    /// Matching is case-insensitive, so "walk-in" will not duplicate "Walk-in".
    /// </summary>
    [HttpPost("sources")]
    [RequirePermission("leads", PermAction.Create)]
    public async Task<ActionResult<LookupDto>> CreateSource(SaveLookupRequest req)
    {
        var name = req.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Source name is required." });
        if (name.Length > 50)
            return BadRequest(new { message = "Source name cannot exceed 50 characters." });

        var existing = await db.Sources
            .FirstOrDefaultAsync(s => s.SourceName == name);

        if (existing is not null)
        {
            // Re-activate rather than creating a duplicate.
            if (!existing.IsActive)
            {
                existing.IsActive = true;
                await db.SaveChangesAsync();
            }
            return Ok(new LookupDto { Id = existing.SourceId, Name = existing.SourceName });
        }

        var created = new Source { SourceName = name, IsActive = true };
        db.Sources.Add(created);
        await db.SaveChangesAsync();

        return Ok(new LookupDto { Id = created.SourceId, Name = created.SourceName });
    }

    /// <summary>Find-or-create a project by name. See CreateSource for the rationale.</summary>
    [HttpPost("projects")]
    [RequirePermission("leads", PermAction.Create)]
    public async Task<ActionResult<LookupDto>> CreateProject(SaveLookupRequest req)
    {
        var name = req.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Project name is required." });
        if (name.Length > 100)
            return BadRequest(new { message = "Project name cannot exceed 100 characters." });

        var existing = await db.Projects
            .FirstOrDefaultAsync(p => p.ProjectName == name);

        if (existing is not null)
        {
            if (!existing.IsActive)
            {
                existing.IsActive = true;
                await db.SaveChangesAsync();
            }
            return Ok(new LookupDto { Id = existing.ProjectId, Name = existing.ProjectName });
        }

        var created = new Project
        {
            ProjectName = name,
            City = string.IsNullOrWhiteSpace(req.City) ? null : req.City.Trim(),
            IsActive = true
        };
        db.Projects.Add(created);
        await db.SaveChangesAsync();

        return Ok(new LookupDto { Id = created.ProjectId, Name = created.ProjectName });
    }

    /// <summary>Find-or-create an area by name. See CreateSource for the rationale.</summary>
    [HttpPost("areas")]
    [RequirePermission("leads", PermAction.Create)]
    public async Task<ActionResult<LookupDto>> CreateArea(SaveLookupRequest req)
    {
        var name = req.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Area name is required." });
        if (name.Length > 100)
            return BadRequest(new { message = "Area name cannot exceed 100 characters." });

        var existing = await db.Areas.FirstOrDefaultAsync(a => a.AreaName == name);
        if (existing is not null)
        {
            if (!existing.IsActive) { existing.IsActive = true; await db.SaveChangesAsync(); }
            return Ok(new LookupDto { Id = existing.AreaId, Name = existing.AreaName });
        }

        var created = new Area
        {
            AreaName = name,
            City = string.IsNullOrWhiteSpace(req.City) ? null : req.City.Trim(),
            IsActive = true
        };
        db.Areas.Add(created);
        await db.SaveChangesAsync();
        return Ok(new LookupDto { Id = created.AreaId, Name = created.AreaName });
    }

    /// <summary>Find-or-create a property type by name.</summary>
    [HttpPost("propertytypes")]
    [RequirePermission("leads", PermAction.Create)]
    public async Task<ActionResult<LookupDto>> CreatePropertyType(SaveLookupRequest req)
    {
        var name = req.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { message = "Property type is required." });
        if (name.Length > 60)
            return BadRequest(new { message = "Property type cannot exceed 60 characters." });

        var existing = await db.PropertyTypes.FirstOrDefaultAsync(p => p.TypeName == name);
        if (existing is not null)
        {
            if (!existing.IsActive) { existing.IsActive = true; await db.SaveChangesAsync(); }
            return Ok(new LookupDto { Id = existing.PropertyTypeId, Name = existing.TypeName });
        }

        var created = new PropertyType { TypeName = name, IsActive = true };
        db.PropertyTypes.Add(created);
        await db.SaveChangesAsync();
        return Ok(new LookupDto { Id = created.PropertyTypeId, Name = created.TypeName });
    }
}
