// Launches The Cut on NEAR testnet, end to end, and records what it did in deploy/testnet-<mode>.json.
//
//   node scripts/testnet/launch.ts           # daily: a cut every day at 18:00 UTC, the app's public contract
//   node scripts/testnet/launch.ts --fast    # fast: a cut every 2 minutes, to watch robots get deleted
//
// Build first: pnpm contracts:build.
// Every step is idempotent: run it again and it picks up where it stopped. Accounts come from the testnet
// faucet; their keys go to ~/.near-credentials/testnet/<account>.json (the near CLI's legacy keychain), never
// into the repo. After `new`, the contract account's only full-access key is deleted, so nobody can change
// its code or parameters. Testnet only: it refuses any other network.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, nearToYocto, teraToGas, type KeyPairString } from "near-api-js";

const RPC_URL = process.env.NEAR_RPC_URL ?? "https://near-testnet.drpc.org";
const FAUCET_URL = "https://helper.nearprotocol.com/account";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MODE = process.argv.includes("--fast") ? "fast" : "daily";
const STATE_FILE = join(ROOT, "deploy", `testnet-${MODE}.json`);
const WASM = join(ROOT, "contracts", "target", "near", "thecut", "thecut.wasm");
const KEYCHAIN = join(homedir(), ".near-credentials", "testnet");

// Testnet parameters (docs/contract-interface.md): cheaper robots so the faucet covers them.
const NS_PER_SECOND = 1_000_000_000n;
const PARAMS = {
  fee_bps: 100,
  burn_bps: 5_000,
  savers_bps: 9_500,
  stage_size: 10,
  cut_interval: String((MODE === "fast" ? 120n : 86_400n) * NS_PER_SECOND),
  robot_funding: nearToYocto("0.5").toString(),
  register_deposit: nearToYocto("1").toString(),
};

/** Fast: 5 minutes from now, time to register and seed. Daily: the next 18:00 UTC at least 15 minutes away. */
function firstCutAtNs(): bigint {
  const now = Date.now();
  if (MODE === "fast") return BigInt(now + 5 * 60_000) * 1_000_000n;
  const at = new Date(now);
  at.setUTCHours(18, 0, 0, 0);
  if (at.getTime() < now + 15 * 60_000) at.setUTCDate(at.getUTCDate() + 1);
  return BigInt(at.getTime()) * 1_000_000n;
}
const POOL_NEAR = nearToYocto("4");

// The design's robots (src/entities/robot/api/sample.ts), split between two creator accounts.
const ROBOTS = [
  ["pixie", "Pixie Volt", "AI streamer"],
  ["lila", "Lila Loop", "Virtual influencer"],
  ["oracle", "Oracle Toad", "AI agent"],
  ["mabel", "Mabel Market", "Virtual influencer"],
  ["melody", "Melody-9", "Virtual singer"],
  ["yuna", "Yuna Star", "AI idol"],
  ["gremlin", "Glitch Gremlin", "AI artist"],
  ["velvet", "Velvet Vee", "Virtual model"],
  ["onyx", "Onyx Moon", "Digital model"],
  ["kiko", "Kiko Bun", "VTuber"],
  ["chartwise", "Chartwise", "AI analyst"],
  ["bloop", "Bloop", "AI robot"],
] as const;

type State = {
  network: "testnet";
  contract?: string;
  creators?: string[];
  keeper?: string;
  fans?: string[];
  deployedAt?: string;
  wasmSha256?: string;
  firstCutAt?: string;
  locked?: boolean;
  registered?: string[];
  keeperKey?: string;
  seeded?: boolean;
};

/** "@PixieVoltCut", or "@gremlinCut" when the long form passes the contract's 16 bytes. */
function xHandle(id: string, name: string) {
  const long = `@${name.replace(/[^A-Za-z0-9]/g, "")}Cut`;
  return long.length <= 16 ? long : `@${id}Cut`;
}

const provider = new JsonRpcProvider({ url: RPC_URL });

function loadState(): State {
  return existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, "utf8")) as State) : { network: "testnet" };
}

function saveState(state: State) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function keyFile(accountId: string) {
  return join(KEYCHAIN, `${accountId}.json`);
}

function loadKey(accountId: string): KeyPairString {
  const { private_key } = JSON.parse(readFileSync(keyFile(accountId), "utf8")) as { private_key: KeyPairString };
  return private_key;
}

function account(accountId: string, key: KeyPairString = loadKey(accountId)) {
  return new Account(accountId, provider, KeyPairSigner.fromSecretKey(key));
}

async function exists(accountId: string): Promise<boolean> {
  try {
    await provider.viewAccount({ accountId });
    return true;
  } catch {
    return false;
  }
}

// The faucet allows a handful of accounts per IP every 12 hours. Past that, FUNDER_ACCOUNT (any account with a
// key in the keychain) pays for new accounts through the `testnet` registrar instead.
const FUNDER = process.env.FUNDER_ACCOUNT;
const FUNDED_NEAR = nearToYocto((process.env.FUNDED_NEAR ?? "3") as `${number}`);

/** A new top-level testnet account funded by the faucet. Its key is written to the keychain before the request. */
async function createFaucetAccount(accountId: string): Promise<string> {
  if (existsSync(keyFile(accountId)) && (await exists(accountId))) return accountId;
  const keyPair = KeyPair.fromRandom("ed25519");
  mkdirSync(KEYCHAIN, { recursive: true, mode: 0o700 });
  const publicKey = keyPair.getPublicKey().toString();
  writeFileSync(keyFile(accountId), JSON.stringify({ account_id: accountId, public_key: publicKey, private_key: keyPair.toString() }), { mode: 0o600 });
  const response = await fetch(FAUCET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: publicKey }),
  });
  if (!response.ok) {
    const reason = `HTTP ${response.status} ${(await response.text()).slice(0, 200)}`;
    if (!FUNDER) throw new Error(`Faucet refused ${accountId}: ${reason}. Set FUNDER_ACCOUNT to pay for it instead.`);
    const outcome = await account(FUNDER).callFunctionRaw({
      contractId: "testnet",
      methodName: "create_account",
      args: { new_account_id: accountId, new_public_key: publicKey },
      deposit: FUNDED_NEAR,
      gas: teraToGas("100"),
    });
    if (JSON.stringify(outcome.status).includes("Failure")) throw new Error(`testnet.create_account failed for ${accountId}`);
    log(`faucet refused (${response.status}); ${FUNDER} paid for ${accountId}`);
  }
  for (let i = 0; i < 30 && !(await exists(accountId)); i++) await new Promise((r) => setTimeout(r, 1_000));
  if (!(await exists(accountId))) throw new Error(`${accountId} did not appear on chain`);
  log(`created ${accountId}`);
  return accountId;
}

function log(message: string) {
  console.log(`[launch] ${message}`);
}

async function call(signer: Account, method: string, args: object, deposit = 0n, gas = teraToGas("100")) {
  const outcome = await signer.callFunctionRaw({ contractId: STATE.contract!, methodName: method, args, deposit, gas });
  const failure = JSON.stringify(outcome.status).includes("Failure");
  if (failure) throw new Error(`${method} failed: ${JSON.stringify(outcome.status).slice(0, 400)}`);
  return outcome;
}

const STATE = loadState();

async function main() {
  if (!RPC_URL.includes("testnet")) throw new Error("This script only launches on testnet.");
  const suffix = STATE.contract?.split(".")[0].replace("thecut-", "") ?? `${MODE === "fast" ? "f" : "d"}${Math.random().toString(36).slice(2, 7)}`;

  // 1. Accounts, saved one by one so a refused faucet call resumes with the same names.
  STATE.contract = `thecut-${suffix}.testnet`;
  saveState(STATE);
  await createFaucetAccount(STATE.contract);
  STATE.creators = [`thecut-${suffix}-studio-a.testnet`, `thecut-${suffix}-studio-b.testnet`];
  STATE.keeper = `thecut-${suffix}-keeper.testnet`;
  STATE.fans = [`thecut-${suffix}-fan-a.testnet`, `thecut-${suffix}-fan-b.testnet`];
  saveState(STATE);
  for (const id of [...STATE.creators, STATE.keeper, ...STATE.fans]) await createFaucetAccount(id);

  // 2. Deploy and initialize in one transaction, so nobody can call `new` in between.
  if (!STATE.deployedAt) {
    const code = readFileSync(WASM);
    const firstCutAt = firstCutAtNs();
    const args = { ...PARAMS, first_cut_at: firstCutAt.toString() };
    const outcome = await account(STATE.contract).signAndSendTransaction({
      receiverId: STATE.contract,
      actions: [actions.deployContract(code), actions.functionCall("new", args, teraToGas("100"), POOL_NEAR)],
    });
    if (JSON.stringify(outcome.status).includes("Failure")) throw new Error(`deploy failed: ${JSON.stringify(outcome.status).slice(0, 400)}`);
    const { createHash } = await import("node:crypto");
    STATE.wasmSha256 = createHash("sha256").update(code).digest("hex");
    STATE.firstCutAt = new Date(Number(firstCutAt / 1_000_000n)).toISOString();
    STATE.deployedAt = new Date().toISOString();
    saveState(STATE);
    log(`deployed ${STATE.contract} (first cut ${STATE.firstCutAt})`);
  }

  // 3. Robots: each creator registers half, so the bench fills before the first cut seats the stage.
  STATE.registered ??= [];
  for (const [index, [id, name, kind]] of ROBOTS.entries()) {
    if (STATE.registered.includes(id)) continue;
    // A call can land even when its RPC answer is lost (a 429 on the way back): ask the contract first.
    const known = await provider.callFunction({ contractId: STATE.contract, method: "get_robot", args: { id } });
    if (known) {
      STATE.registered.push(id);
      continue;
    }
    const creator = account(STATE.creators[index % 2]);
    await call(creator, "register_robot", { id, name, kind, x_handle: xHandle(id, name) }, BigInt(PARAMS.register_deposit), teraToGas("100"));
    STATE.registered.push(id);
    saveState(STATE);
    log(`registered ${id}`);
  }

  // 4. Fans buy $CUT and save on different robots, so queues differ and the first cut seats the top ten.
  if (!STATE.seeded) {
    const plan: [string, string[]][] = [
      [STATE.fans[0], ["pixie", "lila", "oracle", "mabel", "melody", "yuna"]],
      [STATE.fans[1], ["gremlin", "velvet", "onyx", "kiko", "chartwise"]],
    ];
    for (const [fanId, robots] of plan) {
      const fan = account(fanId);
      // Registration plus room for the save records, which are paid from the storage balance.
      await call(fan, "storage_deposit", { account_id: fanId }, nearToYocto("0.1"));
      await call(fan, "buy", { min_out: "0" }, nearToYocto("1"));
      const balance = BigInt((await provider.callFunction<string>({ contractId: STATE.contract, method: "ft_balance_of", args: { account_id: fanId } })) ?? "0");
      // Decreasing amounts: the first robot gets the biggest share.
      let left = balance;
      for (const [i, robotId] of robots.entries()) {
        const amount = i === robots.length - 1 ? left / 2n : left / 3n;
        left -= amount;
        await call(fan, "save", { robot_id: robotId, amount: amount.toString() }, 0n);
      }
      log(`seeded saves from ${fanId}`);
    }
    STATE.seeded = true;
    saveState(STATE);
  }

  // 5. The keeper: a key on its own account that can only call run_cut on the contract.
  if (!STATE.keeperKey) {
    const keyPair = KeyPair.fromRandom("ed25519");
    const keeper = account(STATE.keeper);
    await keeper.addFunctionCallAccessKey({ publicKey: keyPair.getPublicKey(), contractId: STATE.contract, methodNames: ["run_cut"], allowance: nearToYocto("1") });
    writeFileSync(join(KEYCHAIN, `${STATE.keeper}.run_cut.json`), JSON.stringify({ account_id: STATE.keeper, public_key: keyPair.getPublicKey().toString(), private_key: keyPair.toString() }), { mode: 0o600 });
    STATE.keeperKey = keyPair.getPublicKey().toString();
    saveState(STATE);
    log(`keeper key ${STATE.keeperKey} (run_cut only), secret in ${KEYCHAIN}`);
  }

  // 6. Lock the contract: delete its only full-access key. Nobody can redeploy or change it after this.
  if (!STATE.locked) {
    const contract = account(STATE.contract);
    const publicKey = KeyPair.fromString(loadKey(STATE.contract)).getPublicKey();
    await contract.deleteKey(publicKey);
    STATE.locked = true;
    saveState(STATE);
    log(`locked ${STATE.contract}: no access keys left`);
  }

  log(`done. NEXT_PUBLIC_CUT_CONTRACT=${STATE.contract}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
