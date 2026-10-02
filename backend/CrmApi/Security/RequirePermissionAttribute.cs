using System.Security.Claims;
using CrmApi.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace CrmApi.Security;

public enum PermAction { View, Create, Edit, Delete, Export }

/// <summary>
/// Server-side authority check. The frontend hides menus, but every
/// protected endpoint re-checks the role's permission on the module here,
/// so hiding the UI is never the only thing standing in the way.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequirePermissionAttribute(string moduleKey, PermAction action)
    : Attribute, IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;
        if (user.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedObjectResult(new { message = "Not authenticated." });
            return;
        }

        var userIdClaim = user.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userIdClaim, out var userId))
        {
            context.Result = new ForbidResult();
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<CrmDbContext>();

        // Authority is per-user (UserPermissions), not per-role.
        var perm = await db.UserPermissions
            .AsNoTracking()
            .Where(p => p.UserId == userId && p.Module!.ModuleKey == moduleKey)
            .Select(p => new { p.CanView, p.CanCreate, p.CanEdit, p.CanDelete, p.CanExport })
            .FirstOrDefaultAsync();

        var allowed = action switch
        {
            PermAction.View => perm?.CanView,
            PermAction.Create => perm?.CanCreate,
            PermAction.Edit => perm?.CanEdit,
            PermAction.Delete => perm?.CanDelete,
            PermAction.Export => perm?.CanExport,
            _ => false
        } ?? false;

        if (!allowed)
        {
            context.Result = new ObjectResult(new
            {
                message = $"You do not have permission to {action.ToString().ToLower()} in {moduleKey}."
            })
            { StatusCode = StatusCodes.Status403Forbidden };
        }
    }
}

public static class ClaimsPrincipalExtensions
{
    public static int GetUserId(this ClaimsPrincipal principal)
        => int.TryParse(principal.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : 0;

    public static int GetRoleId(this ClaimsPrincipal principal)
        => int.TryParse(principal.FindFirst("roleId")?.Value, out var id) ? id : 0;
}
