using CrmApi.Data;
using CrmApi.Models;
using CrmApi.Models.Dtos;
using CrmApi.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrmApi.Controllers;

/// <summary>
/// Live site-visit tracking. An agent starts a visit to a lead (capturing GPS),
/// pings their location while travelling, and completes it on return. Admins/managers
/// with the 'sitevisits' module can watch any agent's live position and path.
/// Location comes from the browser's Geolocation API - free, no external service.
/// </summary>
[ApiController]
[Route("api/visits")]
[Authorize]
public class SiteVisitsController(CrmDbContext db) : ControllerBase
{
    /// <summary>
    /// Agent starts a visit to a lead. Gated by the 'sitevisits' create permission
    /// (agents have it) and the lead must be ASSIGNED to the caller - so only the
    /// assigned agent can visit their own lead. Started from the Leads grid.
    /// </summary>
    [HttpPost("start")]
    [RequirePermission("sitevisits", PermAction.Create)]
    public async Task<ActionResult<SiteVisitDto>> Start(StartVisitRequest req)
    {
        var userId = User.GetUserId();

        var lead = await db.Leads.AsNoTracking().FirstOrDefaultAsync(l => l.LeadId == req.LeadId && l.IsActive);
        if (lead is null) return NotFound(new { message = "Lead not found." });

        // Only the assigned agent may visit their own lead.
        if (lead.AssignedToUserId != userId)
            return StatusCode(StatusCodes.Status403Forbidden,
                new { message = "You can only start a visit for a lead assigned to you." });

        // One live visit per agent at a time - close any dangling one first.
        var open = await db.SiteVisits
            .Where(v => v.AgentUserId == userId && v.Status == VisitStatus.Ongoing)
            .FirstOrDefaultAsync();
        if (open is not null)
            return Conflict(new
            {
                message = "You already have an ongoing visit. Complete it before starting a new one.",
                visitId = open.VisitId
            });

        var visit = new SiteVisit
        {
            AgentUserId = userId,
            LeadId = req.LeadId,
            Status = VisitStatus.Ongoing,
            StartLat = req.Lat,
            StartLng = req.Lng,
            Purpose = req.Purpose,
            StartedAt = DateTime.UtcNow
        };
        db.SiteVisits.Add(visit);
        await db.SaveChangesAsync();

        if (req.Lat.HasValue && req.Lng.HasValue)
        {
            db.VisitPoints.Add(new VisitPoint
            {
                VisitId = visit.VisitId, Lat = req.Lat.Value, Lng = req.Lng.Value,
                RecordedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        return await GetById(visit.VisitId);
    }

    /// <summary>Agent's device posts a new location point during the visit.</summary>
    [HttpPost("{id:int}/ping")]
    [RequirePermission("sitevisits", PermAction.Create)]
    public async Task<IActionResult> Ping(int id, VisitPingRequest req)
    {
        var visit = await db.SiteVisits.FirstOrDefaultAsync(v => v.VisitId == id);
        if (visit is null) return NotFound(new { message = "Visit not found." });

        // Only the owning agent can ping their own visit.
        if (visit.AgentUserId != User.GetUserId())
            return Forbid();
        if (visit.Status != VisitStatus.Ongoing)
            return BadRequest(new { message = "This visit is no longer active." });

        db.VisitPoints.Add(new VisitPoint
        {
            VisitId = id, Lat = req.Lat, Lng = req.Lng,
            Accuracy = req.Accuracy, RecordedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    /// <summary>Agent completes (or cancels) their visit on return.</summary>
    [HttpPost("{id:int}/complete")]
    [RequirePermission("sitevisits", PermAction.Create)]
    public async Task<ActionResult<SiteVisitDto>> Complete(int id, CompleteVisitRequest req)
    {
        var visit = await db.SiteVisits.FirstOrDefaultAsync(v => v.VisitId == id);
        if (visit is null) return NotFound(new { message = "Visit not found." });
        if (visit.AgentUserId != User.GetUserId())
            return Forbid();
        if (visit.Status != VisitStatus.Ongoing)
            return BadRequest(new { message = "This visit is already closed." });

        visit.Status = req.Completed ? VisitStatus.Completed : VisitStatus.Cancelled;
        visit.EndLat = req.Lat;
        visit.EndLng = req.Lng;
        visit.Remark = req.Remark;
        visit.CompletedAt = DateTime.UtcNow;

        if (req.Lat.HasValue && req.Lng.HasValue)
            db.VisitPoints.Add(new VisitPoint
            {
                VisitId = id, Lat = req.Lat.Value, Lng = req.Lng.Value, RecordedAt = DateTime.UtcNow
            });

        await db.SaveChangesAsync();
        return await GetById(id);
    }

    /// <summary>The current user's own ongoing visit, if any (drives the agent's Start/Complete UI).</summary>
    [HttpGet("mine/active")]
    public async Task<ActionResult<SiteVisitDto?>> MyActive()
    {
        var v = await db.SiteVisits.AsNoTracking()
            .Where(x => x.AgentUserId == User.GetUserId() && x.Status == VisitStatus.Ongoing)
            .OrderByDescending(x => x.StartedAt)
            .Select(x => x.VisitId).FirstOrDefaultAsync();
        if (v == 0) return Ok((SiteVisitDto?)null);
        var result = await GetById(v);
        return result.Result is OkObjectResult ok ? Ok((SiteVisitDto?)ok.Value) : result.Result!;
    }

    /// <summary>List visits - filter by agent and/or status. Needs view permission.</summary>
    [HttpGet]
    [RequirePermission("sitevisits", PermAction.View)]
    public async Task<ActionResult<List<SiteVisitDto>>> List(
        [FromQuery] int? agentId = null, [FromQuery] string? status = null)
    {
        var q = db.SiteVisits.AsNoTracking()
            .Include(v => v.Agent).Include(v => v.Lead)!.ThenInclude(l => l!.Project)
            .Include(v => v.Lead)!.ThenInclude(l => l!.Area)
            .AsQueryable();

        if (agentId.HasValue) q = q.Where(v => v.AgentUserId == agentId);
        if (!string.IsNullOrWhiteSpace(status)) q = q.Where(v => v.Status == status);

        var visits = await q.OrderByDescending(v => v.StartedAt).Take(100).ToListAsync();
        var ids = visits.Select(v => v.VisitId).ToList();

        // Last point per visit, for the "currently here" pin.
        var lastPoints = await db.VisitPoints.AsNoTracking()
            .Where(p => ids.Contains(p.VisitId))
            .GroupBy(p => p.VisitId)
            .Select(g => g.OrderByDescending(x => x.RecordedAt).First())
            .ToListAsync();
        var pointCounts = await db.VisitPoints.AsNoTracking()
            .Where(p => ids.Contains(p.VisitId))
            .GroupBy(p => p.VisitId).Select(g => new { g.Key, C = g.Count() }).ToListAsync();

        return Ok(visits.Select(v =>
        {
            var last = lastPoints.FirstOrDefault(p => p.VisitId == v.VisitId);
            var count = pointCounts.FirstOrDefault(c => c.Key == v.VisitId)?.C ?? 0;
            return Map(v, last, count, []);
        }).ToList());
    }

    /// <summary>Full visit with its path (for the map). View OR the owning agent.</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<SiteVisitDto>> GetById(int id)
    {
        var v = await db.SiteVisits.AsNoTracking()
            .Include(x => x.Agent).Include(x => x.Lead)!.ThenInclude(l => l!.Project)
            .Include(x => x.Lead)!.ThenInclude(l => l!.Area)
            .FirstOrDefaultAsync(x => x.VisitId == id);
        if (v is null) return NotFound(new { message = "Visit not found." });

        // Either you can view the module, or it's your own visit.
        var canView = await db.UserPermissions.AsNoTracking()
            .AnyAsync(p => p.UserId == User.GetUserId() && p.Module!.ModuleKey == "sitevisits" && p.CanView);
        if (!canView && v.AgentUserId != User.GetUserId())
            return Forbid();

        var path = await db.VisitPoints.AsNoTracking()
            .Where(p => p.VisitId == id)
            .OrderBy(p => p.RecordedAt)
            .Select(p => new VisitPointDto { Lat = p.Lat, Lng = p.Lng, RecordedAt = p.RecordedAt })
            .ToListAsync();

        var last = path.Count > 0 ? path[^1] : null;
        return Ok(Map(v, last is null ? null : new VisitPoint { Lat = last.Lat, Lng = last.Lng },
                      path.Count, path));
    }

    private static SiteVisitDto Map(SiteVisit v, VisitPoint? last, int pointCount, List<VisitPointDto> path) => new()
    {
        VisitId = v.VisitId,
        AgentUserId = v.AgentUserId,
        AgentName = v.Agent?.FullName ?? "",
        LeadId = v.LeadId,
        LeadCode = v.Lead?.LeadCode ?? "",
        ClientName = v.Lead?.FullName ?? "",
        ClientPhone = v.Lead?.Phone,
        City = v.Lead?.City,
        Area = v.Lead?.Area?.AreaName,
        ProjectName = v.Lead?.Project?.ProjectName,
        Status = v.Status,
        Purpose = v.Purpose,
        Remark = v.Remark,
        StartLat = v.StartLat,
        StartLng = v.StartLng,
        EndLat = v.EndLat,
        EndLng = v.EndLng,
        LastLat = last?.Lat,
        LastLng = last?.Lng,
        StartedAt = v.StartedAt,
        CompletedAt = v.CompletedAt,
        PointCount = pointCount,
        Path = path
    };
}
