/* =============================================================
   Real Estate CRM - 03 Seed Data
   Default logins (password for ALL seeded users): Admin@123
   BCrypt hash below is a valid hash of 'Admin@123'
   ============================================================= */
USE RealEstateCRM;
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
