import "server-only";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { directorAttestations, directorLines } from "../db/schema";
import type { DirectorLineRecord, DirectorStore } from "./store";

/** Any Drizzle Postgres database (postgres-js in the app, others in tests). */
export type DirectorDb = PgDatabase<PgQueryResultHKT>;

// `proof_status` is a denormalized copy of `proof.status`, for filtering only.
const toRecord = (row: typeof directorLines.$inferSelect): DirectorLineRecord => ({
  id: row.id,
  kind: row.kind,
  subjectId: row.subjectId,
  cutIndex: row.cutIndex,
  status: row.status,
  text: row.text,
  rejectReason: row.rejectReason,
  model: row.model,
  chatId: row.chatId,
  requestBody: row.requestBody,
  responseBody: row.responseBody,
  signature: row.signature,
  proof: row.proof,
  attestationId: row.attestationId,
  receivedAt: row.receivedAt,
  createdAt: row.createdAt,
});

export function drizzleDirectorStore(db: DirectorDb): DirectorStore {
  return {
    async saveAttestation(record) {
      await db.insert(directorAttestations).values({ id: record.id, model: record.evidence.model, nonce: record.evidence.nonce, fetchedAt: new Date(record.evidence.fetchedAt), evidence: record.evidence, createdAt: record.createdAt });
    },

    async getAttestation(id) {
      const [row] = await db.select().from(directorAttestations).where(eq(directorAttestations.id, id)).limit(1);
      return row ? { id: row.id, evidence: row.evidence, createdAt: row.createdAt } : null;
    },

    async saveLine(record) {
      await db.insert(directorLines).values({ ...record, proofStatus: record.proof?.status ?? null });
    },

    async getLine(id) {
      const [row] = await db.select().from(directorLines).where(eq(directorLines.id, id)).limit(1);
      return row ? toRecord(row) : null;
    },

    async latestLines({ kinds, subjectId, provenOnly = true, limit }) {
      const filters: SQL[] = [eq(directorLines.status, "accepted")];
      if (kinds) filters.push(inArray(directorLines.kind, kinds));
      if (subjectId !== undefined) filters.push(eq(directorLines.subjectId, subjectId));
      if (provenOnly) filters.push(inArray(directorLines.proofStatus, ["verified", "partial"]));
      const rows = await db
        .select()
        .from(directorLines)
        .where(and(...filters))
        .orderBy(desc(directorLines.createdAt))
        .limit(limit);
      return rows.map(toRecord);
    },
  };
}
