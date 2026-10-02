"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AssistantMatch, AssistantResult } from "@/lib/types";
import { StatusBadge, formatDate, formatDateTime, formatMoneyFull } from "./ui";

interface Msg {
  id: number;
  from: "bot" | "user";
  text?: string;
  match?: AssistantMatch;
  extra?: AssistantMatch[];
}

let msgId = 1;

/**
 * Floating client-lookup assistant. Type a name or phone and it pulls up the
 * matching client's full detail (when they came, what for, status, history).
 * Only rendered when the signed-in user has the 'assistant' module permission,
 * and results are scoped to their data authority server-side.
 */
export function Assistant() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: msgId++,
      from: "bot",
      text: "Hi! Type a client's name, phone or lead code and I'll pull up their details.",
    },
  ]);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!can("assistant")) return null;

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;

    setMessages((m) => [...m, { id: msgId++, from: "user", text: q }]);
    setText("");
    setBusy(true);

    try {
      const res = await api.get<AssistantResult>(
        `/assistant/lookup?q=${encodeURIComponent(q)}`,
      );
      if (res.matches.length === 0) {
        setMessages((m) => [
          ...m,
          { id: msgId++, from: "bot", text: res.message ?? "Nothing found." },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: msgId++,
            from: "bot",
            match: res.matches[0],
            extra: res.matches.slice(1),
          },
        ]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: msgId++,
          from: "bot",
          text: err instanceof ApiError ? err.message : "Something went wrong. Try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Client lookup assistant"
        aria-expanded={open}
        title="Client lookup assistant"
      >
        💬
      </button>

      {open && (
        <div className="assistant-panel" role="dialog" aria-label="Client assistant">
          <div className="assistant-head">
            <div className="assistant-head-title">
              <span className="assistant-avatar" aria-hidden>
                🤖
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Client Assistant</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Search by name, phone or code
                </div>
              </div>
            </div>
            <button
              className="icon-btn"
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{ width: 30, height: 30 }}
            >
              ×
            </button>
          </div>

          <div className="assistant-body" ref={bodyRef}>
            {messages.map((m) =>
              m.match ? (
                <div key={m.id} className="assistant-msg bot">
                  <ClientCard match={m.match} />
                  {m.extra && m.extra.length > 0 && (
                    <div className="assistant-more">
                      {m.extra.length} more match{m.extra.length === 1 ? "" : "es"}:{" "}
                      {m.extra.map((x) => `${x.fullName} (${x.leadCode})`).join(", ")}
                    </div>
                  )}
                </div>
              ) : (
                <div key={m.id} className={`assistant-msg ${m.from}`}>
                  {m.text}
                </div>
              ),
            )}
            {busy && (
              <div className="assistant-msg bot">
                <span className="typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            )}
          </div>

          <form className="assistant-input" onSubmit={ask}>
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Rahul, 9876543210, LD-00042"
              disabled={busy}
              autoFocus
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>
              Ask
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function ClientCard({ match }: { match: AssistantMatch }) {
  return (
    <div className="client-card">
      <div className="client-card-head">
        <div>
          <div className="client-card-name">{match.fullName}</div>
          <div className="client-card-code">{match.leadCode}</div>
        </div>
        <StatusBadge status={match.status} />
      </div>

      <div className="client-card-rows">
        <Row label="Phone" value={match.phone} />
        {match.email && <Row label="Email" value={match.email} />}
        <Row label="City / Area" value={[match.area, match.city].filter(Boolean).join(", ") || "—"} />
        <Row label="Source" value={match.source ?? "—"} />
        <Row label="Interested in" value={[match.propertyType, match.project].filter(Boolean).join(" · ") || "—"} />
        <Row label="Budget" value={formatMoneyFull(match.budget)} />
        {match.dealValue != null && <Row label="Deal value" value={formatMoneyFull(match.dealValue)} />}
        <Row label="Assigned to" value={match.assignedTo ?? "Unassigned"} />
        <Row label="First came" value={formatDate(match.leadDate)} />
        {match.convertedDate && <Row label="Converted on" value={formatDate(match.convertedDate)} />}
        {match.rejectedDate && <Row label="Rejected on" value={formatDate(match.rejectedDate)} />}
        {match.rejectReason && <Row label="Reject reason" value={match.rejectReason} />}
        {match.notes && <Row label="Notes" value={match.notes} />}
      </div>

      {match.history.length > 0 && (
        <div className="client-card-history">
          <div className="client-card-history-title">Recent activity</div>
          {match.history.map((h, i) => (
            <div className="client-card-history-row" key={i}>
              <span className="history-dot" aria-hidden />
              <span>
                {h.fromStatus ? `${h.fromStatus} → ` : ""}
                <strong>{h.toStatus}</strong>
                {h.changedBy ? ` by ${h.changedBy}` : ""} · {formatDateTime(h.changedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="client-card-row">
      <span className="client-card-label">{label}</span>
      <span className="client-card-value">{value}</span>
    </div>
  );
}
