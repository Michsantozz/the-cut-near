# Contract interface

The shared contract between `contracts/` and the app. Agents build against this file in parallel.
Change it only together with both sides. Rules and numbers come from `docs/design/SPEC-v19.md`.

## Accounts

| Account | What it is |
| - | - |
| `thecut.near` / `thecut.testnet` | Main contract: the $CUT token (NEP-141), the NEAR/$CUT pool, piles, bench, the daily cut, prizes and the robot factory. |
| `<id>.thecut.near` | One per robot. Created by the main contract with the `robot` contract deployed and no access keys. Only the main contract can make it delete itself. |

After deploy and `new`, every full-access key on the main account is deleted. Nobody can change code or parameters.

## Units

- $CUT has 18 decimals. Amounts cross the JSON boundary as decimal strings (`U128`).
- NEAR amounts are yoctoNEAR strings (`U128`, NearToken).
- Times are nanoseconds since the Unix epoch as strings (`U64`), from `env::block_timestamp()`.
- Basis points (`bps`) are integers out of 10,000.

## Parameters (set once in `new`, read with `get_params`)

| Field | Mainnet | Testnet |
| - | - | - |
| `total_supply` | 10,000,000 $CUT | same |
| `fee_bps` | 100 (1% on every buy and sell, to the next prize) | same |
| `burn_bps` | 5000 (half the cut pile burns) | same |
| `savers_bps` | 9500 (95% of the prize to savers, 5% to creators) | same |
| `stage_size` | 10 | same |
| `first_cut_at` | first 18:00 UTC at least 24 h after launch | launch + 2 min |
| `cut_interval` | 86,400 s | 120 s |
| `robot_funding` | 0.5 NEAR (left in the robot account; the cut runner receives it) | same |
| `register_deposit` | 5 NEAR (0.5 funds the robot account, 4.5 back when it leaves) | same |
| `pool_cut_reserve` / `pool_near_reserve` | initial liquidity, set in `new` | small |

## Robots

`RobotView`: `{ id, account_id, name, kind, x_handle, creator, status: "stage" | "bench" | "deleted", pile: U128, savers: u32, joined_at: U64 }`.
On the bench, `pile` is the robot's queue.

## View methods

| Method | Returns |
| - | - |
| `get_params()` | `Params` (table above) |
| `get_stage()` | `RobotView[]` sorted by pile, highest first |
| `get_bench()` | `RobotView[]` sorted by queue, highest first |
| `get_robot({ id })` | `RobotView \| null` |
| `get_saves({ account_id })` | `{ robot_id, amount: U128, since_cut: u64 }[]` |
| `get_pool()` | `{ near_reserve: U128, cut_reserve: U128, fee_bps }` |
| `quote_buy({ near_in })` / `quote_sell({ cut_in })` | `{ amount_out: U128, fee: U128 }` |
| `get_next_cut()` | `{ index: u64, at: U64, lowest_id, gap_to_next: U128, prize_so_far: U128 }` |
| `get_cut({ index })` | `CutRecord \| null`: `{ index, at, deleted_id, pile, burned, prize, slice, creator_slice, joined_id, runner }` |
| `get_claimable({ account_id })` | `U128`: prizes not yet collected |
| `ft_balance_of`, `ft_total_supply`, `ft_metadata` | NEP-141 standard |

## Change methods

| Method | Who | What it does |
| - | - | - |
| `buy({ min_out })`, payable | anyone | Swaps attached NEAR for $CUT in the pool. 1% fee goes to the next prize. |
| `sell({ cut_in, min_out })` | holder | Swaps $CUT for NEAR. 1% fee goes to the next prize. |
| `save({ robot_id, amount })` | holder | Locks $CUT into a stage pile or a bench queue until the next cut. |
| `unsave({ robot_id })` | saver | Takes back a save on a survivor or a queue that did not get in. Only after the cut it was locked for. |
| `run_cut()` | anyone | Refused before `at`. Cuts the lowest pile (tie: newer robot), burns half, splits the prize, deletes the robot account (beneficiary = caller, who keeps 0.5 NEAR), moves the biggest bench queue onto the stage. |
| `claim()` | anyone | Sends the caller's prizes. |
| `register_robot({ id, name, kind, x_handle })`, payable 5 NEAR | creator | Creates `<id>.thecut.near`, deploys `robot`, puts it on the bench. |

Prize split at each cut: `prize = pile / 2 + fees since the last cut`.
`savers_bps` of it is cut into one equal slice per surviving stage robot. Each slice is shared by that robot's savers, pro rata by $CUT saved.
The rest is cut into equal creator slices. A survivor with an empty pile burns its slice.

## Events (NEP-297, `standard: "thecut"`, `version: "1.0.0"`)

`ft_mint` and `ft_burn` follow NEP-141. Ours: `buy`, `sell`, `fee`, `save`, `unsave`, `cut`, `delete`, `prize`, `join`, `register`.
Each `data` item carries the account, robot id, amounts as strings and the cut index where it applies.
The app's Receipts page and the indexer read these events. They are the public log the track asks for.
