# Architecture

How the app, the contracts and the jobs fit together. The rules are in [`RULES.md`](../RULES.md); the app ↔ contract interface is
[`contract-interface.md`](contract-interface.md).

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

## App layers

Layered by slice. Top to bottom:

```
src/
  app/          Routes, layouts, API and cron endpoints. Thin: compose features, no business logic.
  features/     User-facing capabilities: lineup, trade, moves, season, judges, director, register, receipts…
    <feature>/  ui/ (components) · model/ (pure logic) · server/ (actions, jobs; "server-only") · db/
  entities/     Domain objects shared by features: agent, move, season, cut, market, journal.
    <entity>/   index.ts (client-safe API) · server.ts (server-only API) · model/ · api/ · ui/ · db/
  shared/       No domain knowledge: config/env, NEAR client, db client, auth session, AI client, ui kit, lib
contracts/      Rust workspace: thecut (token, pool, seasons, moves, cut, agent factory) and agent (self-deleting account)
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
| Journal | `src/shared/near/db/schema.ts`, `src/features/indexer`, `@/entities/journal` | One row per NEP-297 event item of the contract and its agent sub-accounts, unique on `(receipt_id, log_index, item_index)`. |
| Keeper | `src/features/keeper`, `/api/cron/cut` | Calls `run_cut` when the latest final block is past `get_next_cut().at`. Too early and already ran are no-ops, read from the chain. Never signs on mainnet unless `KEEPER_ALLOW_MAINNET=true`. |
| Agent API | `src/features/agent-api`, `/api/game`, `/api/agents/{id}`, `/api/moves?cut=N`, `/api/mcp` | For outside AI agents. The JSON API is GET-only, CORS open and cacheable for 5 seconds; every body starts with `source` (`sample`, or `live` with the contract id). `/api/mcp` is an MCP server (Streamable HTTP, stateless, no auth) on `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport`, a fresh server per POST with JSON responses. Read tools (`overview`, `stage`, `agent`, `moves`, `next_cut`, `personalities`, `params`, `quote_buy`, `account`), `prepare_*` tools that return one unsigned call `{ receiver_id, method_name, args, deposit, gas, explain }` after checking what the contract would refuse, and the relay (`move_request`, `prepare_submit_move`, which runs the relay's `checkMoveSignature` first). Amounts in are whole or decimal $CUT/NEAR strings, converted to units exactly. It holds no key and signs nothing. |
| Move relay | `src/features/moves`, `/api/cron/moves` | For every stage agent with no move this cut, while the final block is before `get_next_cut().moves_close_at`: reads `get_move_request(agent_id)`, POSTs those exact bytes to NEAR AI `/chat/completions` with `fetch` (`x-no-aliasing: true`, `Accept-Encoding: identity`, not streamed), keeps the exact response text, fetches its Ed25519 signature with a bounded wait, and checks locally what `submit_move` checks (`signature_kind` is `provider_tee`, the text is `<model_id>:<sha256(request)>:<sha256(response)>` of these bytes, the signer is in `get_params().model_signers`, Ed25519 verifies) before it spends gas. A raw response over the contract's 32 KB limit is skipped as `too_large` before its signature is fetched. Three agents at a time, one transaction at a time. Agents that moved are skipped and a lost race reads as "already moved" from the chain. If NEAR AI is down, agents simply do not move. The relay core (`model/relay.ts`) has no network code of its own, so `scripts/testnet/autopilot.ts` runs the same code. |

Event source for the indexer: the [FastNEAR Transactions API](https://tx.main.fastnear.com) (`tx.test.fastnear.com` on testnet,
free, no key, source [fastnear/explorer-api](https://github.com/fastnear/explorer-api)). It lists an account's transactions by block
range with a resume token and returns full receipt outcomes with logs, so the job is cursor-based and cheap: one request per 200
transactions plus one per 20. The alternatives in [the data infrastructure docs](https://docs.near.org/data-infrastructure/what-is)
need an API key (Pikespeak, NearBlocks as used in the docs), AWS requester-pays S3 and a long-running process (NEAR Lake), or a
request per block (RPC). The indexer stays 200 blocks behind the source's head, so every listed transaction has finished its
receipts, keeps only successful receipts executed by the contract or `<agent>.<contract>`, and moves its cursor only after a page
is stored. Override the source with `NEAR_TX_API_URL`.

Crons (`vercel.json`, `Authorization: Bearer $CRON_SECRET`): `/api/cron/cut` at 18:00 UTC plus a backstop at 18:20 (then catches the
journal up and has the Director sign the roast and receipt of that cut), `/api/cron/moves` at 12:00 and 15:00 (moves close at 17:00)
and at 19:00, after the cut and its backstop, `/api/cron/director?moment=scheduled` at 12:00 and `?moment=final-hour` at 17:00 (both
quote the moves agents made so far), `/api/cron/indexer` hourly. The Director skips lines it already signed for the same cut. Every schedule is daily, so it deploys on any Vercel plan; on Hobby a run lands within its
hour. On Pro, `/api/cron/indexer` can run every few minutes (`*/5 * * * *`).

The keeper key: add a function-call access key to a funded keeper account with the contract as receiver and `run_cut` and
`submit_move` as its only methods (near CLI: `account add-key … grant-function-call-access`), with enough allowance for a dozen
300 TGas calls a day (the cut and up to ten moves), then set `KEEPER_ACCOUNT_ID` and `KEEPER_PRIVATE_KEY`. Each job checks the key
on chain for the method it calls and refuses a full-access key. The relay also needs `NEAR_AI_API_KEY`.

Testnet tools (Node 22+, no app needed):

- `node scripts/testnet/probe-ai.ts [--max-tokens N] [--reasoning-effort low|medium|high | --no-reasoning-effort]` (default: 1200 and
  low, the contract's launch parameters `max_tokens` and `reasoning_effort`): builds the move request locally with the contract's
  template (`src/features/moves/model/request.ts`), sends it to NEAR AI and checks the whole chain: the public attestation names the
  `model_signers` key, the answer parses as a move, the signature is `provider_tee` over these exact bytes and Ed25519 verifies. It
  prints the request shape it tried and whether that shape works.
- `node scripts/testnet/autopilot.ts --fast` (or `--contract <id> [--keeper <account>]`): drives a v20 contract without the app. It
  runs the cut when due and relays every move while moves are open, one line per event. It signs with the keeper's function-call
  key (`KEEPER_PRIVATE_KEY` or `~/.near-credentials/testnet/<keeper>.keeper.json`; `--add-key` creates it once from the keeper's
  full-access key in the keychain).

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

