import "server-only";

import { proofBadge } from "@/features/director";
import { getDirectorLines } from "@/features/director/server";
import { quoteOf, type ShareQuote } from "@/features/share";

/** The Director's after-cut receipt for a cut, cut to a quote, with its proof badge. Null when there is none. */
export async function cutQuote(cutIndex: number): Promise<ShareQuote | null> {
  const lines = await getDirectorLines({ kinds: ["after-cut-receipt"], limit: 20 });
  const line = lines.find((candidate) => candidate.cutIndex === cutIndex);
  if (!line?.text) return null;
  return { text: quoteOf(line.text), badge: proofBadge(line.proof.status).label, proofUrl: line.proof.proofUrl };
}
