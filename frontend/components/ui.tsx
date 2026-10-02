"use client";

import type { LeadStatus } from "@/lib/types";

/* ---------------- Status badge ---------------- */

const STATUS_STYLE: Record<LeadStatus, { color: string; bg: string }> = {
  New: { color: "#2a78d6", bg: "rgba(42,120,214,0.13)" },
  Contacted: { color: "#eda100", bg: "rgba(237,161,0,0.15)" },
  Qualified: { color: "#1baf7a", bg: "rgba(27,175,122,0.15)" },
  Converted: { color: "#0ca30c", bg: "rgba(12,163,12,0.15)" },
  Rejected: { color: "#d03b3b", bg: "rgba(208,59,59,0.14)" },
};

export function StatusBadge({ status }: { status: LeadStatus | string }) {
  const s = STATUS_STYLE[status as LeadStatus] ?? {
    color: "var(--text-secondary)",
    bg: "rgba(128,128,128,0.15)",
  };
  return (
    <span className="badge" style={{ color: s.color, background: s.bg }}>
      <span className="badge-dot" style={{ background: s.color }} aria-hidden />
      {status}
    </span>
  );
}

/* ---------------- Formatting helpers ---------------- */

export function formatMoney(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function formatMoneyFull(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatDate(d?: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(d?: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/* ---------------- Delta indicator ---------------- */

export function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) {
    return <span className="delta delta-flat">— 0%</span>;
  }
  const up = rounded > 0;
  // For "Rejected", an increase is bad - invert flips which direction reads as good.
  const good = invert ? !up : up;
  return (
    <span className={good ? "delta delta-up" : "delta delta-down"}>
      {up ? "▲" : "▼"} {Math.abs(rounded)}%
    </span>
  );
}

/* ---------------- Loading / empty states ---------------- */

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="empty">
      <div className="spinner" style={{ margin: "0 auto 10px" }} />
      {label}
    </div>
  );
}

export function Empty({
  icon = "◇",
  title,
  hint,
}: {
  icon?: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{title}</div>
      {hint && <div style={{ marginTop: 4, fontSize: 12.5 }}>{hint}</div>}
    </div>
  );
}

/* ---------------- Pagination ---------------- */

export function Pagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
}) {
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="pagination">
      <div className="page-info">
        Showing <strong>{from}</strong>–<strong>{to}</strong> of{" "}
        <strong>{totalCount.toLocaleString("en-IN")}</strong>
      </div>
      <div className="page-buttons">
        {onPageSize && (
          <select
            className="select"
            style={{ width: "auto", padding: "5px 8px", fontSize: 12.5 }}
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
        <button
          className="btn btn-ghost btn-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ‹ Prev
        </button>
        <span className="page-info" style={{ padding: "0 6px" }}>
          {page} / {Math.max(1, totalPages)}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        style={wide ? { maxWidth: 860 } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
