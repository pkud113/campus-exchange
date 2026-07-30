"use client";

import type { InstitutionSearchResult } from "@campus-exchange/shared-types";
import { LoaderCircle, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type InstitutionOption = InstitutionSearchResult;

type Props = {
  label?: string;
  selected: InstitutionOption | null;
  onSelect: (institution: InstitutionOption | null) => void;
  lifecycle?: "active" | "all";
  presence?: "any" | "provisioned" | "unprovisioned";
  required?: boolean;
  placeholder?: string;
};

export function InstitutionCombobox({
  label = "College or university",
  selected,
  onSelect,
  lifecycle = "active",
  presence = "any",
  required = false,
  placeholder = "Search by institution, alias, city, or state"
}: Props) {
  const rootId = useId();
  const listId = `${rootId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [options, setOptions] = useState<InstitutionOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selected) setQuery(selected.name);
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const params = new URLSearchParams({ q: query, lifecycle, presence, limit: "20" });
        const response = await fetch(`/api/v1/institutions?${params}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Institution search is unavailable.");
        setOptions(body.data?.items ?? body.data ?? []);
        setActiveIndex(-1);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setOptions([]);
        setError(cause instanceof Error ? cause.message : "Institution search is unavailable.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lifecycle, open, presence, query]);

  function choose(option: InstitutionOption) {
    setQuery(option.name);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(option);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(options.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      const active = options[activeIndex];
      if (active) choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return <div className="institution-combobox">
    <label htmlFor={`${rootId}-input`}>{label}</label>
    <div className="institution-search-input">
      <Search size={17} aria-hidden="true" />
      <input
        ref={inputRef}
        id={`${rootId}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={activeIndex >= 0 ? `${rootId}-option-${activeIndex}` : undefined}
        aria-describedby={`${rootId}-status`}
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget)) setOpen(false);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          onSelect(null);
        }}
        onKeyDown={onKeyDown}
        required={required}
      />
      {busy && <LoaderCircle className="spin" size={17} aria-hidden="true" />}
    </div>
    <span id={`${rootId}-status`} className="sr-only" role="status" aria-live="polite">
      {busy ? "Searching institutions." : error || `${options.length} institutions available.`}
    </span>
    {open && <div className="institution-options" id={listId} role="listbox">
      {!busy && error && <p className="institution-option-note" role="alert">{error}</p>}
      {!busy && !error && options.length === 0 && <p className="institution-option-note">No matching institution found.</p>}
      {!busy && options.map((institution, index) => <button
        id={`${rootId}-option-${index}`}
        key={institution.id}
        type="button"
        role="option"
        aria-selected={selected?.id === institution.id}
        className="institution-option"
        data-active={activeIndex === index}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => choose(institution)}
      >
        <span>
          <strong>{institution.name}</strong>
          <small>{[institution.city, institution.region].filter(Boolean).join(", ")}</small>
        </span>
        <em data-availability={institution.availability}>
          {institution.availability === "available" ? institution.campus ? "Campus active" : "Email verification" : institution.availability}
        </em>
      </button>)}
    </div>}
  </div>;
}
