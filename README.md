# Real Monk Reality — CRM

Real-estate lead & client management. Three folders, kept separate for clarity:

```
D:\CRM\
├── database\   SQL scripts (schema, seed data)
├── backend\    ASP.NET Core 10 Web API  (port 5072)
└── frontend\   Next.js 16 + React 19    (port 3100)
```

## Login

All seeded users share the password **`Admin@123`**.

| Username | Role    | What they can do |
|----------|---------|------------------|
| `admin`  | Admin   | Everything, including User Master |
| `rahul`  | Manager | Dashboard + all lead modules, create/edit/delete leads. No User Master |
| `priya`  | Agent   | Create & edit leads, view clients/pending. Cannot delete. No User Master |
| `neha`   | Viewer  | Read-only across dashboard and lists |

> Change these passwords before any real use.

## Running it

Both servers must be running. Open two terminals.

**1. Backend**
```powershell
cd D:\CRM\backend\CrmApi
dotnet run --launch-profile http
```
→ http://localhost:5072 (health check: http://localhost:5072/api/health)

**2. Frontend**
```powershell
cd D:\CRM\frontend
npm run dev
```
→ **http://localhost:3100**

Port 3100 is pinned because port 3000 was already in use on this machine.

## Database

Already created and seeded with **900 sample leads spanning Jan-2024 → today**, so the
dashboard comparisons and the year filter have real data on first run.

Connection: `YOUR-SERVER\SQLEXPRESS`, database `RealEstateCRM`, **Windows Authentication**
(Trusted_Connection). Configure it in `backend/CrmApi/appsettings.Development.json`
(git-ignored) — the base `appsettings.json` ships with empty placeholders so no
secrets are committed.

To rebuild the database from scratch:
```powershell
$S = "YOUR-SERVER\SQLEXPRESS"
sqlcmd -S $S -E -C -b -I -i "database\01_CreateDatabase.sql"
sqlcmd -S $S -E -C -b -I -i "database\02_Schema.sql"
sqlcmd -S $S -E -C -b -I -i "database\03_SeedData.sql"
```
The `-I` flag matters — the `LeadCode` computed column requires `QUOTED_IDENTIFIER ON`.

Seeded users are stored with a sentinel password hash; the API replaces it with a real
BCrypt hash of `Admin@123` on first startup (`Data/PasswordSeeder.cs`), because a valid
BCrypt hash can only be produced by the BCrypt library itself.

## Modules

**Dashboard** — leads / clients / rejected / pending / revenue tiles with % change vs the
preceding period, a 6-month comparison chart (this month + previous 5), revenue trend, and
breakdowns by source and project. Filter by month, full year, or a custom date range.

**Leads** — one grid serving three tabs off the same record:
- *All Leads* — every enquiry at any stage
- *Clients* — status = Converted
- *Pending* — status is New / Contacted / Qualified

Search (name, phone, email, city, lead code), filters for source / project / assigned agent /
date range / status, sortable columns, pagination, and a detail view with full status history.
Convert and Reject actions move a lead through the funnel and are recorded in the audit trail.

**User Master** — two panes:
- *Users* — create, edit, deactivate; assign roles
- *Roles & Authority* — a Module × (View/Create/Edit/Delete) checkbox matrix per role

Permissions drive both the visible menu **and** the API. Every protected endpoint re-checks
the role's permission server-side (`Security/RequirePermissionAttribute.cs`), so hiding a
menu is never the only thing enforcing access.

## Theming

Top bar has a dark/light toggle and a 6-colour accent picker. Both persist to `localStorage`
and apply across the entire CRM. An inline script in `app/layout.tsx` stamps the saved theme
before first paint, so there is no white flash on reload.

Chart colours are fixed per series (never cycled) and were validated for colour-blind
separation and contrast in both light and dark modes.

## Notes

- Auth is JWT (8-hour expiry), sent as `Authorization: Bearer`. A 401 from any call clears
  the token and bounces to `/login`.
- Deletes are soft (`IsActive = 0`) so historical dashboard numbers stay intact.
- Lead phone numbers are unique among active leads; duplicates are rejected with a clear message.
- Rejecting a lead requires a reason — enforced on both client and server.
- Mobile: the top menu collapses to a ☰ drawer, tiles reflow to 2 columns, grids scroll
  horizontally, and charts resize.
