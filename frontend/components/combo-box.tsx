"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Lookup } from "@/lib/types";

interface Props {
  /** Currently selected id, as a string ("" when nothing is chosen). */
  value: string;
  options: Lookup[];
  onChange: (id: string) => void;
  /** Called when the typed name is not in the list - should create it and return the new row. */
  onCreate?: (name: string) => Promise<Lookup | null>;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  allowCreate?: boolean;
}

/**
 * Type-or-pick input. Behaves like a select when you click the arrow, and like a
 * text box when you type. Typing a name that isn't in the list offers to add it,
 * so the master list grows from normal use instead of a separate admin screen.
 */
export function ComboBox({
  value,
  options,
  onChange,
  onCreate,
  placeholder = "Type or select…",
  disabled = false,
  id,
  allowCreate = true,
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;

  const selected = options.find((o) => String(o.id) === value) ?? null;
  const [text, setText] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in step when the selection changes from outside
  // (e.g. the form was reset, or a freshly created option was selected).
  const selectedName = selected?.name ?? "";
  const [lastSelectedName, setLastSelectedName] = useState(selectedName);
  if (selectedName !== lastSelectedName) {
    setLastSelectedName(selectedName);
    setText(selectedName);
  }

  const trimmed = text.trim();
  const matches = useMemo(() => {
    if (!trimmed) return options;
    const q = trimmed.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, trimmed]);

  const exactMatch = options.find(
    (o) => o.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const canOfferCreate = allowCreate && Boolean(onCreate) && trimmed.length > 0 && !exactMatch;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      // Abandon a half-typed name that was never committed.
      setText(selectedName);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, selectedName]);

  function choose(opt: Lookup) {
    onChange(String(opt.id));
    setText(opt.name);
    setOpen(false);
  }

  function clear() {
    onChange("");
    setText("");
    setOpen(false);
  }

  async function create() {
    if (!onCreate || !trimmed || creating) return;
    setCreating(true);
    try {
      const made = await onCreate(trimmed);
      if (made) {
        onChange(String(made.id));
        setText(made.name);
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  // Rows are the filtered options plus, optionally, the "add" row at the end.
  const rowCount = matches.length + (canOfferCreate ? 1 : 0);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (rowCount === 0 ? 0 : (h + 1) % rowCount));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (rowCount === 0 ? 0 : (h - 1 + rowCount) % rowCount));
      return;
    }
    if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      if (canOfferCreate && highlight === matches.length) void create();
      else if (matches[highlight]) choose(matches[highlight]);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setText(selectedName);
    }
  }

  return (
    <div className="combo" ref={wrapRef}>
      <input
        id={inputId}
        className="input combo-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${inputId}-list`}
        aria-autocomplete="list"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        disabled={disabled || creating}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
          // Clearing the box clears the selection.
          if (!e.target.value.trim()) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      <div className="combo-actions">
        {text && !disabled && (
          <button
            type="button"
            className="combo-btn"
            onClick={clear}
            aria-label="Clear"
            tabIndex={-1}
          >
            ×
          </button>
        )}
        <button
          type="button"
          className="combo-btn"
          onClick={() => setOpen((o) => !o)}
          aria-label="Show options"
          disabled={disabled}
          tabIndex={-1}
        >
          ▾
        </button>
      </div>

      {open && (
        <ul className="combo-list" id={`${inputId}-list`} role="listbox">
          {matches.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={String(o.id) === value}
              className={`combo-option${i === highlight ? " active" : ""}${
                String(o.id) === value ? " selected" : ""
              }`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
            >
              {o.name}
            </li>
          ))}

          {canOfferCreate && (
            <li
              role="option"
              aria-selected={false}
              className={`combo-option combo-create${
                highlight === matches.length ? " active" : ""
              }`}
              onMouseEnter={() => setHighlight(matches.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              {creating ? "Adding…" : `+ Add "${trimmed}"`}
            </li>
          )}

          {matches.length === 0 && !canOfferCreate && (
            <li className="combo-empty">No matches</li>
          )}
        </ul>
      )}
    </div>
  );
}
