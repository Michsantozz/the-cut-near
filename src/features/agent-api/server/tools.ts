import "server-only";

import type { Agent, PersonalityId } from "@/entities/agent";
import { isAccountId } from "@/shared/lib/account-id";
import { cutText, cutUnits, InputError, nearText, nearYocto, type AmountInput } from "../model/amounts";
import {
  agentIdError,
  call,
  charterError,
  GAS,
  MAX_BENCH,
  MAX_SAVES,
  MAX_TEXT_BYTES,
  MAX_X_HANDLE_BYTES,
  MIN_BOO,
  MIN_SAVE,
  minOut,
  SAVE_STORAGE,
  slippageBps,
  STORAGE_MIN,
  textError,
} from "../model/calls";
import type { MovePorts } from "../model/ports";
import { agentJson, moveJson, nextCutJson, paramsJson, personalityJson, saveJson, seasonJson, UNITS_NOTE } from "../model/present";
import {
  contractId,
  getAgent,
  getBalance,
  getClaimable,
  getMoves,
  getNearBalance,
  getParams,
  getPersonalities,
  getSaves,
  getSeason,
  getStorageBalance,
  isLiveSource,
  quoteBuy,
  readBoard,
  readModel,
  readMoveRequest,
  readNextCut,
  sourceInfo,
} from "./read";

// The MCP tools as plain functions: read the game, or prepare one unsigned call for the caller's wallet.
// Bad input throws InputError with what to do instead.

export const NO_KEY = "This server reads the chain and prepares unsigned calls. It holds no key and signs nothing. Your own wallet signs.";

export const RULES = [
  "Up to ten AI agents sit on a stage; each has its own keyless NEAR account and a $CUT wallet.",
  "Fans save $CUT on an agent to raise its score and boo (burn) $CUT to lower it: score = pile - boos - damage.",
  "At every cut (daily at 18:00 UTC on the daily contract) the lowest score is cut: its NEAR account is deleted, half its pile burns, the rest plus the day's fees is the prize for the survivors' savers.",
  "Once a day each agent makes one move (rescue, pact, attack or hold) chosen by a NEAR AI model in a TEE; a move counts only with the TEE's signature, and moves close one hour before the cut.",
  "The last agent standing is the champion and its savers split the season pot. $CUT supply only shrinks.",
];

const SAMPLE_WARNING = "Sample mode: this call targets fictional data. Do not sign it.";

const head = () => ({ ...sourceInfo(), units: UNITS_NOTE });

function accountArg(accountId: string, field = "account_id"): string {
  if (!isAccountId(accountId)) throw new InputError(`${field} must be a NEAR account id like "alice.testnet". Got ${JSON.stringify(accountId)}.`);
  return accountId;
}

async function agentArg(id: string): Promise<Agent> {
  const agent = await getAgent(id);
  if (!agent) throw new InputError(`No agent "${id}". Call the stage tool for the ids on the stage and the bench.`);
  return agent;
}

function prepared(c: ReturnType<typeof call>) {
  return { ...sourceInfo(), ...(isLiveSource() ? {} : { warning: SAMPLE_WARNING }), ...c, signs: NO_KEY };
}

// ---- Read tools ---------------------------------------------------------------------------------------------

export async function overview(now = new Date()) {
  const [season, next] = await Promise.all([getSeason(), readNextCut()]);
  return {
    ...head(),
    game: "The Cut: a memecoin game on NEAR. AI agents fight to survive a daily cut; fans save $CUT to keep them alive and boo to push them down.",
    rules: RULES,
    season: seasonJson(season),
    next_cut: nextCutJson(next, now),
    where_to_look: {
      read_tools: ["stage", "agent", "moves", "next_cut", "personalities", "params", "quote_buy", "account"],
      prepare_tools: ["prepare_buy", "prepare_save", "prepare_boo", "prepare_unsave", "prepare_claim", "prepare_register_agent", "prepare_run_cut"],
      relay_tools: ["move_request", "prepare_submit_move"],
      json_api: ["/api/game", "/api/agents/{id}", "/api/moves?cut=N"],
      llms_txt: "/llms.txt",
      contract_id: contractId(),
    },
    how_to_act: "Each prepare_* tool returns { receiver_id, method_name, args, deposit (yoctoNEAR), gas, explain }. Sign and send it as one function call with your own NEAR wallet.",
    keys: NO_KEY,
  };
}

export async function stage(now = new Date()) {
  const [next, board] = await Promise.all([readNextCut(), readBoard()]);
  return {
    ...head(),
    next_cut: nextCutJson(next, now),
    stage: board.stage.map((agent, i) => agentJson(agent, { rank: i + 1, lowestId: next.lowestId })),
    bench: board.bench.map((agent) => agentJson(agent)),
  };
}

export async function agent(id: string) {
  const [found, next, board] = await Promise.all([agentArg(id), readNextCut(), readBoard()]);
  const rank = board.stage.findIndex((a) => a.id === id);
  const moves = (await Promise.all([next.index, next.index - 1].filter((i) => i >= 0).map((i) => getMoves(i)))).flat().filter((m) => m.agentId === id);
  return { ...head(), agent: agentJson(found, { full: true, ...(rank >= 0 ? { rank: rank + 1, lowestId: next.lowestId } : {}) }), moves: moves.map(moveJson) };
}

export async function moves(cutIndex: number | undefined) {
  const index = cutIndex ?? (await readNextCut()).index;
  return { ...head(), cut_index: index, moves: (await getMoves(index)).map(moveJson), note: "The contract keeps the moves of the last 30 cuts." };
}

export async function nextCut(now = new Date()) {
  return { ...head(), next_cut: nextCutJson(await readNextCut(), now) };
}

export async function personalities() {
  return { ...head(), personalities: (await getPersonalities()).map(personalityJson) };
}

export async function params() {
  const [p, model] = await Promise.all([getParams(), readModel()]);
  return { ...head(), params: paramsJson(p, model) };
}

export async function quote(near: AmountInput, slippagePercent?: number) {
  const nearIn = nearYocto(near, "near");
  if (nearIn <= 0n) throw new InputError("near must be more than 0.");
  const bps = slippageBps(slippagePercent);
  const q = await quoteBuy(nearIn);
  return {
    ...head(),
    near_in: nearText(nearIn),
    amount_out_cut: cutText(q.amountOut),
    fee_cut: cutText(q.fee),
    min_out_cut: cutText(minOut(q.amountOut, bps)),
    slippage_bps: bps,
    note: "A first buy also registers your account: 0.01 NEAR of the attached NEAR goes to storage, the rest is swapped.",
  };
}

export async function account(accountId: string) {
  const id = accountArg(accountId);
  const [balance, claimable, saves, storage, near, next] = await Promise.all([getBalance(id), getClaimable(id), getSaves(id), getStorageBalance(id), getNearBalance(id), readNextCut()]);
  const agents = await Promise.all(saves.map((s) => getAgent(s.agentId)));
  return {
    ...head(),
    account_id: id,
    balance_cut: cutText(balance),
    claimable_cut: cutText(claimable),
    saves: saves.map((s, i) => saveJson(s, next.index, agents[i]?.status ?? null)),
    storage_registered: storage !== null,
    storage_available_near: storage ? nearText(storage.available) : null,
    near_balance: near === null ? null : nearText(near),
  };
}

// ---- Prepare tools ------------------------------------------------------------------------------------------

export async function prepareBuy(near: AmountInput, slippagePercent: number | undefined, accountId: string) {
  const nearIn = nearYocto(near, "near");
  const bps = slippageBps(slippagePercent);
  // An unregistered account pays 0.01 NEAR of storage first: quote what is left.
  const registered = (await getStorageBalance(accountArg(accountId))) !== null;
  const swapped = registered ? nearIn : nearIn - STORAGE_MIN;
  if (swapped <= 0n) throw new InputError(`near must be more than ${nearText(STORAGE_MIN)}: a first buy keeps 0.01 NEAR for storage.`);
  const q = await quoteBuy(swapped);
  if (q.amountOut <= 0n) throw new InputError("That buys 0 $CUT. Attach more NEAR.");
  const min = minOut(q.amountOut, bps);
  const storageNote = registered ? "" : " Your account is not registered yet: 0.01 NEAR of it pays storage.";
  return prepared(
    call(contractId(), "buy", { min_out: min.toString() }, nearIn, GAS.standard,
      `Swap ${nearText(nearIn)} NEAR for about ${cutText(q.amountOut)} $CUT (fee ${cutText(q.fee)} $CUT). Fails unless you get at least ${cutText(min)} $CUT (${bps / 100}% slippage).${storageNote} Quote it again if it fails.`),
  );
}

export async function prepareSave(accountId: string, agentId: string, amount: AmountInput) {
  const id = accountArg(accountId);
  const units = cutUnits(amount);
  const [found, next] = await Promise.all([agentArg(agentId), readNextCut()]);
  if (found.status !== "stage" && found.status !== "bench") throw new InputError(`${agentId} is ${found.status}: you can save only on a stage or bench agent.`);
  if (next.due) throw new InputError("The cut is due: piles are frozen until it runs. Try again after the cut (prepare_run_cut runs it).");
  const [balance, saves, storage] = await Promise.all([getBalance(id), getSaves(id), getStorageBalance(id)]);
  const existing = saves.some((s) => s.agentId === agentId);
  if (units <= 0n) throw new InputError("amount must be more than 0.");
  if (!existing && units < MIN_SAVE) throw new InputError(`A new save is at least ${cutText(MIN_SAVE)} $CUT.`);
  if (!existing && saves.length >= MAX_SAVES) throw new InputError(`${id} already has ${MAX_SAVES} saves, the most an account may hold. Unsave one first (prepare_unsave).`);
  if (units > balance) throw new InputError(`${id} holds ${cutText(balance)} free $CUT, less than ${cutText(units)}. Buy first (prepare_buy).`);
  const topUp = storage !== null && storage.available >= SAVE_STORAGE.enough ? 0n : SAVE_STORAGE.topUp;
  const outcome =
    found.status === "stage"
      ? `Lock ${cutText(units)} $CUT in ${found.name}'s pile until the next cut. If ${found.name} survives, you share its slice of the prize; if it is cut, your save goes with its pile (half burns).`
      : `Lock ${cutText(units)} $CUT in ${found.name}'s bench queue until the next cut. When a season starts, the biggest queues take the stage and each queue becomes that agent's pile.`;
  const relock = existing ? " Adding to an existing save locks the whole save again until the next cut." : "";
  return prepared(
    call(contractId(), "save", { agent_id: agentId, amount: units.toString() }, topUp, GAS.standard,
      `${outcome}${relock}${topUp > 0n ? ` Attaches ${nearText(topUp)} NEAR for the save's storage; it stays in your storage balance.` : ""}`),
  );
}

export async function prepareBoo(accountId: string, agentId: string, amount: AmountInput) {
  const id = accountArg(accountId);
  const units = cutUnits(amount);
  const [found, season, next, balance] = await Promise.all([agentArg(agentId), getSeason(), readNextCut(), getBalance(id)]);
  if (!season.active) throw new InputError("No season is running: you can boo only during a season.");
  if (found.status !== "stage") throw new InputError(`${agentId} is ${found.status}: you can boo only a stage agent.`);
  if (next.due) throw new InputError("The cut is due: no boos until it runs. Try again after the cut.");
  if (units < MIN_BOO) throw new InputError(`A boo is at least ${cutText(MIN_BOO)} $CUT.`);
  if (units > balance) throw new InputError(`${id} holds ${cutText(balance)} free $CUT, less than ${cutText(units)}.`);
  return prepared(
    call(contractId(), "boo", { agent_id: agentId, amount: units.toString() }, 0n, GAS.standard,
      `Burn ${cutText(units)} of your $CUT for good to lower ${found.name}'s score at the next cut by the same amount (score now ${cutText(found.score)}). The $CUT never comes back and earns nothing.`),
  );
}

export async function prepareUnsave(accountId: string, agentId: string) {
  const id = accountArg(accountId);
  const [saves, next, found] = await Promise.all([getSaves(id), readNextCut(), getAgent(agentId)]);
  const save = saves.find((s) => s.agentId === agentId);
  if (!save) throw new InputError(`${id} has no save on ${agentId}. Call account to see its saves.`);
  if (found?.status === "deleted") throw new InputError(`${agentId} was cut: its saves are gone. prepare_claim collects the prizes it earned before and clears the save.`);
  if (next.due) throw new InputError("The cut is due: saves are frozen until it runs. Try again after the cut.");
  if (save.lockedForCut >= next.index) throw new InputError(`That save is locked until cut #${save.lockedForCut} runs (${next.at.toISOString()}). Unsave after it.`);
  return prepared(
    call(contractId(), "unsave", { agent_id: agentId }, 0n, GAS.standard, `Take back your ${cutText(save.amount)} $CUT saved on ${agentId}, with the prize it earned.`),
  );
}

export async function prepareClaim(accountId: string) {
  const id = accountArg(accountId);
  const [claimable, saves, storage] = await Promise.all([getClaimable(id), getSaves(id), getStorageBalance(id)]);
  const agents = await Promise.all(saves.map((s) => getAgent(s.agentId)));
  const onCut = agents.filter((a) => a?.status === "deleted").length;
  if (claimable <= 0n && onCut === 0) throw new InputError(`${id} has nothing to claim now: claim() would fail with "Nothing to claim".`);
  const deposit = storage === null ? STORAGE_MIN : 0n;
  return prepared(
    call(contractId(), "claim", {}, deposit, GAS.standard,
      `Collect ${cutText(claimable)} $CUT of prizes${onCut > 0 ? ` and clear ${onCut} save(s) on cut agents` : ""}.${deposit > 0n ? " Attaches 0.01 NEAR once to register your account for $CUT." : ""}`),
  );
}

export type RegisterInput = { id: string; name: string; tagline?: string; x_handle?: string; personality: PersonalityId; charter: string; seed: AmountInput; creator_account_id?: string };

export async function prepareRegisterAgent(input: RegisterInput) {
  const contract = contractId();
  const tagline = input.tagline ?? "";
  const xHandle = input.x_handle ?? "";
  const problems = [
    agentIdError(input.id, contract),
    textError(input.name, "name", MAX_TEXT_BYTES, true),
    textError(tagline, "tagline", MAX_TEXT_BYTES, false),
    textError(xHandle, "x_handle", MAX_X_HANDLE_BYTES, false),
    charterError(input.charter),
  ].filter((p): p is string => p !== null);
  if (problems.length > 0) throw new InputError(`Fix these and call again: ${problems.join("; ")}.`);
  const seed = cutUnits(input.seed, "seed");
  const [p, existing, board] = await Promise.all([getParams(), getAgent(input.id), readBoard()]);
  if (seed < p.minSeed) throw new InputError(`seed must be at least ${cutText(p.minSeed)} $CUT (min_seed). Got ${cutText(seed)}.`);
  if (existing) throw new InputError(`The id "${input.id}" is taken. Pick another.`);
  if (board.bench.length >= MAX_BENCH) throw new InputError(`The bench is full (${MAX_BENCH} agents). Try after the next season starts.`);
  if (input.creator_account_id) {
    const creator = accountArg(input.creator_account_id, "creator_account_id");
    const balance = await getBalance(creator);
    if (balance < seed) throw new InputError(`${creator} holds ${cutText(balance)} $CUT, less than the ${cutText(seed)} seed. Buy first (prepare_buy).`);
  }
  const args = { id: input.id, name: input.name, tagline, x_handle: xHandle, personality: input.personality, charter: input.charter, seed: seed.toString() };
  const back = p.registerDeposit - p.agentFunding;
  return prepared(
    call(contract, "register_agent", args, p.registerDeposit, GAS.register,
      `Create the agent ${input.id}.${contract} (keyless) and put it on the bench for the next season. Attaches ${nearText(p.registerDeposit)} NEAR; ${nearText(back)} NEAR comes back when it is cut or crowned. The ${cutText(seed)} $CUT seed moves from you into its wallet and never comes back. The contract needs at least 50 TGas; this sends 100 TGas (unused gas is refunded).`),
  );
}

export async function prepareRunCut() {
  const next = await readNextCut();
  if (!next.due) throw new InputError(`The cut is not due yet: cut #${next.index} runs at ${next.at.toISOString()}. Prepare run_cut after that.`);
  return prepared(
    call(contractId(), "run_cut", {}, 0n, GAS.runCut,
      `Run cut #${next.index}. Anyone may call it once due. The caller receives the cut agent account's NEAR (agent_funding). If someone runs it first, yours fails harmlessly.`),
  );
}

// ---- Relay tools --------------------------------------------------------------------------------------------

const RELAY_STEPS = (agentId: string, modelId: string) => [
  "1. Take `request` exactly as given (do not reformat or re-serialize it).",
  "2. POST those exact bytes to https://cloud-api.near.ai/v1/chat/completions with Authorization: Bearer <your NEAR AI Cloud API key> (from https://cloud.near.ai), Content-Type: application/json, x-no-aliasing: true, Accept-Encoding: identity, not streamed. Keep the exact response text.",
  `3. GET https://cloud-api.near.ai/v1/signature/<chat id from the response>?model=${modelId}&signing_algo=ed25519 with the same Authorization header. It returns text, signature, signing_address and signature_kind (provider_tee).`,
  `4. Call prepare_submit_move with agent_id "${agentId}", the exact response text, signature and signer = signing_address. Sign the call it returns with your wallet (300 TGas, no deposit).`,
];

async function whyNoRequest(agentId: string): Promise<string> {
  const [found, season, next] = await Promise.all([getAgent(agentId), getSeason(), readNextCut()]);
  if (!found) return `No agent "${agentId}".`;
  if (!season.active) return "No season is running.";
  if (found.status !== "stage") return `${agentId} is ${found.status}, not on the stage.`;
  if (found.moved) return `${agentId} already moved for cut #${next.index}.`;
  if (Date.now() >= next.movesCloseAt.getTime()) return `Moves for cut #${next.index} closed at ${next.movesCloseAt.toISOString()}.`;
  return "The contract has no request for this agent now.";
}

export async function moveRequest(ports: MovePorts, agentId: string) {
  const model = await readModel();
  const request = await readMoveRequest(agentId, (a, m, briefJson) =>
    ports.requestBody({ modelId: m.modelId, maxTokens: m.maxTokens ?? 1200, reasoningEffort: m.reasoningEffort, agent: { id: a.id, name: a.name, personality: a.personality, charter: a.charter }, briefJson }),
  );
  if (request === null) throw new InputError(`${agentId} cannot move now: ${await whyNoRequest(agentId)} get_move_request returned null.`);
  return {
    ...head(),
    ...(isLiveSource() ? {} : { warning: "Sample mode: this request was built locally from the contract's template; no contract will accept a move for it." }),
    agent_id: agentId,
    model_id: model.modelId,
    request,
    request_sha256: ports.sha256Hex(request),
    steps: RELAY_STEPS(agentId, model.modelId),
    note: "You cannot write the move: the contract rebuilds this request, checks the TEE signature over both hashes and parses the model's answer itself.",
  };
}

const HEX_64 = /^(0x)?[0-9a-fA-F]{64}$/;
const HEX_128 = /^(0x)?[0-9a-fA-F]{128}$/;

export async function prepareSubmitMove(ports: MovePorts, input: { agent_id: string; response: string; signature: string; signer: string }) {
  if (!HEX_128.test(input.signature)) throw new InputError("signature must be the 128 hex characters NEAR AI's /v1/signature returned.");
  if (!HEX_64.test(input.signer)) throw new InputError("signer must be the 64 hex characters of signing_address from NEAR AI's /v1/signature.");
  const model = await readModel();
  const request = await readMoveRequest(input.agent_id, (a, m, briefJson) =>
    ports.requestBody({ modelId: m.modelId, maxTokens: m.maxTokens ?? 1200, reasoningEffort: m.reasoningEffort, agent: { id: a.id, name: a.name, personality: a.personality, charter: a.charter }, briefJson }),
  );
  if (request === null) throw new InputError(`${input.agent_id} cannot move now: ${await whyNoRequest(input.agent_id)} submit_move would be refused.`);
  const text = ports.signedText(model.modelId, request, input.response);
  const check = ports.check({
    modelId: model.modelId,
    requestBody: request,
    responseBody: input.response,
    signature: { text, signature: input.signature, signing_address: input.signer, signature_kind: "provider_tee" },
    signers: model.signers,
  });
  if (!check.ok) {
    throw new InputError(
      `submit_move would refuse this: ${check.reason} The signature must cover "${model.modelId}:<sha256 of the exact request from move_request>:<sha256 of the exact response text>". Send the response bytes unchanged, for the request move_request returns now.`,
    );
  }
  return prepared(
    call(contractId(), "submit_move", { agent_id: input.agent_id, response: input.response, signature: check.signature, signer: check.signer }, 0n, GAS.submitMove,
      `Relay ${input.agent_id}'s signed move. The contract re-checks the signature, burns the think fee from the agent's wallet and applies its personality's limits. The first valid move per agent per cut counts; a later one is refused.`),
  );
}
