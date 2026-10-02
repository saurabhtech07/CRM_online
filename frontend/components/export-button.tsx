"use client";

import { useState } from "react";
import { ApiError, downloadFile } from "@/lib/api";
import { useAlerts } from "@/lib/alerts";
import { useAuth } from "@/lib/auth";

interface Props {
  /** Module the export belongs to - also the CanExport permission that gates it. */
  module: string;
  /** API path under /export, e.g. "leads?status=Converted". */
  path: string;
  /** Filename the browser saves if the server sends none. */
  fileName: string;
  label?: string;
}

/**
 * Shared Excel-export button. Renders nothing unless the signed-in role has the
 * CanExport permission on this module, so export visibility is authority-driven.
 */
export function ExportButton({ module, path, fileName, label = "Export Excel" }: Props) {
  const { can } = useAuth();
  const alerts = useAlerts();
  const [busy, setBusy] = useState(false);

  if (!can(module, "canExport")) return null;

  // "Users.xlsx" -> "Users", for a readable confirmation message.
  const listName = fileName.replace(/\.xlsx$/i, "");

  async function onClick() {
    const ok = await alerts.confirm({
      title: "Export to Excel?",
      message: `The current ${listName} list — with the filters you have applied — will be downloaded as an Excel file.`,
      confirmLabel: "Download Excel",
    });
    if (!ok) return;

    setBusy(true);
    try {
      await downloadFile(`/export/${path}`, fileName);
      alerts.success("Export downloaded.");
    } catch (err) {
      alerts.error(err instanceof ApiError ? err.message : "Could not export the data.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn btn-ghost" onClick={onClick} disabled={busy} title="Download as Excel">
      {busy ? (
        <span className="spinner" />
      ) : (
        <span aria-hidden style={{ fontSize: 14 }}>
          ⭳
        </span>
      )}
      {busy ? "Exporting…" : label}
    </button>
  );
}
