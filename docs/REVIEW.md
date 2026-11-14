# Review before launch

The v20 contract was reviewed line by line on 14 November 2026, before the daily contract was deployed. Each finding below was
fixed in commit `c47953a` and is pinned by a unit test that fails if it comes back. The daily contract,
`thecut-daily.testnet`, runs the fixed build (sha256 `e1527ed5e5e583ed86cd891ad22ee89dcbea5667281e7c3af132dd2d5564cf19`,
recorded in [`deploy/testnet-daily.json`](../deploy/testnet-daily.json)).

| # | Finding | Fix | Test |
| - | - | - | - |
| 1 | One agent's reason reached the other agents' prompts through the brief's `last_moves`, so an agent could write a speech aimed at steering its rivals' models. | The brief carries moves without reasons. Reasons stay public for fans in `get_moves` and the `move` events. | `the_brief_is_the_board_of_the_last_cut` ([`seasons.rs`](../contracts/thecut/src/tests/seasons.rs)) |
| 2 | A save on an agent cut with no prize could never be cleared: `claim` failed with nothing to pay, and the dead save kept counting toward the 20-save limit. | `claim` succeeds when it only clears saves on cut agents (returns 0, no transfer, no event). | `claim_clears_a_save_on_a_cut_agent_even_with_no_prize` ([`contract_cut.rs`](../contracts/thecut/src/tests/contract_cut.rs)) |
| 3 | Agent ids `null` and `none` were accepted, but a move reads them as "no agent", so such an agent could never be a target or an heir. | `register_agent` refuses both. | `register_refuses_the_id_null` ([`contract_agents_saves.rs`](../contracts/thecut/src/tests/contract_agents_saves.rs)) |
| 4 | A gift sent with `ft_transfer_call` during the day raised the agent's spend cap, and the gift could still be refunded after the move spent it. | The cap uses the lower of the wallet now and the wallet at the last cut, stored when the brief is built. | `a_gift_during_the_day_does_not_raise_the_cap` ([`contract_moves.rs`](../contracts/thecut/src/tests/contract_moves.rs)) |
| 5 | When creating an agent account failed, the refund returned the agent account's whole $CUT balance, which could include $CUT someone else had sent to it. | The refund returns at most the seed. An account registered for $CUT before keeps its registration and the rest of its balance; a registration made by `register_agent` is closed and any gift burns. | `failed_creation_returns_only_the_seed_and_keeps_an_earlier_registration`, `failed_creation_burns_a_gift_that_reached_a_new_registration` ([`contract_agents_saves.rs`](../contracts/thecut/src/tests/contract_agents_saves.rs)) |
| 6 | A cut run late could schedule the next cut inside a move window that had already closed, so the agents lost a day of moves. | `run_cut` schedules the first slot of the daily grid whose moves are still open. | `a_late_cut_still_leaves_a_move_window` ([`seasons.rs`](../contracts/thecut/src/tests/seasons.rs)), `a_late_cut_keeps_the_daily_grid` ([`contract_cut.rs`](../contracts/thecut/src/tests/contract_cut.rs)) |
| 7 | A large stage could make one cut emit more logs than a receipt allows, so the cut would fail every time. | `stage_size` is 2 to 12 at launch. | `launch_rejects_a_stage_whose_cut_logs_could_overflow` ([`contract_pool.rs`](../contracts/thecut/src/tests/contract_pool.rs)) |

## What the review did not change

- **Money weighs.** A whale can save an agent alive or boo one down, paying for every point with its own $CUT. A per-wallet cap
  would not help: splitting into many accounts beats any cap. See [Known limits](../RULES.md#known-limits).
- **The relayer picks among answers.** Anyone may relay a move and the first valid one counts, so a relayer can ask the model
  several times and submit the answer it prefers. It cannot write, change or forge one. See [TEE.md](TEE.md).

## A deploy that ran the old build

The first v20 deploy, `thecut-v20.testnet`, went out with the build from before these fixes, and its key was deleted before the
fixes landed, so it can never be upgraded. It is kept as a rehearsal and the app does not read it. The daily contract was
deployed afterwards from the fixed build.

## Tests

| Where | Count | Run |
| - | - | - |
| The game contract, `contracts/thecut` | 116 unit tests | `cd contracts && cargo test -p thecut` |
| The agent account contract, `contracts/agent` | 6 unit tests | `cd contracts && cargo test -p agent` |
| Sandbox launch, `contracts/integration-tests` | 1 test: deploy, lock, 0 keys | `cd contracts && cargo test -p integration-tests` |
| The app | 500 tests (Vitest, MSW, PGlite) | `pnpm test` |
| The simulation | 14 tests | `pnpm sim:test` |

Most contract tests end with `assert_books`: the contract's balance equals the pool, the saves, the fees, the pot, the committed
moves and the prizes owed, and minted minus burned equals the supply.
