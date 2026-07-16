import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ListingEditForm } from "./listing-edit-form";
export default async function EditListing({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/listings/${id}/edit`)}`);
  const { data } = await db
    .from("listings")
    .select(
      "id,seller_id,title,description,category,condition,price_cents,currency,visibility,exchange_methods,legacy_exchange_unspecified,deleted_at,media_uploads(id,alt_text,status)",
    )
    .eq("id", id)
    .single();
  if (!data || data.seller_id !== user.id || data.deleted_at) notFound();
  return (
    <main className="dashboard narrow">
      <div className="page-title">
        <span className="overline">MY LISTINGS</span>
        <h1>Edit listing</h1>
      </div>
      <ListingEditForm
        listing={data}
        existingPhotos={(data.media_uploads ?? [])
          .filter((photo) => photo.status === "ready")
          .map((photo) => ({ id: photo.id, altText: photo.alt_text || data.title }))}
      />
    </main>
  );
}
