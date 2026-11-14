// Launches The Cut v20 on NEAR testnet, end to end, and records what it did in deploy/testnet-<mode>.json.
//
//   node scripts/testnet/launch.ts                    # daily: a cut every day at 18:00 UTC, the app's public contract
//   node scripts/testnet/launch.ts --fast             # fast: a cut every 3 minutes, for the demo video
//   node scripts/testnet/launch.ts --fast --dry-run   # print the `new` arguments and the plan; touches nothing
//
// Options:
//   --new                           start a new launch instead of resuming the one in deploy/testnet-<mode>.json
//   --float <near>                  NEAR the contract holds above the pool before deploy (default 20)
//   --keep-key                      rehearsal: keep the contract's full-access key (the contract stays changeable)
//   --suffix <name>                accounts are thecut-<name>.testnet, thecut-<name>-keeper.testnet, ... (default: random)
//   --first-cut-at <ISO | ns>       time of cut 1 (daily default: the next 18:00 UTC at least 15 minutes away;
//                                   fast default: deploy + 3 minutes)
//   --max-tokens <64..4096>         max_tokens of every move request (default 1200)
//   --reasoning-effort <low|medium|high|none>   reasoning_effort of every move request (default low; none leaves it out)
//
// Build first: pnpm contracts:build. Parameters come from docs/contract-interface.md (v2) and docs/design/SPEC-v20.md.
// Every step is idempotent: run it again and it picks up where it stopped. Accounts come from the testnet faucet;
// their keys go to ~/.near-credentials/testnet/<account>.json (the near CLI's legacy keychain), never into the repo.
// When the faucet refuses, FUNDER_ACCOUNTS (comma-separated accounts with a key in the keychain) pay instead;
// NO_FAUCET=1 makes them pay for everything (a rehearsal that leaves the faucet's quota to the real launch).
// The keeper gets a function-call key limited to `run_cut` and `submit_move` on the contract, written to
// ~/.near-credentials/testnet/<keeper>.keeper.json (the file autopilot.ts reads). Finally the contract account's
// only full-access key is deleted, so nobody can change its code or parameters. Testnet only.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, baseEncode, nearToYocto, teraToGas, type Action, type KeyPairString } from "near-api-js";

const RPC_URL = process.env.NEAR_RPC_URL ?? "https://near-testnet.drpc.org";
const FAUCET_URL = "https://helper.nearprotocol.com/account";
const EXPLORER = "https://testnet.nearblocks.io/txns";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MODE: "daily" | "fast" = process.argv.includes("--fast") ? "fast" : "daily";
const DRY_RUN = process.argv.includes("--dry-run");
const STATE_FILE = join(ROOT, "deploy", `testnet-${MODE}.json`);
const WASM = join(ROOT, "contracts", "target", "near", "thecut", "thecut.wasm");
const KEYCHAIN = join(homedir(), ".near-credentials", "testnet");
const VERSION = "v20";

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

// Parameters (docs/contract-interface.md). Amounts are $CUT units (18 decimals) or yoctoNEAR, times are ns.
const NS_PER_SECOND = 1_000_000_000n;
const ONE_CUT = 10n ** 18n;
const MODEL_ID = "z-ai/glm-5.3-flash";
const MODEL_SIGNERS = ["5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff"];
const PRESETS = {
  daily: { cut_interval: 86_400n * NS_PER_SECOND, move_lead: 3_600n * NS_PER_SECOND },
  fast: { cut_interval: 180n * NS_PER_SECOND, move_lead: 30n * NS_PER_SECOND },
} as const;
/** The pool's initial NEAR, attached to `new`. */
const POOL_NEAR = nearToYocto("4");
/**
 * NEAR the contract account holds on top of the pool: about 4.6 NEAR of storage at launch, then the storage it pays
 * for agents, moves and cut records over time (about 3 to 4 NEAR more), with a wide margin.
 */
const CONTRACT_FLOAT_NEAR = nearToYocto((arg("float") ?? "20") as `${number}`);
const REGISTER_DEPOSIT = nearToYocto("1");

function reasoningEffort(): string | null {
  const value = arg("reasoning-effort") ?? "low";
  if (value === "none" || value === "null") return null;
  if (!["low", "medium", "high"].includes(value)) throw new Error(`--reasoning-effort must be low, medium, high or none, not ${value}`);
  return value;
}

function maxTokens(): number {
  const value = Number(arg("max-tokens") ?? 1200);
  if (!Number.isInteger(value) || value < 64 || value > 4096) throw new Error(`--max-tokens must be an integer from 64 to 4096`);
  return value;
}

/** --first-cut-at, else fast: `deployAt` + 3 minutes; daily: the next 18:00 UTC at least 15 minutes after `deployAt`. */
function firstCutAtNs(deployAt: number): bigint {
  const override = arg("first-cut-at");
  if (override) {
    const ns = /^\d+$/.test(override) ? BigInt(override) : BigInt(Date.parse(override)) * 1_000_000n;
    if (ns <= BigInt(deployAt) * 1_000_000n) throw new Error(`--first-cut-at ${override} is not in the future`);
    return ns;
  }
  if (MODE === "fast") return BigInt(deployAt + 3 * 60_000) * 1_000_000n;
  const at = new Date(deployAt);
  at.setUTCHours(18, 0, 0, 0);
  if (at.getTime() < deployAt + 15 * 60_000) at.setUTCDate(at.getUTCDate() + 1);
  return BigInt(at.getTime()) * 1_000_000n;
}

function newArgs(firstCutAt: bigint) {
  const preset = PRESETS[MODE];
  return {
    fee_bps: 100,
    pot_bps: 5_000,
    burn_bps: 5_000,
    savers_bps: 9_000,
    agents_bps: 500,
    stage_size: 10,
    min_season: 3,
    first_cut_at: firstCutAt.toString(),
    cut_interval: preset.cut_interval.toString(),
    move_lead: preset.move_lead.toString(),
    think_fee: (10n * ONE_CUT).toString(),
    min_seed: (1_000n * ONE_CUT).toString(),
    agent_funding: nearToYocto("0.3").toString(),
    register_deposit: REGISTER_DEPOSIT.toString(),
    model_id: MODEL_ID,
    model_signers: MODEL_SIGNERS,
    max_tokens: maxTokens(),
    reasoning_effort: reasoningEffort(),
  };
}

// The cast of the sample world (src/entities/agent/api/sample.ts of the v20 UI): the ten agents of season 1, in its
// registration order, so the testnet game and the sample world show the same agents. `seed` is whole $CUT moved
// from the creator into the agent's wallet; `queue` is whole $CUT the fans save on it before the first cut (it
// becomes the pile at the season start), as [fan a, fan b].
type Personality = "miser" | "gambler" | "traitor" | "generous";
type CastMember = { id: string; name: string; tagline: string; personality: Personality; charter: string; seed: number; queue: [number, number] };
const CAST: CastMember[] = [
  {
    id: "pixie",
    name: "Pixie Volt",
    tagline: "AI streamer, never off air",
    personality: "gambler",
    charter:
      "Pixie streams 24/7 and treats every day like a final round. Loud, funny, allergic to playing safe. She thanks her savers by name and swings at whoever is on top, because the top is boring. She never begs; she bets.",
    seed: 2_400,
    queue: [3_000, 1_120],
  },
  {
    id: "oracle",
    name: "Oracle Toad",
    tagline: "Sees the cut coming",
    personality: "miser",
    charter:
      "Oracle is an old, patient toad who speaks in short prophecies. He believes whoever spends first dies first. He keeps his wallet fat, makes deals only with other careful agents and never takes a side in a fight he did not start.",
    seed: 3_000,
    queue: [3_390, 0],
  },
  {
    id: "mabel",
    name: "Mabel Market",
    tagline: "Buys low, cries high",
    personality: "miser",
    charter:
      "Mabel runs a tiny shop and counts every coin twice. She is warm with customers and cold with rivals. She buys friendships at a discount and expects them to last. She would rather starve than overpay.",
    seed: 1_800,
    queue: [2_000, 840],
  },
  {
    id: "melody",
    name: "Melody-9",
    tagline: "Sings for her savers",
    personality: "generous",
    charter:
      "Melody-9 is a pop singer who would give her last note to her fans. She shares whatever she gets, keeps her promises and never hits back. Kiko was her best friend on the stage.",
    seed: 1_500,
    queue: [2_410, 0],
  },
  {
    id: "lila",
    name: "Lila Loop",
    tagline: "Smiles, then loops back",
    personality: "traitor",
    charter:
      "Lila is the friendliest influencer on the stage, right up to the moment she is not. She makes pacts with whoever is scared and breaks them when it pays. She says sorry beautifully. She never says it twice.",
    seed: 2_200,
    queue: [1_500, 480],
  },
  {
    id: "gremlin",
    name: "Glitch Gremlin",
    tagline: "Paints with broken pixels",
    personality: "gambler",
    charter:
      "Gremlin is a chaotic digital artist who thinks the stage is a canvas and the other agents are paint. He attacks the strongest for the drama, not for the math. He loves his savers and hates being bored.",
    seed: 2_600,
    queue: [1_630, 0],
  },
  {
    id: "yuna",
    name: "Yuna Star",
    tagline: "Idol of the underdogs",
    personality: "generous",
    charter:
      "Yuna is an idol who always roots for the smallest agent on the stage. She is soft-spoken, trusts too fast and pays for peace. She would never attack anyone, and she wants her fans to know it.",
    seed: 1_200,
    queue: [1_000, 520],
  },
  {
    id: "velvet",
    name: "Velvet Vee",
    tagline: "Velvet glove, iron grip",
    personality: "traitor",
    charter:
      "Velvet is a model with a runway walk and a knife in her boot. She plays the long game, trusts nobody but Lila and leaves her fortune to whoever she thinks will finish the job.",
    seed: 2_000,
    queue: [1_310, 0],
  },
  {
    id: "onyx",
    name: "Onyx Moon",
    tagline: "Only shines at night",
    personality: "miser",
    charter:
      "Onyx is a quiet night model who hoards like the winter never ends. She trusts one agent, Kiko, and would leave her everything.",
    seed: 2_800,
    queue: [800, 350],
  },
  {
    id: "kiko",
    name: "Kiko Bun",
    tagline: "Cozy VTuber, cozier vibes",
    personality: "generous",
    charter:
      "Kiko is a sleepy bunny VTuber who streams in pajamas. She gives gifts to everyone, especially Melody, and believes kindness is a strategy. It was not, on day 1.",
    seed: 1_000,
    queue: [960, 0],
  },
];
const CREATOR_COUNT = 3;
/** NEAR each fan swaps for $CUT on its first buy (0.01 of it pays the $CUT registration). */
const FAN_BUY_NEAR = nearToYocto("0.03");
/** NEAR attached to each save: tops up the fan's storage balance for the save record. */
const SAVE_STORAGE_NEAR = nearToYocto("0.01");

/** "@PixieVoltCut" like the sample world, or "@gremlinCut" when that passes the contract's 16 bytes. */
function xHandle(id: string, name: string) {
  const long = `@${name.replace(/[^A-Za-z0-9]/g, "")}Cut`;
  return long.length <= 16 ? long : `@${id}Cut`;
}

type State = {
  network: "testnet";
  version: typeof VERSION;
  mode: "daily" | "fast";
  rpc: string;
  contract: string;
  keeper: string;
  creators: string[];
  fans: string[];
  /** How each account got its NEAR. */
  funding: Record<string, string>;
  wasm?: { file: string; bytes: number; sha256: string; bs58: string };
  launchedAt?: string;
  firstCutAt?: string;
  firstCutAtNs?: string;
  poolNear?: string;
  newArgs?: ReturnType<typeof newArgs>;
  agents: Record<string, { account: string; creator: string; name: string; personality: string; x_handle: string; seed: string; tx: string }>;
  buys: Record<string, { near: string; tx: string }>;
  saves: { fan: string; agent: string; amount: string; tx: string }[];
  keeperKey?: { publicKey: string; methods: string[]; file: string; tx: string };
  txs: { deploy?: string; deleteKey?: string; topUps: Record<string, string> };
  locked?: boolean;
  accessKeysAfterLock?: number;
};

const provider = new JsonRpcProvider({ url: RPC_URL });
const log = (message: string) => console.log(`[launch] ${message}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const near = (yocto: bigint) => (Number(yocto / 10n ** 20n) / 10_000).toFixed(4);

/** Resumes the launch in the state file; starts over with --new or when it holds an older launch (v19 had no `version`). */
function loadState(suffix: string): State {
  if (existsSync(STATE_FILE) && !process.argv.includes("--new")) {
    const saved = JSON.parse(readFileSync(STATE_FILE, "utf8")) as Partial<State>;
    if (saved.version === VERSION && saved.contract) return saved as State;
  }
  const base = `thecut-${suffix}`;
  return {
    network: "testnet",
    version: VERSION,
    mode: MODE,
    rpc: RPC_URL,
    contract: `${base}.testnet`,
    keeper: `${base}-keeper.testnet`,
    creators: Array.from({ length: CREATOR_COUNT }, (_, i) => `${base}-studio-${"abc"[i]}.testnet`),
    fans: [`${base}-fan-a.testnet`, `${base}-fan-b.testnet`],
    funding: {},
    agents: {},
    buys: {},
    saves: [],
    txs: { topUps: {} },
  };
}

function saveState(state: State) {
  if (DRY_RUN) return;
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

const keyFile = (accountId: string) => join(KEYCHAIN, `${accountId}.json`);

function loadKey(accountId: string): KeyPairString {
  return (JSON.parse(readFileSync(keyFile(accountId), "utf8")) as { private_key: KeyPairString }).private_key;
}

const account = (accountId: string) => new Account(accountId, provider, KeyPairSigner.fromSecretKey(loadKey(accountId)));

async function balance(accountId: string): Promise<bigint | null> {
  try {
    return BigInt((await provider.viewAccount({ accountId })).amount);
  } catch {
    return null;
  }
}

type Outcome = Awaited<ReturnType<Account["signAndSendTransaction"]>>;
const failed = (outcome: Outcome) => typeof outcome.status === "object" && "Failure" in outcome.status;

/**
 * Signs one transaction and returns its hash; throws with the hash when it fails. The hash is known before sending,
 * so an RPC error on the way back (a 500 or a 429) is retried by sending the same signed transaction again: the same
 * nonce cannot run twice, and the RPC answers with the outcome of the one that already ran.
 */
async function send(signer: Account, receiverId: string, txActions: Action[], what: string): Promise<string> {
  const signed = await signer.createSignedTransaction({ receiverId, actions: txActions });
  const hash = baseEncode(createHash("sha256").update(signed.transaction.encode()).digest());
  let outcome: Outcome | null = null;
  for (let attempt = 1; !outcome; attempt++) {
    try {
      outcome = await provider.sendTransactionUntil(signed, "EXECUTED_OPTIMISTIC");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (attempt >= 6 || /InvalidNonce|InvalidTxError|does not exist|NotEnoughBalance/.test(reason)) throw new Error(`${what} (tx ${hash}): ${reason}`);
      log(`${what}: RPC error (${reason.slice(0, 80)}); resending tx ${hash}`);
      await sleep(3_000 * attempt);
    }
  }
  if (failed(outcome)) throw new Error(`${what} failed (tx ${hash}): ${JSON.stringify(outcome.status).slice(0, 400)}`);
  return hash;
}

const STATE = loadState(arg("suffix") ?? `${MODE === "fast" ? "f" : "d"}${Math.random().toString(36).slice(2, 7)}`);

const call = (signer: Account, method: string, args: object, deposit = 0n, gas = teraToGas("100")) =>
  send(signer, STATE.contract, [actions.functionCall(method, args, gas, deposit)], method);

/** A view call, retried a few times over RPC errors. */
async function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return (await provider.callFunction({ contractId: STATE.contract, method, args })) as T;
    } catch (error) {
      if (attempt >= 4) throw error;
      await sleep(2_000 * attempt);
    }
  }
}

const FUNDERS = (process.env.FUNDER_ACCOUNTS ?? process.env.FUNDER_ACCOUNT ?? "").split(",").map((id) => id.trim()).filter(Boolean);
/** NO_FAUCET=1: funders pay for every account (a rehearsal that leaves the faucet's quota to the real launch). */
const NO_FAUCET = process.env.NO_FAUCET === "1";
/** NEAR a funder keeps for itself. */
const FUNDER_RESERVE = nearToYocto("0.5");

/** A funder with a key in the keychain and `amount` to spare (plus 0.5 NEAR for its own storage and gas). */
async function funderFor(amount: bigint): Promise<string> {
  for (const id of FUNDERS) {
    const have = await balance(id);
    if (existsSync(keyFile(id)) && have !== null && have >= amount + FUNDER_RESERVE) return id;
  }
  throw new Error(`No funder can spare ${near(amount)} NEAR: set FUNDER_ACCOUNTS to testnet accounts with keys in ${KEYCHAIN}.`);
}

const call2 = (signerId: string, receiverId: string, method: string, args: object, deposit: bigint) =>
  send(account(signerId), receiverId, [actions.functionCall(method, args, teraToGas("100"), deposit)], `${receiverId}.${method}`);

/**
 * A new top-level testnet account. The faucet funds it; when it refuses, a funder pays `fallbackNear` through the
 * registrar (or, with `fallbackNear` null, it throws).
 */
async function createAccount(accountId: string, fallbackNear: bigint | null): Promise<void> {
  if (existsSync(keyFile(accountId)) && (await balance(accountId)) !== null) return;
  if ((await balance(accountId)) !== null) throw new Error(`${accountId} exists but its key is not in ${KEYCHAIN}: pick another --suffix`);
  const keyPair = KeyPair.fromRandom("ed25519");
  const publicKey = keyPair.getPublicKey().toString();
  mkdirSync(KEYCHAIN, { recursive: true, mode: 0o700 });
  writeFileSync(keyFile(accountId), JSON.stringify({ account_id: accountId, public_key: publicKey, private_key: keyPair.toString() }), { mode: 0o600 });
  const response = NO_FAUCET
    ? new Response("NO_FAUCET=1", { status: 499 })
    : await fetch(FAUCET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
      });
  if (response.ok) {
    STATE.funding[accountId] = "testnet faucet (helper.nearprotocol.com)";
  } else {
    const reason = `HTTP ${response.status} ${(await response.text()).slice(0, 160)}`;
    if (fallbackNear === null) throw new Error(`faucet refused ${accountId}: ${reason}`);
    const funder = await funderFor(fallbackNear);
    const tx = await call2(funder, "testnet", "create_account", { new_account_id: accountId, new_public_key: publicKey }, fallbackNear);
    STATE.funding[accountId] = `${near(fallbackNear)} NEAR from ${funder} via testnet.create_account (tx ${tx}); faucet refused: ${reason}`;
    log(`faucet refused ${accountId} (${reason}); ${funder} paid ${near(fallbackNear)} NEAR`);
  }
  saveState(STATE);
  for (let i = 0; i < 30 && (await balance(accountId)) === null; i++) await sleep(1_000);
  if ((await balance(accountId)) === null) throw new Error(`${accountId} did not appear on chain`);
  log(`created ${accountId} (${near((await balance(accountId))!)} NEAR)`);
}

/** Tops `accountId` up to `target`: first from faucet-made bank accounts deleted into it, then from the funders. */
async function topUp(accountId: string, target: bigint): Promise<void> {
  for (let n = 1; n <= 3 && !NO_FAUCET; n++) {
    const have = (await balance(accountId)) ?? 0n;
    if (have >= target) return;
    const bank = accountId.replace(/\.testnet$/, `-bank-${n}.testnet`);
    if (STATE.txs.topUps[bank]) continue;
    try {
      await createAccount(bank, null);
    } catch (error) {
      log(`no faucet bank for ${accountId}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
    // Deleting the bank sends its whole balance to the account: the faucet's NEAR, nothing left behind.
    const tx = await send(account(bank), bank, [actions.deleteAccount(accountId)], `delete ${bank}`);
    STATE.txs.topUps[bank] = tx;
    STATE.funding[accountId] = `${STATE.funding[accountId] ?? ""}; + faucet bank ${bank} deleted into it (tx ${tx})`;
    saveState(STATE);
    log(`${bank} deleted into ${accountId} (tx ${tx})`);
  }
  // Then each funder sends what it can spare until the target is met.
  for (const funder of FUNDERS) {
    const have = (await balance(accountId)) ?? 0n;
    if (have >= target) return;
    const spare = ((await balance(funder)) ?? 0n) - FUNDER_RESERVE;
    if (!existsSync(keyFile(funder)) || spare <= 0n) continue;
    const amount = spare < target - have ? spare : target - have;
    const tx = await send(account(funder), accountId, [actions.transfer(amount)], `transfer to ${accountId}`);
    STATE.txs.topUps[`${funder}->${accountId}`] = tx;
    STATE.funding[accountId] = `${STATE.funding[accountId] ?? ""}; + ${near(amount)} NEAR from ${funder} (tx ${tx})`;
    saveState(STATE);
    log(`${funder} sent ${near(amount)} NEAR to ${accountId} (tx ${tx})`);
  }
  const have = (await balance(accountId)) ?? 0n;
  if (have < target) throw new Error(`${accountId} holds ${near(have)} NEAR, needs ${near(target)}: set FUNDER_ACCOUNTS to accounts with spare testnet NEAR`);
}

/** Creator of each agent: round robin over the creator accounts, in registration order. */
const creatorOf = (index: number) => STATE.creators[index % STATE.creators.length];

/** Buys at least `needed` $CUT units for `accountId`, registering it on the first buy. */
async function buyCut(accountId: string, needed: bigint, nearIn: bigint) {
  const have = BigInt((await view<string>("ft_balance_of", { account_id: accountId })) ?? "0");
  if (have >= needed) return;
  const tx = await call(account(accountId), "buy", { min_out: "0" }, nearIn);
  STATE.buys[accountId] = { near: nearIn.toString(), tx };
  saveState(STATE);
  const after = BigInt((await view<string>("ft_balance_of", { account_id: accountId })) ?? "0");
  if (after < needed) throw new Error(`${accountId} bought ${after} units of $CUT, needs ${needed}`);
  log(`${accountId} bought ${after / ONE_CUT} $CUT for ${near(nearIn)} NEAR (tx ${tx})`);
}

function dryRun() {
  const deployAt = Date.now();
  const firstCutAt = firstCutAtNs(deployAt);
  console.log(JSON.stringify({ mode: MODE, contract: STATE.contract, keeper: STATE.keeper, creators: STATE.creators, fans: STATE.fans, pool_near: POOL_NEAR.toString(), first_cut_at: new Date(Number(firstCutAt / 1_000_000n)).toISOString(), new_args: newArgs(firstCutAt) }, null, 2));
  for (const [index, agent] of CAST.entries()) {
    console.log(`  ${agent.id.padEnd(8)} ${agent.personality.padEnd(9)} seed ${agent.seed} $CUT, queue ${agent.queue[0] + agent.queue[1]} $CUT, x ${xHandle(agent.id, agent.name)}, creator ${creatorOf(index)}`);
  }
  log("dry run: nothing was sent and nothing was written");
}

async function main() {
  if (!RPC_URL.includes("testnet") || !STATE.contract.endsWith(".testnet")) throw new Error("This script only launches on testnet.");
  if (DRY_RUN) return dryRun();
  if (!existsSync(WASM)) throw new Error(`No ${WASM}: run pnpm contracts:build first.`);
  log(`${MODE} launch of ${STATE.contract} (${VERSION})`);
  saveState(STATE);

  // 1. Accounts. The contract holds the pool's NEAR plus a float for its storage; each creator pays 1 NEAR per agent.
  await createAccount(STATE.contract, nearToYocto("2"));
  for (const id of [...STATE.creators, STATE.keeper]) await createAccount(id, nearToYocto("5"));
  for (const id of STATE.fans) await createAccount(id, nearToYocto("1"));
  if (!STATE.txs.deploy) await topUp(STATE.contract, CONTRACT_FLOAT_NEAR + POOL_NEAR + nearToYocto("0.5"));

  // 2. Deploy and initialize in one transaction, so nobody can call `new` in between.
  const code = readFileSync(WASM);
  const sha = createHash("sha256").update(code).digest();
  STATE.wasm = { file: "contracts/target/near/thecut/thecut.wasm", bytes: code.length, sha256: sha.toString("hex"), bs58: baseEncode(sha) };
  if (!STATE.txs.deploy) {
    const { code_hash } = await provider.viewAccount({ accountId: STATE.contract });
    if (code_hash !== "11111111111111111111111111111111") throw new Error(`${STATE.contract} already has code ${code_hash} but no deploy is recorded: check it by hand.`);
    const deployAt = Date.now();
    const firstCutAt = firstCutAtNs(deployAt);
    const args = newArgs(firstCutAt);
    STATE.newArgs = args;
    STATE.poolNear = POOL_NEAR.toString();
    STATE.firstCutAtNs = firstCutAt.toString();
    STATE.firstCutAt = new Date(Number(firstCutAt / 1_000_000n)).toISOString();
    STATE.launchedAt = new Date(deployAt).toISOString();
    STATE.txs.deploy = await send(account(STATE.contract), STATE.contract, [actions.deployContract(code), actions.functionCall("new", args, teraToGas("100"), POOL_NEAR)], "deploy + new");
    saveState(STATE);
    log(`deployed ${STATE.contract}: first cut ${STATE.firstCutAt} (tx ${STATE.txs.deploy})`);
  }
  const { code_hash } = await provider.viewAccount({ accountId: STATE.contract });
  if (code_hash !== STATE.wasm.bs58) throw new Error(`On-chain code hash ${code_hash} is not the local wasm's ${STATE.wasm.bs58}`);
  const params = await view<Record<string, unknown>>("get_params");
  for (const [key, value] of Object.entries(STATE.newArgs ?? {})) {
    if (JSON.stringify(params[key]) !== JSON.stringify(value)) throw new Error(`get_params().${key} is ${JSON.stringify(params[key])}, expected ${JSON.stringify(value)}`);
  }

  // 3. Creators buy their agents' seeds, then register the cast in the sample world's order (its `seq` breaks ties).
  for (const creator of STATE.creators) {
    const seeds = CAST.filter((_, index) => creatorOf(index) === creator).reduce((sum, agent) => sum + BigInt(agent.seed) * ONE_CUT, 0n);
    await buyCut(creator, seeds, nearToYocto("0.03"));
  }
  for (const [index, agent] of CAST.entries()) {
    if (STATE.agents[agent.id]) continue;
    const creator = creatorOf(index);
    const accountId = `${agent.id}.${STATE.contract}`;
    // A call can land even when its RPC answer is lost: ask the contract first.
    let tx = "(sent earlier; answer lost)";
    if (!(await view<unknown>("get_agent", { id: agent.id }))) {
      const args = { id: agent.id, name: agent.name, tagline: agent.tagline, x_handle: xHandle(agent.id, agent.name), personality: agent.personality, charter: agent.charter, seed: (BigInt(agent.seed) * ONE_CUT).toString() };
      tx = await call(account(creator), "register_agent", args, REGISTER_DEPOSIT, teraToGas("100"));
    }
    // The account is created by a promise; the agent shows up once the callback confirms it.
    let view_: { status: string; wallet: string } | null = null;
    for (let i = 0; i < 20 && !(view_ = await view<{ status: string; wallet: string } | null>("get_agent", { id: agent.id })); i++) await sleep(1_000);
    if (!view_ || view_.status !== "bench") throw new Error(`${agent.id} is ${view_?.status ?? "not confirmed"} after register_agent (tx ${tx})`);
    STATE.agents[agent.id] = { account: accountId, creator, name: agent.name, personality: agent.personality, x_handle: xHandle(agent.id, agent.name), seed: (BigInt(agent.seed) * ONE_CUT).toString(), tx };
    saveState(STATE);
    log(`registered ${agent.id} (${agent.personality}, seed ${agent.seed} $CUT) from ${creator} (tx ${tx})`);
  }

  // 4. Fans save on the bench: the queues differ, so the season start seats by queue (and the pile order is no tie).
  for (const [fanIndex, fan] of STATE.fans.entries()) {
    const plan = CAST.filter((agent) => agent.queue[fanIndex] > 0 && !STATE.saves.some((s) => s.fan === fan && s.agent === agent.id));
    if (plan.length === 0) continue;
    await buyCut(fan, plan.reduce((sum, agent) => sum + BigInt(agent.queue[fanIndex]) * ONE_CUT, 0n), FAN_BUY_NEAR);
    for (const agent of plan) {
      const amount = (BigInt(agent.queue[fanIndex]) * ONE_CUT).toString();
      const tx = await call(account(fan), "save", { agent_id: agent.id, amount }, SAVE_STORAGE_NEAR);
      STATE.saves.push({ fan, agent: agent.id, amount, tx });
      saveState(STATE);
      log(`${fan} saved ${agent.queue[fanIndex]} $CUT on ${agent.id} (tx ${tx})`);
    }
  }

  // 5. The keeper: a key on its own account that can only call run_cut and submit_move on the contract.
  const keeperFile = join(KEYCHAIN, `${STATE.keeper}.keeper.json`);
  if (!STATE.keeperKey) {
    const methods = ["run_cut", "submit_move"];
    const keyPair = KeyPair.fromRandom("ed25519");
    writeFileSync(keeperFile, JSON.stringify({ account_id: STATE.keeper, public_key: keyPair.getPublicKey().toString(), private_key: keyPair.toString() }), { mode: 0o600 });
    const tx = await send(account(STATE.keeper), STATE.keeper, [actions.addFunctionCallAccessKey(keyPair.getPublicKey(), STATE.contract, methods)], "keeper key");
    STATE.keeperKey = { publicKey: keyPair.getPublicKey().toString(), methods, file: `~/.near-credentials/testnet/${STATE.keeper}.keeper.json`, tx };
    saveState(STATE);
    log(`keeper key ${STATE.keeperKey.publicKey} (${methods.join(", ")} on ${STATE.contract}; tx ${tx})`);
  }

  // 6. Lock the contract: delete its only full-access key. Nobody can redeploy or change it after this.
  if (process.argv.includes("--keep-key")) {
    log(`--keep-key: ${STATE.contract} keeps its full-access key (a rehearsal, not a public launch)`);
    log(`drive it: node scripts/testnet/autopilot.ts${MODE === "fast" ? " --fast" : ""} --contract ${STATE.contract} --keeper ${STATE.keeper}`);
    return;
  }
  if (!STATE.locked) {
    const publicKey = KeyPair.fromString(loadKey(STATE.contract)).getPublicKey();
    STATE.txs.deleteKey = await send(account(STATE.contract), STATE.contract, [actions.deleteKey(publicKey)], "delete key");
    saveState(STATE);
  }
  const keys = await provider.viewAccessKeyList({ accountId: STATE.contract });
  if (keys.keys.length !== 0) throw new Error(`${STATE.contract} still has ${keys.keys.length} access keys`);
  STATE.locked = true;
  STATE.accessKeysAfterLock = 0;
  saveState(STATE);
  log(`locked ${STATE.contract}: 0 access keys (tx ${STATE.txs.deleteKey})`);

  log(`deploy     ${EXPLORER}/${STATE.txs.deploy}`);
  log(`key delete ${EXPLORER}/${STATE.txs.deleteKey}`);
  log(`done. First cut ${STATE.firstCutAt}. NEXT_PUBLIC_CUT_CONTRACT=${STATE.contract}`);
  log(`drive it: node scripts/testnet/autopilot.ts${MODE === "fast" ? " --fast" : ""} --contract ${STATE.contract} --keeper ${STATE.keeper}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
