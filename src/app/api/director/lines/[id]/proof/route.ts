import { z } from "zod";
import { getDirectorLineProof } from "@/features/director/server";

// GET /api/director/lines/{id}/proof: the proof bundle of one Director line, as JSON.
// Local checks are recomputed on every request from the stored bytes; hardware verdicts are the recorded ones.

const idSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return Response.json({ error: "invalid_id" }, { status: 400 });
  const proof = await getDirectorLineProof(parsed.data);
  if (!proof) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(proof, { headers: { "cache-control": "no-store" } });
}
