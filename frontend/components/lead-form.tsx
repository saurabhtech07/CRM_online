"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import { useAlerts } from "@/lib/alerts";
import type { Lead, LeadStatus, Lookup } from "@/lib/types";
import { ComboBox } from "./combo-box";
import { Modal } from "./ui";

const STATUSES: LeadStatus[] = ["New", "Contacted", "Qualified", "Converted", "Rejected"];

interface Props {
  lead: Lead | null;
  sources: Lookup[];
  projects: Lookup[];
  areas: Lookup[];
  propertyTypes: Lookup[];
  agents: Lookup[];
  onClose: () => void;
  onSaved: () => void;
  /** Lets the parent refresh its lookup lists after one is created inline. */
  onLookupsChanged?: () => void;
}

/** Lookup endpoints that accept inline "type a new one" creation. */
type LookupKind = "sources" | "projects" | "areas" | "propertytypes";
const KIND_LABEL: Record<LookupKind, string> = {
  sources: "source",
  projects: "project",
  areas: "area",
  propertytypes: "property type",
};

export function LeadForm({
  lead,
  sources,
  projects,
  areas,
  propertyTypes,
  agents,
  onClose,
  onSaved,
  onLookupsChanged,
}: Props) {
  const alerts = useAlerts();
  const editing = Boolean(lead);

  /** Creates a lookup value on the fly when the user types a new name. */
  async function createLookup(kind: LookupKind, name: string): Promise<Lookup | null> {
    try {
      const made = await api.post<Lookup>(`/lookups/${kind}`, { name });
      onLookupsChanged?.();
      alerts.success(`"${made.name}" added to ${KIND_LABEL[kind]}s.`);
      return made;
    } catch (err) {
      alerts.error(
        err instanceof ApiError ? err.message : `Could not add the ${KIND_LABEL[kind]}.`,
      );
      return null;
    }
  }

  // The dialog is mounted fresh per lead, so seeding state on first render is
  // enough - no effect needed to sync from the prop.
  const [form, setForm] = useState(() => ({
    fullName: lead?.fullName ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    city: lead?.city ?? "",
    address: lead?.address ?? "",
    sourceId: lead?.sourceId ? String(lead.sourceId) : "",
    projectId: lead?.projectId ? String(lead.projectId) : "",
    areaId: lead?.areaId ? String(lead.areaId) : "",
    // Property type is stored as text; match it to an existing lookup id if we can.
    propertyTypeId: lead?.propertyType
      ? String(propertyTypes.find((p) => p.name === lead.propertyType)?.id ?? "")
      : "",
    propertyType: lead?.propertyType ?? "",
    budget: lead?.budget != null ? String(lead.budget) : "",
    dealValue: lead?.dealValue != null ? String(lead.dealValue) : "",
    status: (lead?.status ?? "New") as LeadStatus,
    rejectReason: lead?.rejectReason ?? "",
    notes: lead?.notes ?? "",
    assignedToUserId: lead?.assignedToUserId ? String(lead.assignedToUserId) : "",
    leadDate: lead?.leadDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  }));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = "Name is required.";
    if (!form.phone.trim()) e.phone = "Phone is required.";
    else if (!/^[0-9+\-\s()]{7,20}$/.test(form.phone.trim()))
      e.phone = "Enter a valid phone number.";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Enter a valid email address.";
    if (form.budget && Number(form.budget) < 0) e.budget = "Budget cannot be negative.";
    if (form.status === "Rejected" && !form.rejectReason.trim())
      e.rejectReason = "A reason is required when rejecting a lead.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) {
      alerts.warning("Please correct the highlighted fields.");
      return;
    }

    const payload = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      sourceId: form.sourceId ? Number(form.sourceId) : null,
      projectId: form.projectId ? Number(form.projectId) : null,
      areaId: form.areaId ? Number(form.areaId) : null,
      // Property type is saved as text - resolve the chosen lookup id to its name.
      propertyType:
        propertyTypes.find((p) => String(p.id) === form.propertyTypeId)?.name ??
        (form.propertyType || null),
      budget: form.budget ? Number(form.budget) : null,
      dealValue: form.dealValue ? Number(form.dealValue) : null,
      status: form.status,
      rejectReason: form.rejectReason.trim() || null,
      notes: form.notes.trim() || null,
      assignedToUserId: form.assignedToUserId ? Number(form.assignedToUserId) : null,
      leadDate: form.leadDate,
    };

    const ok = await alerts.confirm({
      title: editing ? "Save these changes?" : "Create this lead?",
      message: editing
        ? `Changes to ${lead!.leadCode} — ${form.fullName.trim()} will be saved.`
        : `A new lead will be created for ${form.fullName.trim()} (${form.phone.trim()}).`,
      confirmLabel: editing ? "Save changes" : "Create lead",
    });
    if (!ok) return;

    setBusy(true);
    try {
      if (editing) {
        await api.put(`/leads/${lead!.leadId}`, payload);
        alerts.success(`Lead ${lead!.leadCode} updated.`);
      } else {
        const created = await api.post<Lead>("/leads", payload);
        alerts.success(`Lead ${created.leadCode} created.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      alerts.error(err instanceof ApiError ? err.message : "Could not save the lead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? `Edit lead ${lead!.leadCode}` : "Add new lead"}
      onClose={onClose}
      wide
    >
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <Field label="Full name *" error={errors.fullName}>
            <input
              className="input"
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              disabled={busy}
              autoFocus
            />
          </Field>

          <Field label="Phone *" error={errors.phone}>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              disabled={busy}
              inputMode="tel"
            />
          </Field>

          <Field label="Email" error={errors.email}>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              disabled={busy}
            />
          </Field>

          <Field label="City">
            <input
              className="input"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              disabled={busy}
            />
          </Field>

          <Field label="Area">
            <ComboBox
              value={form.areaId}
              options={areas}
              onChange={(v) => set("areaId", v)}
              onCreate={(name) => createLookup("areas", name)}
              disabled={busy}
              placeholder="Type or select an area…"
            />
          </Field>

          <Field label="Source">
            <ComboBox
              value={form.sourceId}
              options={sources}
              onChange={(v) => set("sourceId", v)}
              onCreate={(name) => createLookup("sources", name)}
              disabled={busy}
              placeholder="Type or select a source…"
            />
          </Field>

          <Field label="Project">
            <ComboBox
              value={form.projectId}
              options={projects}
              onChange={(v) => set("projectId", v)}
              onCreate={(name) => createLookup("projects", name)}
              disabled={busy}
              placeholder="Type or select a project…"
            />
          </Field>

          <Field label="Property type">
            <ComboBox
              value={form.propertyTypeId}
              options={propertyTypes}
              onChange={(v) => set("propertyTypeId", v)}
              onCreate={(name) => createLookup("propertytypes", name)}
              disabled={busy}
              placeholder="Type or select a type…"
            />
          </Field>

          <Field label="Budget (₹)" error={errors.budget}>
            <input
              className="input"
              type="number"
              min={0}
              value={form.budget}
              onChange={(e) => set("budget", e.target.value)}
              disabled={busy}
            />
          </Field>

          <Field label="Assigned to">
            <ComboBox
              value={form.assignedToUserId}
              options={agents}
              allowCreate={false}
              onChange={(v) => set("assignedToUserId", v)}
              disabled={busy}
              placeholder="Unassigned"
            />
          </Field>

          <Field label="Lead date">
            <input
              className="input"
              type="date"
              value={form.leadDate}
              onChange={(e) => set("leadDate", e.target.value)}
              disabled={busy}
            />
          </Field>

          <Field label="Status">
            <select
              className="select"
              value={form.status}
              onChange={(e) => set("status", e.target.value as LeadStatus)}
              disabled={busy}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          {form.status === "Converted" && (
            <Field label="Deal value (₹)">
              <input
                className="input"
                type="number"
                min={0}
                value={form.dealValue}
                onChange={(e) => set("dealValue", e.target.value)}
                disabled={busy}
                placeholder="Defaults to the budget"
              />
            </Field>
          )}
        </div>

        {form.status === "Rejected" && (
          <div style={{ marginTop: 14 }}>
            <Field label="Reject reason *" error={errors.rejectReason}>
              <input
                className="input"
                value={form.rejectReason}
                onChange={(e) => set("rejectReason", e.target.value)}
                disabled={busy}
              />
            </Field>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <Field label="Address">
            <input
              className="input"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              disabled={busy}
            />
          </Field>
        </div>

        <div style={{ marginTop: 14 }}>
          <Field label="Notes">
            <textarea
              className="textarea"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              disabled={busy}
            />
          </Field>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create lead"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
