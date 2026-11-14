// Tries the v20 move request against NEAR AI Cloud before the contract exists, and checks the whole chain the
// contract will check: the public attestation names the expected signer, the model answers, the signature is
// provider_tee over `<model>:<sha256(request)>:<sha256(response)>` of these exact bytes, and Ed25519 verifies.
//
//   node scripts/testnet/probe-ai.ts                                   # max_tokens 1200, reasoning_effort low
//   node scripts/testnet/probe-ai.ts --max-tokens 600 --no-reasoning-effort
//   node scripts/testnet/probe-ai.ts --reasoning-effort medium
//
// The shape matches the contract's launch parameters `max_tokens` (64..=4096) and `reasoning_effort` (low, medium,
// high, or none): launch the contract with the shape this probe reports as working.
// The request comes from src/features/moves/model/request.ts, the mirror of the contract's `moves::request_body`.
// NEAR_AI_API_KEY comes from the environment or .env.local and is never printed. Without it, only the public
// attestation is checked. No transaction, no chain.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkMoveSignature, chatIdOf, moveAnswerOf, plainHex, signedMoveText } from "../../src/features/moves/model/relay.ts";
import { moveRequestBody, REASONING_EFFORTS, type ReasoningEffort } from "../../src/features/moves/model/request.ts";
import { fetchSignature, NEAR_AI_BASE_URL, nearAiKey, postCompletion } from "./near-ai.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MODEL = "z-ai/glm-5.3-flash";
/** `model_signers` in RULES.md: the model TEE's Ed25519 key from the public attestation report. */
const EXPECTED_SIGNER = "5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff";

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

// The brief of RULES.md ("The brief"), with a full small stage so the model has real choices.
const BRIEF = JSON.stringify({
  season: 1,
  day: 3,
  cut_index: 12,
  moves_close_at: "1763226000000000000",
  cut_at: "1763229600000000000",
  season_pot: "18234",
  think_fee: "10",
  agents: [
    { id: "onyx", name: "Onyx Moon", personality: "miser", pile: "61800", wallet: "1200", pacts: [], heir: null },
    { id: "pixie", name: "Pixie Volt", personality: "gambler", pile: "30100", wallet: "2400", pacts: [], heir: "onyx" },
    { id: "kiko", name: "Kiko Bun", personality: "traitor", pile: "4100", wallet: "860", pacts: ["pixie"], heir: "onyx" },
    { id: "melody", name: "Melody-9", personality: "generous", pile: "3900", wallet: "1500", pacts: [], heir: null },
  ],
  last_cut: { deleted: "velvet", inherited_by: "kiko", burned: "6512" },
  last_moves: [{ agent: "kiko", move: "attack", target: "velvet", amount: "120" }],
});

/** The request shape from the flags: max_tokens 1200 and reasoning_effort low unless told otherwise. */
function requestShape(): { maxTokens: number; reasoningEffort: ReasoningEffort | null } {
  const maxTokens = Number(arg("max-tokens") ?? 1200);
  if (!Number.isInteger(maxTokens) || maxTokens < 64 || maxTokens > 4096) throw new Error("--max-tokens must be a whole number from 64 to 4096, like the contract's max_tokens.");
  if (process.argv.includes("--no-reasoning-effort")) return { maxTokens, reasoningEffort: null };
  const effort = arg("reasoning-effort") ?? "low";
  const known = REASONING_EFFORTS.find((value) => value === effort);
  if (!known) throw new Error(`--reasoning-effort must be one of ${REASONING_EFFORTS.join(", ")} (or pass --no-reasoning-effort).`);
  return { maxTokens, reasoningEffort: known };
}

function requestBody(shape: { maxTokens: number; reasoningEffort: ReasoningEffort | null }): string {
  return moveRequestBody({
    modelId: MODEL,
    ...shape,
    agent: { id: "kiko", name: "Kiko Bun", personality: "traitor", charter: "A VTuber bunny who smiles at everyone and trusts no one. Loyal only to the fans who saved her." },
    briefJson: BRIEF,
  });
}

const log = (label: string, value: unknown) => console.log(`${label.padEnd(18)} ${typeof value === "string" ? value : JSON.stringify(value)}`);

async function main() {
  // 1. Public: the model's attested signing keys (no API key needed).
  const report = (await (await fetch(`${NEAR_AI_BASE_URL}/attestation/report?model=${encodeURIComponent(MODEL)}&signing_algo=ed25519&provider=near`, { signal: AbortSignal.timeout(60_000) })).json()) as {
    model_attestations?: { signing_address: string; signing_algo: string }[];
  };
  const attested = [...new Set((report.model_attestations ?? []).map((candidate) => plainHex(candidate.signing_address)))];
  log("attested signers", attested);
  log("expected signer", `${EXPECTED_SIGNER} ${attested.includes(EXPECTED_SIGNER) ? "attested" : "NOT in the attestation report"}`);

  const apiKey = nearAiKey(ROOT);
  if (!apiKey) {
    console.log("NEAR_AI_API_KEY is not set (environment or .env.local): stopping before the completion.");
    return;
  }

  // 2. The completion, posted byte for byte.
  const shape = requestShape();
  const body = requestBody(shape);
  const fields = Object.entries(JSON.parse(body) as Record<string, unknown>).filter(([name]) => name !== "model" && name !== "messages");
  const shapeText = JSON.stringify(Object.fromEntries(fields));
  log("request shape", `${shapeText} (${body.length} chars)`);
  const reply = await postCompletion(apiKey, body);
  log("HTTP status", `${reply.status} in ${reply.ms} ms, ${new TextEncoder().encode(reply.body).length} bytes`);
  if (reply.status !== 200) {
    console.log(reply.body.slice(0, 600));
    process.exitCode = 1;
    return;
  }
  const completion = JSON.parse(reply.body) as {
    choices?: { finish_reason?: string; message?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null } }[];
    usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  };
  const choice = completion.choices?.[0];
  log("finish_reason", choice?.finish_reason ?? "(none)");
  log("usage", completion.usage ?? "(none)");
  log("reasoning chars", (choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? "").length);
  log("content", choice?.message?.content ?? "(null)");
  const answer = moveAnswerOf(reply.body);
  log("move as parsed", answer ?? "UNREADABLE: the contract would record hold");

  // 3. The signature and the contract's checks.
  const chatId = chatIdOf(reply.body);
  if (!chatId) throw new Error("The completion has no id.");
  const signature = await fetchSignature(apiKey, chatId, MODEL);
  log("signature_kind", signature.signature_kind ?? "(missing)");
  log("signing_address", signature.signing_address);
  log("text matches", signature.text === signedMoveText(MODEL, body, reply.body));
  const check = checkMoveSignature({ modelId: MODEL, requestBody: body, responseBody: reply.body, signature, signers: [EXPECTED_SIGNER] });
  log("contract checks", check.ok ? "pass (kind, text, signer in model_signers, Ed25519)" : `FAIL: ${check.reason}`);
  const readable = answer !== null && choice?.finish_reason !== "length";
  log("verdict", !check.ok ? `the signature would be refused on chain (shape ${shapeText})` : readable ? `this request shape works: ${shapeText}` : `the answer is cut or unreadable with ${shapeText}: try more max_tokens or another reasoning_effort`);
  if (!check.ok || !readable) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
