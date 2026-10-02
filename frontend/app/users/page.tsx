"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { ExportButton } from "@/components/export-button";
import { TagBox, type TagOption } from "@/components/tag-box";
import {
  Empty,
  Loading,
  Modal,
  Pagination,
  formatDateTime,
} from "@/components/ui";
import { ApiError, api, qs } from "@/lib/api";
import { useAlerts } from "@/lib/alerts";
import { useAuth } from "@/lib/auth";
import type {
  Lookup,
  ModuleDef,
  PagedResult,
  Role,
  User,
} from "@/lib/types";

type Pane = "users" | "roles";

export default function UsersPage() {
  return (
    <AppShell>
      <UsersContent />
    </AppShell>
  );
}

function UsersContent() {
  const { can } = useAuth();
  const [pane, setPane] = useState<Pane>("users");

  if (!can("users")) {
    return (
      <Empty
        icon="⚠"
        title="You do not have access to User Master"
        hint="Only roles with permission on the User Master module can manage users and authorities."
      />
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">User Master</h1>
          <p className="page-sub">Manage users and control what each role can see and do</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button
          className={`tab${pane === "users" ? " active" : ""}`}
          onClick={() => setPane("users")}
          role="tab"
          aria-selected={pane === "users"}
        >
          Users
        </button>
        <button
          className={`tab${pane === "roles" ? " active" : ""}`}
          onClick={() => setPane("roles")}
          role="tab"
          aria-selected={pane === "roles"}
        >
          Users &amp; Authority
        </button>
      </div>

      {pane === "users" ? <UsersPane /> : <UsersAuthorityPane />}
    </>
  );
}

/* ==================== Users ==================== */

function UsersPane() {
  const { can, user: me } = useAuth();
  const alerts = useAlerts();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [roleId, setRoleId] = useState("");
  const [isActive, setIsActive] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [result, setResult] = useState<PagedResult<User> | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const canCreate = can("users", "canCreate");
  const canEdit = can("users", "canEdit");
  const canDelete = can("users", "canDelete");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    api.get<Role[]>("/roles").then(setRoles).catch(() => setRoles([]));
  }, []);

  // Bumped after a create/edit/deactivate to refetch the current query.
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  const query = qs({ search: debounced, roleId, isActive, page, pageSize });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await api.get<PagedResult<User>>(`/users${query}`);
        if (!cancelled) setResult(res);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status !== 401) alerts.error(err.message);
        setResult(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, reloadKey, alerts]);

  async function onDeactivate(u: User) {
    const ok = await alerts.confirm({
      title: "Deactivate this user?",
      message: `${u.fullName} will no longer be able to sign in. Their leads stay assigned to them.`,
      confirmLabel: "Deactivate",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await api.del<{ message: string }>(`/users/${u.userId}`);
      alerts.success(res.message);
      load();
    } catch (err) {
      alerts.error(err instanceof ApiError ? err.message : "Could not deactivate the user.");
    }
  }

  return (
    <>
      <div className="filter-bar">
        <div className="search-field">
          <span className="search-icon" aria-hidden>
            ⌕
          </span>
          <input
            className="input"
            placeholder="Search name, username, email or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="u-role">
            Role
          </label>
          <select
            id="u-role"
            className="select"
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {roles.map((r) => (
              <option key={r.roleId} value={r.roleId}>
                {r.roleName}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="u-active">
            Status
          </label>
          <select
            id="u-active"
            className="select"
            value={isActive}
            onChange={(e) => {
              setIsActive(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        <div style={{ marginInlineStart: "auto", display: "flex", gap: 8 }}>
          <ExportButton module="users" path="users" fileName="Users.xlsx" />
          {canCreate && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              + Add user
            </button>
          )}
        </div>
      </div>

      <div className="card">
        {loading && !result ? (
          <Loading />
        ) : !result || result.items.length === 0 ? (
          <Empty title="No users match your filters" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last login</th>
                    <th style={{ textAlign: "end" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((u) => (
                    <tr key={u.userId}>
                      <td className="cell-strong">
                        {u.fullName}
                        {u.userId === me?.userId && (
                          <span className="cell-muted"> (you)</span>
                        )}
                      </td>
                      <td>{u.username}</td>
                      <td className="cell-muted">{u.email}</td>
                      <td className="cell-muted">{u.phone ?? "—"}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            color: "var(--accent)",
                            background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                          }}
                        >
                          {u.roleName}
                        </span>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={
                            u.isActive
                              ? { color: "#0ca30c", background: "rgba(12,163,12,0.15)" }
                              : { color: "#d03b3b", background: "rgba(208,59,59,0.14)" }
                          }
                        >
                          <span
                            className="badge-dot"
                            style={{ background: u.isActive ? "#0ca30c" : "#d03b3b" }}
                            aria-hidden
                          />
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="cell-muted">{formatDateTime(u.lastLoginAt)}</td>
                      <td>
                        <div className="row-actions">
                          {canEdit && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setEditing(u);
                                setFormOpen(true);
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && u.isActive && u.userId !== me?.userId && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--critical)" }}
                              onClick={() => onDeactivate(u)}
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              totalCount={result.totalCount}
              totalPages={result.totalPages}
              onPage={setPage}
              onPageSize={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </>
        )}
      </div>

      {formOpen && (
        <UserForm
          user={editing}
          roles={roles}
          onClose={() => setFormOpen(false)}
          onSaved={load}
        />
      )}
    </>
  );
}

function UserForm({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: User | null;
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const alerts = useAlerts();
  const editing = Boolean(user);

  const [form, setForm] = useState({
    fullName: user?.fullName ?? "",
    email: user?.email ?? "",
    username: user?.username ?? "",
    password: "",
    phone: user?.phone ?? "",
    roleId: user?.roleId ? String(user.roleId) : roles[0] ? String(roles[0].roleId) : "",
    isActive: user?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = "Name is required.";
    if (!form.email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Enter a valid email address.";
    if (!editing && !form.username.trim()) e.username = "Username is required.";
    if (!editing && form.password.length < 6)
      e.password = "Password must be at least 6 characters.";
    if (editing && form.password && form.password.length < 6)
      e.password = "Password must be at least 6 characters.";
    if (!form.roleId) e.roleId = "Select a role.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) {
      alerts.warning("Please correct the highlighted fields.");
      return;
    }

    const roleName = roles.find((r) => r.roleId === Number(form.roleId))?.roleName ?? "";
    const notes = [
      `Role: ${roleName}`,
      form.isActive ? "Account active" : "Account inactive",
      editing && form.password ? "Password will be reset" : "",
    ].filter(Boolean).join(" · ");

    const ok = await alerts.confirm({
      title: editing ? "Save these changes?" : "Create this user?",
      message: editing
        ? `${form.fullName.trim()} will be updated. ${notes}`
        : `A new user "${form.username.trim()}" will be created for ${form.fullName.trim()}. ${notes}`,
      confirmLabel: editing ? "Save changes" : "Create user",
    });
    if (!ok) return;

    // Data scope (cities/areas/types) is managed in the Users & Authority pane,
    // not here - so this form leaves it untouched.
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/users/${user!.userId}`, {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          roleId: Number(form.roleId),
          isActive: form.isActive,
          newPassword: form.password || null,
        });
        alerts.success(`${form.fullName} updated.`);
      } else {
        await api.post("/users", {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          username: form.username.trim(),
          password: form.password,
          phone: form.phone.trim() || null,
          roleId: Number(form.roleId),
          isActive: form.isActive,
        });
        alerts.success(`${form.fullName} created.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      alerts.error(err instanceof ApiError ? err.message : "Could not save the user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? `Edit ${user!.fullName}` : "Add new user"} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label className="field-label">Full name *</label>
            <input
              className="input"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              disabled={busy}
              autoFocus
            />
            {errors.fullName && <div className="form-error">{errors.fullName}</div>}
          </div>

          <div className="field">
            <label className="field-label">Email *</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={busy}
            />
            {errors.email && <div className="form-error">{errors.email}</div>}
          </div>

          <div className="field">
            <label className="field-label">Username *</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={busy || editing}
              title={editing ? "Username cannot be changed" : undefined}
            />
            {errors.username && <div className="form-error">{errors.username}</div>}
          </div>

          <div className="field">
            <label className="field-label">
              {editing ? "New password (leave blank to keep)" : "Password *"}
            </label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              disabled={busy}
              autoComplete="new-password"
            />
            {errors.password && <div className="form-error">{errors.password}</div>}
          </div>

          <div className="field">
            <label className="field-label">Phone</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              disabled={busy}
              inputMode="tel"
            />
          </div>

          <div className="field">
            <label className="field-label">Role *</label>
            <select
              className="select"
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
              disabled={busy}
            >
              {roles.map((r) => (
                <option key={r.roleId} value={r.roleId}>
                  {r.roleName}
                </option>
              ))}
            </select>
            {errors.roleId && <div className="form-error">{errors.roleId}</div>}
          </div>
        </div>

        <label
          style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}
        >
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            disabled={busy}
            style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
          />
          <span>Account is active</span>
        </label>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ==================== Roles & authority ==================== */

/** Authority pane: pick a USER on the left, edit their module matrix on the right. */
function UsersAuthorityPane() {
  const { can } = useAuth();
  const alerts = useAlerts();

  const [users, setUsers] = useState<User[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const canEdit = can("users", "canEdit");

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [u, m] = await Promise.all([
          api.get<PagedResult<User>>("/users?pageSize=200"),
          api.get<ModuleDef[]>("/roles/modules"),
        ]);
        if (cancelled) return;
        setUsers(u.items);
        setModules(m);
        setSelectedId((cur) =>
          cur && u.items.some((x) => x.userId === cur) ? cur : (u.items[0]?.userId ?? null),
        );
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status !== 401) alerts.error(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, alerts]);

  if (loading) return <Loading />;
  const selected = users.find((u) => u.userId === selectedId);
  if (!selected) return <Empty title="No users found" />;

  return (
    <div
      style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 240px) minmax(0, 1fr)" }}
      className="roles-layout"
    >
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Users</h2>
        </div>
        <div style={{ padding: 8, maxHeight: "60vh", overflowY: "auto" }}>
          {users.map((u) => (
            <button
              key={u.userId}
              className={`nav-link${selectedId === u.userId ? " active" : ""}`}
              style={{ display: "block", width: "100%", textAlign: "start", marginBottom: 2 }}
              onClick={() => setSelectedId(u.userId)}
            >
              <div style={{ fontWeight: 600 }}>{u.username}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                {u.fullName} · {u.roleName}
                {u.isActive ? "" : " · inactive"}
              </div>
            </button>
          ))}
        </div>
      </div>

      <UserPermissionMatrix
        key={selected.userId}
        user={selected}
        modules={modules}
        canEdit={canEdit}
        onSaved={reload}
      />
    </div>
  );
}

function UserPermissionMatrix({
  user,
  modules,
  canEdit,
  onSaved,
}: {
  user: User;
  modules: ModuleDef[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const alerts = useAlerts();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  type Row = {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canExport: boolean;
  };
  const [matrix, setMatrix] = useState<Record<number, Row>>({});

  // Data scope (cities / areas / property types / agents) for this user.
  const [cities, setCities] = useState<string[]>([]);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);

  // Scope option lists (loaded once).
  const [cityOpts, setCityOpts] = useState<TagOption[]>([]);
  const [areaOpts, setAreaOpts] = useState<TagOption[]>([]);
  const [typeOpts, setTypeOpts] = useState<TagOption[]>([]);
  const [agentOpts, setAgentOpts] = useState<TagOption[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<string[]>("/lookups/cities").catch(() => []),
      api.get<Lookup[]>("/lookups/areas").catch(() => []),
      api.get<Lookup[]>("/lookups/propertytypes").catch(() => []),
      api.get<Lookup[]>("/lookups/agents").catch(() => []),
    ]).then(([c, a, t, ag]) => {
      setCityOpts(c.map((x) => ({ value: x, label: x })));
      setAreaOpts(a.map((x) => ({ value: String(x.id), label: x.name })));
      setTypeOpts(t.map((x) => ({ value: x.name, label: x.name })));
      setAgentOpts(ag.map((x) => ({ value: String(x.id), label: x.name })));
    });
  }, []);

  // Load this user's saved permissions AND scope.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const full = await api.get<User>(`/users/${user.userId}`);
        if (cancelled) return;
        const map: Record<number, Row> = {};
        for (const m of modules) {
          const p = full.permissions?.find((x) => x.moduleId === m.moduleId);
          map[m.moduleId] = {
            canView: p?.canView ?? false,
            canCreate: p?.canCreate ?? false,
            canEdit: p?.canEdit ?? false,
            canDelete: p?.canDelete ?? false,
            canExport: p?.canExport ?? false,
          };
        }
        setMatrix(map);
        setCities(full.cities ?? []);
        setAreaIds((full.areaIds ?? []).map(String));
        setPropertyTypes(full.propertyTypes ?? []);
        setAgentIds((full.agentUserIds ?? []).map(String));
      } catch {
        /* leave the matrix empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.userId, modules]);

  function toggle(moduleId: number, key: keyof Row) {
    setMatrix((m) => {
      const row = { ...m[moduleId], [key]: !m[moduleId][key] };
      if (key === "canView" && !row.canView) {
        row.canCreate = false;
        row.canEdit = false;
        row.canDelete = false;
        row.canExport = false;
      }
      if (key !== "canView" && row[key]) row.canView = true;
      return { ...m, [moduleId]: row };
    });
  }

  async function save() {
    const granted = modules.filter((m) => matrix[m.moduleId]?.canView).map((m) => m.moduleName);
    const summary = granted.length ? granted.join(", ") : "no modules at all";
    const noScope = cities.length === 0 && areaIds.length === 0 && propertyTypes.length === 0;

    const ok = await alerts.confirm({
      title: `Update ${user.username}'s authority?`,
      message:
        `${user.fullName} will be able to see the modules: ${summary}. ` +
        (noScope
          ? "No data access is set, so they will see NO leads until you add a city, area or type."
          : `Data limited to: ${[...cities, ...propertyTypes].join(", ") || "the selected areas"}.`) +
        " Takes effect on their next page load.",
      confirmLabel: "Save",
      danger: granted.length === 0 || noScope,
    });
    if (!ok) return;

    setBusy(true);
    try {
      // Save both the module matrix and the data scope together.
      await api.put(`/users/${user.userId}/permissions`, {
        permissions: modules.map((m) => ({ moduleId: m.moduleId, ...matrix[m.moduleId] })),
      });
      await api.put(`/users/${user.userId}/scope`, {
        cities,
        areaIds: areaIds.map(Number),
        propertyTypes,
        agentUserIds: agentIds.map(Number),
      });
      alerts.success(`Authority for ${user.username} saved.`);
      onSaved();
    } catch (err) {
      alerts.error(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card authority-card">
      <div className="card-head">
        <div>
          <h2 className="card-title">{user.username} — authority</h2>
          <p className="card-sub">
            Controls which modules <strong>{user.fullName}</strong> sees in the menu and what
            they may do. Enforced by the API on every request.
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={save} disabled={busy || loading}>
            {busy ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      <div className="authority-body">
      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="table-wrap" style={{ maxHeight: "none" }}>
            <table className="table perm-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Module</th>
                  <th style={{ textAlign: "center" }}>View</th>
                  <th style={{ textAlign: "center" }}>Create</th>
                  <th style={{ textAlign: "center" }}>Edit</th>
                  <th style={{ textAlign: "center" }}>Delete</th>
                  <th style={{ textAlign: "center" }}>Export</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.moduleId}>
                    <td>{m.moduleName}</td>
                    {(["canView", "canCreate", "canEdit", "canDelete", "canExport"] as const).map(
                      (k) => (
                        <td className="checkbox-cell" key={k}>
                          <input
                            type="checkbox"
                            checked={matrix[m.moduleId]?.[k] ?? false}
                            onChange={() => toggle(m.moduleId, k)}
                            disabled={!canEdit || busy}
                            aria-label={`${m.moduleName} ${k.replace("can", "")}`}
                          />
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---------- Data access (scope), same Save button ---------- */}
          <div style={{ padding: "18px 16px 8px", borderTop: "1px solid var(--border)" }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-secondary)",
                marginBottom: 4,
              }}
            >
              Data access
            </div>
            <p className="scope-note" style={{ marginBottom: 12 }}>
              {user.username} only sees leads matching the cities, areas and property types below.
              Leave a box empty to not limit by it — if <strong>all three</strong> are empty,
              they see no data at all.
            </p>

            <div className="form-grid">
              <div className="field">
                <label className="field-label">Cities</label>
                <TagBox
                  selected={cities}
                  options={cityOpts}
                  onChange={setCities}
                  disabled={!canEdit || busy}
                  allowCustom
                  placeholder="Type or pick a city…"
                />
              </div>
              <div className="field">
                <label className="field-label">Areas</label>
                <TagBox
                  selected={areaIds}
                  options={areaOpts}
                  onChange={setAreaIds}
                  disabled={!canEdit || busy}
                  placeholder="Type or pick an area…"
                />
              </div>
              <div className="field">
                <label className="field-label">Property types</label>
                <TagBox
                  selected={propertyTypes}
                  options={typeOpts}
                  onChange={setPropertyTypes}
                  disabled={!canEdit || busy}
                  placeholder="Type or pick a type…"
                />
              </div>

              <div className="field">
                <label className="field-label">Agents (see their leads)</label>
                <TagBox
                  selected={agentIds}
                  options={agentOpts}
                  onChange={setAgentIds}
                  disabled={!canEdit || busy}
                  placeholder="Pick agents…"
                />
              </div>
            </div>
            <p className="scope-note" style={{ marginTop: 8 }}>
              <strong>Agents:</strong> pick whose assigned leads this user sees in the Leads
              grid. Leave empty to show all (within the city/area limits above).
            </p>
          </div>
        </>
      )}

      {!canEdit && (
        <div style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 12.5 }}>
          You have view-only access to this matrix.
        </div>
      )}
      </div>
    </div>
  );
}
