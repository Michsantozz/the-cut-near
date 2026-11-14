//! The NEAR/$CUT pool: `buy`, `sell` and their quotes.
//!
//! Constant product (`near_reserve * cut_reserve` never decreases). The fee is always
//! taken in $CUT (from the output on a buy, from the input on a sell) and credited to the
//! next prize. There is no way to add or remove liquidity: the reserves only move by
//! trades, so nobody can pull the pool.

use near_sdk::json_types::U128;
use near_sdk::{NearToken, Promise, env, near, require};
use near_sdk_contract_tools::ft::Nep145Controller;

use crate::types::{PoolView, QuoteView};
use crate::{Contract, ContractExt, checked, events, math};

#[near]
impl Contract {
    /// Swaps the attached NEAR for $CUT. Fails if the buyer would get less than `min_out`.
    ///
    /// An account that is not registered yet is registered on its first buy: the NEP-145
    /// minimum (0.01 NEAR) is taken from the attached deposit and the rest is swapped.
    #[payable]
    pub fn buy(&mut self, min_out: U128) -> U128 {
        let buyer = env::predecessor_account_id();
        let mut near_in = env::attached_deposit();
        if self.get_storage_balance(&buyer).is_err() {
            let min = self.get_storage_balance_bounds().min;
            require!(
                near_in > min,
                format!("Your first buy also registers your account: attach more than {min}")
            );
            self.top_up_storage(&buyer, min);
            near_in = near_in.saturating_sub(min);
        }
        let near_in = near_in.as_yoctonear();
        require!(near_in > 0, "Attach NEAR to buy $CUT");

        let quote = checked(math::quote_buy(
            self.pool.near_reserve,
            self.pool.cut_reserve,
            near_in,
            self.params.fee_bps,
        ));
        require!(
            quote.amount_out > 0,
            "Too little NEAR: you would get 0 $CUT"
        );
        require!(
            quote.amount_out >= min_out.0,
            format!(
                "Slippage: you would get {} $CUT units, below min_out {}",
                quote.amount_out, min_out.0
            )
        );

        self.pool.near_reserve = checked(self.pool.near_reserve.checked_add(near_in));
        self.pool.cut_reserve = checked(self.pool.cut_reserve.checked_sub(quote.gross_out));
        self.fees_since_cut = checked(self.fees_since_cut.checked_add(quote.fee));
        self.send_cut(&buyer, quote.amount_out, "buy");

        events::emit(
            "buy",
            &[events::Buy {
                account_id: buyer.clone(),
                near_in: U128(near_in),
                cut_out: U128(quote.amount_out),
                fee: U128(quote.fee),
                cut_index: self.next_cut_index,
            }],
        );
        events::emit(
            "fee",
            &[events::Fee {
                account_id: buyer,
                amount: U128(quote.fee),
                source: "buy",
                cut_index: self.next_cut_index,
            }],
        );
        U128(quote.amount_out)
    }

    /// Swaps `cut_in` $CUT for NEAR. Fails if the seller would get less than `min_out`
    /// yoctoNEAR.
    pub fn sell(&mut self, cut_in: U128, min_out: U128) -> U128 {
        let seller = env::predecessor_account_id();
        require!(cut_in.0 > 0, "cut_in must be positive");
        let quote = checked(math::quote_sell(
            self.pool.near_reserve,
            self.pool.cut_reserve,
            cut_in.0,
            self.params.fee_bps,
        ));
        require!(quote.near_out > 0, "Too little $CUT: you would get 0 NEAR");
        require!(
            quote.near_out >= min_out.0,
            format!(
                "Slippage: you would get {} yoctoNEAR, below min_out {}",
                quote.near_out, min_out.0
            )
        );

        self.take_cut(&seller, cut_in.0, "sell");
        self.pool.cut_reserve = checked(self.pool.cut_reserve.checked_add(quote.net_in));
        self.pool.near_reserve = checked(self.pool.near_reserve.checked_sub(quote.near_out));
        self.fees_since_cut = checked(self.fees_since_cut.checked_add(quote.fee));
        Promise::new(seller.clone())
            .transfer(NearToken::from_yoctonear(quote.near_out))
            .detach();

        events::emit(
            "sell",
            &[events::Sell {
                account_id: seller.clone(),
                cut_in,
                near_out: U128(quote.near_out),
                fee: U128(quote.fee),
                cut_index: self.next_cut_index,
            }],
        );
        events::emit(
            "fee",
            &[events::Fee {
                account_id: seller,
                amount: U128(quote.fee),
                source: "sell",
                cut_index: self.next_cut_index,
            }],
        );
        U128(quote.near_out)
    }

    /// Pool reserves.
    pub fn get_pool(&self) -> PoolView {
        PoolView {
            near_reserve: U128(self.pool.near_reserve),
            cut_reserve: U128(self.pool.cut_reserve),
            fee_bps: self.params.fee_bps,
        }
    }

    /// $CUT out and fee for buying with `near_in` yoctoNEAR. For an account that is not
    /// registered yet, quote `near_in` minus the 0.01 NEAR registration.
    pub fn quote_buy(&self, near_in: U128) -> QuoteView {
        match math::quote_buy(
            self.pool.near_reserve,
            self.pool.cut_reserve,
            near_in.0,
            self.params.fee_bps,
        ) {
            Some(q) => QuoteView {
                amount_out: U128(q.amount_out),
                fee: U128(q.fee),
            },
            None => QuoteView {
                amount_out: U128(0),
                fee: U128(0),
            },
        }
    }

    /// yoctoNEAR out and $CUT fee for selling `cut_in` $CUT.
    pub fn quote_sell(&self, cut_in: U128) -> QuoteView {
        match math::quote_sell(
            self.pool.near_reserve,
            self.pool.cut_reserve,
            cut_in.0,
            self.params.fee_bps,
        ) {
            Some(q) => QuoteView {
                amount_out: U128(q.near_out),
                fee: U128(q.fee),
            },
            None => QuoteView {
                amount_out: U128(0),
                fee: U128(0),
            },
        }
    }
}
