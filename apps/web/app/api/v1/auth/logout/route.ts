import { apiData, verifyMutationOrigin } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const originError = verifyMutationOrigin(request); if (originError) return originError;
  try { await (await createSupabaseServerClient()).auth.signOut({ scope: "local" }); } catch { /* Cookie cleanup still succeeds. */ }
  const response = apiData(request, { authenticated: false });
  response.headers.set("clear-site-data", '"cache"');
  return response;
}
