using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CrmApi.Models;

public class Role
{
    [Key] public int RoleId { get; set; }
    public string RoleName { get; set; } = "";
    public string? Description { get; set; }
    public bool IsSystem { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }

    public ICollection<RolePermission> Permissions { get; set; } = new List<RolePermission>();
    public ICollection<User> Users { get; set; } = new List<User>();
}

public class Module
{
    [Key] public int ModuleId { get; set; }
    public string ModuleKey { get; set; } = "";
    public string ModuleName { get; set; } = "";
    public int SortOrder { get; set; }
}

public class RolePermission
{
    [Key] public int RolePermissionId { get; set; }
    public int RoleId { get; set; }
    public int ModuleId { get; set; }
    public bool CanView { get; set; }
    public bool CanCreate { get; set; }
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
    public bool CanExport { get; set; }

    public Role? Role { get; set; }
    public Module? Module { get; set; }
}

public class User
{
    [Key] public int UserId { get; set; }
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string? Phone { get; set; }
    public int RoleId { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public Role? Role { get; set; }
}

public class Source
{
    [Key] public int SourceId { get; set; }
    public string SourceName { get; set; } = "";
    public bool IsActive { get; set; } = true;
}

/* ---------- Per-user data scope ---------- */

public class UserCity
{
    [Key] public int UserCityId { get; set; }
    public int UserId { get; set; }
    public string City { get; set; } = "";
}

public class UserArea
{
    [Key] public int UserAreaId { get; set; }
    public int UserId { get; set; }
    public int AreaId { get; set; }
    public Area? Area { get; set; }
}

public class UserPropertyType
{
    [Key] public int UserPropertyTypeId { get; set; }
    public int UserId { get; set; }
    public string PropertyType { get; set; } = "";
}

/// <summary>Restricts the Leads grid to leads assigned to the chosen agents.</summary>
public class UserAgent
{
    [Key] public int UserAgentId { get; set; }
    public int UserId { get; set; }
    public int AgentUserId { get; set; }
}

public class SiteVisit
{
    [Key] public int VisitId { get; set; }
    public int AgentUserId { get; set; }
    public int LeadId { get; set; }
    public string Status { get; set; } = VisitStatus.Ongoing;
    public decimal? StartLat { get; set; }
    public decimal? StartLng { get; set; }
    public decimal? EndLat { get; set; }
    public decimal? EndLng { get; set; }
    public string? Purpose { get; set; }
    public string? Remark { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    public User? Agent { get; set; }
    public Lead? Lead { get; set; }
    public ICollection<VisitPoint> Points { get; set; } = new List<VisitPoint>();
}

public class VisitPoint
{
    [Key] public int PointId { get; set; }
    public int VisitId { get; set; }
    public decimal Lat { get; set; }
    public decimal Lng { get; set; }
    public decimal? Accuracy { get; set; }
    public DateTime RecordedAt { get; set; }
}

public static class VisitStatus
{
    public const string Ongoing = "Ongoing";
    public const string Completed = "Completed";
    public const string Cancelled = "Cancelled";
}

/// <summary>Per-user module permission (View/Create/Edit/Delete/Export).</summary>
public class UserPermission
{
    [Key] public int UserPermissionId { get; set; }
    public int UserId { get; set; }
    public int ModuleId { get; set; }
    public bool CanView { get; set; }
    public bool CanCreate { get; set; }
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
    public bool CanExport { get; set; }

    public Module? Module { get; set; }
}

public class Project
{
    [Key] public int ProjectId { get; set; }
    public string ProjectName { get; set; } = "";
    public string? City { get; set; }
    public bool IsActive { get; set; } = true;
}

public class Area
{
    [Key] public int AreaId { get; set; }
    public string AreaName { get; set; } = "";
    public string? City { get; set; }
    public bool IsActive { get; set; } = true;
}

public class PropertyType
{
    [Key] public int PropertyTypeId { get; set; }
    public string TypeName { get; set; } = "";
    public bool IsActive { get; set; } = true;
}

public class Lead
{
    [Key] public int LeadId { get; set; }

    [DatabaseGenerated(DatabaseGeneratedOption.Computed)]
    public string LeadCode { get; set; } = "";

    public string FullName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? Email { get; set; }
    public string? City { get; set; }
    public string? Address { get; set; }

    public int? SourceId { get; set; }
    public int? ProjectId { get; set; }
    public int? AreaId { get; set; }

    public string? PropertyType { get; set; }
    public decimal? Budget { get; set; }
    public decimal? DealValue { get; set; }

    public string Status { get; set; } = LeadStatus.New;
    public string? RejectReason { get; set; }
    public string? Notes { get; set; }

    public int? AssignedToUserId { get; set; }

    public DateOnly LeadDate { get; set; }
    public DateOnly? ConvertedDate { get; set; }
    public DateOnly? RejectedDate { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? UpdatedAt { get; set; }

    public Source? Source { get; set; }
    public Project? Project { get; set; }
    public Area? Area { get; set; }
    public User? AssignedToUser { get; set; }
}

public class LeadStatusHistory
{
    [Key] public int HistoryId { get; set; }
    public int LeadId { get; set; }
    public string? FromStatus { get; set; }
    public string ToStatus { get; set; } = "";
    public int? ChangedByUserId { get; set; }
    public DateTime ChangedAt { get; set; }
    public string? Remark { get; set; }

    public User? ChangedByUser { get; set; }
}

/// <summary>Canonical lead status values. Must match CK_Leads_Status in the database.</summary>
public static class LeadStatus
{
    public const string New = "New";
    public const string Contacted = "Contacted";
    public const string Qualified = "Qualified";
    public const string Converted = "Converted";
    public const string Rejected = "Rejected";

    /// <summary>Statuses that mean "still in the funnel" - these drive the Pending tab.</summary>
    public static readonly string[] Pending = [New, Contacted, Qualified];

    public static readonly string[] All = [New, Contacted, Qualified, Converted, Rejected];

    public static bool IsValid(string? s) => s is not null && All.Contains(s);
}
