"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChrome, useSeriesColors } from "@/lib/theme";
import type { LookupCount, MonthlyStat } from "@/lib/types";
import { formatMoney } from "./ui";

/**
 * Series identity is fixed by key, never by rank - filtering a series out
 * never repaints the survivors.
 */
const SERIES_META = [
  { key: "totalLeads", name: "Leads", slot: "leads" },
  { key: "clients", name: "Clients", slot: "clients" },
  { key: "rejected", name: "Rejected", slot: "rejected" },
  { key: "pending", name: "Pending", slot: "pending" },
] as const;

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
  moneyKeys = [],
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  moneyKeys?: string[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      {payload.map((e, i) => (
        <div className="chart-tooltip-row" key={i}>
          <span
            className="legend-swatch"
            style={{ background: e.color }}
            aria-hidden
          />
          <span>{e.name}</span>
          <span className="num">
            {moneyKeys.includes(String(e.dataKey))
              ? formatMoney(Number(e.value))
              : Number(e.value).toLocaleString("en-IN")}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Legend is always present for >= 2 series so identity is never colour-alone. */
function ManualLegend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((s) => (
        <span className="legend-item" key={s.name}>
          <span className="legend-swatch" style={{ background: s.color }} aria-hidden />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/* ============ Monthly comparison: this month vs previous 5 ============ */

export function TrendChart({ data }: { data: MonthlyStat[] }) {
  const c = useSeriesColors();
  const chrome = useChrome();

  const colorFor = (slot: string) => c[slot as keyof typeof c];
  const legendItems = SERIES_META.map((s) => ({
    name: s.name,
    color: colorFor(s.slot),
  }));

  return (
    <>
      <ManualLegend items={legendItems} />
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 4 }} barGap={2}>
            <CartesianGrid stroke={chrome.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: chrome.muted, fontSize: 11.5 }}
              axisLine={{ stroke: chrome.axis }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: chrome.muted, fontSize: 11.5 }}
              axisLine={false}
              tickLine={false}
              width={38}
              allowDecimals={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: "color-mix(in srgb, currentColor 6%, transparent)" }}
            />
            {SERIES_META.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={colorFor(s.slot)}
                radius={[4, 4, 0, 0]}
                maxBarSize={26}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ============ Revenue trend ============ */

export function RevenueChart({ data }: { data: MonthlyStat[] }) {
  const c = useSeriesColors();
  const chrome = useChrome();

  return (
    <>
      <ManualLegend items={[{ name: "Revenue booked", color: c.clients }]} />
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={chrome.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: chrome.muted, fontSize: 11.5 }}
              axisLine={{ stroke: chrome.axis }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: chrome.muted, fontSize: 11.5 }}
              axisLine={false}
              tickLine={false}
              width={54}
              tickFormatter={(v: number) =>
                v >= 10000000
                  ? `${(v / 10000000).toFixed(1)}Cr`
                  : v >= 100000
                    ? `${(v / 100000).toFixed(0)}L`
                    : String(v)
              }
            />
            <Tooltip content={<ChartTooltip moneyKeys={["revenue"]} />} />
            <Line
              type="monotone"
              dataKey="revenue"
              name="Revenue booked"
              stroke={c.clients}
              strokeWidth={2}
              dot={{ r: 4, fill: c.clients, strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: chrome.surface, strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ============ Breakdown (source / project) ============ */

export function BreakdownChart({
  data,
  slot = "leads",
}: {
  data: LookupCount[];
  slot?: "leads" | "clients" | "rejected" | "pending";
}) {
  const c = useSeriesColors();
  const chrome = useChrome();
  const color = c[slot];

  if (!data.length) {
    return (
      <div className="empty" style={{ padding: 30 }}>
        No data for this period.
      </div>
    );
  }

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 34, left: 4, bottom: 4 }}
        >
          <CartesianGrid stroke={chrome.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: chrome.muted, fontSize: 11.5 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: chrome.muted, fontSize: 11.5 }}
            axisLine={false}
            tickLine={false}
            width={124}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "transparent" }} />
          <Bar dataKey="count" name="Leads" fill={color} radius={[0, 4, 4, 0]} maxBarSize={20}>
            {data.map((d) => (
              <Cell key={d.name} fill={color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
