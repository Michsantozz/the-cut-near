import { NextResponse, type NextRequest } from "next/server";

import { getAgent } from "@/entities/agent/server";
import { getCut } from "@/entities/cut/server";
import { isShareableCut } from "@/features/share";
import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";

/**
 * Real 404s for an agent or a cut that does not exist. With Cache Components a page sends its shell (and a 200) before a
 * request-time `notFound()` runs, so the existence check happens here, before rendering starts
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md "Status codes"). The pages keep their
 * own `notFound()` for anything this check lets through. One contract view per request; when the chain cannot be read,
 * the request goes on and the page decides.
 */
export async function proxy(request: NextRequest) {
  const [, section, ...rest] = request.nextUrl.pathname.split("/");
  // A file (the art in public/agents/) is never an agent; the matcher already skips it.
  if (rest.some((segment) => segment.includes("."))) return NextResponse.next();
  try {
    const exists = section === "agents" ? await agentExists(decodeURIComponent(rest[0] ?? "")) : await cutExists(rest[1] ?? "");
    if (exists) return NextResponse.next();
  } catch (error) {
    console.error("[proxy] existence check failed, rendering the page", error);
    return NextResponse.next();
  }
  // No route matches this path, so Next renders src/app/not-found.tsx with a 404 status.
  return NextResponse.rewrite(new URL("/_not-found-404", request.url));
}

export const config = {
  // `/agents/<id>` but not the art in public/agents/ (`/agents/kiko.svg`).
  matcher: ["/agents/:id([^/.]+)", "/share/cut/:index"],
};

async function agentExists(id: string): Promise<boolean> {
  if (!/^[a-z0-9_-]{1,64}$/.test(id)) return false;
  // Live: the bare contract view (getAgent also reads the journal for "saved today").
  if (dataSource() === "live") return (await cutContract().getAgent(id)) !== null;
  return (await getAgent(id)) !== null;
}

async function cutExists(raw: string): Promise<boolean> {
  if (!/^[1-9][0-9]{0,8}$/.test(raw)) return false;
  const cut = await getCut(Number(raw));
  return cut !== null && isShareableCut(cut);
}
