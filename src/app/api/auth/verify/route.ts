import type { NextRequest } from "next/server";
import { handleVerify } from "@/shared/auth/server";

/** Verifies the signed challenge (NEP-413, full-access key) and sets the session cookie. */
export async function POST(request: NextRequest) {
  return handleVerify(request);
}
