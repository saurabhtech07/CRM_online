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
/// Chatbot lookup. Given a name or phone it returns the matching leads/clients
/// with their full detail, so a user can pull up "who is this, when did they come,
/// what for" without leaving the page. Gated by the 'assistant' module permission
/// and restricted to the caller's data scope.
/// </summary>
[ApiController]
[Route("api/assistant")]
[Authorize]
public class AssistantController(CrmDbContext db, ILeadScopeService scope) : ControllerBase
{
    [HttpGet("lookup")]
    [RequirePermission("assistant", PermAction.View)]
    public async Task<ActionResult<AssistantResult>> Lookup([FromQuery] string q)
    {
        q = (q ?? "").Trim();
        if (q.Length < 2)
            return Ok(new AssistantResult { Query = q, Matches = [], Message = "Type at least 2 characters." });

        var baseQuery = await scope.ApplyAsync(
            db.Leads.AsNoTracking()
                .Include(l => l.Source).Include(l => l.Project).Include(l => l.Area)
                .Include(l => l.AssignedToUser)
                .Where(l => l.IsActive),
            User.GetUserId(), User.GetRoleId());

        var matches = await baseQuery
            .Where(l => l.FullName.Contains(q) || l.Phone.Contains(q) || l.LeadCode.Contains(q)
                        || (l.Email != null && l.Email.Contains(q)))
            .OrderByDescending(l => l.LeadDate)
            .Take(10)
            .Select(l => new AssistantMatch
            {
                LeadId = l.LeadId,
                LeadCode = l.LeadCode,
                FullName = l.FullName,
                Phone = l.Phone,
                Email = l.Email,
                City = l.City,
                Area = l.Area != null ? l.Area.AreaName : null,
                Source = l.Source != null ? l.Source.SourceName : null,
                Project = l.Project != null ? l.Project.ProjectName : null,
                PropertyType = l.PropertyType,
                Budget = l.Budget,
                DealValue = l.DealValue,
                Status = l.Status,
                AssignedTo = l.AssignedToUser != null ? l.AssignedToUser.FullName : null,
                Notes = l.Notes,
                RejectReason = l.RejectReason,
                LeadDate = l.LeadDate,
                ConvertedDate = l.ConvertedDate,
                RejectedDate = l.RejectedDate
            })
            .ToListAsync();

        // Attach a short status history to the single best match (most useful case).
        if (matches.Count > 0)
        {
            var topId = matches[0].LeadId;
            var history = await db.LeadStatusHistories.AsNoTracking()
                .Where(h => h.LeadId == topId)
                .OrderByDescending(h => h.ChangedAt)
                .Take(6)
                .Select(h => new AssistantHistory
                {
                    FromStatus = h.FromStatus,
                    ToStatus = h.ToStatus,
                    ChangedBy = h.ChangedByUser != null ? h.ChangedByUser.FullName : null,
                    ChangedAt = h.ChangedAt,
                    Remark = h.Remark
                }).ToListAsync();
            matches[0] = matches[0] with { History = history };
        }

        return Ok(new AssistantResult
        {
            Query = q,
            Matches = matches,
            Message = matches.Count == 0
                ? $"No client or lead found for \"{q}\" in your data."
                : null
        });
    }
}
