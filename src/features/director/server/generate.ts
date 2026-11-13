import "server-only";
import { assertPrivateModel, isNearAiError, type ChatCompletionRequest, type NearAiClient, type RawCompletion } from "@/shared/ai";
import { verifyCompletionProof, type AttestationEvidence, type ChatSignature, type CompletionProof, type ProofCheck, type SigningAlgo } from "@/shared/ai/verify";
import { collectAttestation, type HardwareVerifier } from "@/shared/ai/verify/server";
import { allowedNumbersFor, type DirectorPrompt } from "../model/prompts";
import { DIRECTOR_REPLY_JSON_SCHEMA, lineFromReply, validateLine } from "../model/validate";
import type { DirectorLineRecord, DirectorStore } from "./store";

// The Director's pipeline for one line:
// 1. once per session: refuse non-Private models, then fetch and verify the attestation (fresh nonce);
// 2. ask the model, keeping the exact request and response bytes;
// 3. validate the line (length, plain text, no advice, numbers only from the prompt); retry once if rejected;
// 4. fetch the TEE signature for the chat id and verify it against the preflight evidence;
// 5. persist everything: bytes, chat id, model, signature, verification.

export type DirectorDeps = {
  client: NearAiClient;
  store: DirectorStore;
  /** Canonical id of a Private model (owned_by "nearai"). */
  model: string;
  signingAlgo: SigningAlgo;
  /** Null records the delegated Intel/NVIDIA checks as "skipped". */
  hardware: HardwareVerifier | null;
  reasoningEffort?: "low" | "medium" | "high";
  /** Attempts per line when validation rejects a reply. Default 2. */
  maxAttempts?: number;
  /** Re-attest when the evidence is older than this. Default 15 minutes. */
  attestationTtlMs?: number;
  now?: () => Date;
  newId?: () => string;
};

export class DirectorGenerationError extends Error {
  readonly attempts: { id: string; reason: string }[];

  constructor(message: string, attempts: { id: string; reason: string }[], options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DirectorGenerationError";
    this.attempts = attempts;
  }
}

/** The structured-output request for a prompt. Built once; its JSON text is what gets hashed and signed. */
export function chatRequestFor(prompt: DirectorPrompt, model: string, options: { reasoningEffort?: "low" | "medium" | "high"; feedback?: string } = {}): ChatCompletionRequest {
  const userContent = options.feedback ? `${prompt.user}\n\nYour last answer was rejected: ${options.feedback} Write a new one.` : prompt.user;
  return {
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: userContent },
    ],
    max_tokens: 400,
    temperature: 0.9,
    response_format: { type: "json_schema", json_schema: { name: "director_line", strict: true, schema: DIRECTOR_REPLY_JSON_SCHEMA } },
    ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
  };
}

/** The line inside a stored response body, read the same way it was read when generated. */
export function lineInResponse(responseBody: string): string | null {
  try {
    const parsed: unknown = JSON.parse(responseBody);
    if (typeof parsed !== "object" || parsed === null || !("choices" in parsed) || !Array.isArray(parsed.choices)) return null;
    const first: unknown = parsed.choices[0];
    if (typeof first !== "object" || first === null || !("message" in first)) return null;
    const message: unknown = first.message;
    if (typeof message !== "object" || message === null || !("content" in message) || typeof message.content !== "string") return null;
    return lineFromReply(message.content)?.replace(/\s+/g, " ") ?? null;
  } catch {
    return null;
  }
}

/** Local check: the shown line is exactly the content of the signed reply. */
export function lineInReplyCheck(text: string, responseBody: string): ProofCheck {
  const signed = lineInResponse(responseBody);
  const ok = signed === text;
  return { id: "line-in-reply", label: "Line is the signed reply", status: ok ? "pass" : "fail", scope: "local", detail: ok ? "The line shown is the content of the signed reply." : "The line shown differs from the signed reply." };
}

export function proofFor(record: { text: string; requestBody: string; responseBody: string; model: string; signature: ChatSignature | null; receivedAt: Date }, evidence: AttestationEvidence | null, now?: Date): CompletionProof {
  return verifyCompletionProof({
    requestBody: record.requestBody,
    responseBody: record.responseBody,
    model: record.model,
    signature: record.signature,
    evidence,
    receivedAt: record.receivedAt,
    extraChecks: [lineInReplyCheck(record.text, record.responseBody)],
    now,
  });
}

type Attested = { id: string; evidence: AttestationEvidence };

/** A run of the Director: one attestation shared by the lines generated within its lifetime. */
export class DirectorSession {
  private attested: Promise<Attested> | null = null;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: DirectorDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  /** Verified preflight evidence for the session's model, fetched once and refreshed when stale. */
  async attestation(): Promise<Attested> {
    const ttl = this.deps.attestationTtlMs ?? 15 * 60_000;
    if (this.attested) {
      const current = await this.attested.catch(() => null);
      if (current && this.now().getTime() - new Date(current.evidence.fetchedAt).getTime() < ttl) return current;
    }
    this.attested = (async () => {
      await assertPrivateModel(this.deps.client, this.deps.model);
      const evidence = await collectAttestation(this.deps.client, { model: this.deps.model, signingAlgo: this.deps.signingAlgo, hardware: this.deps.hardware, now: this.now });
      const record = { id: this.newId(), evidence, createdAt: this.now() };
      await this.deps.store.saveAttestation(record);
      return { id: record.id, evidence };
    })();
    return this.attested;
  }

  /** Generates, validates, signs, verifies and stores one line. Throws DirectorGenerationError if every attempt is rejected. */
  async generate(prompt: DirectorPrompt): Promise<DirectorLineRecord> {
    const { client, store, model } = this.deps;
    const attested = await this.attestation();
    const allowed = allowedNumbersFor(prompt);
    const attempts: { id: string; reason: string }[] = [];
    const maxAttempts = this.deps.maxAttempts ?? 2;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const request = chatRequestFor(prompt, model, { reasoningEffort: this.deps.reasoningEffort, feedback: attempts.at(-1)?.reason });
      const raw: RawCompletion = await client.chatCompletion(request);
      const base = {
        id: this.newId(),
        kind: prompt.kind,
        subjectId: prompt.subjectId,
        cutIndex: prompt.cutIndex,
        model,
        chatId: raw.chatId,
        requestBody: raw.requestBody,
        responseBody: raw.responseBody,
        attestationId: attested.id,
        receivedAt: raw.receivedAt,
        createdAt: this.now(),
      };
      const reply = lineFromReply(raw.completion.choices[0]?.message.content);
      const check = reply === null ? ({ ok: false, reason: "The reply has no line." } as const) : validateLine(reply, prompt.kind, allowed, prompt.names);
      if (!check.ok) {
        attempts.push({ id: base.id, reason: check.reason });
        await store.saveLine({ ...base, status: "rejected", text: reply, rejectReason: check.reason, signature: null, proof: null });
        continue;
      }

      let signature: ChatSignature | null = null;
      try {
        signature = await client.chatSignature({ chatId: raw.chatId, model, signingAlgo: this.deps.signingAlgo });
      } catch (error) {
        if (!isNearAiError(error, "signature-unavailable")) throw error;
      }
      const proof = proofFor({ text: check.line, requestBody: raw.requestBody, responseBody: raw.responseBody, model, signature, receivedAt: raw.receivedAt }, attested.evidence, this.now());
      const record: DirectorLineRecord = { ...base, status: "accepted", text: check.line, rejectReason: null, signature, proof };
      await store.saveLine(record);
      return record;
    }
    throw new DirectorGenerationError(`Every reply for ${prompt.kind}${prompt.subjectId ? ` (${prompt.subjectId})` : ""} was rejected: ${attempts.map((a) => a.reason).join(" / ")}`, attempts);
  }
}

