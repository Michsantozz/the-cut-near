import { z } from "zod";

// Wire formats of NEAR AI Cloud verification endpoints, validated at the boundary.
// Sources: https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md
//          https://docs.near.ai/cloud/verification/cloud-api/model-attestations.md
//          https://docs.near.ai/cloud/verification/cloud-api/gateway-attestation.md

export const signingAlgoSchema = z.enum(["ecdsa", "ed25519"]);
export type SigningAlgo = z.infer<typeof signingAlgoSchema>;

/** `GET /v1/signature/{chat_id}`. `signature_kind` is kept as a string: an unfamiliar kind is handled, not rejected. */
export const chatSignatureSchema = z.object({
  text: z.string().min(1),
  signature: z.string().min(1),
  signing_address: z.string().min(1),
  signing_algo: signingAlgoSchema,
  signature_kind: z.string().optional(),
});
export type ChatSignature = z.infer<typeof chatSignatureSchema>;

/** A 2xx answer of the signature endpoint that carries no signature. */
export const signatureUnavailableSchema = z.object({ error_code: z.string(), message: z.string().optional() });

export const eventLogEntrySchema = z.looseObject({
  imr: z.number().int(),
  event_type: z.number().int().nonnegative(),
  event: z.string(),
  event_payload: z.string().nullish(),
  digest: z.string().nullish(),
});
export type EventLogEntry = z.infer<typeof eventLogEntrySchema>;

const tcbInfoObjectSchema = z.looseObject({ app_compose: z.string() });

/** One NEAR-operated dstack report: the gateway's, or one model candidate. Unknown fields are kept but not trusted. */
export const nearReportSchema = z.looseObject({
  signing_address: z.string().min(1),
  signing_algo: signingAlgoSchema,
  intel_quote: z.string().min(1),
  /** A JSON array, or that array as JSON text (gateway). */
  event_log: z.union([z.string(), z.array(eventLogEntrySchema)]),
  request_nonce: z.string().optional(),
  report_data: z.string().optional(),
  /** GPU evidence as JSON text, for NVIDIA NRAS. Model reports only. */
  nvidia_payload: z.string().optional(),
  model_name: z.string().optional(),
  info: z.looseObject({
    /** An object with `app_compose`, or that object as JSON text. */
    tcb_info: z.union([z.string(), tcbInfoObjectSchema]),
    app_id: z.string().optional(),
    instance_id: z.string().optional(),
    compose_hash: z.string().optional(),
    os_image_hash: z.string().optional(),
  }),
});
export type NearReport = z.infer<typeof nearReportSchema>;

/** `GET /v1/attestation/report?model=…&provider=near&signing_algo=…&nonce=…`. */
export const attestationReportSchema = z.looseObject({
  gateway_attestation: nearReportSchema,
  model_attestations: z.array(nearReportSchema).optional(),
});
export type AttestationReport = z.infer<typeof attestationReportSchema>;

/** Reads `app_compose` from `info.tcb_info`, which can be an object or JSON text. Null when absent or malformed. */
export function appComposeOf(report: NearReport): string | null {
  const tcb = report.info.tcb_info;
  if (typeof tcb !== "string") return tcb.app_compose;
  try {
    const parsed = tcbInfoObjectSchema.safeParse(JSON.parse(tcb));
    return parsed.success ? parsed.data.app_compose : null;
  } catch {
    return null;
  }
}

/** Reads the event log, which can be an array or JSON text. Null when malformed. */
export function eventLogOf(report: NearReport): EventLogEntry[] | null {
  if (typeof report.event_log !== "string") return report.event_log;
  try {
    const parsed = z.array(eventLogEntrySchema).safeParse(JSON.parse(report.event_log));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** NVIDIA NRAS `POST /v3/attest/gpu` answer: `[["JWT", "<overall>"], {"GPU-0": "<jwt>", …}]`. */
export const nrasResponseSchema = z.tuple([z.tuple([z.literal("JWT"), z.string().min(1)]), z.record(z.string(), z.string().min(1))]);

/** The GPU evidence inside `nvidia_payload`. */
export const nvidiaPayloadSchema = z.looseObject({ nonce: z.string(), evidence_list: z.array(z.unknown()).min(1), arch: z.string().optional() });
