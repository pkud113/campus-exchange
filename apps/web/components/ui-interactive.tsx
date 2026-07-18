"use client";

import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Upload, X } from "lucide-react";
import { Button, IconButton } from "./ui";

function focusable(container: HTMLElement | null) {
  return Array.from(container?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
}

function ModalSurface({ open, onClose, title, description, children, footer, kind = "dialog" }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; kind?: "dialog" | "drawer" | "sheet";
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => focusable(panel.current)[0]?.focus());
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const items = focusable(panel.current);
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("modal-open"); document.removeEventListener("keydown", onKey); previousFocus.current?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className={`ui-modal-layer ui-modal-${kind}`}><button className="ui-modal-backdrop" onClick={onClose} aria-label={`Close ${kind}`} /><div className="ui-modal-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}><header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><IconButton label={`Close ${kind}`} onClick={onClose}><X aria-hidden="true" /></IconButton></header><div className="ui-modal-body">{children}</div>{footer && <footer>{footer}</footer>}</div></div>;
}

export function Dialog(props: Omit<Parameters<typeof ModalSurface>[0], "kind">) { return <ModalSurface {...props} kind="dialog" />; }
export function Drawer(props: Omit<Parameters<typeof ModalSurface>[0], "kind">) { return <ModalSurface {...props} kind="drawer" />; }
export function Sheet(props: Omit<Parameters<typeof ModalSurface>[0], "kind">) { return <ModalSurface {...props} kind="sheet" />; }

export function ConfirmationDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", destructive = false, busy = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; description: ReactNode; confirmLabel?: string; destructive?: boolean; busy?: boolean;
}) {
  return <Dialog open={open} onClose={onClose} title={title} description={description} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} busy={busy}>{confirmLabel}</Button></>}><p className="confirmation-copy">This action only proceeds after you confirm.</p></Dialog>;
}

export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <span className="ui-tooltip"><span>{children}</span><span role="tooltip">{label}</span></span>;
}

export function Popover({ label, children, content }: { label: ReactNode; children?: ReactNode; content: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  return <div className="ui-popover" ref={root}><Button variant="ghost" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{children ?? label}<ChevronDown aria-hidden="true" /></Button>{open && <div className="ui-popover-panel" role="dialog" aria-label={typeof label === "string" ? label : undefined}>{content}</div>}</div>;
}

export function DropdownMenu({ label, items }: { label: ReactNode; items: Array<{ label: string; onSelect: () => void; disabled?: boolean; destructive?: boolean }> }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = focusable(root.current).filter((item) => item.getAttribute("role") === "menuitem");
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") { event.preventDefault(); items[(index + 1) % items.length]?.focus(); }
    if (event.key === "ArrowUp") { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
    if (event.key === "Escape") setOpen(false);
  };
  return <div className="ui-menu" ref={root} onKeyDown={onKeyDown}><Button variant="ghost" aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen((value) => !value); requestAnimationFrame(() => focusable(root.current).find((item) => item.getAttribute("role") === "menuitem")?.focus()); }}>{label}<ChevronDown aria-hidden="true" /></Button>{open && <div className="ui-menu-list" role="menu">{items.map((item) => <button key={item.label} role="menuitem" disabled={item.disabled} className={item.destructive ? "danger" : undefined} onClick={() => { item.onSelect(); setOpen(false); }}>{item.label}</button>)}</div>}</div>;
}

export function Tabs({ tabs, activeId, onChange, label }: { tabs: Array<{ id: string; label: ReactNode; panel: ReactNode; disabled?: boolean }>; activeId: string; onChange: (id: string) => void; label: string }) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const enabled = tabs.filter((tab) => !tab.disabled);
    const current = enabled.findIndex((tab) => tab.id === tabs[index]?.id);
    const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length;
    const id = enabled[next]?.id; if (id) { onChange(id); document.getElementById(`tab-${id}`)?.focus(); }
  };
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  return <div className="ui-tabs"><div role="tablist" aria-label={label}>{tabs.map((tab, index) => <button id={`tab-${tab.id}`} key={tab.id} role="tab" aria-selected={tab.id === active?.id} aria-controls={`panel-${tab.id}`} tabIndex={tab.id === active?.id ? 0 : -1} disabled={tab.disabled} onClick={() => onChange(tab.id)} onKeyDown={(event) => onKeyDown(event, index)}>{tab.label}</button>)}</div>{active && <div id={`panel-${active.id}`} role="tabpanel" tabIndex={0} aria-labelledby={`tab-${active.id}`}>{active.panel}</div>}</div>;
}

type Toast = { id: number; title: string; description?: string; tone?: "neutral" | "success" | "danger" };
const ToastContext = createContext<{ push: (toast: Omit<Toast, "id">) => void }>({ push: () => {} });
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((toast: Omit<Toast, "id">) => { const id = Date.now() + Math.random(); setToasts((items) => [...items, { ...toast, id }]); window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000); }, []);
  return <ToastContext.Provider value={{ push }}>{children}<div className="ui-toast-region" role="region" aria-label="Notifications" aria-live="polite">{toasts.map((toast) => <div className={`ui-toast ui-toast-${toast.tone ?? "neutral"}`} key={toast.id}><Check aria-hidden="true" /><div><strong>{toast.title}</strong>{toast.description && <p>{toast.description}</p>}</div><IconButton label="Dismiss notification" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}><X aria-hidden="true" /></IconButton></div>)}</div></ToastContext.Provider>;
}
export function useToast() { return useContext(ToastContext); }

export function MediaUploader({ id, label = "Add media", accept = "image/jpeg,image/png,image/webp", multiple = true, maxFiles = 5, onChange, error }: { id: string; label?: string; accept?: string; multiple?: boolean; maxFiles?: number; onChange?: (files: File[]) => void; error?: string }) {
  const [files, setFiles] = useState<File[]>([]);
  return <div className={`ui-uploader${error ? " ui-uploader-invalid" : ""}`}><label htmlFor={id}><Upload aria-hidden="true" /><strong>{label}</strong><span>JPEG, PNG or WebP. Up to {maxFiles} files.</span></label><input id={id} type="file" accept={accept} multiple={multiple} onChange={(event) => { const next = Array.from(event.target.files ?? []).slice(0, maxFiles); setFiles(next); onChange?.(next); }} />{files.length > 0 && <ul aria-label="Selected files">{files.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name}<span>{Math.ceil(file.size / 1024)} KB</span></li>)}</ul>}{error && <p role="alert">{error}</p>}</div>;
}
