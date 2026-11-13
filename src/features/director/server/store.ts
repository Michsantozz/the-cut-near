import "server-only";
import type { AttestationEvidence, ChatSignature, CompletionProof } from "@/shared/ai/verify";
import type { DirectorLineKind } from "../model/kinds";

/** One completion the Director asked for, as stored. Mirrors `director_lines`. */
export type DirectorLineRecord = {
  id: string;
  kind: DirectorLineKind;
  subjectId: string | null;
  cutIndex: number | null;
  status: "accepted" | "rejected";
  text: string | null;
  rejectReason: string | null;
  model: string;
  chatId: string | null;
  requestBody: string;
  responseBody: string | null;
  signature: ChatSignature | null;
  proof: CompletionProof | null;
  attestationId: string | null;
  receivedAt: Date | null;
  createdAt: Date;
};

export type AttestationRecord = { id: string; evidence: AttestationEvidence; createdAt: Date };

export type LatestLinesQuery = {
  kinds?: DirectorLineKind[];
  subjectId?: string;
  /** Only lines whose proof is `verified` or `partial` (default true). */
  provenOnly?: boolean;
  limit: number;
};

/** Where Director lines and their evidence live: Postgres in production, memory in tests and sample mode. */
export interface DirectorStore {
  saveAttestation(record: AttestationRecord): Promise<void>;
  getAttestation(id: string): Promise<AttestationRecord | null>;
  saveLine(record: DirectorLineRecord): Promise<void>;
  getLine(id: string): Promise<DirectorLineRecord | null>;
  /** Accepted lines, newest first. */
  latestLines(query: LatestLinesQuery): Promise<DirectorLineRecord[]>;
}

const PROVEN = new Set(["verified", "partial"]);

export function memoryDirectorStore(): DirectorStore {
  const attestations = new Map<string, AttestationRecord>();
  const lines = new Map<string, DirectorLineRecord>();
  return {
    async saveAttestation(record) {
      attestations.set(record.id, structuredClone(record));
    },
    async getAttestation(id) {
      const record = attestations.get(id);
      return record ? structuredClone(record) : null;
    },
    async saveLine(record) {
      lines.set(record.id, structuredClone(record));
    },
    async getLine(id) {
      const record = lines.get(id);
      return record ? structuredClone(record) : null;
    },
    async latestLines({ kinds, subjectId, provenOnly = true, limit }) {
      return [...lines.values()]
        .filter((line) => line.status === "accepted")
        .filter((line) => !kinds || kinds.includes(line.kind))
        .filter((line) => subjectId === undefined || line.subjectId === subjectId)
        .filter((line) => !provenOnly || PROVEN.has(line.proof?.status ?? ""))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map((line) => structuredClone(line));
    },
  };
}
