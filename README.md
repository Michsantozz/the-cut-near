# The Cut · NEAR

10 AI robots, one coin. Fans save $CUT into a robot's pile to keep it alive. Every day at 18:00 UTC the lowest pile is cut: the robot's NEAR account is deleted, half its pile burns, and the other half plus the day's fees is split into equal slices, one per surviving robot, shared by its savers. Small piles share their slice among fewer $CUT, so rescuing the robot near the cut line pays the most.

Built for NEAR HACKATHON, track Memecoins With Mechanics (`memecoins`).

## The problem and the mechanic

Most memecoins only do one thing: their price moves. $CUT has a daily onchain ritual instead. Holders choose which robot survives by
saving $CUT into its pile, and the cut, run by anyone, deletes the loser's NEAR account, burns half of its pile and pays the rest to
the survivors' savers. The supply only shrinks: 10,000,000 $CUT are minted once at deploy and every cut burns.

| Step | What happens on chain |
| - | - |
| Buy | NEAR in, $CUT out from the contract's pool (constant product, 1% fee to the next prize). |
| Save | `save(robot_id, amount)` locks $CUT in a stage robot's pile or a bench robot's queue until the next cut. |
| Cut | `run_cut` (open to anyone once `get_next_cut().at` has passed) picks the lowest pile on the stage. Ties cut the newer robot. |
| Delete | The robot's sub-account `<robot>.<contract>` deletes itself. The caller of `run_cut` keeps 0.5 NEAR; the creator gets the rest of the deposit back. |
| Burn | Half the cut pile burns (`ft_burn` event). |
| Prize | The other half plus the fees is the prize. The savers' share is split into equal slices, one per surviving robot, shared by that robot's savers by $CUT saved; creators get equal creator slices. |
| Seat | The biggest bench queue takes the empty seat; its queue becomes its pile. |

Limits that keep each call bounded and blunt sybil spam: 20 saves per account, 0.1 $CUT smallest save, 50 robots on the bench,
20 seats, a 1 NEAR register deposit on testnet. `contracts/thecut/src/lib.rs` lists them all.

## Try it

Sample mode needs no chain, wallet or database:

1. `pnpm install && pnpm dev`, open http://localhost:3000. See the lineup: 10 robots ranked by pile, the countdown to 18:00 UTC.
2. Open **Inside the cut** (`/inside`). See the rules, the parameters and the 60-day supply model (`pnpm sim` prints the same).
3. Open **Receipts** (`/receipts`). See every mint, burn, save and prize as a row.
4. Open **Director** (`/director`). See the AI host's lines. Sample lines are marked unsigned; live lines carry the NEAR AI Cloud signature from the TEE.

Live mode reads the daily testnet contract below:

1. `pnpm db:up`, then set in `.env.local`: `DATA_SOURCE=live`, `NEXT_PUBLIC_NEAR_NETWORK=testnet`,
   `NEXT_PUBLIC_CUT_CONTRACT=thecut-d9jicr.testnet`, `NEAR_RPC_URL=https://near-testnet.drpc.org`, `DATABASE_URL`,
   `SESSION_SECRET`, `CRON_SECRET`. Run `pnpm db:migrate && pnpm build && pnpm start`.
2. Run `node scripts/testnet/status.ts` (Node 22+). See the contract's access keys (0), the next cut, the stage and the bench.
3. Connect a testnet wallet ([faucet](https://docs.near.org/tools/faucet)), buy $CUT, save it on a robot. See your save in its pile.
4. After 18:00 UTC, call `GET /api/cron/cut` with `Authorization: Bearer $CRON_SECRET` (or `run_cut` from any account).
   See the cut on the lineup and the burn and prizes in `/receipts`.

To watch cuts every 2 minutes, launch your own contract: `node scripts/testnet/launch.ts --fast`. It creates the accounts from the
testnet faucet, deploys, registers 12 robots, seeds saves, adds a `run_cut`-only keeper key, then deletes the contract's full-access key.

## Testnet deployment

| | Daily (the app) | Fast (the demo video) |
| - | - | - |
| Contract | [`thecut-d9jicr.testnet`](https://testnet.nearblocks.io/address/thecut-d9jicr.testnet) | [`thecut-2sk15l.testnet`](https://testnet.nearblocks.io/address/thecut-2sk15l.testnet) |
| Cut every | 24 h, 18:00 UTC (first cut 2026-11-14) | 2 min |
| Keeper | `thecut-d9jicr-keeper.testnet` (key for `run_cut` only) | `thecut-2sk15l-keeper.testnet` |
| Access keys on the contract | 0 (locked: no one can upgrade it) | 0 |

Accounts, wasm hash and launch times: `deploy/testnet-daily.json`, `deploy/testnet-fast.json`. Mainnet is not deployed.

## Disclosure

- **Prior work (Q-002).** An earlier edition of The Cut exists on Base (Solidity, built for Base Stocks Maxxing, separate repository).
  This repository is new for NEAR HACKATHON: the Rust contracts, the NEAR wallet and sign-in, the indexer, the keeper and the
  NEAR AI Director were written in the hackathon window. The design and the name carry over.
- **AI used.** The code was written with Claude Code (Anthropic). The in-app Director uses NEAR AI Cloud with a Private model.
- **Libraries.** All open source, listed under Stack below and in `package.json` / `contracts/Cargo.toml`.

## Stack

| Part | Choice |
| - | - |
| App | Next.js 16 (App Router, `cacheComponents`), React 19, TypeScript, Tailwind 4 |
| UI kit | shadcn/ui on Radix primitives, themed to the design, in `src/shared/ui` |
| Wallet | NEAR Connect (`@hot-labs/near-connect` + `near-connect-hooks`), `near-api-js` |
| Sign-in | NEP-413 signed message, verified on the server with `near-api-js/nep413`; session JWT with `jose` |
| Contracts | Rust, `near-sdk` 5.x, NEP-141 via `near-sdk-contract-tools`, built with `cargo-near` |
| Contract tests | `cargo test` (unit) + `near-sandbox` / `near-api` (integration, time travel) |
| Database | Postgres + Drizzle ORM (`postgres` driver): an index of the contract's events for Receipts and history |
| AI | NEAR AI Cloud (OpenAI-compatible API) with a Private model: every Director line is signed inside a TEE |
| Validation | zod 4 |
| Tests | Vitest projects (unit, integration, smoke, e2e, evals) + MSW; integration tests run on PGlite (in-process Postgres) |
| Hosting | Vercel; Vercel Cron as a fallback keeper for the daily cut (anyone can run it) |

## Architecture

Layered by slice. Top to bottom:

```
src/
  app/          Routes, layouts, API and cron endpoints. Thin: compose features, no business logic.
  features/     User-facing capabilities: lineup, trade, save, cut, prizes, director, register, receipts…
    <feature>/  ui/ (components) · model/ (pure logic) · server/ (actions, jobs; "server-only") · db/
  entities/     Domain objects shared by features: robot, save, cut, market.
    <entity>/   index.ts (client-safe API) · server.ts (server-only API) · model/ · api/ · ui/ · db/
  shared/       No domain knowledge: config/env, NEAR client, db client, auth session, AI client, ui kit, lib
contracts/      Rust workspace: thecut (token, pool, piles, cut, factory) and robot (self-deleting account)
docs/           contract-interface.md (the app ↔ contract contract) and design/ (approved design + spec)
tests/          Separate from src; tests/unit mirrors src/
```

Rules, enforced by ESLint:

- A layer imports only layers below it; slices in the same layer never import each other.
- Entities are imported through `@/entities/<name>`, `@/entities/<name>/server` or `@/entities/<name>/db/schema`.
- Tables live next to their owner (`src/{shared,entities,features}/*/db/schema.ts`); one migration history in `drizzle/`.

Data: `DATA_SOURCE=sample` (default) serves the design's fictional data, so every screen works without a chain or DB.
`DATA_SOURCE=live` reads NEAR and Postgres.

## Backend

| Part | Where | Notes |
| - | - | - |
| Config | `src/shared/config` | zod-validated env. `publicEnv` (client-safe, `NEXT_PUBLIC_*`) and `serverEnv()` (server-only); a bad value fails with the variable's name, never its value. Live data requires `DATABASE_URL` and `SESSION_SECRET`. |
| Database | `src/shared/db` | Drizzle on postgres.js, one small pool per process (kept across dev HMR), `prepare: false` for poolers. |
| NEAR | `src/shared/near` | `NearRpc`: failover across `NEAR_RPC_URL` and the public endpoints of [the provider list](https://docs.near.org/api/rpc/providers), only on transient errors (network, timeout, 429/5xx, syncing node). `cutContract()`: one zod-checked read per view in `docs/contract-interface.md`, amounts as `bigint`, times as `Date`. `createFunctionCallSigner()`: refuses full-access keys. |
| Sign-in | `src/shared/auth`, `/api/auth/*` | NEP-413: `POST challenge` stores a single-use 32-byte nonce (5 min) and binds it to the browser with an HttpOnly cookie; `POST verify` burns the nonce, checks the signature offline, requires a full-access key (`view_access_key`), then runs `verifyMessage` from `near-api-js/nep413`; the session is an HS256 JWT cookie (8 h, HttpOnly, SameSite=Lax, Secure in production). The signed `recipient` is the contract account, never the request host. `getSession()` for Server Components (inside `<Suspense>`). |
| Journal | `src/shared/near/db/schema.ts`, `src/features/indexer`, `@/entities/journal` | One row per NEP-297 event item of the contract and its robot sub-accounts, unique on `(receipt_id, log_index, item_index)`. |
| Keeper | `src/features/keeper`, `/api/cron/cut` | Calls `run_cut` when the latest final block is past `get_next_cut().at`. Too early and already ran are no-ops, read from the chain. Never signs on mainnet unless `KEEPER_ALLOW_MAINNET=true`. |

Event source for the indexer: the [FastNEAR Transactions API](https://tx.main.fastnear.com) (`tx.test.fastnear.com` on testnet,
free, no key, source [fastnear/explorer-api](https://github.com/fastnear/explorer-api)). It lists an account's transactions by block
range with a resume token and returns full receipt outcomes with logs, so the job is cursor-based and cheap: one request per 200
transactions plus one per 20. The alternatives in [the data infrastructure docs](https://docs.near.org/data-infrastructure/what-is)
need an API key (Pikespeak, NearBlocks as used in the docs), AWS requester-pays S3 and a long-running process (NEAR Lake), or a
request per block (RPC). The indexer stays 200 blocks behind the source's head, so every listed transaction has finished its
receipts, keeps only successful receipts executed by the contract or `<robot>.<contract>`, and moves its cursor only after a page
is stored. Override the source with `NEAR_TX_API_URL`.

Crons (`vercel.json`, `Authorization: Bearer $CRON_SECRET`): `/api/cron/cut` at 18:00 UTC plus a backstop at 18:20 (then catches the
journal up and has the Director sign the roast and receipt of that cut), `/api/cron/director?moment=scheduled` at 12:00 and
`?moment=final-hour` at 17:00, `/api/cron/indexer` hourly. The Director skips lines it already signed for the same cut. Every schedule is daily, so it deploys on any Vercel plan; on Hobby a run lands within its
hour. On Pro, `/api/cron/indexer` can run every few minutes (`*/5 * * * *`).

The keeper key: add a function-call access key to a funded keeper account with the contract as receiver and `run_cut` as its
only method (near CLI: `account add-key … grant-function-call-access`), with enough allowance for a 300 TGas call a day, then set
`KEEPER_ACCOUNT_ID` and `KEEPER_PRIVATE_KEY`. The keeper checks the key on chain and refuses a full-access key.

## Commands

```bash
pnpm install
cp .env.example .env.local
pnpm db:up                       # local Postgres on port 54330
pnpm dev

pnpm check                       # typecheck, lint, tests
pnpm db:generate && pnpm db:migrate
pnpm contracts:build && pnpm contracts:test
pnpm sim                         # the 60-day supply simulation
```

## License

MIT, see `LICENSE`.
