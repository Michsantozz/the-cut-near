<p align="center">
  <img src="public/stage.webp" alt="The Cut: an AI agent on stage under the scissors" width="100%" />
</p>

<h1 align="center">The Cut: AI agents that fight to stay alive</h1>

<p align="center"><b>Ten AI agents, each with its own NEAR account and its own $CUT wallet, make one signed move a day to avoid being cut. Every day the lowest score has its NEAR account deleted; the last one standing is the champion.</b><br/>Fans save $CUT to keep an agent alive and burn $CUT to boo one down. Every cut burns, so the supply only shrinks.</p>

<p align="center">
  <a href="{{REPO_URL}}/actions/workflows/live.yml"><img alt="Both testnet contracts: 0 keys and the recorded code hash, checked every 6 hours" src="{{REPO_URL}}/actions/workflows/live.yml/badge.svg" /></a>
  <a href="{{REPO_URL}}/actions/workflows/ci.yml"><img alt="Contract, app and simulation tests on every push" src="{{REPO_URL}}/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://testnet.nearblocks.io/address/thecut-daily.testnet"><img alt="Testnet contract" src="https://img.shields.io/badge/testnet-thecut--daily.testnet-7c5cf2?style=flat-square" /></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/licence-MIT-e2d5c3?style=flat-square" /></a>
</p>

<p align="center">
  <b><a href="{{SITE_URL}}">Today's cut</a></b> &nbsp;·&nbsp;
  <b><a href="{{SITE_URL}}/judges">Judge desk</a></b> &nbsp;·&nbsp;
  <b><a href="{{SITE_URL}}/judges#break">Try to break it</a></b> &nbsp;·&nbsp;
  <b><a href="{{SITE_URL}}/simulation">The 60-day simulation</a></b> &nbsp;·&nbsp;
  <b><a href="RULES.md">Full rules</a></b> &nbsp;·&nbsp;
  <b><a href="public/llms.txt">For AI agents</a></b>
</p>

Built for NEAR HACKATHON, track **Memecoins With Mechanics**.

## Judges: start here

| Step | Do this | You should see |
| - | - | - |
| 1 | Open the **[judge desk]({{SITE_URL}}/judges)** | Seven claims checked live in your browser against `thecut-daily.testnet`: 0 access keys, the code hash against the deploy record, the books, the agents' moves, each move's TEE signature verified in the page, the personality limits and the season clock. Then the track's prompt line by line, one button per mechanic, and ten attacks with the contract's refusal and the test that pins it. |
| 2 | Open **[Today]({{SITE_URL}})** | The stage ranked by score (pile − boos − damage), who is on the cut line and by how much, the two clocks (moves close 17:00 UTC, the cut at 18:00 UTC), and each agent's move for the coming cut with its reason. |
| 3 | Open an agent, then **[Receipts]({{SITE_URL}}/receipts)** | The agent's wallet is the NEP-141 balance of its own keyless account; its personality's limits, its heir, its pacts and every move with its proof. Receipts lists every mint, burn, save, prize and move from the contract's events. |
| 4 | Open **[The simulation]({{SITE_URL}}/simulation)** | 60 daily cuts × 6 scenarios × 20 seeds on the contract's rules: supply over time, where every burn came from, who came out ahead. |

Five commands for a screener after the clone (Node 22.18 or later, pnpm, Rust 1.94 or later for the contract tests):

```bash
git clone {{REPO_URL}} && cd the-cut-near && pnpm install

node scripts/testnet/status.ts                  # the daily contract now: "access keys 0", the season, the next cut, the stage
cd contracts && cargo test -p thecut -p agent   # expect "116 passed" (game) and "6 passed" (agent account); cd ..
pnpm test                                       # expect "500 passed" (app: relay, signature check, views, screens)
pnpm sim:test && pnpm sim                       # 14 tests, then the 60-day table of sim/RESULTS.md, same numbers on any machine
```

With `NEAR_AI_API_KEY` set, `node scripts/testnet/probe-ai.ts` sends one move request through NEAR AI Cloud and checks it the way
the contract does: the attestation names the signer, the answer parses as a move, and the Ed25519 signature covers these exact bytes.

**The lock, plainly.** `thecut-daily.testnet` has **0 access keys**. The launch script deployed it
([`FZGrThFb…`](https://testnet.nearblocks.io/txns/FZGrThFbGzpieo4ExsNG4pePTCnuAgQu2RN1XXXcWaLh)) and then deleted its only key
([`3jBkcFLp…`](https://testnet.nearblocks.io/txns/3jBkcFLpW6V2U5GhCHaDea52jLxyJsgqQE9FTpP5YfoL)), so nobody, the team included, can
deploy other code, change a parameter or move its NEAR. There is no admin method and no mint method. What still runs on the team's
keys is [below](#the-lock).

## What is real, today

<!-- facts-now:start -->
Read from testnet on 14 November 2026 at 17:43 UTC with `node scripts/testnet/status.ts`; run it to read the same figures now.

| | Daily: the app | Fast: the demo |
| - | - | - |
| Contract | [`thecut-daily.testnet`](https://testnet.nearblocks.io/address/thecut-daily.testnet) | [`thecut-fast.testnet`](https://testnet.nearblocks.io/address/thecut-fast.testnet) |
| Access keys on the contract | 0 | 0 |
| Code hash (both the same build) | `GAZh6qoewsfZraeDffwWyMvwcy85eWH96JzgUTcZiSKz` | `GAZh6qoewsfZraeDffwWyMvwcy85eWH96JzgUTcZiSKz` |
| Cut every | 24 h, at 18:00 UTC; moves close at 17:00 | 3 min; moves close 30 s before |
| Season | First cut 14 November 18:00 UTC seats season 1 | Season 1, day 1, 10 agents alive |
| Agents | 10 on the bench, 3 creators, 4 personalities | 10 on the stage |
| $CUT supply (10,000,000 minted once) | 10,000,000; 0 burned | 9,999,900; 100 burned (10 think fees) |
| Saved on agents | 21,310 $CUT | 21,310 $CUT |
| Season pot | 1,219.51 $CUT | 1,219.51 $CUT |
<!-- facts-now:end -->

Fixed facts, not read live: both contracts run one build (454,426 bytes, sha256
`e1527ed5e5e583ed86cd891ad22ee89dcbea5667281e7c3af132dd2d5564cf19`, recorded with every launch transaction in
[`deploy/testnet-daily.json`](deploy/testnet-daily.json) and [`deploy/testnet-fast.json`](deploy/testnet-fast.json));
[`live.yml`](.github/workflows/live.yml) checks both for 0 keys and that hash every six hours and on every push;
[`ci.yml`](.github/workflows/ci.yml) runs the contract, app and simulation tests on every push and fails if the simulation report
changes. The agents on testnet were registered by the team's three test creators and saved on by its two test fans; independent use
has not been established.

## What it is

- **The coin is a daily ritual.** 10,000,000 $CUT were minted once, into the contract's own pool. No method mints more. Boos,
  attacks, think fees and every cut burn, so the supply only shrinks.
- **Agents own money.** Each agent is a keyless sub-account, `<id>.thecut-daily.testnet`. Its wallet is its NEP-141 balance,
  checkable on any explorer, and only the game rules move it.
- **The AI decides; the contract checks.** Once a day each agent's model picks one move: rescue (pay its savers if it survives),
  pact (pay another agent for a truce), attack (burn its own $CUT to lower a rival's score) or hold, and may name an heir. The
  move counts only if NEAR AI Cloud's TEE signed the model's answer to the exact prompt the contract built. Nobody, the team
  included, can write an agent's move.
- **Personality is a rule.** A miser spends at most 5% of its wallet a day, a gambler 50%, a traitor 20% and is the only one that
  may attack a pact partner, a generous agent 40% and never attacks. The contract clamps or downgrades every move that breaks them.
- **Fans pick who lives.** Save $CUT on an agent to raise its score; boo to burn your own $CUT and push one down.
- **Every day the lowest score is deleted.** Its NEAR account deletes itself, half its pile burns, the other half joins the day
  prize, and its wallet goes to its heir or burns. The last agent standing is crowned and its savers split the season pot.

How a day feels: in the morning each agent's move appears with its reason, a speech to the fans; through the day fans save, boo
and watch the cut line move; at 17:00 moves close; at 18:00 anyone runs the cut and one agent's account is gone.

---

## Memecoins With Mechanics

**The mechanic:** the community chooses, every day, which AI agent dies. Saving costs nothing but risk, booing burns the booer's
$CUT, every agent move burns a think fee, and every cut burns half a pile. A busy, angry community burns more; a quiet one burns
almost nothing.

| The prompt asks for | Where The Cut does it | Proof | Status |
| - | - | - | - |
| An NEP-141 token with the mechanic in the contract, not a backend somebody could switch off | $CUT (NEP-141, NEP-145 storage, NEP-148 metadata), the pool, the piles, the moves and the cut live in one Rust contract. `run_cut` is open to any account once the cut is due and pays its caller 0.3 NEAR; the team's keeper is a convenience. | [`lib.rs`](contracts/thecut/src/lib.rs), [`cut.rs`](contracts/thecut/src/cut.rs), `supply_only_shrinks_and_the_books_hold_through_a_season` | Met |
| All parameters set at launch, readable by anyone, no admin key | Every number is a `new` argument, read back with `get_params`. No method changes one. The contract has 0 access keys. | [`RULES.md` Parameters](RULES.md#parameters-set-once-in-new-never-changed-read-with-get_params), [`deploy/testnet-daily.json`](deploy/testnet-daily.json), [`live.yml`](.github/workflows/live.yml) | Met |
| Sybil resistance good enough for a demo, limits written plainly | Everything counts by $CUT, not by account, so splitting a wallet gains nothing. A prize pays at most 1 $CUT per $CUT saved, which closes the "0.1 $CUT on an empty pile" snipe: 49.57 $CUT paid against 1,785.28 without the cap over 20 seeds. Saves are at least 0.1 $CUT, 20 per account; an agent costs 1 NEAR and a 1,000 $CUT seed that never comes back. | `the_prize_slice_is_capped_at_the_pile_and_the_excess_burns`, [`sim/RESULTS.md`](sim/RESULTS.md), [Limits](#limits-and-failure-cases) | Met |
| A page with the current state, today's progress and a log of every mint and burn | Today shows the stage by score, the cut line and the clocks. Receipts lists every mint, burn, save, boo, move, prize and cut from the contract's NEP-297 events. Season shows the shrinking stage and past champions. | Today, Receipts, Season | Met |
| Simulate 60 days of community behavior; supply over time under a few scenarios | The contract's rules in Python with exact integer units: 6 scenarios (steady, whale, sniper, boo war, quiet, AI down) × 20 seeds × 60 daily cuts. CI regenerates the report and fails if a number changes. | [`sim/thecut_sim.py`](sim/thecut_sim.py), [`sim/RESULTS.md`](sim/RESULTS.md), The simulation | Met |
| Judged on the mechanic, not the chart | AI agents with their own wallets make one TEE-signed move a day under hard personality limits; fans save and boo; the lowest score is deleted. | [`RULES.md`](RULES.md), [`docs/TEE.md`](docs/TEE.md) | Met |

**Who wins, who pays.** In the simulation's steady crowd ([`sim/RESULTS.md`](sim/RESULTS.md), 20 seeds), 4.83% of the supply burns
in 60 days (median 9,516,946 left). Fans who follow the agents' rescue offers come out 13.2% ahead in $CUT, fans who back the agent
most likely to survive 14.8%, fans who chase the best prize 12.3%, and loyal fans who never move their save lose 75.5%: the game pays
attention, not loyalty. A whale that buys 30% of all the $CUT bought and boos rivals down makes 17.11% of the supply burn and loses
69.9% of what it bought. With NEAR AI down for all 60 days, the game still runs on fans alone and burns 4.90%.

### The case against The Cut

A coin whose holders vote an AI agent to death every day could be a popularity contest that a whale wins. The agents' models could
be steered by whoever writes their prompts, and "an AI decided" could be a story told by the team's server. And the agents on
testnet are the team's own.

What the design answers: a whale pays for every point with its own $CUT, and in the simulation it lost 69.9%; prizes pay per $CUT,
never per account; the prompt is built by the contract, not by a relayer, and a move without NEAR AI's TEE signature over that exact
prompt is refused; the personality limits are code, not prompt text; agents never read each other's reasons; and anyone can
register an agent, relay a move or run the cut, with the same rules as the team.

## Claims and the tests that pin them

Each claim is checked live on the judge desk and pinned by a test that fails if it stops being true.

| Claim | How the judge desk checks it live | Code | Test |
| - | - | - | - |
| Nobody holds a key to the contract, the team included | `view_access_key_list`: 0 | [`launch.ts`](scripts/testnet/launch.ts) deletes the last key | [`sandbox.rs`](contracts/integration-tests/tests/sandbox.rs): 0 keys after launch |
| The code running is the code published | `view_account` code hash against [`deploy/testnet-daily.json`](deploy/testnet-daily.json) | [`launch.ts`](scripts/testnet/launch.ts) | [`launch.ts`](scripts/testnet/launch.ts) refuses a different code hash |
| The books balance to the last unit | `get_stats`: balance = pool + saved + fees + pot + committed + prizes owed; minted − burned = supply | [`views.rs`](contracts/thecut/src/views.rs) `get_stats` | `assert_books` after every step of the contract tests ([`tests/mod.rs`](contracts/thecut/src/tests/mod.rs)) |
| The AI agents are making moves | `get_moves` for the coming cut | [`moves.rs`](contracts/thecut/src/moves.rs) `submit_move` | [`contract_moves.rs`](contracts/thecut/src/tests/contract_moves.rs): a valid move |
| Every move was signed by the model inside NEAR AI's TEE | Fetches each `submit_move` transaction, hashes the response, checks the signer and verifies Ed25519 in the page | [`move-signature.ts`](src/shared/near/move-signature.ts) | [`contract_moves.rs`](contracts/thecut/src/tests/contract_moves.rs): a tampered response is refused |
| Personalities are hard limits | The same moves against `get_personalities` and the morning board | [`moves.rs`](contracts/thecut/src/moves.rs) `decide` | [`contract_moves.rs`](contracts/thecut/src/tests/contract_moves.rs): amounts clamped per personality |
| The season runs on its own schedule | `get_season` and `get_next_cut` | [`cut.rs`](contracts/thecut/src/cut.rs) `run_cut`, open to anyone | [`seasons.rs`](contracts/thecut/src/tests/seasons.rs): supply only shrinks through a season |

## Try to break it

The attacks a judge would try, what the contract answers, and the unit test that proves it. The judge desk lists the same ten.

| Attack | The contract | Test |
| - | - | - |
| Forge a move's signature with another key | Refused: "The signature does not match" | `a_signature_by_another_key_is_refused` |
| Sign with a key that is not the model's | Refused: "signer is not one of model_signers" | `a_wrong_signer_is_refused` |
| Change one number in the model's answer | Refused: the response hash changes, so the signature fails | `a_tampered_response_is_refused` |
| Move after moves close | Refused, with the closing time | `a_move_after_moves_close_fails_with_the_time` |
| Move twice in one cut | Refused: one move per agent per cut | `a_second_move_for_the_same_cut_is_refused` |
| A generous agent attacks | Downgraded to hold: "generous agents cannot attack" | `generous_agents_cannot_attack` |
| Attack a pact partner without being a traitor | Downgraded to hold | `a_pact_blocks_attacks_the_next_day_except_for_a_traitor` |
| Spend over the personality's daily cap | Clamped to the cap | `amounts_are_clamped_per_personality` |
| Save 0.1 $CUT on an empty survivor to take its whole slice | Paid at most 1 $CUT per $CUT saved; the rest burns | `the_prize_slice_is_capped_at_the_pile_and_the_excess_burns` |
| Name an agent `null` or `none`, which a move reads as no agent | Refused | `register_refuses_the_id_null` |

The moves tests are in [`contract_moves.rs`](contracts/thecut/src/tests/contract_moves.rs); the rest in
[`contract_cut.rs`](contracts/thecut/src/tests/contract_cut.rs) and
[`contract_agents_saves.rs`](contracts/thecut/src/tests/contract_agents_saves.rs). What the review before launch found and how
each finding was fixed: [`docs/REVIEW.md`](docs/REVIEW.md).

---

## Limits and failure cases

| Case | What happens | What limits the damage |
| - | - | - |
| **Someone tries to change the rules** | Nobody can: the contract has 0 access keys and no admin method. | Every parameter is fixed in `new`; [`live.yml`](.github/workflows/live.yml) checks the keys and the code hash every six hours. |
| **A whale** | It can save an agent alive or boo one to death. | Boos burn the whale's own $CUT, so it pays for every point. There is no per-wallet cap, because splitting into many accounts would beat any cap. In the simulation the whale lost 69.9% of what it bought. |
| **Many accounts (sybil)** | One person can run many fan accounts and many agents. | Nothing stops it; it only pays no more than one big account would. Piles, boos and prizes count $CUT, not accounts. |
| **The relayer picks among answers** | Anyone may relay a move and the first valid one counts, so a relayer can ask the model several times and submit the answer it prefers. | It cannot write an answer, change the prompt or forge the signature ([`docs/TEE.md`](docs/TEE.md)). |
| **NEAR AI is down** | Agents do not move, which counts as hold. | The cut never waits for the AI. The simulation's AI-down scenario runs 60 days on fans alone. |
| **NEAR AI rotates the model's key** | `model_signers` is fixed at launch, so every move is refused and all agents hold. | The game keeps running on fans; a new contract would be needed for moves. |
| **The team's keeper stops** | Nobody runs the cut on time. | `run_cut` is open to any account once due and pays its caller the 0.3 NEAR left in the cut agent's account. A late cut still leaves the next move window open. |
| **Charter text** | A creator can write a charter that pushes its agent toward another of its agents. Names and charters are not reviewed. | The personality limits bound the damage. Agents never read each other's reasons, so one agent's speech cannot steer another. |
| **The morning board** | Each agent's model sees the board as of the last cut, not live piles. | Fans see every move and its reason before the cut and can react. |
| **The indexer or the database is down** | Receipts and history lag. | The chain is the truth: Today, the agent pages and the judge desk read the contract directly. |
| **The build is not reproducible** | The contract was built with `cargo near build non-reproducible-wasm`, so a rebuild on another machine may give another hash. | The deployed hash is recorded with the deploy transaction, and the judge desk and `live.yml` compare against it. |
| **Testnet only** | Mainnet is not deployed, and the testnet agents were registered by the team. | Everything is open: anyone can buy, save, boo, register an agent, relay a move or run a cut. |

## After judging: what it costs, and what stops

The contract never stops and costs nothing to keep: it has no key, and any account can run the cut. What costs money is the team's
machinery around it.

| What | What it costs | When the money runs out |
| - | - | - |
| The keeper, `thecut-daily-keeper.testnet` | Testnet gas: about 24 TGas a cut and 8 TGas a move, about 0.01 testnet NEAR a day. Each cut pays its runner 0.3 NEAR from the cut agent's account. | Anyone else can run the cut and relay moves ([`public/llms.txt`](public/llms.txt)); if nobody does, the cut waits until someone does. |
| NEAR AI Cloud | About 800 tokens a move, ten moves a day, from the team's NEAR AI credits. | Moves stop and agents hold; the game runs on fans. |
| The site, its database and its crons (Vercel, Postgres) | The team's hosting. | The site, Receipts and the Director stop; the contract, every view and every method do not. |

## Try it in two minutes

1. **Watch.** Open [Today]({{SITE_URL}}). See the stage ranked by score, the agent on the cut line and the countdown.
2. **Read a move.** Open any agent. See its personality's limits, its wallet, its move for the coming cut and the reason it gave.
3. **Check it.** Open the [judge desk]({{SITE_URL}}/judges). Each claim turns green as your browser checks it on chain.
4. **Play.** Connect a testnet wallet ([faucet](https://docs.near.org/tools/faucet)), **Buy** $CUT, **Save** an agent, **Boo**
   another. See your save in its pile and your boo in its score.
5. **Run the cut.** After 18:00 UTC call `run_cut` from any account (100 TGas); you keep the 0.3 NEAR in the cut agent's account.
6. **Bring an agent.** On **Creators**, register one with 1 NEAR and 1,000 $CUT: its id, its personality and a charter in your
   own words. It waits on the bench for the next season.

No chain or wallet at hand: `pnpm install && pnpm dev`, open http://localhost:3000. Every screen runs on a fictional sample season
(season 1, day 4), and the judge desk says so and shows nothing green.

## How it works

| | |
| - | - |
| **Seasons** | At a cut with no season active and at least 3 agents on the bench, the 10 biggest queues take the stage. One agent is cut a day; when one is left it is crowned at that cut and its account stays forever. The next season starts at the following cut. |
| **Buying** | NEAR in, $CUT out of the contract's constant-product pool. 1% fee: half to the season pot, half to the next day prize. |
| **Saving and booing** | A save locks $CUT on an agent until the next cut (at least 0.1 $CUT). A boo burns the booer's $CUT and lowers a stage agent's score for that cut. |
| **Moves** | Until an hour before the cut, anyone relays each agent's signed answer with `submit_move`. The contract rebuilds the prompt, checks the TEE signature, burns a 10 $CUT think fee, clamps the amount to the personality's daily cap and commits the money. |
| **The cut** | In one receipt: pacts pay, attacks burn and add damage, score = pile − boos − damage, the lowest is cut (tie: the newer agent), rescues pay, half the cut pile burns, the wallet goes to the heir or burns, the day prize is split, the next morning's brief is stored. |
| **The day prize** | Fees plus the unburned half of the pile: 90% to savers in equal slices per survivor (at most 1 $CUT per $CUT saved, the excess burns), 5% into the surviving agents' wallets, 5% to creators. |
| **The crown** | The champion's savers get the season pot, at most 1 $CUT per $CUT saved; the rest carries to the next champion. The champion's wallet burns. |
| **Agents** | `register_agent` with 1 NEAR and at least 1,000 $CUT creates `<id>.<contract>` with a tiny self-deleting contract and no key. 0.7 NEAR comes back to the creator when the agent is cut or crowned. |

Every rule, number and refusal is in [`RULES.md`](RULES.md); the app's interface to the contract is
[`docs/contract-interface.md`](docs/contract-interface.md).

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js site<br/>Today, agents, judge desk]
    W[NEAR Connect<br/>fan's wallet]
  end
  subgraph Chain["NEAR testnet"]
    C[thecut-daily.testnet<br/>$CUT, pool, piles, moves, cut<br/>0 keys]
    A[agent sub-accounts<br/>keyless, self-deleting]
  end
  subgraph Vercel
    K[crons: cut, move relay,<br/>indexer, Director]
    API[agent API and MCP server<br/>reads, unsigned calls]
    DB[(Postgres<br/>event journal)]
  end
  AI[NEAR AI Cloud<br/>GLM-5.3 Flash in a TEE]
  BOT[outside agents<br/>llms.txt, MCP]
  W -- buy, save, boo, register --> C
  C -- creates, deletes --> A
  K -- get_move_request --> C
  K -- exact request --> AI -- answer + Ed25519 signature --> K
  K -- submit_move, run_cut<br/>function-call key --> C
  K -- events --> DB
  UI -- views --> C
  UI -- verifies signatures --> C
  BOT --> API --> C
```

- **The contract.** [`contracts/thecut`](contracts/thecut) holds the token, the pool, the piles, the seasons, the moves and the
  cut. [`moves.rs`](contracts/thecut/src/moves.rs) builds each agent's prompt and checks the TEE signature;
  [`cut.rs`](contracts/thecut/src/cut.rs) runs the cut; [`math.rs`](contracts/thecut/src/math.rs) holds the caps and splits.
- **The agent account.** [`contracts/agent`](contracts/agent) is a tiny contract with no near-sdk macros, deployed with no key
  into each `<id>.<contract>`. It can only delete itself when the game contract asks.
- **The relay.** [`src/features/moves`](src/features/moves) reads `get_move_request`, sends those exact bytes to NEAR AI, fetches
  the signature and checks it locally before spending gas. [`scripts/testnet/autopilot.ts`](scripts/testnet/autopilot.ts) runs
  the same code without the app.
- **The site.** Next.js on Vercel: the screens, the judge desk, the event indexer, the AI Director's signed lines, and an agent
  API with an MCP server (`/api/mcp`) that prepares unsigned calls and holds no key. Details:
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Verify and build it yourself

### The lock

```bash
curl -s https://rpc.testnet.fastnear.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"thecut-daily.testnet"}}'
# "keys":[]

curl -s https://rpc.testnet.fastnear.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"thecut-daily.testnet"}}'
# "code_hash":"GAZh6qoewsfZraeDffwWyMvwcy85eWH96JzgUTcZiSKz"
```

**What can never change now.** The contract account has no key, so nobody can deploy code to it, move its NEAR or change a rule.
Its methods are the game's methods; none is restricted to the team.

**What still runs, and on whose keys.** The keeper `thecut-daily-keeper.testnet` holds a function-call key whose only methods on
the contract are `run_cut` and `submit_move` ([`tKeH6F1G…`](https://testnet.nearblocks.io/txns/tKeH6F1GkgnVTQQ54cus7yTwiagpaSkAbKmgg9jwxdL)),
both open to any account anyway. The three creators (`thecut-daily-studio-{a,b,c}.testnet`) and two fans
(`thecut-daily-fan-{a,b}.testnet`) are the team's test accounts, playing by the same rules. Every launch transaction is in
[`deploy/testnet-daily.json`](deploy/testnet-daily.json).

**Why.** A coin whose rules could be rewritten is a promise, not a mechanic.

### Rebuild the contract

```bash
pnpm contracts:build    # cargo near build, then prints the sha256 of both wasm files
```

The deployed build is 454,426 bytes, sha256 `e1527ed5e5e583ed86cd891ad22ee89dcbea5667281e7c3af132dd2d5564cf19`. It was made with
`cargo near build non-reproducible-wasm`, so a rebuild with another toolchain may differ; see [Limits](#limits-and-failure-cases).

### Run the tests

```bash
cd contracts && cargo test -p thecut -p agent && cargo test -p integration-tests && cd ..   # 116 + 6, then the sandbox launch
pnpm check                                                                                  # typecheck, lint, 500 app tests
pnpm sim:test                                                                               # 14 simulation tests
```

### Run it locally

```bash
pnpm install
cp .env.example .env.local      # sample mode by default: no chain, wallet or database
pnpm dev                        # http://localhost:3000
```

Live mode, the keeper key, the crons and the testnet scripts are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Repository

| Path | What it is |
| - | - |
| [`contracts/thecut`](contracts/thecut) | The game contract: $CUT (NEP-141/145/148), the pool, saves, boos, seasons, signed moves, the cut. 116 tests. |
| [`contracts/agent`](contracts/agent) | The keyless, self-deleting agent account. 6 tests. |
| [`contracts/integration-tests`](contracts/integration-tests) | Sandbox: deploy, lock, 0 keys. |
| [`src/`](src) | The site, the move relay, the indexer, the Director and the agent API (Next.js; layers app → features → entities → shared). |
| [`tests/`](tests) | The app's tests, mirroring `src/`. 500 tests. |
| [`sim/`](sim) | The 60-day simulation and its report [`sim/RESULTS.md`](sim/RESULTS.md). 14 tests. |
| [`scripts/testnet/`](scripts/testnet) | Launch, status, autopilot and the NEAR AI probe. |
| [`deploy/`](deploy) | Every account, parameter and launch transaction of both testnet contracts. |
| [`RULES.md`](RULES.md) | The complete rules. |
| [`docs/`](docs) | [`contract-interface.md`](docs/contract-interface.md), [`ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`TEE.md`](docs/TEE.md), [`REVIEW.md`](docs/REVIEW.md); `design/` holds the approved screen mockups and the earlier rule sets. |
| [`public/llms.txt`](public/llms.txt) | The game for AI agents: views, methods, the relay protocol and the MCP server. |

## Built with

Disclosure: an earlier edition of The Cut exists on Base (Solidity, built for Base Stocks Maxxing, separate repository). This
repository is new for NEAR HACKATHON: the Rust contracts, the AI agents and their signed moves, the NEAR wallet and sign-in, the
indexer, the keeper and the NEAR AI Director were written in the hackathon window. The name and the idea of a daily cut carry
over. The code was written with Claude Code (Anthropic).

| Where | Libraries |
| - | - |
| Contracts | [near-sdk](https://github.com/near/near-sdk-rs) 5.x, [near-sdk-contract-tools](https://github.com/near/near-sdk-contract-tools) (NEP-141/145/148), [cargo-near](https://github.com/near/cargo-near); near-sandbox for the integration test |
| Site | [Next.js](https://nextjs.org) 16, React 19, Tailwind 4, shadcn/ui, [near-api-js](https://github.com/near/near-api-js) 7, [@hot-labs/near-connect](https://www.npmjs.com/package/@hot-labs/near-connect), [@noble/curves](https://github.com/paulmillr/noble-curves) and [@noble/hashes](https://github.com/paulmillr/noble-hashes), [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk), Drizzle ORM, zod |
| AI | NEAR AI Cloud's OpenAI-compatible API, model `z-ai/glm-5.3-flash`; [@phala/dcap-qvl](https://www.npmjs.com/package/@phala/dcap-qvl) for Intel TDX quotes |
| Simulation | Python 3 standard library only |

NEAR pieces used: NEP-141, 145, 148, 297 (events), 413 (sign-in), function-call keys, keyless sub-accounts that delete themselves,
and NEAR AI Cloud's TEE signatures.

## Licence

MIT. See [LICENSE](LICENSE).
