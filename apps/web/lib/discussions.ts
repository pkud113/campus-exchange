import type { DiscussionComment, DiscussionSort } from "@campus-exchange/contracts";

export type DiscussionCursor = { sort: DiscussionSort; value: string; createdAt: string; id: string };

export function encodeDiscussionCursor(cursor: DiscussionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeDiscussionCursor(value?: string): DiscussionCursor | null {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as DiscussionCursor;
    if (!["hot", "new", "top", "comments"].includes(cursor.sort) || !cursor.value || Number.isNaN(Date.parse(cursor.createdAt)) || !/^[0-9a-f-]{36}$/i.test(cursor.id)) return null;
    return cursor;
  } catch { return null; }
}

export function discussionCursorFor(row: { id: string; created_at: string; hot_rank: number; score: number; comment_count: number }, sort: DiscussionSort): string {
  const value = sort === "hot" ? String(row.hot_rank) : sort === "top" ? String(row.score) : sort === "comments" ? String(row.comment_count) : row.created_at;
  return encodeDiscussionCursor({ sort, value, createdAt: row.created_at, id: row.id });
}

export function buildCommentTree(rows: DiscussionComment[]): DiscussionComment[] {
  const byId = new Map(rows.map((row) => [row.id, { ...row, children: [] as DiscussionComment[] }]));
  const roots: DiscussionComment[] = [];
  for (const row of byId.values()) {
    const parent = row.parentCommentId ? byId.get(row.parentCommentId) : null;
    if (parent) parent.children!.push(row);
    else roots.push(row);
  }
  return roots;
}
