import { listingTransitionSchema } from "@campus-exchange/contracts";
import { assertListingTransition, DomainError } from "@campus-exchange/domain";
import { apiData, apiError, parseJson, requireVerified, verifyMutationOrigin } from "@/lib/api";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  const context = await requireVerified(request); if (context instanceof NextResponse) return context; const { id } = await params;
  const { data, error } = await context.supabase.from("listings").select("*,profiles!listings_seller_id_fkey(handle,display_name),media_uploads(id,alt_text,status)").eq("id", id).single();
  return error ? apiError(request, 404, "not_found", "Listing not found.") : apiData(request, data);
}
export async function PATCH(request: Request, { params }: Params) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  const context = await requireVerified(request); if (context instanceof NextResponse) return context; const { id } = await params;
  const input = await parseJson(request, listingTransitionSchema); if (input instanceof NextResponse) return input;
  const { data: current } = await context.supabase.from("listings").select("status,seller_id").eq("id", id).single();
  if (!current) return apiError(request, 404, "not_found", "Listing not found.");
  if (current.seller_id !== context.userId) return apiError(request, 403, "forbidden", "Only the seller can change this listing.");
  try { assertListingTransition(current.status, input.status, input.buyerId); } catch (error) { return apiError(request, 409, "conflict", error instanceof DomainError ? error.message : "Invalid listing transition."); }
  const { data, error } = await context.supabase.from("listings").update({ status: input.status, buyer_id: input.buyerId ?? null }).eq("id", id).select().single();
  return error ? apiError(request, 409, "conflict", "Unable to change this listing state.") : apiData(request, data);
}
