import type { NextRequest } from "next/server";
import { handleSession } from "@/shared/auth/server";

/** The signed-in account, for client components. */
export async function GET(request: NextRequest) {
  return handleSession(request);
}
