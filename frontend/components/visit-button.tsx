"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import { useAlerts } from "@/lib/alerts";
import type { Lead, SiteVisit } from "@/lib/types";

interface Props {
  lead: Lead;
  currentUserId: number;
  /** The caller's ongoing visit, if any (shared across rows). */
  activeVisit: SiteVisit | null;
  /** Called after start/complete so the parent refreshes the active visit. */
  onChanged: () => void;
}

function getPosition(): Promise<GeolocationCoordinates | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

/**
 * Start / Complete visit button shown in the Leads grid. Only appears on a
 * PENDING lead that is ASSIGNED to the signed-in user. Captures GPS on start and
 * on complete. No map here - the Site Visits module handles monitoring.
 */
export function VisitButton({ lead, currentUserId, activeVisit, onChanged }: Props) {
  const alerts = useAlerts();
  const [busy, setBusy] = useState(false);

  const isMine = lead.assignedToUserId === currentUserId;
  const isPending = ["New", "Contacted", "Qualified"].includes(lead.status);
  const activeForThis = activeVisit && activeVisit.leadId === lead.leadId;

  // Show nothing if not the assigned agent, or the lead isn't visitable -
  // unless there's already an active visit on THIS lead (so you can complete it).
  if (!isMine) return null;
  if (!isPending && !activeForThis) return null;

  async function start() {
    if (activeVisit && activeVisit.leadId !== lead.leadId) {
      alerts.warning(
        `Finish your ongoing visit to ${activeVisit.clientName} before starting a new one.`,
      );
      return;
    }
    const ok = await alerts.confirm({
      title: `Start visit to ${lead.fullName}?`,
      message:
        "Your location will be captured now and again when you complete the visit. " +
        "Allow location access when your browser asks.",
      confirmLabel: "Start visit",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const coords = await getPosition();
      await api.post<SiteVisit>("/visits/start", {
        leadId: lead.leadId,
        lat: coords?.latitude ?? null,
        lng: coords?.longitude ?? null,
        purpose: `Site visit — ${lead.fullName}`,
      });
      alerts.success("Visit started. Complete it when you return.");
      onChanged();
    } catch (err) {
      alerts.error(err instanceof ApiError ? err.message : "Could not start the visit.");
    } finally {
      setBusy(false);
    }
  }

  async function complete(completed: boolean) {
    if (!activeForThis) return;
    const ok = await alerts.confirm({
      title: completed ? "Complete this visit?" : "Cancel this visit?",
      message: completed
        ? "Your location will be captured and the visit marked complete."
        : "The visit will be marked cancelled.",
      confirmLabel: completed ? "Complete" : "Cancel visit",
      danger: !completed,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const coords = await getPosition();
      await api.post(`/visits/${activeVisit!.visitId}/complete`, {
        lat: coords?.latitude ?? null,
        lng: coords?.longitude ?? null,
        completed,
      });
      alerts.success(completed ? "Visit completed." : "Visit cancelled.");
      onChanged();
    } catch (err) {
      alerts.error(err instanceof ApiError ? err.message : "Could not close the visit.");
    } finally {
      setBusy(false);
    }
  }

  if (activeForThis) {
    return (
      <>
        <button className="btn btn-primary btn-sm" onClick={() => complete(true)} disabled={busy}>
          ✓ Complete
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => complete(false)}
          disabled={busy}
          style={{ color: "var(--critical)" }}
        >
          Cancel visit
        </button>
      </>
    );
  }

  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={start}
      disabled={busy}
      title="Start a tracked visit to this client"
    >
      📍 Start visit
    </button>
  );
}
