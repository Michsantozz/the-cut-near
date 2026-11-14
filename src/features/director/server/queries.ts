import "server-only";
import { z } from "zod";
import { LINKS, sha256Hex, verifierUrl } from "@/shared/ai/verify";
import type { DirectorLineKind } from "../model/kinds";
import type { SampleLine } from "../model/sample";
import { proofUrlOf, type DirectorLineView, type DirectorProofBundle } from "../model/view";
import { proofFor } from "./generate";
import { defaultDirectorStore, sampleLines } from "./runtime";
import type { DirectorLineRecord, DirectorStore } from "./store";

export type DirectorLinesQuery = {
  kinds?: DirectorLineKind[];
  subjectId?: string;
  /** Default 20, at most 100. */
  limit?: number;
  store?: DirectorStore;
};

function recordView(record: DirectorLineRecord): DirectorLineView {
  const proof = record.proof;
  return {
    id: record.id,
    kind: record.kind,
    subjectId: record.subjectId,
    cutIndex: record.cutIndex,
    text: record.text ?? "",
    createdAt: record.createdAt.toISOString(),
    model: record.model,
    proof: {
      status: proof?.status ?? "unavailable",
      summary: proof?.summary ?? null,
      chatId: record.chatId,
      proofUrl: proofUrlOf(record.id),
      verifierUrl: record.signature && record.chatId ? verifierUrl({ model: record.model, chatId: record.chatId, signature: record.signature, verifiedAt: proof?.verifiedAt }) : null,
    },
  };
}

function sampleView(line: SampleLine): DirectorLineView {
  return { ...line, model: null, proof: { status: "unsigned", summary: null, chatId: null, proofUrl: proofUrlOf(line.id), verifierUrl: null } };
}

/**
 * The latest Director lines with their proof status, newest first, for the UI. Only lines whose proof is
 * `verified` or `partial` are listed. With DATA_SOURCE=sample the sample world's lines follow, marked `unsigned`.
 */
export async function getDirectorLines(query: DirectorLinesQuery = {}): Promise<DirectorLineView[]> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const store = query.store ?? defaultDirectorStore();
  const records = await store.latestLines({ kinds: query.kinds, subjectId: query.subjectId, limit });
  const samples = (query.store ? [] : sampleLines()).filter((line) => (!query.kinds || query.kinds.includes(line.kind)) && (query.subjectId === undefined || line.subjectId === query.subjectId));
  return [...records.map(recordView), ...samples.map(sampleView)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

/** The newest line of a kind (optionally about one agent), or null. */
export async function getLatestDirectorLine(kind: DirectorLineKind, options: { subjectId?: string; store?: DirectorStore } = {}): Promise<DirectorLineView | null> {
  const [line] = await getDirectorLines({ kinds: [kind], subjectId: options.subjectId, limit: 1, store: options.store });
  return line ?? null;
}

const requestSchema = z.object({ messages: z.array(z.object({ role: z.string(), content: z.string() })) });

function userPromptOf(requestBody: string): string | null {
  try {
    const parsed = requestSchema.safeParse(JSON.parse(requestBody));
    return parsed.success ? (parsed.data.messages.find((message) => message.role === "user")?.content ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * The full proof of one line. Local checks (hashes, signature, signer, line in reply) are recomputed now
 * from the stored bytes; delegated hardware verdicts are the ones recorded with the preflight attestation.
 * Null when there is no accepted line with this id.
 */
export async function getDirectorLineProof(id: string, options: { store?: DirectorStore; now?: Date } = {}): Promise<DirectorProofBundle | null> {
  const now = options.now ?? new Date();
  const sample = (options.store ? [] : sampleLines(now)).find((line) => line.id === id);
  if (sample) {
    return {
      version: 1,
      line: { id: sample.id, kind: sample.kind, subjectId: sample.subjectId, cutIndex: sample.cutIndex, text: sample.text, createdAt: sample.createdAt },
      status: "unsigned",
      summary: null,
      checks: [],
      model: null,
      chatId: null,
      prompt: null,
      request: null,
      response: null,
      signature: null,
      attestation: null,
      links: { verifier: null, teeExplorer: LINKS.teeExplorer, docs: LINKS.responseSignatures },
      generatedAt: sample.createdAt,
      checkedAt: now.toISOString(),
      note: "Sample world data (DATA_SOURCE=sample): no model wrote this line, so there is nothing to verify.",
    };
  }

  const store = options.store ?? defaultDirectorStore();
  const record = await store.getLine(id);
  if (!record || record.status !== "accepted" || record.text === null || record.responseBody === null) return null;
  const attestation = record.attestationId ? await store.getAttestation(record.attestationId) : null;
  const evidence = attestation?.evidence ?? null;
  const proof = proofFor({ text: record.text, requestBody: record.requestBody, responseBody: record.responseBody, model: record.model, signature: record.signature, receivedAt: record.receivedAt ?? record.createdAt }, evidence, now);
  return {
    version: 1,
    line: { id: record.id, kind: record.kind, subjectId: record.subjectId, cutIndex: record.cutIndex, text: record.text, createdAt: record.createdAt.toISOString() },
    status: proof.status,
    summary: proof.summary,
    checks: [...proof.checks, ...(evidence ? [evidence.gateway, ...evidence.models].flatMap((report, index) => report.checks.map((check) => ({ ...check, id: `${report.role}${report.role === "model" ? `-${index}` : ""}:${check.id}` }))) : [])],
    model: record.model,
    chatId: record.chatId,
    prompt: userPromptOf(record.requestBody),
    request: { body: record.requestBody, sha256: sha256Hex(record.requestBody) },
    response: { body: record.responseBody, sha256: sha256Hex(record.responseBody) },
    signature: record.signature ? { ...record.signature, kind: proof.signatureKind, expectedText: proof.expectedText } : null,
    attestation: evidence,
    links: {
      verifier: record.signature && record.chatId ? verifierUrl({ model: record.model, chatId: record.chatId, signature: record.signature, verifiedAt: proof.verifiedAt }) : null,
      teeExplorer: LINKS.teeExplorer,
      docs: LINKS.responseSignatures,
    },
    generatedAt: record.createdAt.toISOString(),
    checkedAt: now.toISOString(),
  };
}
