using System.Globalization;
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
[Route("api/dashboard")]
[Authorize]
public class DashboardController(CrmDbContext db, ILeadScopeService scope) : ControllerBase
{
    /// <summary>Active leads the caller is allowed to see - every dashboard query builds on this.</summary>
    private Task<IQueryable<Lead>> ScopedLeadsAsync() =>
        scope.ApplyAsync(db.Leads.AsNoTracking().Where(l => l.IsActive),
                         User.GetUserId(), User.GetRoleId());

    /// <summary>
    /// Dashboard for a period. Either pass explicit fromDate/toDate, or pass
    /// year (+ optional month) and the range is derived. Default is the current month.
    /// The trend always returns the selected month plus the previous 5.
    /// </summary>
    [HttpGet]
    [RequirePermission("dashboard", PermAction.View)]
    public async Task<ActionResult<DashboardResponse>> Get(
        [FromQuery] int? year = null,
        [FromQuery] int? month = null,
        [FromQuery] DateOnly? fromDate = null,
        [FromQuery] DateOnly? toDate = null)
    {
        var today = DateOnly.FromDateTime(DateTime.Today);
        DateOnly from, to;

        if (fromDate.HasValue || toDate.HasValue)
        {
            from = fromDate ?? new DateOnly((toDate ?? today).Year, (toDate ?? today).Month, 1);
            to = toDate ?? today;
        }
        else if (year.HasValue && month.HasValue)
        {
            if (month is < 1 or > 12)
                return BadRequest(new { message = "month must be between 1 and 12." });
            from = new DateOnly(year.Value, month.Value, 1);
            to = from.AddMonths(1).AddDays(-1);
        }
        else if (year.HasValue)
        {
            from = new DateOnly(year.Value, 1, 1);
            to = new DateOnly(year.Value, 12, 31);
        }
        else
        {
            from = new DateOnly(today.Year, today.Month, 1);
            to = from.AddMonths(1).AddDays(-1);
        }

        if (from > to)
            return BadRequest(new { message = "fromDate cannot be after toDate." });

        var baseQuery = await ScopedLeadsAsync();

        var summary = await BuildSummary(baseQuery, from, to);

        // Trend: the month `to` falls in, plus the previous 5 months.
        var trendEnd = new DateOnly(to.Year, to.Month, 1);
        var trendStart = trendEnd.AddMonths(-5);
        var trend = await BuildTrend(baseQuery, trendStart, trendEnd);

        var scoped = baseQuery.Where(l =>
            (l.LeadDate >= from && l.LeadDate <= to)
            || (l.ConvertedDate >= from && l.ConvertedDate <= to)
            || (l.RejectedDate >= from && l.RejectedDate <= to));

        var bySource = await scoped
            .GroupBy(l => l.Source != null ? l.Source.SourceName : "Unknown")
            .Select(g => new LookupCountDto { Name = g.Key, Count = g.Count(), Value = g.Sum(x => x.DealValue ?? 0) })
            .OrderByDescending(x => x.Count).Take(8).ToListAsync();

        var byProject = await scoped
            .GroupBy(l => l.Project != null ? l.Project.ProjectName : "Unassigned")
            .Select(g => new LookupCountDto { Name = g.Key, Count = g.Count(), Value = g.Sum(x => x.DealValue ?? 0) })
            .OrderByDescending(x => x.Count).Take(8).ToListAsync();

        var byStatus = await scoped
            .GroupBy(l => l.Status)
            .Select(g => new LookupCountDto { Name = g.Key, Count = g.Count(), Value = g.Sum(x => x.DealValue ?? 0) })
            .ToListAsync();

        var recent = await baseQuery
            .Where(l => l.LeadDate >= from && l.LeadDate <= to)
            .OrderByDescending(l => l.LeadDate).ThenByDescending(l => l.LeadId)
            .Take(8)
            .Select(l => new LeadDto
            {
                LeadId = l.LeadId, LeadCode = l.LeadCode, FullName = l.FullName,
                Phone = l.Phone, City = l.City, Status = l.Status,
                Budget = l.Budget, DealValue = l.DealValue, LeadDate = l.LeadDate,
                SourceName = l.Source != null ? l.Source.SourceName : null,
                ProjectName = l.Project != null ? l.Project.ProjectName : null,
                AssignedToName = l.AssignedToUser != null ? l.AssignedToUser.FullName : null
            }).ToListAsync();

        return Ok(new DashboardResponse
        {
            Summary = summary, Trend = trend,
            BySource = bySource, ByProject = byProject, ByStatus = byStatus,
            RecentLeads = recent
        });
    }

    /// <summary>Distinct years that actually have data - drives the year dropdown.</summary>
    [HttpGet("years")]
    [RequirePermission("dashboard", PermAction.View)]
    public async Task<ActionResult<List<int>>> Years()
    {
        var baseQuery = await ScopedLeadsAsync();
        var years = await baseQuery
            .Select(l => l.LeadDate.Year).Distinct().OrderByDescending(y => y).ToListAsync();

        if (years.Count == 0) years.Add(DateTime.Today.Year);
        return Ok(years);
    }

    private async Task<DashboardSummaryDto> BuildSummary(
        IQueryable<Lead> baseQuery, DateOnly from, DateOnly to)
    {
        var current = await Totals(baseQuery, from, to);

        // Compare against the immediately preceding window of the same length.
        var lengthDays = to.DayNumber - from.DayNumber + 1;
        var prevTo = from.AddDays(-1);
        var prevFrom = prevTo.AddDays(-(lengthDays - 1));
        var previous = await Totals(baseQuery, prevFrom, prevTo);

        return new DashboardSummaryDto
        {
            TotalLeads = current.Leads,
            Clients = current.Clients,
            Rejected = current.Rejected,
            Pending = current.Pending,
            Revenue = current.Revenue,
            ConversionRate = current.Leads > 0
                ? Math.Round(current.Clients * 100.0 / current.Leads, 1) : 0,
            LeadsChangePct = Pct(current.Leads, previous.Leads),
            ClientsChangePct = Pct(current.Clients, previous.Clients),
            RejectedChangePct = Pct(current.Rejected, previous.Rejected),
            RevenueChangePct = Pct((double)current.Revenue, (double)previous.Revenue)
        };
    }

    private static async Task<(int Leads, int Clients, int Rejected, int Pending, decimal Revenue)>
        Totals(IQueryable<Lead> active, DateOnly from, DateOnly to)
    {
        var leads = await active.CountAsync(l => l.LeadDate >= from && l.LeadDate <= to);
        var clients = await active.CountAsync(l => l.ConvertedDate >= from && l.ConvertedDate <= to);
        var rejected = await active.CountAsync(l => l.RejectedDate >= from && l.RejectedDate <= to);
        var pending = await active.CountAsync(l => l.LeadDate >= from && l.LeadDate <= to
                                                   && LeadStatus.Pending.Contains(l.Status));
        var revenue = await active.Where(l => l.ConvertedDate >= from && l.ConvertedDate <= to)
                                  .SumAsync(l => l.DealValue ?? 0);

        return (leads, clients, rejected, pending, revenue);
    }

    private static async Task<List<MonthlyStatDto>> BuildTrend(
        IQueryable<Lead> baseQuery, DateOnly firstMonth, DateOnly lastMonth)
    {
        var rangeStart = firstMonth;
        var rangeEnd = lastMonth.AddMonths(1).AddDays(-1);

        // Pull the window once, then bucket in memory - 6 months is tiny.
        var rows = await baseQuery
            .Where(l =>
                (l.LeadDate >= rangeStart && l.LeadDate <= rangeEnd)
                    || (l.ConvertedDate >= rangeStart && l.ConvertedDate <= rangeEnd)
                    || (l.RejectedDate >= rangeStart && l.RejectedDate <= rangeEnd))
            .Select(l => new { l.LeadDate, l.ConvertedDate, l.RejectedDate, l.Status, l.DealValue })
            .ToListAsync();

        var result = new List<MonthlyStatDto>();

        for (var m = firstMonth; m <= lastMonth; m = m.AddMonths(1))
        {
            var mStart = m;
            var mEnd = m.AddMonths(1).AddDays(-1);

            bool In(DateOnly? d) => d.HasValue && d >= mStart && d <= mEnd;

            result.Add(new MonthlyStatDto
            {
                Year = m.Year,
                Month = m.Month,
                MonthName = CultureInfo.InvariantCulture.DateTimeFormat.GetMonthName(m.Month),
                Label = $"{CultureInfo.InvariantCulture.DateTimeFormat.GetAbbreviatedMonthName(m.Month)} {m.Year}",
                TotalLeads = rows.Count(r => In(r.LeadDate)),
                Clients = rows.Count(r => In(r.ConvertedDate)),
                Rejected = rows.Count(r => In(r.RejectedDate)),
                Pending = rows.Count(r => In(r.LeadDate) && LeadStatus.Pending.Contains(r.Status)),
                Revenue = rows.Where(r => In(r.ConvertedDate)).Sum(r => r.DealValue ?? 0)
            });
        }

        return result;
    }

    private static double Pct(double current, double previous)
    {
        if (previous == 0) return current > 0 ? 100 : 0;
        return Math.Round((current - previous) / previous * 100.0, 1);
    }
}
