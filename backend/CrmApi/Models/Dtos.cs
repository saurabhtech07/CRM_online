using System.ComponentModel.DataAnnotations;

namespace CrmApi.Models.Dtos;

/* ---------------- Auth ---------------- */

public record LoginRequest
{
    [Required] public string Username { get; init; } = "";
    [Required] public string Password { get; init; } = "";
}

public record ChangePasswordRequest
{
    [Required] public string CurrentPassword { get; init; } = "";
    [Required, MinLength(6)] public string NewPassword { get; init; } = "";
}

public record ModulePermissionDto
{
    public int ModuleId { get; init; }
    public string ModuleKey { get; init; } = "";
    public string ModuleName { get; init; } = "";
    public int SortOrder { get; init; }
    public bool CanView { get; init; }
    public bool CanCreate { get; init; }
    public bool CanEdit { get; init; }
    public bool CanDelete { get; init; }
    public bool CanExport { get; init; }
}

public record AuthUserDto
{
    public int UserId { get; init; }
    public string FullName { get; init; } = "";
    public string Username { get; init; } = "";
    public string Email { get; init; } = "";
    public int RoleId { get; init; }
    public string RoleName { get; init; } = "";
    public List<ModulePermissionDto> Permissions { get; init; } = [];
}

public record LoginResponse
{
    public string Token { get; init; } = "";
    public DateTime ExpiresAt { get; init; }
    public AuthUserDto User { get; init; } = new();
}

/* ---------------- Users ---------------- */

public record UserDto
{
    public int UserId { get; init; }
    public string FullName { get; init; } = "";
    public string Email { get; init; } = "";
    public string Username { get; init; } = "";
    public string? Phone { get; init; }
    public int RoleId { get; init; }
    public string RoleName { get; init; } = "";
    public bool IsActive { get; init; }
    public DateTime? LastLoginAt { get; init; }
    public DateTime CreatedAt { get; init; }

    /// <summary>Data scope - which cities / areas / property types this user may see.</summary>
    public List<string> Cities { get; init; } = [];
    public List<int> AreaIds { get; init; } = [];
    public List<string> PropertyTypes { get; init; } = [];
    /// <summary>Agents whose assigned leads this user may see in the Leads grid.</summary>
    public List<int> AgentUserIds { get; init; } = [];

    /// <summary>Per-user module authority (View/Create/Edit/Delete/Export).</summary>
    public List<ModulePermissionDto> Permissions { get; init; } = [];
}

/// <summary>Save a user's whole module-permission matrix (from the authority pane).</summary>
public record SaveUserPermissionsRequest
{
    public List<PermissionInput> Permissions { get; init; } = [];
}

/// <summary>Save a user's data scope (cities / areas / property types / agents).</summary>
public record SaveUserScopeRequest
{
    public List<string> Cities { get; init; } = [];
    public List<int> AreaIds { get; init; } = [];
    public List<string> PropertyTypes { get; init; } = [];
    public List<int> AgentUserIds { get; init; } = [];
}

public record CreateUserRequest
{
    [Required, MaxLength(100)] public string FullName { get; init; } = "";
    [Required, EmailAddress, MaxLength(150)] public string Email { get; init; } = "";
    [Required, MaxLength(50)] public string Username { get; init; } = "";
    [Required, MinLength(6)] public string Password { get; init; } = "";
    [MaxLength(20)] public string? Phone { get; init; }
    [Required] public int RoleId { get; init; }
    public bool IsActive { get; init; } = true;

    public List<string> Cities { get; init; } = [];
    public List<int> AreaIds { get; init; } = [];
    public List<string> PropertyTypes { get; init; } = [];
    public List<int> AgentUserIds { get; init; } = [];
}

public record UpdateUserRequest
{
    [Required, MaxLength(100)] public string FullName { get; init; } = "";
    [Required, EmailAddress, MaxLength(150)] public string Email { get; init; } = "";
    [MaxLength(20)] public string? Phone { get; init; }
    [Required] public int RoleId { get; init; }
    public bool IsActive { get; init; } = true;
    /// <summary>Optional - when supplied the user's password is reset to this value.</summary>
    public string? NewPassword { get; init; }

    public List<string> Cities { get; init; } = [];
    public List<int> AreaIds { get; init; } = [];
    public List<string> PropertyTypes { get; init; } = [];
}

/* ---------------- Roles & permissions ---------------- */

public record RoleDto
{
    public int RoleId { get; init; }
    public string RoleName { get; init; } = "";
    public string? Description { get; init; }
    public bool IsSystem { get; init; }
    public bool IsActive { get; init; }
    public int UserCount { get; init; }
    public List<ModulePermissionDto> Permissions { get; init; } = [];
}

public record SaveRoleRequest
{
    [Required, MaxLength(50)] public string RoleName { get; init; } = "";
    [MaxLength(200)] public string? Description { get; init; }
    public bool IsActive { get; init; } = true;
    public List<PermissionInput> Permissions { get; init; } = [];
}

public record PermissionInput
{
    public int ModuleId { get; init; }
    public bool CanView { get; init; }
    public bool CanCreate { get; init; }
    public bool CanEdit { get; init; }
    public bool CanDelete { get; init; }
    public bool CanExport { get; init; }
}

/* ---------------- Leads ---------------- */

public record LeadDto
{
    public int LeadId { get; init; }
    public string LeadCode { get; init; } = "";
    public string FullName { get; init; } = "";
    public string Phone { get; init; } = "";
    public string? Email { get; init; }
    public string? City { get; init; }
    public string? Address { get; init; }
    public int? SourceId { get; init; }
    public string? SourceName { get; init; }
    public int? ProjectId { get; init; }
    public string? ProjectName { get; init; }
    public int? AreaId { get; init; }
    public string? AreaName { get; init; }
    public string? PropertyType { get; init; }
    public decimal? Budget { get; init; }
    public decimal? DealValue { get; init; }
    public string Status { get; init; } = "";
    public string? RejectReason { get; init; }
    public string? Notes { get; init; }
    public int? AssignedToUserId { get; init; }
    public string? AssignedToName { get; init; }
    public DateOnly LeadDate { get; init; }
    public DateOnly? ConvertedDate { get; init; }
    public DateOnly? RejectedDate { get; init; }
    public DateTime CreatedAt { get; init; }
}

public record SaveLeadRequest
{
    [Required, MaxLength(100)] public string FullName { get; init; } = "";
    [Required, MaxLength(20)] public string Phone { get; init; } = "";
    [MaxLength(150)] public string? Email { get; init; }
    [MaxLength(60)] public string? City { get; init; }
    [MaxLength(300)] public string? Address { get; init; }
    public int? SourceId { get; init; }
    public int? ProjectId { get; init; }
    public int? AreaId { get; init; }
    [MaxLength(60)] public string? PropertyType { get; init; }
    public decimal? Budget { get; init; }
    public decimal? DealValue { get; init; }
    [Required] public string Status { get; init; } = "New";
    [MaxLength(300)] public string? RejectReason { get; init; }
    [MaxLength(1000)] public string? Notes { get; init; }
    public int? AssignedToUserId { get; init; }
    public DateOnly? LeadDate { get; init; }
}

public record ChangeStatusRequest
{
    [Required] public string Status { get; init; } = "";
    public decimal? DealValue { get; init; }
    [MaxLength(300)] public string? RejectReason { get; init; }
    [MaxLength(300)] public string? Remark { get; init; }
}

public record LeadHistoryDto
{
    public int HistoryId { get; init; }
    public string? FromStatus { get; init; }
    public string ToStatus { get; init; } = "";
    public string? ChangedByName { get; init; }
    public DateTime ChangedAt { get; init; }
    public string? Remark { get; init; }
}

/* ---------------- Common ---------------- */

public record PagedResult<T>
{
    public List<T> Items { get; init; } = [];
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalCount { get; init; }
    public int TotalPages => PageSize > 0 ? (int)Math.Ceiling(TotalCount / (double)PageSize) : 0;
}

public record LookupDto
{
    public int Id { get; init; }
    public string Name { get; init; } = "";
}

/// <summary>Payload for creating a lookup value inline from the lead form.</summary>
public record SaveLookupRequest
{
    [Required, MaxLength(100)] public string Name { get; init; } = "";
    [MaxLength(60)] public string? City { get; init; }
}

/// <summary>A visit-eligible lead with a pre-filled purpose for the site-visit form.</summary>
public record VisitLeadDto
{
    public int Id { get; init; }
    public string Name { get; init; } = "";
    public string Purpose { get; init; } = "";
}

/* ---------------- Dashboard ---------------- */

public record MonthlyStatDto
{
    public int Year { get; init; }
    public int Month { get; init; }
    public string MonthName { get; init; } = "";
    public string Label { get; init; } = "";
    public int TotalLeads { get; init; }
    public int Clients { get; init; }
    public int Rejected { get; init; }
    public int Pending { get; init; }
    public decimal Revenue { get; init; }
}

public record DashboardSummaryDto
{
    /// <summary>Totals for the selected period.</summary>
    public int TotalLeads { get; init; }
    public int Clients { get; init; }
    public int Rejected { get; init; }
    public int Pending { get; init; }
    public decimal Revenue { get; init; }
    public double ConversionRate { get; init; }

    /// <summary>Percentage change vs the immediately preceding period of equal length.</summary>
    public double LeadsChangePct { get; init; }
    public double ClientsChangePct { get; init; }
    public double RejectedChangePct { get; init; }
    public double RevenueChangePct { get; init; }
}

public record DashboardResponse
{
    public DashboardSummaryDto Summary { get; init; } = new();
    /// <summary>Current month plus the previous 5 months.</summary>
    public List<MonthlyStatDto> Trend { get; init; } = [];
    public List<LookupCountDto> BySource { get; init; } = [];
    public List<LookupCountDto> ByProject { get; init; } = [];
    public List<LookupCountDto> ByStatus { get; init; } = [];
    public List<LeadDto> RecentLeads { get; init; } = [];
}

public record LookupCountDto
{
    public string Name { get; init; } = "";
    public int Count { get; init; }
    public decimal Value { get; init; }
}

/* ---------------- Assistant (chatbot) ---------------- */

public record AssistantResult
{
    public string Query { get; init; } = "";
    public List<AssistantMatch> Matches { get; init; } = [];
    public string? Message { get; init; }
}

public record AssistantMatch
{
    public int LeadId { get; init; }
    public string LeadCode { get; init; } = "";
    public string FullName { get; init; } = "";
    public string Phone { get; init; } = "";
    public string? Email { get; init; }
    public string? City { get; init; }
    public string? Area { get; init; }
    public string? Source { get; init; }
    public string? Project { get; init; }
    public string? PropertyType { get; init; }
    public decimal? Budget { get; init; }
    public decimal? DealValue { get; init; }
    public string Status { get; init; } = "";
    public string? AssignedTo { get; init; }
    public string? Notes { get; init; }
    public string? RejectReason { get; init; }
    public DateOnly LeadDate { get; init; }
    public DateOnly? ConvertedDate { get; init; }
    public DateOnly? RejectedDate { get; init; }
    public List<AssistantHistory> History { get; init; } = [];
}

public record AssistantHistory
{
    public string? FromStatus { get; init; }
    public string ToStatus { get; init; } = "";
    public string? ChangedBy { get; init; }
    public DateTime ChangedAt { get; init; }
    public string? Remark { get; init; }
}

/* ---------------- Site visits ---------------- */

public record StartVisitRequest
{
    [Required] public int LeadId { get; init; }
    public decimal? Lat { get; init; }
    public decimal? Lng { get; init; }
    [MaxLength(300)] public string? Purpose { get; init; }
}

public record VisitPingRequest
{
    [Required] public decimal Lat { get; init; }
    [Required] public decimal Lng { get; init; }
    public decimal? Accuracy { get; init; }
}

public record CompleteVisitRequest
{
    public decimal? Lat { get; init; }
    public decimal? Lng { get; init; }
    [MaxLength(500)] public string? Remark { get; init; }
    /// <summary>False marks the visit Cancelled instead of Completed.</summary>
    public bool Completed { get; init; } = true;
}

public record VisitPointDto
{
    public decimal Lat { get; init; }
    public decimal Lng { get; init; }
    public DateTime RecordedAt { get; init; }
}

public record SiteVisitDto
{
    public int VisitId { get; init; }
    public int AgentUserId { get; init; }
    public string AgentName { get; init; } = "";
    public int LeadId { get; init; }
    public string LeadCode { get; init; } = "";
    public string ClientName { get; init; } = "";
    public string? ClientPhone { get; init; }
    public string? City { get; init; }
    public string? Area { get; init; }
    public string? ProjectName { get; init; }
    public string Status { get; init; } = "";
    public string? Purpose { get; init; }
    public string? Remark { get; init; }
    public decimal? StartLat { get; init; }
    public decimal? StartLng { get; init; }
    public decimal? EndLat { get; init; }
    public decimal? EndLng { get; init; }
    public decimal? LastLat { get; init; }
    public decimal? LastLng { get; init; }
    public DateTime StartedAt { get; init; }
    public DateTime? CompletedAt { get; init; }
    public int PointCount { get; init; }
    public List<VisitPointDto> Path { get; init; } = [];
}
