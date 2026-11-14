// Drives a v20 contract on testnet with no app and no cron: runs the cut when it is due and relays every agent's
// move while moves are open, printing one line per event. Made for the fast contract (a cut every 3 minutes)
// during the demo video.
//
//   node scripts/testnet/autopilot.ts --fast                                    # deploy/testnet-fast.json
//   node scripts/testnet/autopilot.ts --contract <id> [--keeper <account>]      # any v20 contract
//   node scripts/testnet/autopilot.ts --fast --add-key                          # first run: create the keeper's key
//
// The keeper signs with a function-call key limited to `run_cut` and `submit_move` on the contract, never a
// full-access key: KEEPER_PRIVATE_KEY, or ~/.near-credentials/testnet/<keeper>.keeper.json. `--add-key` creates
// that file once with the keeper's full-access key from the keychain (launch.ts puts it there).
// The relay is the app's (src/features/moves/model/relay.ts): same checks, same idempotence. NEAR_AI_API_KEY comes
// from the environment or .env.local and is never printed. Testnet only. Stop with Ctrl+C.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, nearToYocto, teraToGas, type KeyPairString } from "near-api-js";
import { MOVE_SIGNING_ALGO, relayMoves, type AgentRelayResult, type RelayPorts, type SubmitOutcome } from "../../src/features/moves/model/relay.ts";
import { complete, fetchSignature, nearAiKey } from "./near-ai.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEYCHAIN = join(homedir(), ".near-credentials", "testnet");
const RPC_URL = process.env.NEAR_RPC_URL ?? "https://near-testnet.drpc.org";
const KEY_METHODS = ["run_cut", "submit_move"];
const TICK_MS = Number(process.env.AUTOPILOT_TICK_MS ?? 5_000);
/** Relay passes per cut: later passes retry agents NEAR AI missed. */
const PASSES_PER_CUT = 3;

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

function deployment(): { contract: string; keeper: string } {
  const contract = arg("contract");
  if (contract) return { contract, keeper: arg("keeper") ?? `${contract.replace(/\.testnet$/, "")}-keeper.testnet` };
  const mode = process.argv.includes("--fast") ? "fast" : "daily";
  const state = JSON.parse(readFileSync(join(ROOT, "deploy", `testnet-${mode}.json`), "utf8")) as { contract: string; keeper: string };
  return { contract: state.contract, keeper: arg("keeper") ?? state.keeper };
}

const { contract: CONTRACT, keeper: KEEPER } = deployment();
const KEY_FILE = join(KEYCHAIN, `${KEEPER}.keeper.json`);
const provider = new JsonRpcProvider({ url: RPC_URL });

const log = (message: string) => console.log(`[autopilot] ${new Date().toISOString().slice(11, 19)} ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const view = <T>(method: string, args: Record<string, unknown> = {}) => provider.callFunction({ contractId: CONTRACT, method, args }) as Promise<T>;
const nsToDate = (ns: string | number) => new Date(Number(BigInt(ns) / 1_000_000n));
const short = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** The function-call key: from the environment, the keychain, or (with --add-key) created from the full-access key. */
async function keeperKey(): Promise<KeyPairString> {
  if (process.env.KEEPER_PRIVATE_KEY && process.env.KEEPER_ACCOUNT_ID === KEEPER) return process.env.KEEPER_PRIVATE_KEY as KeyPairString;
  if (existsSync(KEY_FILE)) return (JSON.parse(readFileSync(KEY_FILE, "utf8")) as { private_key: KeyPairString }).private_key;
  if (!process.argv.includes("--add-key")) throw new Error(`No key for ${KEEPER}: set KEEPER_PRIVATE_KEY, or run once with --add-key to create ${KEY_FILE}.`);
  const full = (JSON.parse(readFileSync(join(KEYCHAIN, `${KEEPER}.json`), "utf8")) as { private_key: KeyPairString }).private_key;
  const keyPair = KeyPair.fromRandom("ed25519");
  const owner = new Account(KEEPER, provider, KeyPairSigner.fromSecretKey(full));
  await owner.addFunctionCallAccessKey({ publicKey: keyPair.getPublicKey(), contractId: CONTRACT, methodNames: KEY_METHODS, allowance: nearToYocto("2") });
  writeFileSync(KEY_FILE, JSON.stringify({ account_id: KEEPER, public_key: keyPair.getPublicKey().toString(), private_key: keyPair.toString() }), { mode: 0o600 });
  log(`added key ${keyPair.getPublicKey().toString()} to ${KEEPER} (${KEY_METHODS.join(", ")} on ${CONTRACT})`);
  return keyPair.toString();
}

/** Refuses anything but a function-call key for both methods on this contract, like the app's signer. */
async function checkKey(key: KeyPairString) {
  const publicKey = KeyPair.fromString(key).getPublicKey().toString();
  const { permission } = await provider.viewAccessKey({ accountId: KEEPER, publicKey });
  if (permission === "FullAccess" || !("FunctionCall" in permission)) throw new Error(`Refusing ${publicKey}: it is not a function-call key. Use --add-key.`);
  const { receiver_id, method_names } = permission.FunctionCall;
  const missing = KEY_METHODS.filter((method) => !method_names.includes(method));
  if (receiver_id !== CONTRACT || missing.length > 0) throw new Error(`${publicKey} may call ${method_names.join(", ") || "any method"} on ${receiver_id}; it needs ${KEY_METHODS.join(", ")} on ${CONTRACT}.`);
}

function outcomeOf(response: Awaited<ReturnType<Account["signAndSendTransaction"]>>): SubmitOutcome {
  const txHash = response.transaction_outcome.id;
  const { status } = response;
  if (typeof status === "object" && "SuccessValue" in status) return { status: "success", txHash };
  if (typeof status === "object" && "Failure" in status) return { status: "failure", txHash, detail: JSON.stringify(status.Failure).slice(0, 300) };
  return { status: "pending", txHash };
}

type NextCut = { index: number; at: string; moves_close_at: string };

function ports(keeper: Account, apiKey: string): RelayPorts {
  return {
    async window() {
      const [params, next, block] = await Promise.all([view<{ model_id: string; model_signers: string[] }>("get_params"), view<NextCut>("get_next_cut"), provider.viewBlock({ finality: "final" })]);
      return { cutIndex: next.index, closesAt: nsToDate(next.moves_close_at), chainNow: nsToDate(block.header.timestamp_nanosec), modelId: params.model_id, signers: params.model_signers };
    },
    waitingAgents: async () => (await view<{ id: string; moved: boolean }[]>("get_stage")).filter((agent) => !agent.moved).map((agent) => agent.id),
    moveRequest: (agentId) => view<string | null>("get_move_request", { agent_id: agentId }),
    complete: (requestBody) => complete(apiKey, requestBody),
    signature: (chatId, modelId) => fetchSignature(apiKey, chatId, modelId),
    submit: async (args) => outcomeOf(await keeper.signAndSendTransaction({ receiverId: CONTRACT, actions: [actions.functionCall("submit_move", args, teraToGas("300"), 0n)], throwOnFailure: false })),
    hasMoved: async (agentId) => (await view<{ moved: boolean } | null>("get_agent", { id: agentId }))?.moved ?? false,
  };
}

function describe(result: AgentRelayResult): string {
  const tx = result.txHash ? ` (tx ${result.txHash})` : "";
  if (result.status === "moved" || result.status === "already_moved") {
    const a = result.answer;
    const move = a ? `${a.move}${a.target ? ` ${a.target}` : ""}${a.move === "hold" ? "" : ` ${a.amount}`} "${short(a.reason)}"` : "(unreadable answer: holds)";
    return `move ${result.agentId}: ${move}${result.status === "already_moved" ? " [already in]" : ""}${tx}`;
  }
  return `move ${result.agentId}: ${result.status}${result.detail ? ` (${short(result.detail, 160)})` : ""}${tx}`;
}

async function main() {
  if (!CONTRACT.endsWith(".testnet") || !RPC_URL.includes("testnet")) throw new Error("The autopilot only runs on testnet.");
  const apiKey = nearAiKey(ROOT);
  const key = await keeperKey();
  await checkKey(key);
  const keeper = new Account(KEEPER, provider, KeyPairSigner.fromSecretKey(key));
  log(`driving ${CONTRACT} as ${KEEPER} (${MOVE_SIGNING_ALGO} moves${apiKey ? "" : "; NEAR_AI_API_KEY not set, so agents hold"})`);
  const shape = await view<{ model_id: string; max_tokens?: number; reasoning_effort?: string | null }>("get_params");
  log(`requests: ${shape.model_id}, max_tokens ${shape.max_tokens ?? "?"}, reasoning_effort ${shape.reasoning_effort ?? "none"}`);

  const passes = new Map<number, number>();
  const announced = new Set<string>();
  const once = (key: string, message: string) => {
    if (!announced.has(key)) log(message);
    announced.add(key);
  };

  for (;;) {
    try {
      const [next, block] = await Promise.all([view<NextCut>("get_next_cut"), provider.viewBlock({ finality: "final" })]);
      const chainNow = nsToDate(block.header.timestamp_nanosec);
      const cutAt = nsToDate(next.at);
      if (chainNow >= cutAt) {
        const outcome = outcomeOf(await keeper.signAndSendTransaction({ receiverId: CONTRACT, actions: [actions.functionCall("run_cut", {}, teraToGas("300"), 0n)], throwOnFailure: false }));
        const after = await view<NextCut>("get_next_cut");
        if (after.index > next.index) {
          const record = await view<{ deleted_id?: string | null } | null>("get_cut", { index: next.index }).catch(() => null);
          log(`cut #${next.index} ran${record?.deleted_id ? `: ${record.deleted_id} deleted` : ""} (tx ${outcome.txHash}${outcome.status === "success" ? "" : ", by someone else"}); next cut #${after.index} at ${nsToDate(after.at).toISOString().slice(11, 19)}`);
        } else {
          log(`cut #${next.index} did not go through: ${outcome.detail ?? outcome.status} (tx ${outcome.txHash})`);
        }
        continue;
      }
      const closesAt = nsToDate(next.moves_close_at);
      const runs = passes.get(next.index) ?? 0;
      if (apiKey && chainNow < closesAt && runs < PASSES_PER_CUT) {
        once(`open-${next.index}`, `moves open for cut #${next.index} until ${closesAt.toISOString().slice(11, 19)}`);
        const report = await relayMoves(ports(keeper, apiKey));
        if (report.agents.length > 0) passes.set(next.index, runs + 1);
        for (const result of report.agents) if (result.status !== "no_request") log(describe(result));
      } else if (chainNow >= closesAt) {
        once(`closed-${next.index}`, `moves closed for cut #${next.index}; cut at ${cutAt.toISOString().slice(11, 19)}`);
      }
    } catch (error) {
      log(`error: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(TICK_MS);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
