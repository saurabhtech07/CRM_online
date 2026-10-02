"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { Empty, Loading, formatDateTime } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useAlerts } from "@/lib/alerts";
import { useAuth } from "@/lib/auth";
import type { Lookup, SiteVisit } from "@/lib/types";

// Leaflet touches window, so load the map client-side only.
const VisitMap = dynamic(() => import("@/components/visit-map").then((m) => m.VisitMap), {
  ssr: false,
  loading: () => <div className="visit-map-wrap" />,
});

export default function VisitsPage() {
  return (
    <AppShell>
      <VisitsContent />
    </AppShell>
  );
}

function VisitsContent() {
  const { can } = useAuth();

  // Monitoring-only module: whoever has Site Visits VIEW can watch every agent's
  // visits on the map. Agents start/complete from the Leads grid, not here.
  if (!can("sitevisits")) {
    return (
      <Empty
        icon="⚠"
        title="You do not have access to Site Visits"
        hint="Ask an administrator to grant your role the Site Visits permission."
      />
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Site Visits</h1>
          <p className="page-sub">
            Track where each agent went — pick an agent to see their visits on the map
          </p>
        </div>
      </div>

      <WatchPanel />
    </>
  );
}


/* ==================== Admin/manager: watch agents ==================== */

function WatchPanel() {
  const alerts = useAlerts();
  const [agents, setAgents] = useState<Lookup[]>([]);
  const [agentId, setAgentId] = useState("");
  const [status, setStatus] = useState("");
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [selected, setSelected] = useState<SiteVisit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Lookup[]>("/lookups/agents").then(setAgents).catch(() => setAgents([]));
  }, []);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (agentId) params.set("agentId", agentId);
        if (status) params.set("status", status);
        const list = await api.get<SiteVisit[]>(`/visits?${params.toString()}`);
        if (!cancelled) setVisits(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status !== 401) alerts.error(err.message);
        setVisits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, status, reloadKey, alerts]);

  // Auto-refresh the selected ongoing visit every 8s so the pin moves live.
  useEffect(() => {
    if (!selected || selected.status !== "Ongoing") return;
    const id = setInterval(async () => {
      try {
        setSelected(await api.get<SiteVisit>(`/visits/${selected.visitId}`));
      } catch {
        /* ignore transient errors */
      }
    }, 8000);
    return () => clearInterval(id);
  }, [selected]);

  async function openVisit(v: SiteVisit) {
    try {
      setSelected(await api.get<SiteVisit>(`/visits/${v.visitId}`));
    } catch {
      setSelected(v);
    }
  }

  return (
    <>
      <div className="filter-bar">
        <div className="field" style={{ minWidth: 180 }}>
          <label className="field-label">Agent</label>
          <select className="select" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 150 }}>
          <label className="field-label">Status</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <button className="btn btn-ghost" onClick={load} style={{ marginInlineStart: "auto" }}>
          ⟳ Refresh
        </button>
      </div>

      <div className="visits-layout">
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Visits</h2>
          </div>
          <div className="visits-list">
            {loading ? (
              <Loading />
            ) : visits.length === 0 ? (
              <Empty title="No visits found" />
            ) : (
              visits.map((v) => (
                <button
                  key={v.visitId}
                  className={`visit-item${selected?.visitId === v.visitId ? " active" : ""}`}
                  onClick={() => openVisit(v)}
                >
                  <div className="visit-item-top">
                    <strong>{v.agentName}</strong>
                    <StatusPill status={v.status} />
                  </div>
                  <div className="visit-item-sub">
                    → {v.clientName} ({v.leadCode})
                    {v.city ? ` · ${[v.area, v.city].filter(Boolean).join(", ")}` : ""}
                  </div>
                  <div className="visit-item-time">
                    {v.status === "Ongoing" ? "Started " : ""}
                    {formatDateTime(v.startedAt)}
                    {v.completedAt ? ` → ${formatDateTime(v.completedAt)}` : ""}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-head">
            <div>
              <h2 className="card-title">
                {selected ? `${selected.agentName} → ${selected.clientName}` : "Location"}
              </h2>
              {selected && (
                <p className="card-sub">
                  {selected.status === "Ongoing"
                    ? "Live — pin updates every few seconds"
                    : `Ended ${formatDateTime(selected.completedAt ?? selected.startedAt)}`}
                  {selected.purpose ? ` · ${selected.purpose}` : ""}
                </p>
              )}
            </div>
          </div>
          <VisitMap visit={selected} />
        </div>
      </div>
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === "Ongoing"
      ? { color: "#eb6834", bg: "rgba(235,104,52,0.15)" }
      : status === "Completed"
        ? { color: "#0ca30c", bg: "rgba(12,163,12,0.15)" }
        : { color: "#d03b3b", bg: "rgba(208,59,59,0.14)" };
  return (
    <span className="badge" style={{ color: style.color, background: style.bg }}>
      <span className="badge-dot" style={{ background: style.color }} />
      {status}
    </span>
  );
}
