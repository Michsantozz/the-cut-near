// Prints the live state of the testnet launch from deploy/testnet-{daily,fast}.json: keys left on the contract, the next cut,
// the stage and the bench. Read-only.
//
//   node scripts/testnet/status.ts [--fast]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider } from "near-api-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mode = process.argv.includes("--fast") ? "fast" : "daily";
const { contract } = JSON.parse(readFileSync(join(ROOT, "deploy", `testnet-${mode}.json`), "utf8")) as { contract: string };
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://near-testnet.drpc.org" });

type AgentView = { id: string; pile: string; savers: number };
const view = <T>(method: string, args: Record<string, unknown> = {}) => provider.callFunction({ contractId: contract, method, args }) as Promise<T>;
const cut = (amount: string) => (Number(BigInt(amount) / 10n ** 15n) / 1_000).toLocaleString("en-US");
const time = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString();

const keys = await provider.viewAccessKeyList({ accountId: contract });
const next = await view<{ index: number; at: string; lowest_id: string | null; prize_so_far: string }>("get_next_cut");
const stage = await view<AgentView[]>("get_stage");
const bench = await view<AgentView[]>("get_bench");

console.log(`contract     ${contract}`);
console.log(`access keys  ${keys.keys.length}`);
console.log(`next cut     #${next.index} at ${time(next.at)} (now ${new Date().toISOString()}), lowest ${next.lowest_id ?? "-"}, prize so far ${cut(next.prize_so_far)} $CUT`);
console.log(`stage (${stage.length})  ${stage.map((r) => `${r.id} ${cut(r.pile)}`).join(" · ") || "-"}`);
console.log(`bench (${bench.length})  ${bench.map((r) => `${r.id} ${cut(r.pile)}`).join(" · ") || "-"}`);
