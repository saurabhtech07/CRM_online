# Deployment guide

Both apps must be running. This file covers what to set where, and fixes the
three things that most often make a correct deploy look broken.

---

## 1. Required environment variables

The backend reads these automatically from the host. They **override**
`appsettings*.json`. See `backend/CrmApi/.env.example`.

| Variable | Required | Example |
|---|---|---|
| `Jwt__Key` | **Yes** | 48+ random chars |
| `ConnectionStrings__Default` | **Yes** | `Server=sql###.monsterasp.net;Database=...;User Id=...;Password=...;TrustServerCertificate=True;` |
| `Cors__Origins__0` | **Yes** | `https://crm.yourdomain.com` |

Generate a signing key:

```bash
openssl rand -base64 48
```

If `Jwt__Key` is not set, the app generates a random key on first start and
saves it as `jwt.key` next to the published `CrmApi.dll`. It reuses that file
on every later start, so sessions survive restarts. This keeps a single-instance
deploy working without any configuration.

Set `Jwt__Key` anyway, and always on a load-balanced deployment: each instance
would otherwise generate its own key and a token issued by one would be
rejected by the others. The app logs a warning when it falls back to the file.

`jwt.key` is git-ignored. Back it up — deleting it logs every user out.

The frontend needs one value, and it is baked in at **build** time:

| Variable | Example |
|---|---|
| `NEXT_PUBLIC_API_BASE` | `https://crm.yourdomain.com/api` |

Rebuild the frontend after changing it. A restart is not enough.

---

## 2. Never put real secrets in appsettings\*.json

This repository is **public**. All three appsettings files are committed, but only
as templates with empty secrets. If you edit them to add a real password it
will be published to GitHub, stay in the history after you delete it, and the
database holds real customer leads.

Use environment variables on the host instead.

---

## 3. Database

Run the schema and seed against the **same database the API uses** — the
`Database=` value in `ConnectionStrings__Default`. On MonsterASP that name is
host-assigned (e.g. `db71328`), **not** `RealEstateCRM`.

`02_Schema.sql` and `03_SeedData.sql` each contain a `USE RealEstateCRM;` line.
Leave it in on a MonsterASP database and the tables and seeded users land in the
wrong database: `/api/health` reports `database: connected`, but login fails with
**401 Invalid username or password** because the connected database has an empty
`Users` table.

**A. Host-assigned database (MonsterASP) — use the combined script.**
`database/MonsterASP_Setup.sql` has no `USE RealEstateCRM;` and contains both the
schema and the seed. Connect to your database and run the whole file. The schema
section drops and recreates the tables first, so it is safe to re-run.

```powershell
sqlcmd -S sql###.monsterasp.net -d db71328 -U db71328 -P yourpassword -C -b -I -f -i database\MonsterASP_Setup.sql
```

(Or upload it through the MonsterASP control panel's SQL script runner.)

**B. Local SQL Server — use the numbered scripts.**

```powershell
sqlcmd -S localhost -d master       -E -C -b -I -f -i database\01_CreateDatabase.sql
sqlcmd -S localhost -d RealEstateCRM -E -C -b -I -f -i database\02_Schema.sql
sqlcmd -S localhost -d RealEstateCRM -E -C -b -I -f -i database\03_SeedData.sql
```

`-I` is required — the `LeadCode` computed column needs `QUOTED_IDENTIFIER ON`.
`-f` continues past per-batch errors so you see all of them at once.

Seeded users start with the password **`Admin@123`**. The API swaps the sentinel
hash for a real BCrypt hash on **startup**, so restart the API after seeding.
**Change every password before real use.**

---

## 4. Serving both apps on one domain

Frontend on port 3000/3100, backend on 5072, nginx in front of both.

```nginx
server {
    listen 80;
    server_name crm.yourdomain.com;

    # ---- Frontend (Next.js) ----
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # ---- Backend (ASP.NET Core) ----
    # The API's own routes already start with /api, so the path is passed
    # through unchanged. proxy_pass must NOT end in a trailing slash here.
    location /api/ {
        proxy_pass         http://127.0.0.1:5072;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Then set on the host:

```
NEXT_PUBLIC_API_BASE=https://crm.yourdomain.com/api
Cors__Origins__0=https://crm.yourdomain.com
```

### Windows / IIS

This is the path that produces **`HTTP Error 500.30`**.

1. Install the [.NET 8 ASP.NET Core Runtime Hosting Bundle](https://dotnet.microsoft.com/download/dotnet/8.0)
   on the server. Without `AspNetCoreModuleV2` in IIS, hosting fails.
   The app also carries `<RollForward>LatestMajor</RollForward>`, so a server
   that only has a newer .NET (10) will still run it. Without that property a
   `net8.0` app refuses to start on a machine with no 8.0 runtime, which also
   surfaces as `500.30`.
2. `dotnet publish backend\CrmApi -c Release -o <site-folder>`
3. Set the real configuration on the host. Never commit it — this repository is
   public. In the MonsterASP control panel (or as OS/IIS environment variables)
   set:
   - `Jwt__Key`                   — at least 32 characters
   - `ConnectionStrings__Default` — full SQL Server connection string
   - `Cors__Origins__0`           — exact frontend origin, no trailing slash

   `web.config` ships **without** these variables on purpose. An environment
   variable declared with an empty `value=""` outranks `appsettings.*.json` and
   silently blanks the real value. That single mistake makes the API report
   `database: "unreachable"`, generate a throwaway JWT key, and drop the
   frontend origin from CORS — all at the same time.
4. Create an empty `logs` folder in the site folder and grant the
   **ApplicationPool identity** write access to it. `web.config` enables
   stdout logging, and IIS silently drops the log if it cannot write.
   - `IIS AppPool\<YourPoolName>` → Advanced Settings → Identity
5. Recycle the application pool. IIS only reads `web.config` at process start.
6. Create an IIS site pointing at the published folder on the site's port.

Never edit that copy in a repo you push. This repository is public, so the
template is committed with the secrets blank on purpose.

**Do not enable stdout logging permanently.** It writes request paths and
exception details to disk in clear text. Turn it off once the deploy is healthy.

---

## 5. Fixing a 404

Work top to bottom — each step rules out a whole layer.

| Check | Command | Healthy result |
|---|---|---|
| Backend process alive | `curl -i https://crm.yourdomain.com/api/health` | `200` + `jwtKeyConfigured: true` |
| Login route exists | `curl -i -X POST https://crm.yourdomain.com/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin@123"}'` | `200` with a token |
| Frontend served | open `https://crm.yourdomain.com/login` | login form renders |

Read the result:

- **`HTTP Error 500.30 — app failed to start`** — the process crashed before
  serving anything, so every route including `/api/health` returns 500 and
  there is nothing to curl yet. The app now self-heals the most common cause
  (a missing `Jwt__Key`) by generating `jwt.key`, so a 500.30 today points at
  the runtime or the hosting module rather than configuration. Read the real
  message from `logs\stdout*.log` in the site folder, or from
  **Windows Event Viewer → Windows Logs → Application** (source
  `ASP.NET Core Hosting Diagnostic` / `IIS Express`, event `ASP.NET Core
  Hosting Diagnostics`).
  - `Failed to load ASP.NET Core Module` / `0x8007000d` → the Hosting Bundle
    is not installed
  - `You must install .NET` / `Microsoft.AspNetCore.App 8.0.0 was not found` →
    install the .NET 8 Hosting Bundle. `RollForward` covers a newer runtime,
    not a missing one on a clean machine
  - `Jwt signing key is missing or too short` → only on an old build; pull the
    current code, or set `Jwt__Key`
  - `Cannot reach the database` → the app did start; fix the connection string
  - `jwt.key could not be created` → grant the application pool identity write
    access to the site folder, or set `Jwt__Key`
  - HTTP 500.19 → `web.config` is malformed or the module is not registered
- **404 on `/api/health`** — the reverse proxy is not forwarding `/api`, or the
  backend is not running. Check the `location /api/` block above.
- **`jwtKeyConfigured: false`** — impossible while the process is up; the app
  would have refused to boot. If you see it, a stale build is running.
- **`database: unreachable`** — `ConnectionStrings__Default` is wrong, or the
  MonsterASP firewall is blocking your host's IP.
- **404 on `/login`** — the frontend is being served as static files. Next.js
  needs `npm run build && npm start`; uploading `.next` to a static host gives
  a 404 on every route because there is no `index.html`.
- **Frontend loads, every call fails with "NEXT_PUBLIC_API_BASE is not set"** —
  it was missing at **build** time. Set it and rebuild.
- **"CORS" error in the browser console** — `Cors__Origins__0` does not match
  the frontend origin exactly, including scheme and port.

`GET /api/health` is intentionally unauthenticated so a load balancer or deploy
check can verify the process. It reports config status only and never echoes a
secret.