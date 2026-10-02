"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BreakdownChart, RevenueChart, TrendChart } from "@/components/charts";
import { AppShell } from "@/components/shell";
import {
  Delta,
  Empty,
  Loading,
  StatusBadge,
  formatDate,
  formatMoney,
} from "@/components/ui";
import { ApiError, api, qs } from "@/lib/api";
import { useAlerts } from "@/lib/alerts";
import { useAuth } from "@/lib/auth";
import { useSeriesColors } from "@/lib/theme";
import type { DashboardResponse } from "@/lib/types";

type RangeMode = "month" | "year" | "custom";

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function toIso(d: Date) {
  // Local date, not UTC - avoids the timezone off-by-one on ISO conversion.
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardContent />
    </AppShell>
  );
}

function DashboardContent() {
  const { can } = useAuth();
  const alerts = useAlerts();
  const colors = useSeriesColors();

  const now = new Date();
  const [rangeMode, setRangeMode] = useState<RangeMode>("month");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [fromDate, setFromDate] = useState(toIso(monthStart()));
  const [toDate, setToDate] = useState(toIso(now));

  const [years, setYears] = useState<number[]>([now.getFullYear()]);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const allowed = can("dashboard");

  useEffect(() => {
    if (!allowed) return;
    api
      .get<number[]>("/dashboard/years")
      .then((y) => y.length && setYears(y))
      .catch(() => {
        /* the year dropdown falls back to the current year */
      });
  }, [allowed]);

  const query = useMemo(() => {
    if (rangeMode === "custom") return qs({ fromDate, toDate });
    if (rangeMode === "year") return qs({ year });
    return qs({ year, month });
  }, [rangeMode, year, month, fromDate, toDate]);

  // Bumped to force a refetch of the same query (the Refresh button).
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await api.get<DashboardResponse>(`/dashboard${query}`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status !== 401) alerts.error(err.message);
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // A slow response for an old filter must not overwrite a newer one.
    return () => {
      cancelled = true;
    };
  }, [allowed, query, reloadKey, alerts]);

  if (!allowed) {
    return (
      <Empty
        icon="⚠"
        title="You do not have access to the dashboard"
        hint="Ask an administrator to grant your role view permission on this module."
      />
    );
  }

  const periodLabel =
    rangeMode === "custom"
      ? `${formatDate(fromDate)} – ${formatDate(toDate)}`
      : rangeMode === "year"
        ? `Year ${year}`
        : `${MONTHS[month - 1]} ${year}`;

  const s = data?.summary;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            Showing <strong>{periodLabel}</strong> · compared with the preceding period
          </p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading}>
          ⟳ Refresh
        </button>
      </div>

      {/* -------- Filters -------- */}
      <div className="filter-bar">
        <div className="field">
          <label className="field-label" htmlFor="rangeMode">
            Period
          </label>
          <select
            id="rangeMode"
            className="select"
            value={rangeMode}
            onChange={(e) => setRangeMode(e.target.value as RangeMode)}
          >
            <option value="month">Monthly</option>
            <option value="year">Full year</option>
            <option value="custom">Custom dates</option>
          </select>
        </div>

        {rangeMode !== "custom" && (
          <div className="field">
            <label className="field-label" htmlFor="year">
              Year
            </label>
            <select
              id="year"
              className="select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}

        {rangeMode === "month" && (
          <div className="field">
            <label className="field-label" htmlFor="month">
              Month
            </label>
            <select
              id="month"
              className="select"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}

        {rangeMode === "custom" && (
          <>
            <div className="field">
              <label className="field-label" htmlFor="fromDate">
                From
              </label>
              <input
                id="fromDate"
                type="date"
                className="input"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="toDate">
                To
              </label>
              <input
                id="toDate"
                type="date"
                className="input"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {loading && !data ? (
        <Loading label="Loading dashboard…" />
      ) : !data ? (
        <Empty icon="⚠" title="Could not load the dashboard" hint="Try refreshing." />
      ) : (
        <>
          {/* -------- Stat tiles -------- */}
          <div className="stat-grid">
            <StatTile
              label="Total Leads"
              value={s!.totalLeads}
              color={colors.leads}
              delta={s!.leadsChangePct}
            />
            <StatTile
              label="Clients Converted"
              value={s!.clients}
              color={colors.clients}
              delta={s!.clientsChangePct}
              foot={`${s!.conversionRate}% conversion rate`}
            />
            <StatTile
              label="Rejected"
              value={s!.rejected}
              color={colors.rejected}
              delta={s!.rejectedChangePct}
              invertDelta
            />
            <StatTile
              label="Pending"
              value={s!.pending}
              color={colors.pending}
              foot="Still in the funnel"
            />
            <StatTile
              label="Revenue Booked"
              value={formatMoney(s!.revenue)}
              color={colors.clients}
              delta={s!.revenueChangePct}
            />
          </div>

          {/* -------- 6-month comparison -------- */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div>
                <h2 className="card-title">This month vs previous 5 months</h2>
                <p className="card-sub">
                  Leads received, clients converted, rejected and still-pending per month
                </p>
              </div>
            </div>
            <TrendChart data={data.trend} />
          </div>

          <div className="chart-grid">
            <div className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Revenue trend</h2>
                  <p className="card-sub">Deal value booked per month</p>
                </div>
              </div>
              <RevenueChart data={data.trend} />
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Leads by source</h2>
                  <p className="card-sub">Where enquiries came from</p>
                </div>
              </div>
              <BreakdownChart data={data.bySource} slot="leads" />
            </div>
          </div>

          <div className="chart-grid">
            <div className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Leads by project</h2>
                  <p className="card-sub">Interest per property</p>
                </div>
              </div>
              <BreakdownChart data={data.byProject} slot="pending" />
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Recent leads</h2>
                  <p className="card-sub">Latest enquiries in this period</p>
                </div>
              </div>
              {data.recentLeads.length === 0 ? (
                <Empty title="No leads in this period" />
              ) : (
                <div className="table-wrap" style={{ maxHeight: "none" }}>
                  <table className="table" style={{ minWidth: 520 }}>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th className="num">Budget</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentLeads.map((l) => (
                        <tr key={l.leadId}>
                          <td className="code-cell">{l.leadCode}</td>
                          <td className="cell-strong">{l.fullName}</td>
                          <td>
                            <StatusBadge status={l.status} />
                          </td>
                          <td className="num">{formatMoney(l.budget)}</td>
                          <td className="cell-muted">{formatDate(l.leadDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function StatTile({
  label,
  value,
  color,
  delta,
  foot,
  invertDelta = false,
}: {
  label: string;
  value: number | string;
  color: string;
  delta?: number;
  foot?: string;
  invertDelta?: boolean;
}) {
  return (
    <div className="stat">
      <span className="stat-accent" style={{ background: color }} aria-hidden />
      <div className="stat-label">
        <span className="stat-dot" style={{ background: color }} aria-hidden />
        {label}
      </div>
      <div className="stat-value">
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </div>
      <div className="stat-foot">
        {delta !== undefined && <Delta value={delta} invert={invertDelta} />}
        {delta !== undefined && <span>vs previous</span>}
        {foot && <span>{foot}</span>}
      </div>
    </div>
  );
}
