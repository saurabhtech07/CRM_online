/* =============================================================
   Real Estate CRM - MonsterASP one-shot setup (schema + seed)
   =============================================================

   Use this when your host already created the database for you
   (MonsterASP gives you a database named like db71328, and the
   app connects to that name).

   It differs from 02_Schema.sql / 03_SeedData.sql in ONE way:
   it contains no `USE RealEstateCRM;`, so it runs against
   whatever database you have selected / connected to.

   HOW TO RUN
     1. Select / connect to the SAME database the API uses. That
        name is the `Database=` value in ConnectionStrings__Default.
     2. Run this whole file.
     3. Restart the API so PasswordSeeder swaps the sentinel hashes
        for real BCrypt hashes of 'Admin@123'.
     4. Log in as  admin / Admin@123

   Safe to re-run: the schema section drops and recreates the tables
   first, so it resets the database back to a clean seeded state.

   Local SQL Server users: keep using 01 -> 02 -> 03 instead.
   ============================================================= */

/* =============================================================
   Real Estate CRM - 02 Schema
   Tables: Roles, Modules, RolePermissions, Users,
           Sources, Projects, Leads, LeadStatusHistory
   Everything is Id based. Leads carry a Status that moves
   New/Contacted/Qualified -> Converted (Client)
                           -> Rejected
                           -> anything else = Pending
   ============================================================= */
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

/* =====================  SEED DATA  ===================== */

/* =============================================================
   Real Estate CRM - 03 Seed Data
   Default logins (password for ALL seeded users): Admin@123
   BCrypt hash below is a valid hash of 'Admin@123'
   ============================================================= */
GO

/* ---------- Roles ---------- */
INSERT INTO dbo.Roles (RoleName, Description, IsSystem) VALUES
 ('Admin',   'Full access to every module and settings', 1),
 ('Manager', 'Can view dashboard and manage all leads and clients', 0),
 ('Agent',   'Can work on leads assigned to them', 0),
 ('Viewer',  'Read only access to dashboard and lists', 0);
GO

/* ---------- Modules ---------- */
INSERT INTO dbo.Modules (ModuleKey, ModuleName, SortOrder) VALUES
 ('dashboard', 'Dashboard',   1),
 ('leads',     'Leads',       2),
 ('clients',   'Clients',     3),
 ('pending',   'Pending',     4),
 ('users',     'User Master', 5),
 ('assistant', 'Assistant',   6),
 ('sitevisits','Site Visits',  7);
GO

/* ---------- Role permissions ---------- */
DECLARE @Admin INT = (SELECT RoleId FROM dbo.Roles WHERE RoleName='Admin');
DECLARE @Mgr   INT = (SELECT RoleId FROM dbo.Roles WHERE RoleName='Manager');
DECLARE @Agent INT = (SELECT RoleId FROM dbo.Roles WHERE RoleName='Agent');
DECLARE @View  INT = (SELECT RoleId FROM dbo.Roles WHERE RoleName='Viewer');

-- Admin: everything on every module (export included)
INSERT INTO dbo.RolePermissions (RoleId, ModuleId, CanView, CanCreate, CanEdit, CanDelete, CanExport)
SELECT @Admin, ModuleId, 1,1,1,1,1 FROM dbo.Modules;

-- Manager: all lead modules fully, dashboard view, can export, no user master
INSERT INTO dbo.RolePermissions (RoleId, ModuleId, CanView, CanCreate, CanEdit, CanDelete, CanExport)
SELECT @Mgr, ModuleId,
       1,
       CASE WHEN ModuleKey IN ('leads','clients','pending') THEN 1 ELSE 0 END,
       CASE WHEN ModuleKey IN ('leads','clients','pending') THEN 1 ELSE 0 END,
       CASE WHEN ModuleKey IN ('leads') THEN 1 ELSE 0 END,
       1
FROM dbo.Modules WHERE ModuleKey <> 'users';

-- Agent: create/edit leads, view clients & pending, no delete/export, no user master, no assistant
INSERT INTO dbo.RolePermissions (RoleId, ModuleId, CanView, CanCreate, CanEdit, CanDelete, CanExport)
SELECT @Agent, ModuleId,
       1,
       CASE WHEN ModuleKey = 'leads' THEN 1 ELSE 0 END,
       CASE WHEN ModuleKey IN ('leads','pending') THEN 1 ELSE 0 END,
       0,
       0
FROM dbo.Modules WHERE ModuleKey NOT IN ('users','assistant');

-- Viewer: view only, no export, no assistant
INSERT INTO dbo.RolePermissions (RoleId, ModuleId, CanView, CanCreate, CanEdit, CanDelete, CanExport)
SELECT @View, ModuleId, 1, 0, 0, 0, 0
FROM dbo.Modules WHERE ModuleKey NOT IN ('users','assistant');
GO

/* ---------- Users (password = Admin@123) ----------
   A valid BCrypt hash can only be produced by the BCrypt library, so we store a
   sentinel here. The API replaces it with a real hash of 'Admin@123' on first start
   (see backend/CrmApi/Data/PasswordSeeder.cs).                                     */
DECLARE @Hash NVARCHAR(255) = 'SEED_DEFAULT_PASSWORD';

INSERT INTO dbo.Users (FullName, Email, Username, PasswordHash, Phone, RoleId, IsActive) VALUES
 ('System Administrator','admin@crm.local','admin',   @Hash,'9876500001',(SELECT RoleId FROM dbo.Roles WHERE RoleName='Admin'),  1),
 ('Rahul Sharma',        'rahul@crm.local','rahul',   @Hash,'9876500002',(SELECT RoleId FROM dbo.Roles WHERE RoleName='Manager'),1),
 ('Priya Verma',         'priya@crm.local','priya',   @Hash,'9876500003',(SELECT RoleId FROM dbo.Roles WHERE RoleName='Agent'),  1),
 ('Amit Patel',          'amit@crm.local', 'amit',    @Hash,'9876500004',(SELECT RoleId FROM dbo.Roles WHERE RoleName='Agent'),  1),
 ('Neha Gupta',          'neha@crm.local', 'neha',    @Hash,'9876500005',(SELECT RoleId FROM dbo.Roles WHERE RoleName='Viewer'), 1);
GO

/* ---------- Seed each user's module permissions from their role's defaults ----------
   Authority is per-user; this just gives each seeded user a sensible starting set. */
INSERT INTO dbo.UserPermissions (UserId, ModuleId, CanView, CanCreate, CanEdit, CanDelete, CanExport)
SELECT u.UserId, rp.ModuleId, rp.CanView, rp.CanCreate, rp.CanEdit, rp.CanDelete, rp.CanExport
FROM dbo.Users u
JOIN dbo.RolePermissions rp ON rp.RoleId = u.RoleId;
GO

/* ---------- Lookups ---------- */
INSERT INTO dbo.Sources (SourceName) VALUES
 ('Walk-in'),('Website'),('Referral'),('Facebook Ads'),('Google Ads'),
 ('99acres'),('MagicBricks'),('Cold Call');
GO

INSERT INTO dbo.Projects (ProjectName, City) VALUES
 ('Green Valley Heights','Indore'),
 ('Skyline Residency','Bhopal'),
 ('Palm Grove Villas','Indore'),
 ('Metro Business Park','Pune'),
 ('Riverdale Enclave','Nagpur'),
 ('Sunrise Apartments','Indore');
GO

INSERT INTO dbo.PropertyTypes (TypeName) VALUES
 ('Apartment'),('Villa'),('Plot'),('Commercial'),
 ('Bungalow'),('Penthouse'),('Office Space'),('Shop');
GO

INSERT INTO dbo.Areas (AreaName, City) VALUES
 ('Vijay Nagar','Indore'),('Scheme 78','Indore'),('Palasia','Indore'),('Bhawarkua','Indore'),('Rau','Indore'),
 ('MP Nagar','Bhopal'),('Arera Colony','Bhopal'),('Kolar Road','Bhopal'),
 ('Kothrud','Pune'),('Hinjewadi','Pune'),('Baner','Pune'),
 ('Dharampeth','Nagpur'),('Sadar','Nagpur'),
 ('Freeganj','Ujjain'),('Nanakheda','Ujjain'),
 ('Wright Town','Jabalpur'),('Napier Town','Jabalpur');
GO

/* =============================================================
   Generate ~900 leads spread over Jan-2024 .. current month.
   Deterministic pseudo-random via ABS(CHECKSUM(...)) on the row
   number so re-running gives a comparable dataset.
   ============================================================= */
DECLARE @StartDate DATE = '2024-01-01';
DECLARE @EndDate   DATE = EOMONTH(GETDATE());
DECLARE @Days INT = DATEDIFF(DAY, @StartDate, @EndDate);

/* CHECKSUM(rn,'salt') distributes badly - the literal dominates and every row
   collapses onto the same bucket. HASHBYTES over 'salt:rn' spreads properly and
   stays deterministic across re-runs.                                          */
;WITH N AS (
    SELECT TOP (900) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS rn
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
),
R AS (
    SELECT rn,
        ABS(CHECKSUM(HASHBYTES('MD5', 'fn:'  + CAST(rn AS VARCHAR(10))))) AS h_fn,
        ABS(CHECKSUM(HASHBYTES('MD5', 'ln:'  + CAST(rn AS VARCHAR(10))))) AS h_ln,
        ABS(CHECKSUM(HASHBYTES('MD5', 'ct:'  + CAST(rn AS VARCHAR(10))))) AS h_ct,
        ABS(CHECKSUM(HASHBYTES('MD5', 'lc:'  + CAST(rn AS VARCHAR(10))))) AS h_lc,
        ABS(CHECKSUM(HASHBYTES('MD5', 'pt:'  + CAST(rn AS VARCHAR(10))))) AS h_pt,
        ABS(CHECKSUM(HASHBYTES('MD5', 'bg:'  + CAST(rn AS VARCHAR(10))))) AS h_bg,
        ABS(CHECKSUM(HASHBYTES('MD5', 'rr:'  + CAST(rn AS VARCHAR(10))))) AS h_rr,
        ABS(CHECKSUM(HASHBYTES('MD5', 'nt:'  + CAST(rn AS VARCHAR(10))))) AS h_nt,
        ABS(CHECKSUM(HASHBYTES('MD5', 'dt:'  + CAST(rn AS VARCHAR(10))))) AS h_dt,
        ABS(CHECKSUM(HASHBYTES('MD5', 'st:'  + CAST(rn AS VARCHAR(10))))) AS h_st,
        ABS(CHECKSUM(HASHBYTES('MD5', 'src:' + CAST(rn AS VARCHAR(10))))) AS h_src,
        ABS(CHECKSUM(HASHBYTES('MD5', 'prj:' + CAST(rn AS VARCHAR(10))))) AS h_prj,
        ABS(CHECKSUM(HASHBYTES('MD5', 'ph:'  + CAST(rn AS VARCHAR(10))))) AS h_ph,
        ABS(CHECKSUM(HASHBYTES('MD5', 'ad:'  + CAST(rn AS VARCHAR(10))))) AS h_ad,
        ABS(CHECKSUM(HASHBYTES('MD5', 'dv:'  + CAST(rn AS VARCHAR(10))))) AS h_dv,
        ABS(CHECKSUM(HASHBYTES('MD5', 'usr:' + CAST(rn AS VARCHAR(10))))) AS h_usr,
        ABS(CHECKSUM(HASHBYTES('MD5', 'cd:'  + CAST(rn AS VARCHAR(10))))) AS h_cd,
        ABS(CHECKSUM(HASHBYTES('MD5', 'rd:'  + CAST(rn AS VARCHAR(10))))) AS h_rd
    FROM N
)
INSERT INTO dbo.Leads
    (FullName, Phone, Email, City, Address, SourceId, ProjectId, PropertyType,
     Budget, DealValue, Status, RejectReason, Notes,
     AssignedToUserId, LeadDate, ConvertedDate, RejectedDate, CreatedByUserId)
SELECT
    FirstName + ' ' + LastName,
    '9' + RIGHT('000000000' + CAST(100000000 + (h_ph % 899999999) AS VARCHAR(10)), 9),
    LOWER(FirstName) + '.' + LOWER(LastName) + CAST(rn AS VARCHAR(5)) + '@example.com',
    City,
    CAST((h_ad % 400) + 1 AS VARCHAR(5)) + ', ' + Locality + ', ' + City,
    (h_src % 8) + 1,
    (h_prj % 6) + 1,
    PropertyType,
    Budget,
    -- deal value only for converted rows
    CASE WHEN Status = 'Converted'
         THEN CAST(Budget * (0.85 + (h_dv % 25) / 100.0) AS DECIMAL(18,2))
         ELSE NULL END,
    Status,
    CASE WHEN Status = 'Rejected' THEN RejReason ELSE NULL END,
    Note,
    (h_usr % 3) + 2,          -- assign to users 2,3,4
    LeadDate,
    -- converted 3..40 days after the lead, capped at today
    CASE WHEN Status = 'Converted'
         THEN CASE WHEN DATEADD(DAY, 3 + (h_cd % 38), LeadDate) > CAST(GETDATE() AS DATE)
                   THEN CAST(GETDATE() AS DATE)
                   ELSE DATEADD(DAY, 3 + (h_cd % 38), LeadDate) END
         ELSE NULL END,
    CASE WHEN Status = 'Rejected'
         THEN CASE WHEN DATEADD(DAY, 2 + (h_rd % 30), LeadDate) > CAST(GETDATE() AS DATE)
                   THEN CAST(GETDATE() AS DATE)
                   ELSE DATEADD(DAY, 2 + (h_rd % 30), LeadDate) END
         ELSE NULL END,
    1
FROM (
    SELECT
        rn, h_ph, h_ad, h_src, h_prj, h_dv, h_usr, h_cd, h_rd,
        CHOOSE((h_fn % 20) + 1,
            'Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Krishna','Ishaan','Rohan',
            'Ananya','Diya','Saanvi','Aadhya','Kiara','Riya','Meera','Nisha','Pooja','Sneha') AS FirstName,
        CHOOSE((h_ln % 12) + 1,
            'Sharma','Verma','Patel','Gupta','Singh','Reddy','Nair','Joshi','Mehta','Kulkarni','Desai','Rao') AS LastName,
        CHOOSE((h_ct % 6) + 1,
            'Indore','Bhopal','Pune','Nagpur','Ujjain','Jabalpur') AS City,
        CHOOSE((h_lc % 6) + 1,
            'Vijay Nagar','MG Road','Scheme 78','Civil Lines','Sector 12','New Colony') AS Locality,
        CHOOSE((h_pt % 4) + 1,
            'Apartment','Villa','Plot','Commercial') AS PropertyType,
        CAST(((h_bg % 180) + 20) * 100000 AS DECIMAL(18,2)) AS Budget,
        CHOOSE((h_rr % 5) + 1,
            'Budget mismatch','Not interested anymore','Bought from competitor',
            'Location not suitable','Loan not approved') AS RejReason,
        CHOOSE((h_nt % 5) + 1,
            'Site visit done, awaiting decision.','Wants corner unit facing park.',
            'Requested home loan assistance.','Prefers possession within 6 months.',
            'Negotiating on final price.') AS Note,
        DATEADD(DAY, (h_dt % (@Days + 1)), @StartDate) AS LeadDate,
        /* status mix: ~28% Converted, ~22% Rejected, rest pending-ish */
        CASE
            WHEN (h_st % 100) < 28 THEN 'Converted'
            WHEN (h_st % 100) < 50 THEN 'Rejected'
            WHEN (h_st % 100) < 68 THEN 'Qualified'
            WHEN (h_st % 100) < 85 THEN 'Contacted'
            ELSE 'New'
        END AS Status
    FROM R
) src;
GO

/* ---------- Seed history rows for the moved leads ---------- */
INSERT INTO dbo.LeadStatusHistory (LeadId, FromStatus, ToStatus, ChangedByUserId, Remark)
SELECT LeadId, 'New', Status, 1, 'Seeded status'
FROM dbo.Leads
WHERE Status <> 'New';
GO

/* ---------- Per-user data scope ----------
   LeadScopeService treats a completely empty scope as "sees NOTHING", so a seeded
   user with no scope rows sees zero leads, zero dashboard tiles and an empty
   assistant. We grant the full set here so every seeded user can see the demo
   data. Narrow these per user from User Master before real use.

   Cities are unioned from Leads + Areas + Projects so a lead created in any of
   those places stays visible. dbo.UserAgents is deliberately left empty - an
   empty agent set means "no agent restriction", whereas populating it would
   hide every lead not assigned to the chosen agents.                            */
INSERT INTO dbo.UserCities (UserId, City)
SELECT DISTINCT u.UserId, c.City
FROM dbo.Users u
CROSS JOIN (
    SELECT City FROM dbo.Leads    WHERE City IS NOT NULL AND City <> ''
    UNION SELECT City FROM dbo.Areas   WHERE City IS NOT NULL AND City <> ''
    UNION SELECT City FROM dbo.Projects WHERE City IS NOT NULL AND City <> ''
) c
WHERE NOT EXISTS (SELECT 1 FROM dbo.UserCities x WHERE x.UserId = u.UserId AND x.City = c.City);
GO

INSERT INTO dbo.UserAreas (UserId, AreaId)
SELECT DISTINCT u.UserId, a.AreaId
FROM dbo.Users u
CROSS JOIN dbo.Areas a
WHERE NOT EXISTS (SELECT 1 FROM dbo.UserAreas x WHERE x.UserId = u.UserId AND x.AreaId = a.AreaId);
GO

INSERT INTO dbo.UserPropertyTypes (UserId, PropertyType)
SELECT DISTINCT u.UserId, t.PropertyType
FROM dbo.Users u
CROSS JOIN (
    SELECT PropertyType FROM dbo.Leads         WHERE PropertyType IS NOT NULL AND PropertyType <> ''
    UNION SELECT TypeName    FROM dbo.PropertyTypes
) t
WHERE NOT EXISTS (SELECT 1 FROM dbo.UserPropertyTypes x
                  WHERE x.UserId = u.UserId AND x.PropertyType = t.PropertyType);
GO

PRINT '--- Seed complete ---';
SELECT Status, COUNT(*) AS Cnt FROM dbo.Leads GROUP BY Status ORDER BY Status;
SELECT COUNT(*) AS TotalLeads FROM dbo.Leads;
GO
