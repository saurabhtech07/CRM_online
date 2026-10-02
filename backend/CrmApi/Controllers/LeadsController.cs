using CrmApi.Data;
using CrmApi.Models;
using CrmApi.Models.Dtos;
using CrmApi.Security;
using CrmApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrmApi.Controllers;

/// <summary>
/// One controller backs all three tabs. `tab` selects the slice:
///   leads   -> everything
///   clients -> Status = Converted
///   pending -> Status in (New, Contacted, Qualified)
///
/// Every read is passed through ILeadScopeService, so a non-admin user only ever
/// sees leads inside their assigned City / Area / PropertyType.
/// </summary>
[ApiController]
[Route("api/leads")]
[Authorize]
public class LeadsController(CrmDbContext db, ILeadScopeService scope) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<LeadDto>>> Search(
        [FromQuery] string tab = "leads",
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] int? sourceId = null,
        [FromQuery] int? projectId = null,
        [FromQuery] int? assignedToUserId = null,
        [FromQuery] DateOnly? fromDate = null,
        [FromQuery] DateOnly? toDate = null,
        [FromQuery] string sortBy = "LeadDate",
        [FromQuery] string sortDir = "desc",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        var moduleKey = NormalizeTab(tab);
        if (moduleKey is null)
            return BadRequest(new { message = "tab must be one of: leads, clients, pending." });

        if (!await HasView(moduleKey))
            return Forbid();

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var q = db.Leads.AsNoTracking().Where(l => l.IsActive);
        q = await scope.ApplyAsync(q, User.GetUserId(), User.GetRoleId());

        // Agent restriction (Leads grid only): if this user has chosen agents,
        // limit the grid to leads assigned to any of them. Empty = no limit.
        var allowedAgents = await db.UserAgents.AsNoTracking()
            .Where(x => x.UserId == User.GetUserId()).Select(x => x.AgentUserId).ToListAsync();
        if (allowedAgents.Count > 0)
            q = q.Where(l => l.AssignedToUserId != null && allowedAgents.Contains(l.AssignedToUserId.Value));

        q = moduleKey switch
        {
            "clients" => q.Where(l => l.Status == LeadStatus.Converted),
            "pending" => q.Where(l => LeadStatus.Pending.Contains(l.Status)),
            _ => q
        };

        if (!string.IsNullOrWhiteSpace(status) && moduleKey == "leads")
            q = q.Where(l => l.Status == status);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(l =>
                l.FullName.Contains(s) ||
                l.Phone.Contains(s) ||
                (l.Email != null && l.Email.Contains(s)) ||
                (l.City != null && l.City.Contains(s)) ||
                l.LeadCode.Contains(s));
        }

        if (sourceId.HasValue) q = q.Where(l => l.SourceId == sourceId);
        if (projectId.HasValue) q = q.Where(l => l.ProjectId == projectId);
        if (assignedToUserId.HasValue) q = q.Where(l => l.AssignedToUserId == assignedToUserId);

        // Date filter targets the date that is meaningful for the tab.
        if (fromDate.HasValue)
            q = moduleKey == "clients"
                ? q.Where(l => l.ConvertedDate >= fromDate)
                : q.Where(l => l.LeadDate >= fromDate);
        if (toDate.HasValue)
            q = moduleKey == "clients"
                ? q.Where(l => l.ConvertedDate <= toDate)
                : q.Where(l => l.LeadDate <= toDate);

        var total = await q.CountAsync();

        var desc = !string.Equals(sortDir, "asc", StringComparison.OrdinalIgnoreCase);
        q = (sortBy.ToLowerInvariant(), desc) switch
        {
            ("fullname", true) => q.OrderByDescending(l => l.FullName),
            ("fullname", false) => q.OrderBy(l => l.FullName),
            ("status", true) => q.OrderByDescending(l => l.Status),
            ("status", false) => q.OrderBy(l => l.Status),
            ("budget", true) => q.OrderByDescending(l => l.Budget),
            ("budget", false) => q.OrderBy(l => l.Budget),
            ("dealvalue", true) => q.OrderByDescending(l => l.DealValue),
            ("dealvalue", false) => q.OrderBy(l => l.DealValue),
            ("converteddate", true) => q.OrderByDescending(l => l.ConvertedDate),
            ("converteddate", false) => q.OrderBy(l => l.ConvertedDate),
            (_, false) => q.OrderBy(l => l.LeadDate).ThenBy(l => l.LeadId),
            _ => q.OrderByDescending(l => l.LeadDate).ThenByDescending(l => l.LeadId)
        };

        var items = await q.Skip((page - 1) * pageSize).Take(pageSize)
            .Include(l => l.Source).Include(l => l.Project).Include(l => l.Area).Include(l => l.AssignedToUser)
            .Select(l => Map(l)).ToListAsync();

        return Ok(new PagedResult<LeadDto>
        {
            Items = items, Page = page, PageSize = pageSize, TotalCount = total
        });
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<LeadDto>> GetById(int id)
    {
        if (!await HasView("leads")) return Forbid();

        var scoped = await scope.ApplyAsync(
            db.Leads.AsNoTracking().Where(l => l.IsActive), User.GetUserId(), User.GetRoleId());

        var lead = await scoped
            .Where(l => l.LeadId == id)
            .Include(l => l.Source).Include(l => l.Project).Include(l => l.Area).Include(l => l.AssignedToUser)
            .Select(l => Map(l)).FirstOrDefaultAsync();

        return lead is null ? NotFound(new { message = $"Lead {id} was not found." }) : Ok(lead);
    }

    [HttpGet("{id:int}/history")]
    public async Task<ActionResult<List<LeadHistoryDto>>> History(int id)
    {
        if (!await HasView("leads")) return Forbid();

        // Only expose history for a lead the caller is actually allowed to see.
        var scoped = await scope.ApplyAsync(
            db.Leads.AsNoTracking().Where(l => l.IsActive), User.GetUserId(), User.GetRoleId());
        if (!await scoped.AnyAsync(l => l.LeadId == id))
            return NotFound(new { message = $"Lead {id} was not found." });

        var rows = await db.LeadStatusHistories.AsNoTracking()
            .Where(h => h.LeadId == id)
            .OrderByDescending(h => h.ChangedAt)
            .Select(h => new LeadHistoryDto
            {
                HistoryId = h.HistoryId,
                FromStatus = h.FromStatus,
                ToStatus = h.ToStatus,
                ChangedByName = h.ChangedByUser != null ? h.ChangedByUser.FullName : null,
                ChangedAt = h.ChangedAt,
                Remark = h.Remark
            }).ToListAsync();

        return Ok(rows);
    }

    [HttpPost]
    [RequirePermission("leads", PermAction.Create)]
    public async Task<ActionResult<LeadDto>> Create(SaveLeadRequest req)
    {
        if (!LeadStatus.IsValid(req.Status))
            return BadRequest(new { message = $"Status must be one of: {string.Join(", ", LeadStatus.All)}." });

        if (await db.Leads.AnyAsync(l => l.Phone == req.Phone && l.IsActive))
            return Conflict(new { message = $"A lead with phone {req.Phone} already exists." });

        var today = DateOnly.FromDateTime(DateTime.Today);
        var userId = User.GetUserId();

        var lead = new Lead
        {
            FullName = req.FullName.Trim(),
            Phone = req.Phone.Trim(),
            Email = req.Email,
            City = req.City,
            Address = req.Address,
            SourceId = req.SourceId,
            ProjectId = req.ProjectId,
            AreaId = req.AreaId,
            PropertyType = req.PropertyType,
            Budget = req.Budget,
            Notes = req.Notes,
            AssignedToUserId = req.AssignedToUserId,
            Status = req.Status,
            LeadDate = req.LeadDate ?? today,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = userId,
            IsActive = true
        };

        ApplyStatusDates(lead, req.Status, req.DealValue, req.RejectReason, today);

        db.Leads.Add(lead);
        await db.SaveChangesAsync();

        db.LeadStatusHistories.Add(new LeadStatusHistory
        {
            LeadId = lead.LeadId, FromStatus = null, ToStatus = lead.Status,
            ChangedByUserId = userId, ChangedAt = DateTime.UtcNow, Remark = "Lead created"
        });
        await db.SaveChangesAsync();

        var dto = await db.Leads.AsNoTracking().Where(l => l.LeadId == lead.LeadId)
            .Include(l => l.Source).Include(l => l.Project).Include(l => l.Area).Include(l => l.AssignedToUser)
            .Select(l => Map(l)).FirstAsync();

        return CreatedAtAction(nameof(GetById), new { id = lead.LeadId }, dto);
    }

    [HttpPut("{id:int}")]
    [RequirePermission("leads", PermAction.Edit)]
    public async Task<ActionResult<LeadDto>> Update(int id, SaveLeadRequest req)
    {
        if (!LeadStatus.IsValid(req.Status))
            return BadRequest(new { message = $"Status must be one of: {string.Join(", ", LeadStatus.All)}." });

        var lead = await LoadScopedLeadAsync(id);
        if (lead is null) return NotFound(new { message = $"Lead {id} was not found." });

        if (await db.Leads.AnyAsync(l => l.Phone == req.Phone && l.LeadId != id && l.IsActive))
            return Conflict(new { message = $"Another lead already uses phone {req.Phone}." });

        var prevStatus = lead.Status;
        var today = DateOnly.FromDateTime(DateTime.Today);

        lead.FullName = req.FullName.Trim();
        lead.Phone = req.Phone.Trim();
        lead.Email = req.Email;
        lead.City = req.City;
        lead.Address = req.Address;
        lead.SourceId = req.SourceId;
        lead.ProjectId = req.ProjectId;
        lead.AreaId = req.AreaId;
        lead.PropertyType = req.PropertyType;
        lead.Budget = req.Budget;
        lead.Notes = req.Notes;
        lead.AssignedToUserId = req.AssignedToUserId;
        if (req.LeadDate.HasValue) lead.LeadDate = req.LeadDate.Value;
        lead.Status = req.Status;
        lead.UpdatedAt = DateTime.UtcNow;

        ApplyStatusDates(lead, req.Status, req.DealValue, req.RejectReason, today);

        if (prevStatus != req.Status)
        {
            db.LeadStatusHistories.Add(new LeadStatusHistory
            {
                LeadId = lead.LeadId, FromStatus = prevStatus, ToStatus = req.Status,
                ChangedByUserId = User.GetUserId(), ChangedAt = DateTime.UtcNow,
                Remark = "Updated from lead form"
            });
        }

        await db.SaveChangesAsync();

        var dto = await db.Leads.AsNoTracking().Where(l => l.LeadId == id)
            .Include(l => l.Source).Include(l => l.Project).Include(l => l.Area).Include(l => l.AssignedToUser)
            .Select(l => Map(l)).FirstAsync();
        return Ok(dto);
    }

    /// <summary>Move a lead along the funnel - the Convert / Reject actions in the grid.</summary>
    [HttpPatch("{id:int}/status")]
    [RequirePermission("leads", PermAction.Edit)]
    public async Task<ActionResult<LeadDto>> ChangeStatus(int id, ChangeStatusRequest req)
    {
        if (!LeadStatus.IsValid(req.Status))
            return BadRequest(new { message = $"Status must be one of: {string.Join(", ", LeadStatus.All)}." });

        var lead = await LoadScopedLeadAsync(id);
        if (lead is null) return NotFound(new { message = $"Lead {id} was not found." });

        if (lead.Status == req.Status)
            return BadRequest(new { message = $"This lead is already marked {req.Status}." });

        if (req.Status == LeadStatus.Rejected && string.IsNullOrWhiteSpace(req.RejectReason))
            return BadRequest(new { message = "A reject reason is required when rejecting a lead." });

        var prev = lead.Status;
        var today = DateOnly.FromDateTime(DateTime.Today);

        lead.Status = req.Status;
        lead.UpdatedAt = DateTime.UtcNow;
        ApplyStatusDates(lead, req.Status, req.DealValue, req.RejectReason, today);

        db.LeadStatusHistories.Add(new LeadStatusHistory
        {
            LeadId = lead.LeadId, FromStatus = prev, ToStatus = req.Status,
            ChangedByUserId = User.GetUserId(), ChangedAt = DateTime.UtcNow, Remark = req.Remark
        });

        await db.SaveChangesAsync();

        var dto = await db.Leads.AsNoTracking().Where(l => l.LeadId == id)
            .Include(l => l.Source).Include(l => l.Project).Include(l => l.Area).Include(l => l.AssignedToUser)
            .Select(l => Map(l)).FirstAsync();
        return Ok(dto);
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("leads", PermAction.Delete)]
    public async Task<IActionResult> Delete(int id)
    {
        var lead = await LoadScopedLeadAsync(id);
        if (lead is null) return NotFound(new { message = $"Lead {id} was not found." });

        // Soft delete keeps historical dashboard numbers intact.
        lead.IsActive = false;
        lead.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { message = $"Lead {lead.LeadCode} deleted successfully." });
    }

    /* ---------------- helpers ---------------- */

    /// <summary>Keeps ConvertedDate / RejectedDate / DealValue consistent with Status.</summary>
    private static void ApplyStatusDates(Lead lead, string status, decimal? dealValue,
                                         string? rejectReason, DateOnly today)
    {
        switch (status)
        {
            case LeadStatus.Converted:
                lead.ConvertedDate ??= today;
                lead.RejectedDate = null;
                lead.RejectReason = null;
                if (dealValue.HasValue) lead.DealValue = dealValue;
                lead.DealValue ??= lead.Budget;
                break;

            case LeadStatus.Rejected:
                lead.RejectedDate ??= today;
                lead.ConvertedDate = null;
                lead.DealValue = null;
                if (!string.IsNullOrWhiteSpace(rejectReason)) lead.RejectReason = rejectReason;
                break;

            default: // back in the funnel
                lead.ConvertedDate = null;
                lead.RejectedDate = null;
                lead.DealValue = null;
                lead.RejectReason = null;
                break;
        }
    }

    private static string? NormalizeTab(string tab) => tab?.ToLowerInvariant() switch
    {
        "leads" or "" or null => "leads",
        "clients" => "clients",
        "pending" => "pending",
        _ => null
    };

    private async Task<bool> HasView(string moduleKey)
    {
        var userId = User.GetUserId();
        return await db.UserPermissions.AsNoTracking()
            .AnyAsync(p => p.UserId == userId && p.Module!.ModuleKey == moduleKey && p.CanView);
    }

    /// <summary>
    /// Loads a lead for writing, but only if it is inside the caller's data scope.
    /// Returns null (treat as not-found) when the lead doesn't exist OR is out of scope,
    /// so a user can never edit a lead they aren't allowed to see.
    /// </summary>
    private async Task<Lead?> LoadScopedLeadAsync(int id)
    {
        var scoped = await scope.ApplyAsync(
            db.Leads.Where(l => l.IsActive), User.GetUserId(), User.GetRoleId());
        return await scoped.FirstOrDefaultAsync(l => l.LeadId == id);
    }

    private static LeadDto Map(Lead l) => new()
    {
        LeadId = l.LeadId,
        LeadCode = l.LeadCode,
        FullName = l.FullName,
        Phone = l.Phone,
        Email = l.Email,
        City = l.City,
        Address = l.Address,
        SourceId = l.SourceId,
        SourceName = l.Source != null ? l.Source.SourceName : null,
        ProjectId = l.ProjectId,
        ProjectName = l.Project != null ? l.Project.ProjectName : null,
        AreaId = l.AreaId,
        AreaName = l.Area != null ? l.Area.AreaName : null,
        PropertyType = l.PropertyType,
        Budget = l.Budget,
        DealValue = l.DealValue,
        Status = l.Status,
        RejectReason = l.RejectReason,
        Notes = l.Notes,
        AssignedToUserId = l.AssignedToUserId,
        AssignedToName = l.AssignedToUser != null ? l.AssignedToUser.FullName : null,
        LeadDate = l.LeadDate,
        ConvertedDate = l.ConvertedDate,
        RejectedDate = l.RejectedDate,
        CreatedAt = l.CreatedAt
    };
}
