using ClosedXML.Excel;
using CrmApi.Data;
using CrmApi.Models;
using CrmApi.Security;
using CrmApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CrmApi.Controllers;

/// <summary>
/// Excel (.xlsx) export for every grid. Access is authority-controlled: each
/// endpoint requires CanExport on its module, so a role can be allowed to view
/// a grid but still be blocked from downloading it. Status cells are shaded to
/// match the colours shown in the UI.
/// </summary>
[ApiController]
[Route("api/export")]
[Authorize]
public class ExportController(CrmDbContext db, ILeadScopeService scope) : ControllerBase
{
    private const string XlsxContentType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /// <summary>Fill + font colour per lead status - mirrors the badge colours on the grid.</summary>
    private static (XLColor Fill, XLColor Font) StatusColors(string status) => status switch
    {
        LeadStatus.New       => (XLColor.FromHtml("#E3EEFB"), XLColor.FromHtml("#1C5CAB")),
        LeadStatus.Contacted => (XLColor.FromHtml("#FCEFD2"), XLColor.FromHtml("#9A6A00")),
        LeadStatus.Qualified => (XLColor.FromHtml("#D6F3E6"), XLColor.FromHtml("#0E7A52")),
        LeadStatus.Converted => (XLColor.FromHtml("#D6F5D6"), XLColor.FromHtml("#0A7A0A")),
        LeadStatus.Rejected  => (XLColor.FromHtml("#FBDEDE"), XLColor.FromHtml("#B02A2A")),
        _                    => (XLColor.FromHtml("#EEEEEE"), XLColor.FromHtml("#555555")),
    };

    [HttpGet("leads")]
    [RequirePermission("leads", PermAction.Export)]
    public Task<IActionResult> ExportLeads(
        [FromQuery] string? search, [FromQuery] string? status,
        [FromQuery] int? sourceId, [FromQuery] int? projectId,
        [FromQuery] int? assignedToUserId,
        [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate)
        => ExportLeadTab("leads", search, status, sourceId, projectId, assignedToUserId, fromDate, toDate);

    [HttpGet("clients")]
    [RequirePermission("clients", PermAction.Export)]
    public Task<IActionResult> ExportClients(
        [FromQuery] string? search, [FromQuery] int? sourceId, [FromQuery] int? projectId,
        [FromQuery] int? assignedToUserId,
        [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate)
        => ExportLeadTab("clients", search, null, sourceId, projectId, assignedToUserId, fromDate, toDate);

    [HttpGet("pending")]
    [RequirePermission("pending", PermAction.Export)]
    public Task<IActionResult> ExportPending(
        [FromQuery] string? search, [FromQuery] int? sourceId, [FromQuery] int? projectId,
        [FromQuery] int? assignedToUserId,
        [FromQuery] DateOnly? fromDate, [FromQuery] DateOnly? toDate)
        => ExportLeadTab("pending", search, null, sourceId, projectId, assignedToUserId, fromDate, toDate);

    private async Task<IActionResult> ExportLeadTab(
        string tab, string? search, string? status,
        int? sourceId, int? projectId, int? assignedToUserId,
        DateOnly? fromDate, DateOnly? toDate)
    {
        var q = await scope.ApplyAsync(
            db.Leads.AsNoTracking()
                .Include(l => l.Source).Include(l => l.Project).Include(l => l.Area)
                .Include(l => l.AssignedToUser)
                .Where(l => l.IsActive),
            User.GetUserId(), User.GetRoleId());

        q = tab switch
        {
            "clients" => q.Where(l => l.Status == LeadStatus.Converted),
            "pending" => q.Where(l => LeadStatus.Pending.Contains(l.Status)),
            _ => q
        };

        if (!string.IsNullOrWhiteSpace(status) && tab == "leads")
            q = q.Where(l => l.Status == status);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(l =>
                l.FullName.Contains(s) || l.Phone.Contains(s) ||
                (l.Email != null && l.Email.Contains(s)) ||
                (l.City != null && l.City.Contains(s)) || l.LeadCode.Contains(s));
        }
        if (sourceId.HasValue) q = q.Where(l => l.SourceId == sourceId);
        if (projectId.HasValue) q = q.Where(l => l.ProjectId == projectId);
        if (assignedToUserId.HasValue) q = q.Where(l => l.AssignedToUserId == assignedToUserId);

        if (fromDate.HasValue)
            q = tab == "clients" ? q.Where(l => l.ConvertedDate >= fromDate) : q.Where(l => l.LeadDate >= fromDate);
        if (toDate.HasValue)
            q = tab == "clients" ? q.Where(l => l.ConvertedDate <= toDate) : q.Where(l => l.LeadDate <= toDate);

        var rows = await q.OrderByDescending(l => l.LeadDate).ThenByDescending(l => l.LeadId).ToListAsync();

        var title = tab switch { "clients" => "Clients", "pending" => "Pending", _ => "Leads" };

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add(title);

        string[] headers =
        [
            "Code", "Name", "Phone", "Email", "City", "Area", "Source", "Project",
            "Property Type", "Budget", "Deal Value", "Status", "Assigned To",
            "Lead Date", "Converted Date", "Rejected Date"
        ];
        WriteHeader(ws, headers);

        var r = 2;
        foreach (var l in rows)
        {
            ws.Cell(r, 1).Value = l.LeadCode;
            ws.Cell(r, 2).Value = l.FullName;
            ws.Cell(r, 3).Value = l.Phone;
            ws.Cell(r, 4).Value = l.Email ?? "";
            ws.Cell(r, 5).Value = l.City ?? "";
            ws.Cell(r, 6).Value = l.Area?.AreaName ?? "";
            ws.Cell(r, 7).Value = l.Source?.SourceName ?? "";
            ws.Cell(r, 8).Value = l.Project?.ProjectName ?? "";
            ws.Cell(r, 9).Value = l.PropertyType ?? "";
            if (l.Budget.HasValue) ws.Cell(r, 10).Value = l.Budget.Value;
            if (l.DealValue.HasValue) ws.Cell(r, 11).Value = l.DealValue.Value;

            // Status cell shaded like the on-screen badge.
            var statusCell = ws.Cell(r, 12);
            statusCell.Value = l.Status;
            var (fill, font) = StatusColors(l.Status);
            statusCell.Style.Fill.BackgroundColor = fill;
            statusCell.Style.Font.FontColor = font;
            statusCell.Style.Font.Bold = true;
            statusCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            ws.Cell(r, 13).Value = l.AssignedToUser?.FullName ?? "";
            ws.Cell(r, 14).Value = l.LeadDate.ToString("dd-MMM-yyyy");
            ws.Cell(r, 15).Value = l.ConvertedDate?.ToString("dd-MMM-yyyy") ?? "";
            ws.Cell(r, 16).Value = l.RejectedDate?.ToString("dd-MMM-yyyy") ?? "";
            r++;
        }

        ws.Column(10).Style.NumberFormat.Format = "#,##0";
        ws.Column(11).Style.NumberFormat.Format = "#,##0";
        Finish(ws, headers.Length, r - 1);

        return Workbook(wb, $"{title}_{DateTime.Now:yyyy-MM-dd}.xlsx");
    }

    [HttpGet("users")]
    [RequirePermission("users", PermAction.Export)]
    public async Task<IActionResult> ExportUsers()
    {
        var users = await db.Users.AsNoTracking().Include(u => u.Role)
            .OrderBy(u => u.FullName).ToListAsync();

        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Users");

        string[] headers = ["Name", "Username", "Email", "Phone", "Role", "Status", "Last Login", "Created"];
        WriteHeader(ws, headers);

        var r = 2;
        foreach (var u in users)
        {
            ws.Cell(r, 1).Value = u.FullName;
            ws.Cell(r, 2).Value = u.Username;
            ws.Cell(r, 3).Value = u.Email;
            ws.Cell(r, 4).Value = u.Phone ?? "";
            ws.Cell(r, 5).Value = u.Role?.RoleName ?? "";

            var statusCell = ws.Cell(r, 6);
            statusCell.Value = u.IsActive ? "Active" : "Inactive";
            statusCell.Style.Fill.BackgroundColor =
                u.IsActive ? XLColor.FromHtml("#D6F5D6") : XLColor.FromHtml("#FBDEDE");
            statusCell.Style.Font.FontColor =
                u.IsActive ? XLColor.FromHtml("#0A7A0A") : XLColor.FromHtml("#B02A2A");
            statusCell.Style.Font.Bold = true;
            statusCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            ws.Cell(r, 7).Value = u.LastLoginAt?.ToString("dd-MMM-yyyy HH:mm") ?? "Never";
            ws.Cell(r, 8).Value = u.CreatedAt.ToString("dd-MMM-yyyy");
            r++;
        }

        Finish(ws, headers.Length, r - 1);
        return Workbook(wb, $"Users_{DateTime.Now:yyyy-MM-dd}.xlsx");
    }

    /* ---------------- shared styling ---------------- */

    private static void WriteHeader(IXLWorksheet ws, string[] headers)
    {
        for (var c = 0; c < headers.Length; c++)
        {
            var cell = ws.Cell(1, c + 1);
            cell.Value = headers[c];
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Fill.BackgroundColor = XLColor.FromHtml("#2A78D6");
            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            cell.Style.Border.BottomBorder = XLBorderStyleValues.Thin;
        }
    }

    private static void Finish(IXLWorksheet ws, int cols, int lastRow)
    {
        ws.SheetView.FreezeRows(1);
        if (lastRow >= 1)
            ws.Range(1, 1, Math.Max(1, lastRow), cols).SetAutoFilter();
        ws.Columns(1, cols).AdjustToContents();
        // Keep very wide columns readable.
        for (var c = 1; c <= cols; c++)
            if (ws.Column(c).Width > 40) ws.Column(c).Width = 40;
    }

    private FileContentResult Workbook(XLWorkbook wb, string fileName)
    {
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return File(ms.ToArray(), XlsxContentType, fileName);
    }
}
