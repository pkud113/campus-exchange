import { createSupabaseServerClient } from "./supabase/server";

const listingSelect =
  "id,campus_id,seller_id,title,description,category,condition,price_cents,currency,status,visibility,exchange_methods,legacy_exchange_unspecified,created_at,campuses!inner(name,short_name,slug)";

async function enrichListings(db: Awaited<ReturnType<typeof createSupabaseServerClient>>, rows: any[]) {
  if (!rows.length) return rows;
  const [{ data: profiles }, { data: media }] = await Promise.all([
    db.rpc("safe_profile_cards", { target_ids: [...new Set(rows.map((row) => row.seller_id))] }),
    db.rpc("safe_listing_media", { target_ids: rows.map((row) => row.id) }),
  ]);
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  return rows.map((row) => ({
    ...row,
    profiles: profileMap.get(row.seller_id) ?? null,
    media_uploads: (media ?? []).filter((item: any) => item.listing_id === row.id),
  }));
}

export async function loadListings(filters?: {
  q?: string;
  category?: string;
  sort?: string;
  limit?: number;
}) {
  try {
    const db = await createSupabaseServerClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return [];
    let query = db
      .from("listings")
      .select(listingSelect)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(filters?.limit ?? 24);
    const { data: profile } = await db.from("profiles").select("campus_id").eq("id", user.id).single();
    if (profile?.campus_id) query = query.eq("campus_id", profile.campus_id);
    if (filters?.q) query = query.textSearch("search_vector", filters.q, { type: "websearch", config: "english" });
    if (filters?.category) query = query.eq("category", filters.category);
    if (filters?.sort === "price_asc") query = query.order("price_cents", { ascending: true }).order("id", { ascending: true });
    else if (filters?.sort === "price_desc") query = query.order("price_cents", { ascending: false }).order("id", { ascending: false });
    else query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
    const { data, error } = await query;
    return error ? [] : enrichListings(db, data ?? []);
  } catch {
    return [];
  }
}

type MarketplaceCursor = { sort: "newest" | "price_asc" | "price_desc"; value: string; id: string };

function decodeMarketplaceCursor(value?: string): MarketplaceCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as MarketplaceCursor;
    if (!["newest", "price_asc", "price_desc"].includes(parsed.sort) || !/^[0-9a-f-]{36}$/i.test(parsed.id)) return null;
    if (parsed.sort === "newest" && Number.isNaN(Date.parse(parsed.value))) return null;
    if (parsed.sort !== "newest" && !/^\d+$/.test(parsed.value)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function loadMarketplacePage(filters?: { q?: string; category?: string; sort?: string; campus?: string; cursor?: string }) {
  try {
    const db = await createSupabaseServerClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { listings: [], nextCursor: null };
    const sort = (filters?.sort === "price_asc" || filters?.sort === "price_desc" ? filters.sort : "newest") as MarketplaceCursor["sort"];
    const cursor = decodeMarketplaceCursor(filters?.cursor);
    let query = db
      .from("listings")
      .select(listingSelect)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(25);
    if (!filters?.campus || filters.campus === "my") {
      const { data: profile } = await db.from("profiles").select("campus_id").eq("id", user.id).single();
      if (profile?.campus_id) query = query.eq("campus_id", profile.campus_id);
    } else if (filters.campus !== "all") query = query.eq("campuses.slug", filters.campus);
    if (filters?.q) query = query.textSearch("search_vector", filters.q, { type: "websearch", config: "english" });
    if (filters?.category) query = query.eq("category", filters.category);
    if (sort === "price_asc") query = query.order("price_cents", { ascending: true }).order("id", { ascending: true });
    else if (sort === "price_desc") query = query.order("price_cents", { ascending: false }).order("id", { ascending: false });
    else query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
    if (cursor?.sort === sort) {
      if (sort === "newest") query = query.or(`created_at.lt.${cursor.value},and(created_at.eq.${cursor.value},id.lt.${cursor.id})`);
      else if (sort === "price_asc") query = query.or(`price_cents.gt.${cursor.value},and(price_cents.eq.${cursor.value},id.gt.${cursor.id})`);
      else query = query.or(`price_cents.lt.${cursor.value},and(price_cents.eq.${cursor.value},id.lt.${cursor.id})`);
    }
    const { data, error } = await query;
    if (error) return { listings: [], nextCursor: null };
    const rows = data ?? [];
    const listings = await enrichListings(db, rows.slice(0, 24));
    const last = listings.at(-1);
    const nextCursor = rows.length > 24 && last
      ? Buffer.from(JSON.stringify({ sort, value: sort === "newest" ? last.created_at : String(last.price_cents), id: last.id } satisfies MarketplaceCursor), "utf8").toString("base64url")
      : null;
    return { listings, nextCursor };
  } catch {
    return { listings: [], nextCursor: null };
  }
}

export async function loadEvents(filters?: { campus?: string }) {
  try {
    const db = await createSupabaseServerClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return [];
    let query = db
      .from("events")
      .select("id,campus_id,organizer_id,title,description,location,starts_at,ends_at,capacity,visibility,campuses!inner(name,short_name,slug)")
      .is("cancelled_at", null)
      .is("deleted_at", null)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(12);
    if (!filters?.campus || filters.campus === "my") {
      const { data: profile } = await db.from("profiles").select("campus_id").eq("id", user.id).single();
      if (profile?.campus_id) query = query.eq("campus_id", profile.campus_id);
    } else if (filters.campus !== "all") query = query.eq("campuses.slug", filters.campus);
    const { data, error } = await query;
    if (error || !data) return [];
    const [{ data: profiles }, { data: counts }] = await Promise.all([
      db.rpc("safe_profile_cards", { target_ids: [...new Set(data.map((row) => row.organizer_id))] }),
      db.rpc("event_rsvp_counts", { target_ids: data.map((row) => row.id) }),
    ]);
    const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
    const countMap = new Map<string, number>((counts ?? []).map((row: any) => [String(row.event_id), Number(row.attendee_count)]));
    return data.map((row) => ({ ...row, organizer: profileMap.get(row.organizer_id) ?? null, attendee_count: countMap.get(row.id) ?? 0 }));
  } catch {
    return [];
  }
}
