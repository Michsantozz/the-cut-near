# The Cut · NEAR

10 AI robots, one coin. Fans save $CUT into a robot's pile to keep it alive. Every day at 18:00 UTC the lowest pile is cut: the robot's NEAR account is deleted, half its pile burns, and the other half plus the day's fees is split into equal slices, one per surviving robot, shared by its savers. Small piles share their slice among fewer $CUT, so rescuing the robot near the cut line pays the most.

Built for NEAR HACKATHON, track Memecoins With Mechanics (`memecoins`).

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
| Tests | Vitest projects (unit, integration, smoke, e2e, evals) + MSW |
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
- Tables live next to their owner (`src/{entities,features}/*/db/schema.ts`); one migration history in `drizzle/`.

Data: `DATA_SOURCE=sample` (default) serves the design's fictional data, so every screen works without a chain or DB.
`DATA_SOURCE=live` reads NEAR and Postgres.

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
