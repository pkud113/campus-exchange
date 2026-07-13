"use client";

import { useState } from "react";

type Item = { id: string; title: string; type: "listing" | "event"; owner: string };

export function AdminContent({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState("");

  async function update(item: Item, action: "edit" | "hide") {
    const title = action === "edit" ? window.prompt(`New title for ${item.type}:`, item.title)?.trim() : undefined;
    if (action === "edit" && !title) return;
    const reason = window.prompt(`Reason for ${action === "edit" ? "editing" : "hiding"} this ${item.type}:`)?.trim();
    if (!reason || reason.length < 3) return;
    const response = await fetch(`/api/v1/admin/content/${item.type}/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, title, reason })
    });
    const body = await response.json();
    if (!response.ok) return setError(body.error?.message ?? "Unable to update content.");
    setError("");
    setItems(rows => action === "edit" ? rows.map(row => row.id === item.id && row.type === item.type ? { ...row, title: title! } : row) : rows.filter(row => row.id !== item.id || row.type !== item.type));
  }

  async function remove(item: Item) {
    const reason = window.prompt(`Reason for deleting ${item.type} “${item.title}”:`)?.trim();
    if (!reason || reason.length < 3) return;
    const response = await fetch(`/api/v1/admin/content/${item.type}/${item.id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason })
    });
    const body = await response.json();
    if (!response.ok) return setError(body.error?.message ?? "Unable to delete content.");
    setItems(rows => rows.filter(row => row.id !== item.id || row.type !== item.type));
    setError("");
  }

  return <section className="admin-content"><div className="section-heading"><div><span className="overline">CAMPUS CONTENT</span><h2>Recent listings and events</h2></div></div>{error && <p className="form-error">{error}</p>}<div className="managed-list">{items.map(item => <article key={`${item.type}:${item.id}`}><div><span className="severity low">{item.type}</span><h3>{item.title}</h3><p>Created by {item.owner}</p></div><div className="moderation-actions"><button className="button button-ghost button-small" onClick={() => update(item, "edit")}>Edit</button><button className="button button-ghost button-small" onClick={() => update(item, "hide")}>Hide</button><button className="button button-danger button-small" onClick={() => remove(item)}>Delete</button></div></article>)}</div>{!items.length && <div className="empty-state compact"><p>No active content to review.</p></div>}</section>;
}
