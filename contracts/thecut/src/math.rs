//! Pure math for the pool, the cut, the prize split and the move limits.
//!
//! Every function is free of `env` calls so it can be unit-tested on its own, and every
//! function returns `None` instead of overflowing. Products of two `u128` go through a
//! 256-bit intermediate, so `a * b / c` never overflows before the division.
//! All divisions round down, which always favors the contract (the pool keeps the
//! remainder, prize payouts never exceed what was allocated).

#[allow(clippy::manual_div_ceil)]
mod wide {
    uint::construct_uint! {
        /// 256-bit unsigned integer for intermediate products.
        pub struct U256(4);
    }
}
pub use wide::U256;

/// Basis points in one whole.
pub const BPS: u128 = 10_000;

/// Fixed-point scale of the reward-per-unit accumulator (1e24).
pub const ACC_SCALE: u128 = 1_000_000_000_000_000_000_000_000;

/// `floor(a * b / c)`, or `None` if `c == 0` or the result does not fit in `u128`.
pub fn mul_div(a: u128, b: u128, c: u128) -> Option<u128> {
    if c == 0 {
        return None;
    }
    let result = U256::from(a) * U256::from(b) / U256::from(c);
    if result > U256::from(u128::MAX) {
        None
    } else {
        Some(result.as_u128())
    }
}

/// `floor(amount * bps / 10_000)`. Never larger than `amount` when `bps <= 10_000`.
pub fn bps_of(amount: u128, bps: u16) -> Option<u128> {
    mul_div(amount, u128::from(bps), BPS)
}

/// Result of swapping NEAR for $CUT.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BuyQuote {
    /// $CUT that leaves the pool reserve.
    pub gross_out: u128,
    /// Part of `gross_out` kept as the fee for the next prize.
    pub fee: u128,
    /// $CUT the buyer receives: `gross_out - fee`.
    pub amount_out: u128,
}

/// Constant-product buy: `gross_out = cut_reserve * near_in / (near_reserve + near_in)`.
/// The fee is taken in $CUT from the output.
pub fn quote_buy(
    near_reserve: u128,
    cut_reserve: u128,
    near_in: u128,
    fee_bps: u16,
) -> Option<BuyQuote> {
    let denominator = near_reserve.checked_add(near_in)?;
    let gross_out = mul_div(cut_reserve, near_in, denominator)?;
    let fee = bps_of(gross_out, fee_bps)?;
    let amount_out = gross_out.checked_sub(fee)?;
    Some(BuyQuote {
        gross_out,
        fee,
        amount_out,
    })
}

/// Result of swapping $CUT for NEAR.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SellQuote {
    /// Part of the $CUT sold kept as the fee for the next prize.
    pub fee: u128,
    /// $CUT that enters the pool reserve: `cut_in - fee`.
    pub net_in: u128,
    /// NEAR (yocto) the seller receives.
    pub near_out: u128,
}

/// Constant-product sell. The fee is taken in $CUT from the input, then
/// `near_out = near_reserve * net_in / (cut_reserve + net_in)`.
pub fn quote_sell(
    near_reserve: u128,
    cut_reserve: u128,
    cut_in: u128,
    fee_bps: u16,
) -> Option<SellQuote> {
    let fee = bps_of(cut_in, fee_bps)?;
    let net_in = cut_in.checked_sub(fee)?;
    let denominator = cut_reserve.checked_add(net_in)?;
    let near_out = mul_div(near_reserve, net_in, denominator)?;
    Some(SellQuote {
        fee,
        net_in,
        near_out,
    })
}

/// Splits a trade fee into the season pot part and the day prize part.
/// Returns `(to_pot, to_prize)`.
pub fn fee_split(fee: u128, pot_bps: u16) -> Option<(u128, u128)> {
    let to_pot = bps_of(fee, pot_bps)?;
    Some((to_pot, fee.checked_sub(to_pot)?))
}

/// Splits a cut pile into the part that burns and the part that joins the prize.
/// Returns `(burned, to_prize)`.
pub fn burn_part(pile: u128, burn_bps: u16) -> Option<(u128, u128)> {
    let burned = bps_of(pile, burn_bps)?;
    Some((burned, pile.checked_sub(burned)?))
}

/// How one day prize is cut into equal slices.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PrizeSplit {
    /// `prize * savers_bps / 10_000`: the savers' share.
    pub savers_total: u128,
    /// `prize * agents_bps / 10_000`: the agents' share.
    pub agents_total: u128,
    /// The rest: the creators' share.
    pub creators_total: u128,
    /// One savers' slice per surviving agent (before the per-pile cap).
    pub slice: u128,
    /// $CUT into each surviving agent's wallet.
    pub agent_slice: u128,
    /// One creator slice per surviving agent.
    pub creator_slice: u128,
    /// Rounding remainder, carried into the next prize so no $CUT goes missing.
    pub dust: u128,
}

/// Cuts `prize` into one equal savers' slice, one equal agent slice and one equal creator
/// slice per survivor. `savers_bps + agents_bps` must be at most 10,000.
pub fn split_prize(
    prize: u128,
    savers_bps: u16,
    agents_bps: u16,
    survivors: u32,
) -> Option<PrizeSplit> {
    if survivors == 0 {
        return None;
    }
    let n = u128::from(survivors);
    let savers_total = bps_of(prize, savers_bps)?;
    let agents_total = bps_of(prize, agents_bps)?;
    let creators_total = prize.checked_sub(savers_total)?.checked_sub(agents_total)?;
    let slice = savers_total / n;
    let agent_slice = agents_total / n;
    let creator_slice = creators_total / n;
    let paid = slice
        .checked_add(agent_slice)?
        .checked_add(creator_slice)?
        .checked_mul(n)?;
    let dust = prize.checked_sub(paid)?;
    Some(PrizeSplit {
        savers_total,
        agents_total,
        creators_total,
        slice,
        agent_slice,
        creator_slice,
        dust,
    })
}

/// Caps a payout to a pile at one $CUT per $CUT saved. Returns `(paid, excess)`: an empty
/// pile pays nothing and the whole amount is excess.
pub fn cap_to_pile(amount: u128, pile: u128) -> (u128, u128) {
    let paid = amount.min(pile);
    (paid, amount - paid)
}

/// Most an agent may commit in one move: `floor(spendable * spend_bps / 10_000)`, where
/// `spendable` is its wallet after the think fee.
pub fn spend_cap(spendable: u128, spend_bps: u16) -> Option<u128> {
    bps_of(spendable, spend_bps)
}

/// An agent's score at the cut: `pile - boos - damage`, signed.
pub fn score(pile: u128, boos: u128, damage: u128) -> Option<i128> {
    let pile = i128::try_from(pile).ok()?;
    let boos = i128::try_from(boos).ok()?;
    let damage = i128::try_from(damage).ok()?;
    pile.checked_sub(boos)?.checked_sub(damage)
}

/// Increase of an agent's reward-per-unit accumulator when its pile receives `amount`.
/// `None` when the pile is empty.
pub fn reward_increment(amount: u128, pile: u128) -> Option<u128> {
    mul_div(amount, ACC_SCALE, pile)
}

/// Prize earned by `amount` saved since the accumulator was at `snapshot`.
pub fn pending_reward(amount: u128, acc_now: u128, snapshot: u128) -> Option<u128> {
    mul_div(amount, acc_now.checked_sub(snapshot)?, ACC_SCALE)
}

/// The first scheduled cut time strictly after `now`, on the grid `at + k * interval`
/// with `k >= 1`. A cut that runs late does not shift the schedule, and missed cuts
/// are skipped (one cut per `run_cut`).
pub fn next_cut_after(at: u64, interval: u64, now: u64) -> Option<u64> {
    if interval == 0 {
        return None;
    }
    let steps = now.saturating_sub(at) / interval + 1;
    at.checked_add(steps.checked_mul(interval)?)
}

/// An agent as seen by the cut and seat rules.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Contender {
    /// Its score (stage) or its queue (bench).
    pub score: i128,
    /// Registration order: a higher `seq` is a newer agent.
    pub seq: u64,
}

/// Whether `a` would be cut before `b`: lower score first, and on a tie the newer agent.
fn cut_before(a: Contender, b: Contender) -> bool {
    a.score < b.score || (a.score == b.score && a.seq > b.seq)
}

/// Index of the agent the cut deletes: the lowest score; on a tie, the newer agent.
pub fn pick_lowest(agents: &[Contender]) -> Option<usize> {
    let mut best: Option<usize> = None;
    for (i, agent) in agents.iter().enumerate() {
        match best {
            Some(b) if !cut_before(*agent, agents[b]) => {}
            _ => best = Some(i),
        }
    }
    best
}

/// Index of the bench agent that takes a seat: the biggest queue; on a tie, the older agent.
pub fn pick_biggest(agents: &[Contender]) -> Option<usize> {
    let mut best: Option<usize> = None;
    for (i, agent) in agents.iter().enumerate() {
        match best {
            Some(b)
                if !(agent.score > agents[b].score
                    || (agent.score == agents[b].score && agent.seq < agents[b].seq)) => {}
            _ => best = Some(i),
        }
    }
    best
}

/// Score the lowest agent needs to gain so that another agent becomes the one cut.
/// `next` is the agent that would be cut if `lowest` were gone.
pub fn gap_to_next(lowest: Contender, next: Contender) -> u128 {
    let diff = next.score.saturating_sub(lowest.score).max(0) as u128;
    // On equal scores the newer agent is cut, so a newer `lowest` needs one unit more.
    if lowest.seq > next.seq {
        diff.saturating_add(1)
    } else {
        diff
    }
}
