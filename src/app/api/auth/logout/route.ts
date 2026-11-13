import type { NextRequest } from "next/server";
import { handleLogout } from "@/shared/auth/server";

export async function POST(request: NextRequest) {
  return handleLogout(request);
}
