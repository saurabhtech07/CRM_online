"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type AlertKind = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  kind: AlertKind;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface AlertState {
  notify: (kind: AlertKind, message: string) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  warning: (m: string) => void;
  info: (m: string) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const AlertContext = createContext<AlertState | null>(null);

let nextId = 1;

/** Status colors are fixed (never themed) and always ship with an icon + label. */
const KIND_META: Record<AlertKind, { color: string; icon: string; label: string }> = {
  success: { color: "#0ca30c", icon: "✓", label: "Success" },
  warning: { color: "#fab219", icon: "!", label: "Warning" },
  error: { color: "#d03b3b", icon: "✕", label: "Error" },
  info: { color: "#2a78d6", icon: "i", label: "Info" },
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback(
    (kind: AlertKind, message: string) => {
      const id = nextId++;
      setToasts((t) => [...t, { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4000);
    },
    [dismiss],
  );

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  );

  const closeConfirm = useCallback(
    (result: boolean) => {
      confirmState?.resolve(result);
      setConfirmState(null);
    },
    [confirmState],
  );

  const value = useMemo<AlertState>(
    () => ({
      notify,
      success: (m) => notify("success", m),
      error: (m) => notify("error", m),
      warning: (m) => notify("warning", m),
      info: (m) => notify("info", m),
      confirm,
    }),
    [notify, confirm],
  );

  return (
    <AlertContext.Provider value={value}>
      {children}

      <div className="toast-wrap" role="region" aria-label="Notifications">
        {toasts.map((t) => {
          const meta = KIND_META[t.kind];
          return (
            <div
              key={t.id}
              className="toast"
              role={t.kind === "error" ? "alert" : "status"}
              style={{ borderInlineStartColor: meta.color }}
            >
              <span className="toast-icon" style={{ background: meta.color }} aria-hidden>
                {meta.icon}
              </span>
              <div className="toast-body">
                <strong className="toast-label">{meta.label}</strong>
                <span className="toast-msg">{t.message}</span>
              </div>
              <button
                className="toast-close"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {confirmState && (
        <div
          className="modal-backdrop"
          onClick={() => closeConfirm(false)}
          role="presentation"
        >
          <div
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title">{confirmState.title}</h3>
            <p className="confirm-msg">{confirmState.message}</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => closeConfirm(false)}>
                Cancel
              </button>
              <button
                className={confirmState.danger ? "btn btn-danger" : "btn btn-primary"}
                onClick={() => closeConfirm(true)}
                autoFocus
              >
                {confirmState.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlerts must be used inside AlertProvider");
  return ctx;
}
