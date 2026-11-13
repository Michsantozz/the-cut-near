import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { AttestationEvidence, ChatSignature, CompletionProof, ProofStatus } from "@/shared/ai/verify";
import type { DirectorLineKind } from "../model/kinds";

/**
 * Preflight attestations: the gateway report and every NEAR model candidate, fetched with a fresh nonce
 * before the completions they vouch for, with the verdict of every check (local and delegated).
 */
export const directorAttestations = pgTable("director_attestations", {
  id: uuid("id").primaryKey(),
  model: text("model").notNull(),
  nonce: text("nonce").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  evidence: jsonb("evidence").$type<AttestationEvidence>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every completion the Director asked for, accepted or rejected by validation. `request_body` and
 * `response_body` are the exact bytes (UTF-8) whose SHA-256 the TEE signed: never reformat them.
 */
export const directorLines = pgTable(
  "director_lines",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").$type<DirectorLineKind>().notNull(),
    subjectId: text("subject_id"),
    cutIndex: integer("cut_index"),
    /** `accepted` lines are shown; `rejected` ones failed validation and are kept for audit. */
    status: text("status").$type<"accepted" | "rejected">().notNull(),
    text: text("text"),
    rejectReason: text("reject_reason"),
    model: text("model").notNull(),
    chatId: text("chat_id"),
    requestBody: text("request_body").notNull(),
    responseBody: text("response_body"),
    signature: jsonb("signature").$type<ChatSignature>(),
    proof: jsonb("proof").$type<CompletionProof>(),
    proofStatus: text("proof_status").$type<ProofStatus>(),
    attestationId: uuid("attestation_id").references(() => directorAttestations.id),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("director_lines_kind_created_idx").on(table.kind, table.createdAt), index("director_lines_created_idx").on(table.createdAt)],
);
