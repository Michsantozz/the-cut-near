## Project rules

- Architecture and import rules are in README.md (app → features → entities → shared). ESLint enforces them.
- Tests live in `tests/`, never next to source files; `tests/unit` mirrors `src/`.
- `docs/contract-interface.md` is the contract between `contracts/` and the app. Change it only together with both sides.
- Rules, numbers and copy come from `docs/design/SPEC-v19.md` (on top of `SPEC-v18.md`). Screens match `docs/design/source/<Screen>.dc.html`.
- UI components come from shadcn/ui in `src/shared/ui` (add with `pnpm dlx shadcn@latest add <name>`), themed to the design. Do not add another component library.
- Wallets: NEAR Connect only (`@hot-labs/near-connect`, `near-connect-hooks`). NEAR Wallet Selector is deprecated: never add it.
- AI: NEAR AI Cloud with a Private model only, so lines are signed inside a TEE. No other AI provider.
- Read `node_modules/next/dist/docs/` for any Next.js API you use (Next 16, `cacheComponents` is on).
- Never add a migration by hand or in parallel branches: change `db/schema.ts`, then run `pnpm db:generate` once on main.
- Secrets live in env vars, never in the repo. Never deploy to mainnet, sign mainnet transactions or make the repo public without the human.
- All code, comments, docs and commit messages in English.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
