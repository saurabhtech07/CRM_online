/* =============================================================
   Real Estate CRM - 02 Schema
   Tables: Roles, Modules, RolePermissions, Users,
           Sources, Projects, Leads, LeadStatusHistory
   Everything is Id based. Leads carry a Status that moves
   New/Contacted/Qualified -> Converted (Client)
                           -> Rejected
                           -> anything else = Pending
   ============================================================= */
USE RealEstateCRM;
GO

/* Required for the PERSISTED computed column on dbo.Leads */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ---------- Drop in dependency order (safe re-run) ---------- */
IF OBJECT_ID('dbo.LeadStatusHistory','U') IS NOT NULL DROP TABLE dbo.LeadStatusHistory;
IF OBJECT_ID('dbo.Leads','U')             IS NOT NULL DROP TABLE dbo.Leads;
IF OBJECT_ID('dbo.UserCities','U')        IS NOT NULL DROP TABLE dbo.UserCities;
IF OBJECT_ID('dbo.UserAreas','U')         IS NOT NULL DROP TABLE dbo.UserAreas;
IF OBJECT_ID('dbo.UserPropertyTypes','U') IS NOT NULL DROP TABLE dbo.UserPropertyTypes;
IF OBJECT_ID('dbo.UserAgents','U')        IS NOT NULL DROP TABLE dbo.UserAgents;
IF OBJECT_ID('dbo.VisitPoints','U')       IS NOT NULL DROP TABLE dbo.VisitPoints;
IF OBJECT_ID('dbo.SiteVisits','U')        IS NOT NULL DROP TABLE dbo.SiteVisits;
IF OBJECT_ID('dbo.UserPermissions','U')   IS NOT NULL DROP TABLE dbo.UserPermissions;
IF OBJECT_ID('dbo.RolePermissions','U')   IS NOT NULL DROP TABLE dbo.RolePermissions;
IF OBJECT_ID('dbo.Users','U')             IS NOT NULL DROP TABLE dbo.Users;
IF OBJECT_ID('dbo.Roles','U')             IS NOT NULL DROP TABLE dbo.Roles;
IF OBJECT_ID('dbo.Modules','U')           IS NOT NULL DROP TABLE dbo.Modules;
IF OBJECT_ID('dbo.Sources','U')           IS NOT NULL DROP TABLE dbo.Sources;
IF OBJECT_ID('dbo.Projects','U')          IS NOT NULL DROP TABLE dbo.Projects;
IF OBJECT_ID('dbo.Areas','U')             IS NOT NULL DROP TABLE dbo.Areas;
IF OBJECT_ID('dbo.PropertyTypes','U')     IS NOT NULL DROP TABLE dbo.PropertyTypes;
GO

/* ---------- Roles ---------- */
CREATE TABLE dbo.Roles (
    RoleId       INT IDENTITY(1,1) PRIMARY KEY,
    RoleName     NVARCHAR(50)  NOT NULL UNIQUE,
    Description  NVARCHAR(200) NULL,
    IsSystem     BIT           NOT NULL DEFAULT 0,   -- system roles cannot be deleted
    IsActive     BIT           NOT NULL DEFAULT 1,
    CreatedAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- Modules (the things authority is granted on) ---------- */
CREATE TABLE dbo.Modules (
    ModuleId     INT IDENTITY(1,1) PRIMARY KEY,
    ModuleKey    NVARCHAR(50)  NOT NULL UNIQUE,      -- dashboard, leads, clients, pending, users
    ModuleName   NVARCHAR(100) NOT NULL,
    SortOrder    INT           NOT NULL DEFAULT 0
);
GO

/* ---------- Role x Module permission matrix ---------- */
CREATE TABLE dbo.RolePermissions (
    RolePermissionId INT IDENTITY(1,1) PRIMARY KEY,
    RoleId    INT NOT NULL FOREIGN KEY REFERENCES dbo.Roles(RoleId)   ON DELETE CASCADE,
    ModuleId  INT NOT NULL FOREIGN KEY REFERENCES dbo.Modules(ModuleId) ON DELETE CASCADE,
    CanView   BIT NOT NULL DEFAULT 0,
    CanCreate BIT NOT NULL DEFAULT 0,
    CanEdit   BIT NOT NULL DEFAULT 0,
    CanDelete BIT NOT NULL DEFAULT 0,
    CanExport BIT NOT NULL DEFAULT 0,
    CONSTRAINT UQ_RolePermissions UNIQUE (RoleId, ModuleId)
);
GO

/* ---------- Users ---------- */
CREATE TABLE dbo.Users (
    UserId       INT IDENTITY(1,1) PRIMARY KEY,
    FullName     NVARCHAR(100) NOT NULL,
    Email        NVARCHAR(150) NOT NULL UNIQUE,
    Username     NVARCHAR(50)  NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    Phone        NVARCHAR(20)  NULL,
    RoleId       INT           NOT NULL FOREIGN KEY REFERENCES dbo.Roles(RoleId),
    IsActive     BIT           NOT NULL DEFAULT 1,
    LastLoginAt  DATETIME2     NULL,
    CreatedAt    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt    DATETIME2     NULL
);
CREATE INDEX IX_Users_RoleId ON dbo.Users(RoleId);
GO

/* ---------- Lookup: lead source ---------- */
CREATE TABLE dbo.Sources (
    SourceId   INT IDENTITY(1,1) PRIMARY KEY,
    SourceName NVARCHAR(50) NOT NULL UNIQUE,
    IsActive   BIT NOT NULL DEFAULT 1
);
GO

/* ---------- Lookup: property / project ---------- */
CREATE TABLE dbo.Projects (
    ProjectId   INT IDENTITY(1,1) PRIMARY KEY,
    ProjectName NVARCHAR(100) NOT NULL UNIQUE,
    City        NVARCHAR(60)  NULL,
    IsActive    BIT NOT NULL DEFAULT 1
);
GO

/* ---------- Lookup: area (locality within a city) ---------- */
CREATE TABLE dbo.Areas (
    AreaId   INT IDENTITY(1,1) PRIMARY KEY,
    AreaName NVARCHAR(100) NOT NULL UNIQUE,
    City     NVARCHAR(60)  NULL,
    IsActive BIT NOT NULL DEFAULT 1
);
GO

/* ---------- Lookup: property type ---------- */
CREATE TABLE dbo.PropertyTypes (
    PropertyTypeId INT IDENTITY(1,1) PRIMARY KEY,
    TypeName NVARCHAR(60) NOT NULL UNIQUE,
    IsActive BIT NOT NULL DEFAULT 1
);
GO

/* ---------- Per-user data scope ----------
   A user only sees leads whose City / Area / PropertyType is in their assigned
   set. An empty set means "sees nothing" - EXCEPT the Admin role, which the API
   exempts entirely. Multiple values per user (tag-box selection).            */
CREATE TABLE dbo.UserCities (
    UserCityId INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    City   NVARCHAR(60) NOT NULL,
    CONSTRAINT UQ_UserCities UNIQUE(UserId, City)
);
GO

CREATE TABLE dbo.UserAreas (
    UserAreaId INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    AreaId INT NOT NULL FOREIGN KEY REFERENCES dbo.Areas(AreaId),
    CONSTRAINT UQ_UserAreas UNIQUE(UserId, AreaId)
);
GO

CREATE TABLE dbo.UserPropertyTypes (
    UserPropertyTypeId INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    PropertyType NVARCHAR(60) NOT NULL,
    CONSTRAINT UQ_UserPropertyTypes UNIQUE(UserId, PropertyType)
);
GO

/* ---------- Which agents' assigned leads a user may see (Leads grid only) ----------
   Empty = no agent restriction. When set, the Leads grid is limited to leads
   assigned to any of the chosen agents (on top of the city/area/type scope).   */
CREATE TABLE dbo.UserAgents (
    UserAgentId INT IDENTITY(1,1) PRIMARY KEY,
    UserId      INT NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    AgentUserId INT NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId),
    CONSTRAINT UQ_UserAgents UNIQUE(UserId, AgentUserId)
);
GO

/* ---------- Per-user module permissions (View/Create/Edit/Delete/Export) ----------
   Authority is per USER, not per role. RolePermissions still exists so a new user
   can be seeded from a role's defaults, but access checks read UserPermissions.  */
CREATE TABLE dbo.UserPermissions (
    UserPermissionId INT IDENTITY(1,1) PRIMARY KEY,
    UserId    INT NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    ModuleId  INT NOT NULL FOREIGN KEY REFERENCES dbo.Modules(ModuleId),
    CanView   BIT NOT NULL DEFAULT 0,
    CanCreate BIT NOT NULL DEFAULT 0,
    CanEdit   BIT NOT NULL DEFAULT 0,
    CanDelete BIT NOT NULL DEFAULT 0,
    CanExport BIT NOT NULL DEFAULT 0,
    CONSTRAINT UQ_UserPermissions UNIQUE(UserId, ModuleId)
);
GO

/* ---------- Leads (single table drives Leads / Clients / Pending tabs) ---------- */
CREATE TABLE dbo.Leads (
    LeadId         INT IDENTITY(1,1) PRIMARY KEY,
    LeadCode       AS ('LD-' + RIGHT('00000' + CAST(LeadId AS VARCHAR(10)), 5)) PERSISTED,

    FullName       NVARCHAR(100) NOT NULL,
    Phone          NVARCHAR(20)  NOT NULL,
    Email          NVARCHAR(150) NULL,
    City           NVARCHAR(60)  NULL,
    Address        NVARCHAR(300) NULL,

    SourceId       INT NULL FOREIGN KEY REFERENCES dbo.Sources(SourceId),
    ProjectId      INT NULL FOREIGN KEY REFERENCES dbo.Projects(ProjectId),
    AreaId         INT NULL FOREIGN KEY REFERENCES dbo.Areas(AreaId),

    PropertyType   NVARCHAR(60)  NULL,   -- free text; also picked from PropertyTypes lookup
    Budget         DECIMAL(18,2) NULL,
    DealValue      DECIMAL(18,2) NULL,   -- filled when converted

    -- New | Contacted | Qualified | Converted | Rejected
    Status         NVARCHAR(20)  NOT NULL DEFAULT 'New',
    RejectReason   NVARCHAR(300) NULL,
    Notes          NVARCHAR(1000) NULL,

    AssignedToUserId INT NULL FOREIGN KEY REFERENCES dbo.Users(UserId),

    LeadDate       DATE      NOT NULL,          -- date lead arrived (drives dashboard)
    ConvertedDate  DATE      NULL,
    RejectedDate   DATE      NULL,

    IsActive       BIT       NOT NULL DEFAULT 1,
    CreatedAt      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CreatedByUserId INT NULL FOREIGN KEY REFERENCES dbo.Users(UserId),
    UpdatedAt      DATETIME2 NULL,

    CONSTRAINT CK_Leads_Status CHECK (Status IN ('New','Contacted','Qualified','Converted','Rejected'))
);
CREATE INDEX IX_Leads_LeadDate ON dbo.Leads(LeadDate);
CREATE INDEX IX_Leads_Status   ON dbo.Leads(Status);
CREATE INDEX IX_Leads_Assigned ON dbo.Leads(AssignedToUserId);
GO

/* ---------- Site visits: agent goes to show a lead a property, tracked live ----------
   Created after dbo.Leads because LeadId is a FK into it.                        */
CREATE TABLE dbo.SiteVisits (
    VisitId       INT IDENTITY(1,1) PRIMARY KEY,
    AgentUserId   INT NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId),
    LeadId        INT NOT NULL FOREIGN KEY REFERENCES dbo.Leads(LeadId),
    Status        NVARCHAR(20) NOT NULL DEFAULT 'Ongoing',  -- Ongoing | Completed | Cancelled
    StartLat      DECIMAL(9,6) NULL,
    StartLng      DECIMAL(9,6) NULL,
    EndLat        DECIMAL(9,6) NULL,
    EndLng        DECIMAL(9,6) NULL,
    Purpose       NVARCHAR(300) NULL,
    Remark        NVARCHAR(500) NULL,
    StartedAt     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CompletedAt   DATETIME2 NULL
);
CREATE INDEX IX_SiteVisits_Agent  ON dbo.SiteVisits(AgentUserId);
CREATE INDEX IX_SiteVisits_Status ON dbo.SiteVisits(Status);
GO

/* ---------- Breadcrumb points captured during a visit (the moving path) ---------- */
CREATE TABLE dbo.VisitPoints (
    PointId    INT IDENTITY(1,1) PRIMARY KEY,
    VisitId    INT NOT NULL FOREIGN KEY REFERENCES dbo.SiteVisits(VisitId) ON DELETE CASCADE,
    Lat        DECIMAL(9,6) NOT NULL,
    Lng        DECIMAL(9,6) NOT NULL,
    Accuracy   DECIMAL(9,2) NULL,
    RecordedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_VisitPoints_Visit ON dbo.VisitPoints(VisitId);
GO

/* ---------- Audit trail of status moves ---------- */
CREATE TABLE dbo.LeadStatusHistory (
    HistoryId     INT IDENTITY(1,1) PRIMARY KEY,
    LeadId        INT NOT NULL FOREIGN KEY REFERENCES dbo.Leads(LeadId) ON DELETE CASCADE,
    FromStatus    NVARCHAR(20) NULL,
    ToStatus      NVARCHAR(20) NOT NULL,
    ChangedByUserId INT NULL FOREIGN KEY REFERENCES dbo.Users(UserId),
    ChangedAt     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    Remark        NVARCHAR(300) NULL
);
CREATE INDEX IX_LeadStatusHistory_LeadId ON dbo.LeadStatusHistory(LeadId);
GO

/* =============================================================
   Dashboard aggregate - monthly buckets for a given year.
   Returns one row per month so the API can build the
   "this month vs previous 5 months" comparison.
   ============================================================= */
IF OBJECT_ID('dbo.usp_Dashboard_MonthlyStats','P') IS NOT NULL
    DROP PROCEDURE dbo.usp_Dashboard_MonthlyStats;
GO
CREATE PROCEDURE dbo.usp_Dashboard_MonthlyStats
    @FromDate DATE,
    @ToDate   DATE
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH Months AS (
        SELECT DATEFROMPARTS(YEAR(@FromDate), MONTH(@FromDate), 1) AS MonthStart
        UNION ALL
        SELECT DATEADD(MONTH, 1, MonthStart)
        FROM Months
        WHERE DATEADD(MONTH, 1, MonthStart) <= DATEFROMPARTS(YEAR(@ToDate), MONTH(@ToDate), 1)
    )
    SELECT
        YEAR(m.MonthStart)   AS [Year],
        MONTH(m.MonthStart)  AS [Month],
        DATENAME(MONTH, m.MonthStart) AS MonthName,
        ISNULL(SUM(CASE WHEN l.LeadDate      BETWEEN m.MonthStart AND EOMONTH(m.MonthStart) THEN 1 ELSE 0 END), 0) AS TotalLeads,
        ISNULL(SUM(CASE WHEN l.ConvertedDate BETWEEN m.MonthStart AND EOMONTH(m.MonthStart) THEN 1 ELSE 0 END), 0) AS Clients,
        ISNULL(SUM(CASE WHEN l.RejectedDate  BETWEEN m.MonthStart AND EOMONTH(m.MonthStart) THEN 1 ELSE 0 END), 0) AS Rejected,
        ISNULL(SUM(CASE WHEN l.LeadDate      BETWEEN m.MonthStart AND EOMONTH(m.MonthStart)
                         AND l.Status IN ('New','Contacted','Qualified') THEN 1 ELSE 0 END), 0) AS Pending,
        ISNULL(SUM(CASE WHEN l.ConvertedDate BETWEEN m.MonthStart AND EOMONTH(m.MonthStart) THEN l.DealValue ELSE 0 END), 0) AS Revenue
    FROM Months m
    LEFT JOIN dbo.Leads l
           ON l.IsActive = 1
          AND (   l.LeadDate      BETWEEN m.MonthStart AND EOMONTH(m.MonthStart)
               OR l.ConvertedDate BETWEEN m.MonthStart AND EOMONTH(m.MonthStart)
               OR l.RejectedDate  BETWEEN m.MonthStart AND EOMONTH(m.MonthStart) )
    GROUP BY m.MonthStart
    ORDER BY m.MonthStart
    OPTION (MAXRECURSION 1200);
END
GO
