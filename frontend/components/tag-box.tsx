"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface TagOption {
  /** Stored value (string city/type, or stringified area id). */
  value: string;
  label: string;
}

interface Props {
  /** Currently selected values. */
  selected: string[];
  options: TagOption[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Allow adding a typed value that isn't in the option list (free cities). */
  allowCustom?: boolean;
}

/**
 * Multi-select with checkboxes. Click the control to open a dropdown of options,
 * each with a checkbox; tick as many as you like. A "Select all" row toggles the
 * whole (filtered) list at once. Selected values show as removable chips on the
 * control. Used for the per-user data scope (cities, areas, property types).
 */
export function TagBox({
  selected,
  options,
  onChange,
  placeholder = "Click to choose…",
  disabled = false,
  id,
  allowCustom = false,
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // The panel is position:fixed so it floats above every scroll container and is
  // never clipped. We compute its screen coordinates from the control's rect, and
  // flip it above the control when there isn't enough room below.
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const positionPanel = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const panelMax = 300;
    const below = window.innerHeight - r.bottom;
    const dropUp = below < panelMax && r.top > below;
    setPanelStyle({
      position: "fixed",
      left: r.left,
      width: r.width,
      ...(dropUp
        ? { bottom: window.innerHeight - r.top + gap }
        : { top: r.bottom + gap }),
      maxHeight: Math.max(180, (dropUp ? r.top : below) - gap - 8),
    });
  };

  useEffect(() => {
    if (!open) return;
    positionPanel();
    // Reposition while open in case the user scrolls or resizes.
    window.addEventListener("scroll", positionPanel, true);
    window.addEventListener("resize", positionPanel);
    return () => {
      window.removeEventListener("scroll", positionPanel, true);
      window.removeEventListener("resize", positionPanel);
    };
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const labelFor = useMemo(() => {
    const m = new Map(options.map((o) => [o.value, o.label]));
    return (v: string) => m.get(v) ?? v;
  }, [options]);

  const trimmed = text.trim();
  const filtered = useMemo(
    () =>
      trimmed
        ? options.filter((o) => o.label.toLowerCase().includes(trimmed.toLowerCase()))
        : options,
    [options, trimmed],
  );

  // "Select all" reflects the state of the currently visible (filtered) options.
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selectedSet.has(o.value));
  const someFilteredSelected = filtered.some((o) => selectedSet.has(o.value));

  const exact = options.find((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  const canAddCustom = allowCustom && trimmed.length > 0 && !exact;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: string) {
    onChange(
      selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  }

  function toggleAll() {
    if (allFilteredSelected) {
      // Deselect just the filtered ones, keep any others.
      const remove = new Set(filtered.map((o) => o.value));
      onChange(selected.filter((v) => !remove.has(v)));
    } else {
      const merged = new Set(selected);
      filtered.forEach((o) => merged.add(o.value));
      onChange([...merged]);
    }
  }

  function addCustom() {
    if (!trimmed || selectedSet.has(trimmed)) return;
    onChange([...selected, trimmed]);
    setText("");
  }

  function remove(value: string) {
    onChange(selected.filter((v) => v !== value));
  }

  return (
    <div className="tagbox" ref={wrapRef}>
      <div
        className={`tagbox-control${disabled ? " disabled" : ""}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        {selected.length === 0 ? (
          <span className="tagbox-placeholder">{placeholder}</span>
        ) : (
          selected.map((v) => (
            <span className="tag" key={v}>
              {labelFor(v)}
              {!disabled && (
                <button
                  type="button"
                  className="tag-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(v);
                  }}
                  aria-label={`Remove ${labelFor(v)}`}
                  tabIndex={-1}
                >
                  ×
                </button>
              )}
            </span>
          ))
        )}
        <span className="tagbox-caret" aria-hidden>
          ▾
        </span>
      </div>

      {open && !disabled && (
        <div className="tagbox-panel" role="listbox" aria-multiselectable="true" style={panelStyle}>
          <div className="tagbox-search">
            <input
              id={inputId}
              className="input"
              value={text}
              autoFocus
              placeholder={allowCustom ? "Search or type to add…" : "Search…"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canAddCustom) {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
          </div>

          <div className="tagbox-options">
            {filtered.length > 0 && (
              <label className="tagbox-opt tagbox-all">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allFilteredSelected && someFilteredSelected;
                  }}
                  onChange={toggleAll}
                />
                <span>{allFilteredSelected ? "Deselect all" : "Select all"}</span>
                <span className="tagbox-count">{filtered.length}</span>
              </label>
            )}

            {filtered.map((o) => (
              <label className="tagbox-opt" key={o.value}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}

            {canAddCustom && (
              <button type="button" className="tagbox-opt tagbox-add" onClick={addCustom}>
                + Add &quot;{trimmed}&quot;
              </button>
            )}

            {filtered.length === 0 && !canAddCustom && (
              <div className="combo-empty">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
