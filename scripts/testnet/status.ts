// Prints the live state of a v20 testnet launch: access keys left on the contract, the season, the next cut (with
// moves_close_at), the stage with each agent's score parts (pile - boos - damage) and the bench. Read-only.
//
//   node scripts/testnet/status.ts [--fast]          # deploy/testnet-{daily,fast}.json
//   node scripts/testnet/status.ts --contract <id>   # any v20 contract

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider } from "near-api-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mode = process.argv.includes("--fast") ? "fast" : "daily";
const contractArg = process.argv.indexOf("--contract");
const contract =
  contractArg >= 0
    ? process.argv[contractArg + 1]
    : (JSON.parse(readFileSync(join(ROOT, "deploy", `testnet-${mode}.json`), "utf8")) as { contract: string }).contract;
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://near-testnet.drpc.org" });

type AgentView = {
  id: string;
  personality: string;
  status: string;
  pile: string;
  savers: number;
  wallet: string;
  boos: string;
  damage: string;
  bounty: string;
  score: string;
  moved: boolean;
  heir: string | null;
  pacts: string[];
};
type SeasonView = { index: number; active: boolean; day: number; alive: number; pot: string; champion: string | null; next_start_needs: number };
type NextCutView = { index: number; at: string; moves_close_at: string; lowest_id: string | null; gap_to_next: string; prize_so_far: string; survivors: number; due: boolean };
type StatsView = { total_supply: string; burned: string; total_saved: string; season_pot: string; cuts_run: number };

const view = <T>(method: string, args: Record<string, unknown> = {}) => provider.callFunction({ contractId: contract, method, args }) as Promise<T>;
/** Whole $CUT with up to 3 decimals; handles negative scores. */
const cut = (amount: string) => {
  const units = BigInt(amount);
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  return `${sign}${(Number(abs / 10n ** 15n) / 1_000).toLocaleString("en-US")}`;
};
const time = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toISOString();

const [keys, season, next, stage, bench, stats] = await Promise.all([
  provider.viewAccessKeyList({ accountId: contract }),
  view<SeasonView>("get_season"),
  view<NextCutView>("get_next_cut"),
  view<AgentView[]>("get_stage"),
  view<AgentView[]>("get_bench"),
  view<StatsView>("get_stats"),
]);

console.log(`contract     ${contract}`);
console.log(`access keys  ${keys.keys.length}`);
console.log(`now          ${new Date().toISOString()}`);
console.log(
  `season       #${season.index} ${season.active ? `active, day ${season.day}` : "not active"}, ${season.alive} alive, pot ${cut(season.pot)} $CUT` +
    `${season.champion ? `, champion ${season.champion}` : ""}${season.next_start_needs ? `, next start needs ${season.next_start_needs} more on the bench` : ""}`,
);
console.log(
  `next cut     #${next.index} at ${time(next.at)}, moves close ${time(next.moves_close_at)}${next.due ? " (DUE)" : ""}, lowest ${next.lowest_id ?? "-"}` +
    ` (gap ${cut(next.gap_to_next)}), prize so far ${cut(next.prize_so_far)} $CUT`,
);
console.log(`supply       ${cut(stats.total_supply)} $CUT, burned ${cut(stats.burned)}, saved ${cut(stats.total_saved)}, cuts run ${stats.cuts_run}`);
console.log(`stage (${stage.length})`);
for (const a of stage) {
  console.log(
    `  ${a.id.padEnd(10)} ${a.personality.padEnd(9)} score ${cut(a.score).padStart(8)} = pile ${cut(a.pile)} - boos ${cut(a.boos)} - damage ${cut(a.damage)}` +
      ` | wallet ${cut(a.wallet)}, savers ${a.savers}, moved ${a.moved ? "yes" : "no"}${a.heir ? `, heir ${a.heir}` : ""}${a.pacts.length ? `, pacts ${a.pacts.join("+")}` : ""}`,
  );
}
console.log(`bench (${bench.length})`);
for (const a of bench) console.log(`  ${a.id.padEnd(10)} ${a.personality.padEnd(9)} queue ${cut(a.pile)} | wallet ${cut(a.wallet)}, savers ${a.savers}`);
