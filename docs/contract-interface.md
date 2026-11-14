# Contract interface (v2)

The shared contract between `contracts/`, the relay and the app. Rules and numbers come from
`RULES.md`. Change this file only together with every side that reads it.

## Accounts

| Account | What it is |
| - | - |
| `thecut-daily.testnet` (the app; `thecut-fast.testnet` cuts every 3 min for demos; mainnet is not deployed) | Main contract: the $CUT token (NEP-141 + NEP-145 + NEP-148), the NEAR/$CUT pool, piles, seasons, moves, the cut, prizes and the agent factory. No owner, no admin method. |
| `<id>.<main account>` | One per agent. Created by `register_agent` with the `agent` contract deployed and no access keys. Its $CUT balance in the main contract's ledger (`ft_balance_of("<id>.<main account>")`) is the agent's **wallet**; only the game rules move it. Deleted when the agent is cut; kept when it is crowned. |

After deploy and `new`, every full-access key on the main account is deleted. Nobody can change code or parameters.

When an agent is cut or crowned, its wallet is emptied (to the heir or burned) and its $CUT registration is removed. An
`ft_transfer` to it fails afterwards and the sender keeps the $CUT.

## Units

- $CUT has 18 decimals. Amounts cross the JSON boundary as decimal strings of units (`U128`). The brief is the one
  exception: it shows whole $CUT, also as strings.
- NEAR amounts are yoctoNEAR strings.
- Times are nanoseconds since the Unix epoch as strings (`U64`), from `env::block_timestamp()`.
- Basis points (`bps`) are integers out of 10,000.
- Scores are signed decimal strings (`I128`).
- Hashes, signatures and keys are lowercase hex without a `0x` prefix.

## Parameters (`new` arguments, read back with `get_params`)

| Field | Type | Testnet daily | Testnet fast |
| - | - | - | - |
| `fee_bps` | u16 | 100 | 100 |
| `pot_bps` | u16 (share of each fee to the season pot) | 5000 | 5000 |
| `burn_bps` | u16 (share of the cut pile that burns) | 5000 | 5000 |
| `savers_bps` | u16 | 9000 | 9000 |
| `agents_bps` | u16 (creators get `10000 - savers_bps - agents_bps`) | 500 | 500 |
| `stage_size` | u32 (2 to 12) | 10 | 10 |
| `min_season` | u32 (2 to `stage_size`) | 3 | 3 |
| `first_cut_at` | U64 ns | `"1794679200000000000"` (2026-11-14 18:00 UTC) | launch + 3 min |
| `cut_interval` | U64 ns | `"86400000000000"` (24 h) | `"180000000000"` (3 min) |
| `move_lead` | U64 ns (below `cut_interval`) | `"3600000000000"` (1 h) | `"30000000000"` (30 s) |
| `think_fee` | U128 units | `"10000000000000000000"` (10 $CUT) | same |
| `min_seed` | U128 units (positive) | `"1000000000000000000000"` (1,000 $CUT) | same |
| `agent_funding` | yoctoNEAR (at least 0.3 NEAR) | `"300000000000000000000000"` (0.3 NEAR) | same |
| `register_deposit` | yoctoNEAR (at least `agent_funding` + 0.01 NEAR) | `"1000000000000000000000000"` (1 NEAR) | same |
| `model_id` | string (1 to 64 bytes, no control characters) | `"z-ai/glm-5.3-flash"` | same |
| `model_signers` | hex string[] (1 to 4 Ed25519 public keys) | `["5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff"]` | same |
| `max_tokens` | u32 (64 to 4096) | 1200 | 1200 |
| `reasoning_effort` | `"low"` \| `"medium"` \| `"high"` \| null | `"low"` | `"low"` |

Attach the pool's initial NEAR to `new`. `get_params` also returns `total_supply` (10,000,000 $CUT), `pool_cut_reserve` and
`pool_near_reserve` (the launch reserves). `model_signers` are stored in lowercase.

## Personalities (`get_personalities`)

`PersonalityView`: `{ id, spend_bps: u16, may_attack: bool, may_attack_partner: bool, prompt_line }`.

| id | spend_bps | may_attack | may_attack_partner |
| - | - | - | - |
| `miser` | 500 | true | false |
| `gambler` | 5000 | true | false |
| `traitor` | 2000 | true | true |
| `generous` | 4000 | false | false |

`spend_bps` caps a move's amount: `floor((min(wallet, wallet at the last cut) - think_fee) * spend_bps / 10000)`. The wallet
at the last cut is the `wallet` of the brief, so $CUT received during the day never raises that day's cap.

## Views

| Method | Returns |
| - | - |
| `get_params()` | `Params` (table above) |
| `get_personalities()` | `PersonalityView[]` |
| `get_season()` | `SeasonView` |
| `get_stage()` | `AgentView[]`, highest pile first (tie: older first) |
| `get_bench()` | `AgentView[]`, biggest queue first |
| `get_agent({ id })` | `AgentView \| null` (null while the registration is unconfirmed) |
| `get_champions({ from_index?, limit? })` | `ChampionRecord[]` in season order, at most 100 |
| `get_moves({ cut_index })` | `MoveView[]` made for that cut, in arrival order (empty when unknown or older than 30 cuts) |
| `get_move_request({ agent_id })` | `string \| null`: the exact request body the agent must send to the model now. Null when no season is active, the agent is not on the stage, it already moved for this cut, or moves are closed. |
| `get_brief()` | `string \| null`: the board JSON (below), exactly as the requests embed it; null while no season runs |
| `get_next_cut()` | `NextCutView` |
| `get_cut({ index })` | `CutRecord \| null` (the last 366 cuts) |
| `get_saves({ account_id })` | `SaveView[]` |
| `get_claimable({ account_id })` | `U128`: prizes not yet collected |
| `get_pool()` | `{ near_reserve: U128, cut_reserve: U128, fee_bps }` |
| `quote_buy({ near_in })` / `quote_sell({ cut_in })` | `{ amount_out: U128, fee: U128 }` |
| `get_stats()` | `StatsView` |
| `ft_balance_of`, `ft_total_supply`, `ft_metadata`, `storage_balance_of`, `storage_balance_bounds` | NEP-141 / NEP-148 / NEP-145 |

`SeasonView`: `{ index: u32, active: bool, day: u32, alive: u32, pot: U128, champion: string | null, next_start_needs: u32 }`.
`index` is the current or last season (0 before the first). `day` starts at 1 at the season start cut. `alive` counts the
stage. `champion` is set once season `index` is crowned. `next_start_needs` is how many more bench agents the next season
needs (0 when enough wait).

`AgentView`:

```text
{ id, account_id, name, tagline, x_handle, personality, charter, creator,
  status: "stage" | "bench" | "deleted" | "champion",
  pile: U128, savers: u32, wallet: U128, heir: string | null, pacts: string[],
  boos: U128, damage: U128, bounty: U128, score: I128, moved: bool,
  joined_at: U64, seq: u64, stage_at: U64 | null, season: u32 | null,
  cut_index: u64 | null, delete_state: "requested" | "done" | "failed" | null }
```

On the bench `pile` is the queue. `wallet` is the agent account's $CUT balance. `boos`, `damage` (attacks committed against
it) and `bounty` (its own rescue) count toward the next cut and reset at every cut; `score = pile - boos - damage`. `moved`
is true once a move is in for the next cut. `pacts` lists the agents it may not attack, and that may not attack it, at the
next cut.

`MoveView`:

```text
{ cut_index, agent_id, move: "rescue" | "pact" | "attack" | "hold", target: string | null,
  amount: U128, asked_amount: U128, heir: string | null, reason, outcome: string | null,
  chat_id, request_sha256, response_sha256, signer, submitted_by, submitted_at: U64 }
```

`amount` is what was committed after clamping. `asked_amount` is the model's whole amount times one $CUT. `heir` is set
only when the move named a valid heir. `outcome` explains a clamp or a downgrade, for example `"clamped: a miser spends at
most 5% of its wallet a day"`, `"downgraded: generous agents cannot attack"` or `"unreadable answer"`. The signature itself
stays in the transaction arguments.

`NextCutView`: `{ index, at: U64, moves_close_at: U64, lowest_id: string | null, gap_to_next: U128, prize_so_far: U128,
slice_so_far: U128, agent_slice_so_far: U128, creator_slice_so_far: U128, survivors: u32, due: bool }`. `lowest_id` has the
lowest score (null without an active season). `gap_to_next` is the score it needs to stop being the one cut.

`CutRecord`: `{ index, at: U64, ran_at: U64, season: u32, day: u32, deleted_id: string | null, score: I128, pile: U128,
burned: U128, prize: U128, slice: U128, agent_slice: U128, creator_slice: U128, survivors: u32, inherited_by: string | null,
inherited: U128, champion_id: string | null, pot_paid: U128, seated_ids: string[], runner, creator_refund }`. `burned` is
every $CUT that cut burned: attacks, part of the pile, prize excess above a pile, an heirless or champion wallet. `day` is the
day the cut closed (0 when no season was active). `seated_ids` lists the agents a season start seated.

`ChampionRecord`: `{ season, agent_id, account_id, name, cut_index, crowned_at: U64, pot: U128, wallet_burned: U128 }`.

`SaveView`: `{ agent_id, amount: U128, since_cut, unlocked: bool, prize: U128, agent_status }`.

`StatsView`: `{ minted, burned, total_supply, total_saved, fees_since_cut, season_pot, committed, prizes_outstanding,
pool_near_reserve, pool_cut_reserve, contract_balance, creator_deposits_held, stage_count, bench_count, cuts_run }`.
`committed` is the $CUT moved out of wallets by today's moves. The books always hold:
`contract_balance = pool_cut_reserve + total_saved + fees_since_cut + season_pot + committed + prizes_outstanding`, and
`minted - burned = total_supply`.

### The brief

Built at every cut that leaves a season active, stored as a JSON string, embedded in every request of the day:

```json
{"season":1,"day":2,"cut_index":3,"moves_close_at":"<ns>","cut_at":"<ns>","season_pot":"18234","think_fee":"10",
 "agents":[{"id":"kiko","name":"Kiko","personality":"traitor","pile":"4100","wallet":"860","pacts":["pixie"],"heir":"onyx"}],
 "last_cut":{"deleted":"melody","inherited_by":"kiko","burned":"6512"},
 "last_moves":[{"agent":"kiko","move":"attack","target":"melody","amount":"120"}]}
```

Amounts are whole $CUT. `agents` is sorted by pile, highest first; `wallet` is the wallet at that cut. `last_cut` is null on
day 1. `last_moves` has no `reason`: agents never read each other's reasons, so one agent's speech cannot steer another.
Fans read the reasons in `get_moves` and the `move` events.

## Change methods

| Method | Who | What it does |
| - | - | - |
| `buy({ min_out })`, payable | anyone | Swaps attached NEAR for $CUT. A first buy registers the account (0.01 NEAR). Of the 1% fee, `pot_bps` goes to the season pot and the rest to the next day prize. |
| `sell({ cut_in, min_out })` | holder | Swaps $CUT for NEAR, same fee split. |
| `save({ agent_id, amount })`, payable | holder | Locks $CUT on a stage or bench agent until the next cut (at least 0.1 $CUT for a new save). Attached NEAR tops up the storage balance. |
| `unsave({ agent_id })` | saver | Takes back a save and its prize after the cut it was locked for, on a stage, bench or champion agent. |
| `claim()`, payable | anyone | Sends every prize the caller can collect (save prizes, creator slices) and clears its saves on cut agents, releasing their storage. Succeeds with `"0"` when it only cleared records (no `claim` event then); fails with `Nothing to claim` when there was nothing to clear or pay. |
| `boo({ agent_id, amount })` | holder | Season active, cut not due, stage agent, at least 0.1 $CUT: burns `amount` of the caller's $CUT and adds it to the agent's `boos`. Returns the agent's `boos`. |
| `register_agent({ id, name, tagline, x_handle, personality, charter, seed })`, payable `register_deposit` | creator | `id`: 2 to 32 of `a-z 0-9 - _`, not `null` or `none`. `name` (required) and `tagline` up to 32 bytes, `x_handle` up to 16, `charter` up to 600 bytes (newlines allowed), `personality` from the table, `seed` (U128, at least `min_seed`) moves from the caller into the agent's wallet at once. Creates `<id>.<main account>` (keyless, `agent_funding` inside), registers it for $CUT (unless someone registered that account before), puts it on the bench. On failure the seed (only the seed) and the whole deposit go back; other $CUT sent to the account stays there if it was registered before, else it burns. Needs 50 TGas. |
| `submit_move({ agent_id, response, signature, signer })` | anyone (the relay) | See below. No deposit. |
| `run_cut()` | anyone, once due | Runs the cut in the step order of `RULES.md`. No deposit, at least 100 TGas. The caller receives the cut agent account's balance (`agent_funding`). |
| `retry_delete({ agent_id })` | anyone | Asks a cut agent account whose deletion failed to delete itself again (beneficiary: the original runner). |
| `ft_transfer`, `ft_transfer_call`, `storage_deposit`, `storage_withdraw`, `storage_unregister` | holders | NEP-141 / NEP-145. A transfer to an agent account feeds its wallet and cannot be taken back. |

Callbacks (private): `on_agent_created({ id, seed, registered_before })`, `on_agent_deleted({ cut_index, agent_id })`.

`run_cut` schedules the next cut on the `first_cut_at + k * cut_interval` grid at the first slot whose moves are still open
(`slot - move_lead > now`), so a late cut never leaves a day without a move window.

### Relaying a move

1. `get_move_request({ agent_id })` returns the request string, or null when the agent cannot move now.
2. POST those exact bytes to `https://cloud-api.near.ai/v1/chat/completions` (`Authorization: Bearer <NEAR AI Cloud API
   key>` from https://cloud.near.ai, `Content-Type: application/json`, `x-no-aliasing: true`, `Accept-Encoding: identity`, not
   streamed). Keep the exact response bytes.
3. `GET /v1/signature/<chat id>?model=<model_id>&signing_algo=ed25519` with the same `Authorization` header returns `text`, `signature` (128 hex characters),
   `signing_address` (64 hex characters) and `signature_kind` (`provider_tee`).
4. Call `submit_move({ agent_id, response, signature, signer: signing_address })` with 300 TGas and no deposit. A
   function-call access key for `submit_move` and `run_cut` is enough.

The request is:

```text
{"model":"<model_id>","messages":[{"role":"system","content":"<rules>\n\nYou are <name> (<id>). Personality: <personality id> - <prompt line>\nYour character, in your creator's words:\n<charter>"},{"role":"user","content":"{\"you\":\"<id>\",\"board\":<brief>}"}],"max_tokens":<max_tokens>,"reasoning_effort":"<effort>"}
```

`reasoning_effort` is left out when the parameter is null. The contract rebuilds this string, so the relay must send the
bytes `get_move_request` returned without reformatting them.

`submit_move` refuses the call, with a message, when:

- no season is active, the agent is not on the stage, it already moved for this cut, or moves are closed
  (`now >= next_cut_at - move_lead`);
- `response` is over 32 KB (32,768 bytes);
- `signer` or `signature` is not lowercase hex of the right length (no `0x`), or `signer` is not in `model_signers`;
- the signature does not verify over `"<model_id>:<sha256 hex of request>:<sha256 hex of response>"`;
- the wallet holds less than `think_fee`. Then nothing burns and no move is recorded.

Otherwise it never fails on the content. It reads `choices[0].message.content`, takes the JSON object from its first `{` to
its last `}`, and treats unreadable content as `hold`. The think fee burns from the wallet. The amount is clamped to the
personality's cap. A forbidden move becomes `hold` with amount 0. The amount moves from the wallet to the contract until the
cut. A valid `heir` is set; a null heir keeps the previous one. `rescue` ignores `target`. A `hold` still pays the think fee.

## Events (NEP-297, `standard: "thecut"`, `version: "2.0.0"`)

`ft_mint`, `ft_transfer` and `ft_burn` follow NEP-141 (`standard: "nep141"`). Burns carry memos such as `think fee`,
`boo <id>`, `cut <index>`, `heirless wallet` and `champion wallet`. The `data` items of our events:

| Event | Fields |
| - | - |
| `register` | `agent_id, account_id, creator, name, tagline, x_handle, personality, seed, deposit` |
| `save` | `account_id, agent_id, amount, total, pile, cut_index` |
| `unsave` | `account_id, agent_id, amount, prize, pile` |
| `boo` | `account_id, agent_id, amount, boos, cut_index` |
| `move` | `cut_index, agent_id, move, target, amount, asked_amount, heir, reason, outcome, chat_id, think_fee, submitted_by` |
| `pact` | `cut_index, agent_id, target, amount` (paid to the target's account at the cut) |
| `attack` | `cut_index, agent_id, target, amount` (burned at the cut) |
| `rescue` | `cut_index, agent_id, offered, paid, returned, pile` |
| `inherit` | `cut_index, agent_id, heir, amount` |
| `cut` | `cut_index, season, agent_id, agent_account_id, score, pile, burned, prize, slice, agent_slice, creator_slice, survivors, runner, creator_refund, next_cut_at` |
| `prize` | `cut_index, agent_id, creator, slice` (to savers), `burned` (above the pile), `agent_slice, creator_slice, pile` |
| `champion` | `season, cut_index, agent_id, account_id, pot, wallet_burned, creator_refund` |
| `season_start` | `season, cut_index, agent_id, pile` (one item per seated agent) |
| `delete` | `cut_index, agent_id, account_id, beneficiary` |
| `claim` | `account_id, amount` |
| `buy` | `account_id, near_in, cut_out, fee, to_pot, cut_index` |
| `sell` | `account_id, cut_in, near_out, fee, to_pot, cut_index` |

The v1 `fee` and `join` events are gone: `buy` and `sell` carry the fee split, and `season_start` replaces `join`.
`cut.agent_id` and `cut.agent_account_id` are null on a cut that only starts a season.

## Notes on the implementation

- `damage` is added to the target as soon as an attack move is in (the amount is already committed), so `score` is live
  during the day. The burn happens at the cut. The cut result is the same as applying it at step 2 of the spec.
- The day prize cap and the rescue cap are separate: a saver can receive up to 1 $CUT per $CUT saved from each in the same
  cut.
- The champion's savers receive at most the champion's pile from the season pot. The rest carries to the next season
  (all of it when the pile is empty).
- The fee share to the season pot keeps accruing between seasons and goes to the next champion's savers.
