import type { NextRequest } from "next/server";
import { handleChallenge } from "@/shared/auth/server";

/** Issues a single-use NEP-413 nonce for the wallet to sign. */
export async function POST(request: NextRequest) {
  return handleChallenge(request);
}
