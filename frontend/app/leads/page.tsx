"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ComboBox } from "@/components/combo-box";
import { ExportButton } from "@/components/export-button";
import { LeadForm } from "@/components/lead-form";
import { AppShell } from "@/components/shell";
import { VisitButton } from "@/components/visit-button";
import {
  Empty,
  Loading,
  Modal,
  Pagination,
  StatusBadge,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyFull,
} from "@/components/ui";
import { ApiError, api, qs } from "@/lib/api";
import { useAlerts } from "@/lib/alerts";
import { useAuth } from "@/lib/auth";
import type {
  Lead,
  LeadHistory,
  LeadStatus,
  Lookup,
  PagedResult,
  SiteVisit,
} from "@/lib/types";

type Tab = "leads" | "clients" | "pending";

const TAB_META: Record<Tab, { label: string; title: string; sub: string; module: string }> = {
  leads: {
    label: "All Leads",
    title: "Leads",
    sub: "Every enquiry captured, at any stage",
    module: "leads",
  },
  clients: {
    label: "Clients",
    title: "Clients",
    sub: "Leads that converted into paying clients",
    module: "clients",
  },
  pending: {
    label: "Pending",
    title: "Pending",
    sub: "Still in the funnel — not yet converted or rejected",
    module: "pending",
  },
};

const STATUSES: LeadStatus[] = ["New", "Contacted", "Qualified", "Converted", "Rejected"];

export default function LeadsPage() {
  return (
    <AppShell>
      {/* useSearchParams must sit inside Suspense or the production build fails. */}
      <Suspense fallback={<Loading />}>
        <LeadsTabRouter />
      </Suspense>
    </AppShell>
  );
}

/**
 * Reads the tab from the URL and keys the content on it, so switching tabs
 * remounts with fresh filter state instead of resetting it in an effect.
 */
function LeadsTabRouter() {
  const params = useSearchParams();
  const urlTab = params.get("tab") ?? "leads";
  const tab: Tab = (["leads", "clients", "pending"] as const).includes(urlTab as Tab)
    ? (urlTab as Tab)
    : "leads";
  return <LeadsContent key={tab} tab={tab} />;
}

function LeadsContent({ tab }: { tab: Tab }) {
  const { can, user } = useAuth();
  const alerts = useAlerts();

  const meta = TAB_META[tab];

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState("LeadDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [result, setResult] = useState<PagedResult<Lead> | null>(null);
  const [loading, setLoading] = useState(true);

  const [sources, setSources] = useState<Lookup[]>([]);
  const [projects, setProjects] = useState<Lookup[]>([]);
  const [areas, setAreas] = useState<Lookup[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<Lookup[]>([]);
  const [agents, setAgents] = useState<Lookup[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [detail, setDetail] = useState<Lead | null>(null);
  const [history, setHistory] = useState<LeadHistory[]>([]);
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Lead | null>(null);

  const canView = can(meta.module);
  const canCreate = can("leads", "canCreate");
  const canEdit = can("leads", "canEdit");
  const canDelete = can("leads", "canDelete");

  // Site-visit ability comes from the sitevisits module (agents get 'create').
  const canVisit = can("sitevisits", "canCreate");
  const [activeVisit, setActiveVisit] = useState<SiteVisit | null>(null);
  const refreshActiveVisit = useCallback(() => {
    if (!canVisit) return;
    api.get<SiteVisit | null>("/visits/mine/active").then(setActiveVisit).catch(() => setActiveVisit(null));
  }, [canVisit]);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Bumped when a source/project is created inline so the filter dropdowns pick it up.
  const [lookupKey, setLookupKey] = useState(0);
  const refreshLookups = useCallback(() => setLookupKey((k) => k + 1), []);

  useEffect(() => {
    Promise.all([
      api.get<Lookup[]>("/lookups/sources").catch(() => []),
      api.get<Lookup[]>("/lookups/projects").catch(() => []),
      api.get<Lookup[]>("/lookups/areas").catch(() => []),
      api.get<Lookup[]>("/lookups/propertytypes").catch(() => []),
      api.get<Lookup[]>("/lookups/agents").catch(() => []),
    ]).then(([s, p, ar, pt, a]) => {
      setSources(s);
      setProjects(p);
      setAreas(ar);
      setPropertyTypes(pt);
      setAgents(a);
    });
  }, [lookupKey]);

  useEffect(() => {
    refreshActiveVisit();
  }, [refreshActiveVisit]);

  const query = useMemo(
    () =>
      qs({
        tab,
        search: debounced,
        status: tab === "leads" ? status : "",
        sourceId,
        projectId,
        assignedToUserId,
        fromDate,
        toDate,
        sortBy,
        sortDir,
        page,
        pageSize,
      }),
    [
      tab, debounced, status, sourceId, projectId, assignedToUserId,
      fromDate, toDate, sortBy, sortDir, page, pageSize,
    ],
  );

  // Bumped after a save/convert/reject/delete to refetch the current query.
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await api.get<PagedResult<Lead>>(`/leads${query}`);
        if (!cancelled) setResult(res);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status !== 401) alerts.error(err.message);
        setResult(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // A slow response for an old filter must not overwrite a newer one.
    return () => {
      cancelled = true;
    };
  }, [canView, query, reloadKey, alerts]);

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(1);
  }

  async function openDetail(lead: Lead) {
    setDetail(lead);
    setHistory([]);
    try {
      setHistory(await api.get<LeadHistory[]>(`/leads/${lead.leadId}/history`));
    } catch {
      /* history is supplementary - the detail panel still works without it */
    }
  }

  async function onDelete(lead: Lead) {
    const ok = await alerts.confirm({
      title: "Delete this lead?",
      message: `${lead.leadCode} — ${lead.fullName} will be removed from the lists. Dashboard history is preserved.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await api.del<{ message: string }>(`/leads/${lead.leadId}`);
      alerts.success(res.message);
      load();
    } catch (err) {
      alerts.error(err instanceof ApiError ? err.message : "Could not delete the lead.");
    }
  }

  function clearFilters() {
    setSearch("");
    setStatus("");
    setSourceId("");
    setProjectId("");
    setAssignedToUserId("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  const hasFilters =
    search || status || sourceId || projectId || assignedToUserId || fromDate || toDate;

  if (!canView) {
    return (
      <Empty
        icon="⚠"
        title={`You do not have access to ${meta.title}`}
        hint="Ask an administrator to grant your role view permission on this module."
      />
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{meta.title}</h1>
          <p className="page-sub">{meta.sub}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <ExportButton
            module={meta.module}
            path={`${tab}${qs({
              search: debounced,
              status: tab === "leads" ? status : "",
              sourceId,
              projectId,
              assignedToUserId,
              fromDate,
              toDate,
            })}`}
            fileName={`${meta.title}.xlsx`}
          />
          {canCreate && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              + Add lead
            </button>
          )}
        </div>
      </div>

      {/* -------- Filters -------- */}
      <div className="filter-bar">
        <div className="search-field">
          <span className="search-icon" aria-hidden>
            ⌕
          </span>
          <input
            className="input"
            placeholder="Search name, phone, email, city or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search"
          />
        </div>

        {tab === "leads" && (
          <div className="field">
            <label className="field-label" htmlFor="f-status">
              Status
            </label>
            <select
              id="f-status"
              className="select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Filters use the same combo box, minus the create option - typing
            narrows a long list far faster than scrolling a plain select. */}
        <div className="field" style={{ minWidth: 170 }}>
          <label className="field-label" htmlFor="f-source">
            Source
          </label>
          <ComboBox
            id="f-source"
            value={sourceId}
            options={sources}
            allowCreate={false}
            placeholder="All"
            onChange={(v) => {
              setSourceId(v);
              setPage(1);
            }}
          />
        </div>

        <div className="field" style={{ minWidth: 170 }}>
          <label className="field-label" htmlFor="f-project">
            Project
          </label>
          <ComboBox
            id="f-project"
            value={projectId}
            options={projects}
            allowCreate={false}
            placeholder="All"
            onChange={(v) => {
              setProjectId(v);
              setPage(1);
            }}
          />
        </div>

        <div className="field" style={{ minWidth: 170 }}>
          <label className="field-label" htmlFor="f-agent">
            Assigned to
          </label>
          <ComboBox
            id="f-agent"
            value={assignedToUserId}
            options={agents}
            allowCreate={false}
            placeholder="All"
            onChange={(v) => {
              setAssignedToUserId(v);
              setPage(1);
            }}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="f-from">
            From
          </label>
          <input
            id="f-from"
            type="date"
            className="input"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="f-to">
            To
          </label>
          <input
            id="f-to"
            type="date"
            className="input"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {hasFilters && (
          <button className="btn btn-ghost" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {/* -------- Grid -------- */}
      <div className="card">
        {loading && !result ? (
          <Loading />
        ) : !result || result.items.length === 0 ? (
          <Empty
            title={hasFilters ? "No records match your filters" : `No ${meta.title.toLowerCase()} yet`}
            hint={hasFilters ? "Try clearing the filters." : undefined}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <SortableTh
                      label="Name"
                      col="FullName"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <th>Contact</th>
                    <th>Source / Project</th>
                    <SortableTh
                      label="Status"
                      col="Status"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label={tab === "clients" ? "Deal value" : "Budget"}
                      col={tab === "clients" ? "DealValue" : "Budget"}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={toggleSort}
                      align="end"
                    />
                    <SortableTh
                      label={tab === "clients" ? "Converted" : "Lead date"}
                      col={tab === "clients" ? "ConvertedDate" : "LeadDate"}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <th style={{ textAlign: "end" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((l) => (
                    <tr key={l.leadId}>
                      <td className="code-cell">{l.leadCode}</td>
                      <td>
                        <div className="cell-strong">{l.fullName}</div>
                        {(l.city || l.areaName) && (
                          <div className="cell-muted">
                            {[l.areaName, l.city].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </td>
                      <td>
                        <div>{l.phone}</div>
                        {l.email && <div className="cell-muted">{l.email}</div>}
                      </td>
                      <td>
                        <div>{l.sourceName ?? "—"}</div>
                        <div className="cell-muted">{l.projectName ?? "—"}</div>
                      </td>
                      <td>
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="num">
                        {tab === "clients"
                          ? formatMoney(l.dealValue)
                          : formatMoney(l.budget)}
                      </td>
                      <td className="cell-muted">
                        {tab === "clients"
                          ? formatDate(l.convertedDate)
                          : formatDate(l.leadDate)}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => openDetail(l)}
                          >
                            View
                          </button>
                          {canEdit && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setEditing(l);
                                setFormOpen(true);
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {canEdit && l.status !== "Converted" && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => setConvertTarget(l)}
                            >
                              Convert
                            </button>
                          )}
                          {canEdit && l.status !== "Rejected" && l.status !== "Converted" && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setRejectTarget(l)}
                            >
                              Reject
                            </button>
                          )}
                          {canVisit && user && (
                            <VisitButton
                              lead={l}
                              currentUserId={user.userId}
                              activeVisit={activeVisit}
                              onChanged={refreshActiveVisit}
                            />
                          )}
                          {canDelete && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--critical)" }}
                              onClick={() => onDelete(l)}
                            >
                              Delete
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

      {/* -------- Modals -------- */}
      {formOpen && (
        <LeadForm
          key={editing?.leadId ?? "new"}
          lead={editing}
          sources={sources}
          projects={projects}
          areas={areas}
          propertyTypes={propertyTypes}
          agents={agents}
          onClose={() => setFormOpen(false)}
          onSaved={load}
          onLookupsChanged={refreshLookups}
        />
      )}

      {detail && (
        <LeadDetail lead={detail} history={history} onClose={() => setDetail(null)} />
      )}

      {convertTarget && (
        <ConvertDialog
          lead={convertTarget}
          onClose={() => setConvertTarget(null)}
          onDone={load}
        />
      )}

      {rejectTarget && (
        <RejectDialog
          lead={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={load}
        />
      )}
    </>
  );
}

function SortableTh({
  label,
  col,
  sortBy,
  sortDir,
  onSort,
  align,
}: {
  label: string;
  col: string;
  sortBy: string;
  sortDir: string;
  onSort: (c: string) => void;
  align?: "end";
}) {
  const active = sortBy.toLowerCase() === col.toLowerCase();
  return (
    <th
      className="sortable"
      onClick={() => onSort(col)}
      style={align ? { textAlign: "end" } : undefined}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}

function LeadDetail({
  lead,
  history,
  onClose,
}: {
  lead: Lead;
  history: LeadHistory[];
  onClose: () => void;
}) {
  return (
    <Modal title={`${lead.leadCode} — ${lead.fullName}`} onClose={onClose} wide>
      <div className="detail-grid">
        <Detail label="Status">
          <StatusBadge status={lead.status} />
        </Detail>
        <Detail label="Phone">{lead.phone}</Detail>
        <Detail label="Email">{lead.email ?? "—"}</Detail>
        <Detail label="City">{lead.city ?? "—"}</Detail>
        <Detail label="Area">{lead.areaName ?? "—"}</Detail>
        <Detail label="Source">{lead.sourceName ?? "—"}</Detail>
        <Detail label="Project">{lead.projectName ?? "—"}</Detail>
        <Detail label="Property type">{lead.propertyType ?? "—"}</Detail>
        <Detail label="Budget">{formatMoneyFull(lead.budget)}</Detail>
        {lead.dealValue != null && (
          <Detail label="Deal value">{formatMoneyFull(lead.dealValue)}</Detail>
        )}
        <Detail label="Assigned to">{lead.assignedToName ?? "Unassigned"}</Detail>
        <Detail label="Lead date">{formatDate(lead.leadDate)}</Detail>
        {lead.convertedDate && (
          <Detail label="Converted on">{formatDate(lead.convertedDate)}</Detail>
        )}
        {lead.rejectedDate && (
          <Detail label="Rejected on">{formatDate(lead.rejectedDate)}</Detail>
        )}
      </div>

      {lead.address && (
        <div style={{ marginTop: 16 }}>
          <Detail label="Address">{lead.address}</Detail>
        </div>
      )}
      {lead.rejectReason && (
        <div style={{ marginTop: 16 }}>
          <Detail label="Reject reason">{lead.rejectReason}</Detail>
        </div>
      )}
      {lead.notes && (
        <div style={{ marginTop: 16 }}>
          <Detail label="Notes">{lead.notes}</Detail>
        </div>
      )}

      <h4 style={{ margin: "22px 0 12px", fontSize: 14 }}>Status history</h4>
      {history.length === 0 ? (
        <p className="cell-muted">No status changes recorded.</p>
      ) : (
        <div className="timeline">
          {history.map((h) => (
            <div className="timeline-item" key={h.historyId}>
              <span className="timeline-dot" aria-hidden />
              <div>
                <div>
                  <strong>{h.fromStatus ? `${h.fromStatus} → ` : ""}{h.toStatus}</strong>
                  {h.changedByName && (
                    <span className="cell-muted"> by {h.changedByName}</span>
                  )}
                </div>
                <div className="cell-muted">
                  {formatDateTime(h.changedAt)}
                  {h.remark ? ` · ${h.remark}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{children}</span>
    </div>
  );
}

function ConvertDialog({
  lead,
  onClose,
  onDone,
}: {
  lead: Lead;
  onClose: () => void;
  onDone: () => void;
}) {
  const alerts = useAlerts();
  const [dealValue, setDealValue] = useState(
    lead.dealValue != null ? String(lead.dealValue) : lead.budget != null ? String(lead.budget) : "",
  );
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const ok = await alerts.confirm({
      title: "Convert to client?",
      message: `${lead.fullName} (${lead.leadCode}) will be marked as converted${
        dealValue ? ` with a deal value of ${formatMoneyFull(Number(dealValue))}` : ""
      }, and will count towards this month's revenue.`,
      confirmLabel: "Convert to client",
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.patch(`/leads/${lead.leadId}/status`, {
        status: "Converted",
        dealValue: dealValue ? Number(dealValue) : null,
        remark: remark.trim() || null,
      });
      alerts.success(`${lead.fullName} is now a client.`);
      onDone();
      onClose();
    } catch (err) {
      alerts.error(err instanceof ApiError ? err.message : "Could not convert the lead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Convert ${lead.leadCode} to client`} onClose={onClose}>
      <form onSubmit={submit}>
        <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
          Marking <strong>{lead.fullName}</strong> as converted will move this record to
          the Clients tab and count towards this month&apos;s revenue.
        </p>
        <div className="field">
          <label className="field-label">Deal value (₹)</label>
          <input
            className="input"
            type="number"
            min={0}
            value={dealValue}
            onChange={(e) => setDealValue(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label className="field-label">Remark</label>
          <input
            className="input"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            disabled={busy}
            placeholder="Optional"
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Converting…" : "Convert to client"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RejectDialog({
  lead,
  onClose,
  onDone,
}: {
  lead: Lead;
  onClose: () => void;
  onDone: () => void;
}) {
  const alerts = useAlerts();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("A reason is required when rejecting a lead.");
      return;
    }

    const ok = await alerts.confirm({
      title: "Reject this lead?",
      message: `${lead.fullName} (${lead.leadCode}) will be marked as rejected and removed from the Pending list. Reason: "${reason.trim()}"`,
      confirmLabel: "Reject lead",
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.patch(`/leads/${lead.leadId}/status`, {
        status: "Rejected",
        rejectReason: reason.trim(),
        remark: reason.trim(),
      });
      alerts.success(`${lead.leadCode} marked as rejected.`);
      onDone();
      onClose();
    } catch (err) {
      alerts.error(err instanceof ApiError ? err.message : "Could not reject the lead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reject ${lead.leadCode}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field-label">Reason *</label>
          <input
            className="input"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
            }}
            disabled={busy}
            autoFocus
            placeholder="e.g. Budget mismatch"
          />
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={busy}>
            {busy ? "Rejecting…" : "Reject lead"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
