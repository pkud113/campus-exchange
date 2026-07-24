import { NextResponse } from "next/server";
import { apiData, requireStaffCapability } from "@/lib/api";

export async function GET(request: Request) {
  const context = await requireStaffCapability(request, "cases.read");
  if (context instanceof NextResponse) return context;
  return apiData(request, context.staff);
}
