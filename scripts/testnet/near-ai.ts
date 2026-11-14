// NEAR AI Cloud calls for the testnet scripts (probe-ai.ts, autopilot.ts): a completion posted byte for byte
// and the TEE signature of its chat id. The app has the same calls in src/shared/ai/client.ts; scripts run on
// plain Node, so they cannot import the app's aliased modules.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { MoveSignature } from "../../src/features/moves/model/relay.ts";

export const NEAR_AI_BASE_URL = (process.env.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1").replace(/\/+$/, "");

/** NEAR_AI_API_KEY from the environment, else from .env.local at `root`. Never printed. */
export function nearAiKey(root: string): string | null {
  const file = join(root, ".env.local");
  if (!process.env.NEAR_AI_API_KEY && existsSync(file)) process.loadEnvFile(file);
  return process.env.NEAR_AI_API_KEY?.trim() || null;
}

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type RawReply = { status: number; body: string; ms: number };

/** POSTs `requestBody` unchanged to /chat/completions, not streamed, and returns the exact response text. */
export async function postCompletion(apiKey: string, requestBody: string, timeoutMs = 90_000): Promise<RawReply> {
  const started = Date.now();
  const response = await fetch(`${NEAR_AI_BASE_URL}/chat/completions`, {
    method: "POST",
    body: new TextEncoder().encode(requestBody),
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", accept: "application/json", "accept-encoding": "identity", "x-no-aliasing": "true" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, body: decoder.decode(new Uint8Array(await response.arrayBuffer())), ms: Date.now() - started };
}

/** The completion's exact text, or an error naming the HTTP status. */
export async function complete(apiKey: string, requestBody: string): Promise<string> {
  const reply = await postCompletion(apiKey, requestBody);
  if (reply.status < 200 || reply.status >= 300) throw new Error(`NEAR AI answered HTTP ${reply.status}: ${reply.body.slice(0, 200)}`);
  return reply.body;
}

/** `GET /signature/<chat id>` with a bounded wait: the TEE node may not have recorded it yet. */
export async function fetchSignature(apiKey: string, chatId: string, model: string, attempts = 6): Promise<MoveSignature> {
  let delay = 500;
  let last = "no answer";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const url = `${NEAR_AI_BASE_URL}/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(model)}&signing_algo=ed25519`;
    const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    const body = (await response.json().catch(() => null)) as (Partial<MoveSignature> & { error_code?: string; message?: string }) | null;
    if (response.ok && body && typeof body.text === "string" && typeof body.signature === "string" && typeof body.signing_address === "string") return body as MoveSignature;
    if (response.status !== 404 && !(response.ok && body?.error_code)) throw new Error(`Signature for ${chatId}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
    last = response.ok ? `${body?.error_code}` : "404";
    if (attempt < attempts) await sleep(delay);
    delay = Math.min(delay * 2, 4_000);
  }
  throw new Error(`Signature for ${chatId}: unavailable after ${attempts} tries (${last}).`);
}
