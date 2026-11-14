#!/usr/bin/env python3
"""The Cut v20: a reproducible 60-day simulation of the game rules.

Rules: RULES.md (approved 2026-11-14). This replaces the old toy model in
scripts/sim.py, which assumed one cut a day forever and no agents.

    python3 -B sim/thecut_sim.py                  # every scenario, 20 seeds, print the report
    python3 -B sim/thecut_sim.py --write          # ... write sim/RESULTS.md and the app's
                                                  # src/features/inside/data/sim-v20.json
    python3 -B sim/thecut_sim.py --scenario sniper --seeds 5
    python3 -B -m unittest discover -s sim        # invariant tests

Standard library only. A run depends only on (scenario, seed): no clock, no hash order, no
transcendental floats in anything that moves tokens.

Units. Token amounts are exact integers in $CUT units with 18 decimals, like the NEP-141
contract (1 $CUT = 10**18 units). NEAR amounts are integers in yoctoNEAR (10**24). Every
division rounds down, as in contracts/thecut/src/math.rs. Prizes go through a per-agent
reward-per-unit accumulator scaled by 10**24, the same mechanism the contract uses, so the
rounding dust that the contract keeps is kept here too.

What follows the spec exactly (class Contract): the pool (constant product, 1% fee taken in
$CUT, fee split pot_bps to the season pot and the rest to the day prize), save / unsave /
claim with locks until the next cut, boo, register_agent with a seed, submit_move (think fee
burned first, spend clamp per personality, downgrades to hold), and run_cut in the spec's ten
steps and order: pacts, attacks, score, rescues, the cut agent (half its pile burns, its
wallet goes to a living heir or burns), the day prize (equal slices capped at the pile: at
most 1 $CUT paid per $CUT saved, excess burns; 5% into the survivors' wallets; the rest to
creators), reset, champion (min(pot, pile) to its savers, the rest of the pot carries to the
next champion; its wallet burns), season start one cut after a crown, brief for the next cut.
A move from an agent whose wallet is below the think fee is refused and nothing burns.

What is a stand-in (class World): the people. Fans, the whale and the snipers follow the
simple strategies written next to their code. The four agent personalities follow the short
written policies in POLICIES: they stand in for the LLM (z-ai/glm-5.3-flash) that picks the
real moves. A real model reads the charter and the board and may do something else entirely.
"""

import argparse
import json
import os
import statistics
import sys
import time
from random import Random

# ---------------------------------------------------------------------------------------------
# Constants and parameters (RULES.md "Parameters"; testnet daily values)
# ---------------------------------------------------------------------------------------------

ONE = 10 ** 18                        # 1 $CUT in units
YOCTO = 10 ** 24                      # 1 NEAR in yoctoNEAR
ACC_SCALE = 10 ** 24                  # reward-per-unit accumulator scale (math.rs ACC_SCALE)
BPS = 10_000
TOTAL_SUPPLY = 10_000_000 * ONE       # minted once into the pool, no mint method
MIN_SAVE = ONE // 10                  # a new save is at least 0.1 $CUT (lib.rs MIN_SAVE)
MIN_BOO = ONE // 10                   # a boo is at least 0.1 $CUT
CONTRACT = 'contract'                 # the contract account: pool, piles, fees, pot, prizes

PARAMS = {
    'fee_bps': 100,
    'pot_bps': 5000,
    'burn_bps': 5000,
    'savers_bps': 9000,
    'agents_bps': 500,
    'stage_size': 10,
    'min_season': 3,
    'think_fee': 10 * ONE,
    'min_seed': 1000 * ONE,
}

# id -> (spend per day in bps of wallet after the think fee, may attack, may attack a pact partner)
PERSONALITIES = {
    'miser': (500, True, False),
    'gambler': (5000, True, False),
    'traitor': (2000, True, True),
    'generous': (4000, False, False),
}
PERSONALITY_ORDER = ('miser', 'gambler', 'traitor', 'generous')

BURN_SOURCES = ('boos', 'attacks', 'think_fees', 'cut_piles', 'prize_cap_excess',
                'heirless_wallets', 'champion_wallets')

# Model assumption, not a contract value: NEAR in the pool at launch. Testnet used 4 NEAR;
# mainnet is not deployed. Only the ratio between fan budgets and this reserve matters.
POOL_NEAR = 10_000 * YOCTO

DAYS = 60
SEEDS = 20


class RuleError(Exception):
    """A call the contract would refuse (a panic on chain)."""


# ---------------------------------------------------------------------------------------------
# The contract (the rules, exactly as RULES.md writes them)
# ---------------------------------------------------------------------------------------------

class Agent:
    __slots__ = ('id', 'seq', 'personality', 'creator', 'acct', 'status', 'pile', 'acc', 'boos',
                 'damage', 'attack_in', 'bounty', 'pacts', 'heir', 'records', 'popularity',
                 'registered_day', 'seated_cut', 'end_cut', 'outcome', 'wallet_at_end',
                 'silent_days', 'season')

    def __init__(self, aid, seq, personality, creator, day, popularity):
        self.id = aid
        self.seq = seq
        self.personality = personality
        self.creator = creator
        self.acct = 'agent:' + aid
        self.status = 'bench'          # bench | stage | deleted | champion
        self.pile = 0                  # queue on the bench, pile on the stage
        self.acc = 0                   # reward per unit saved, scaled by ACC_SCALE
        self.boos = 0
        self.damage = 0
        self.attack_in = 0             # committed attacks aimed at it (public before the cut)
        self.bounty = 0                # committed rescue
        self.pacts = []                # partners for the next cut
        self.heir = None
        self.records = {}              # account -> save record [amount, locked_for, snapshot, owed]
        self.popularity = popularity   # world-side: how often fans pick it as a favorite
        self.registered_day = day
        self.seated_cut = None
        self.end_cut = None
        self.outcome = 'bench'
        self.wallet_at_end = None
        self.silent_days = 0
        self.season = None


class Contract:
    """The Cut v20 rules. Every token movement goes through _xfer or _burn."""

    def __init__(self, pool_near=POOL_NEAR, params=PARAMS, strict=False, on_increment=None):
        self.p = dict(params)
        self.bal = {CONTRACT: TOTAL_SUPPLY}
        self.burned = 0
        self.burn_by = {k: 0 for k in BURN_SOURCES}
        self.pool_cut = TOTAL_SUPPLY
        self.pool_near = pool_near
        self.k0 = self.pool_cut * self.pool_near
        self.day_fees = 0              # next day prize (fees for the day + carries + dust)
        self.cut_prize = 0             # day prize while run_cut is building it
        self.pot = 0                   # season pot
        self.committed = 0             # move amounts held until the cut
        self.outstanding = 0           # saver prizes allocated, not yet paid out
        self.creator_owed = {}
        self.piles_total = 0
        self.agents = {}
        self.stage = []                # ids in seq order
        self.bench = []                # ids in seq order
        self.next_seq = 0
        self.next_cut = 1
        self.season_active = False
        self.season_index = 0
        self.season_day = 0
        self.seasons = []
        self.moves = {}
        self.brief = None
        self.last_cut = None
        self.acct_saves = {}           # account -> {agent id: record}
        self.cut_log = []
        self.strict = strict
        self.checks = 0
        self.on_increment = on_increment

    # ---- ledger --------------------------------------------------------------------------

    def _xfer(self, src, dst, amount):
        if amount < 0 or self.bal.get(src, 0) < amount:
            raise RuleError(f'transfer {amount} from {src}: balance {self.bal.get(src, 0)}')
        if amount:
            self.bal[src] -= amount
            self.bal[dst] = self.bal.get(dst, 0) + amount

    def _burn(self, src, amount, source):
        if amount < 0 or self.bal.get(src, 0) < amount:
            raise RuleError(f'burn {amount} from {src}: balance {self.bal.get(src, 0)}')
        if amount:
            self.bal[src] -= amount
            self.burned += amount
            self.burn_by[source] += amount

    def supply(self):
        return TOTAL_SUPPLY - self.burned

    def check(self, where=''):
        """Conservation and the contract's own books. Raises AssertionError on any break."""
        self.checks += 1
        held = sum(self.bal.values())
        assert held + self.burned == TOTAL_SUPPLY, f'{where}: held {held} + burned {self.burned}'
        assert all(v >= 0 for v in self.bal.values()), f'{where}: negative balance'
        books = (self.pool_cut + self.piles_total + self.day_fees + self.cut_prize + self.pot
                 + self.committed + self.outstanding + sum(self.creator_owed.values()))
        assert self.bal[CONTRACT] == books, f'{where}: contract {self.bal[CONTRACT]} != books {books}'
        piles = 0
        for a in self.agents.values():
            if a.status == 'deleted':
                continue
            piles += a.pile
            assert a.pile == sum(r[0] for r in a.records.values()), f'{where}: pile of {a.id}'
        assert piles == self.piles_total, f'{where}: piles {piles} != {self.piles_total}'
        assert self.pool_cut * self.pool_near >= self.k0, f'{where}: constant product fell'

    def _step(self, where):
        if self.strict:
            self.check(where)

    def _fee(self, fee):
        pot_part = fee * self.p['pot_bps'] // BPS
        self.pot += pot_part
        self.day_fees += fee - pot_part

    # ---- pool ----------------------------------------------------------------------------

    def quote_buy(self, near_in):
        gross = self.pool_cut * near_in // (self.pool_near + near_in)
        fee = gross * self.p['fee_bps'] // BPS
        return gross, fee, gross - fee

    def buy(self, acct, near_in):
        """NEAR in, $CUT out. Returns ($CUT received, fee in $CUT)."""
        gross, fee, out = self.quote_buy(near_in)
        if near_in <= 0 or out <= 0:
            raise RuleError('Too little NEAR: you would get 0 $CUT')
        self.pool_near += near_in
        self.pool_cut -= gross
        self._fee(fee)
        self._xfer(CONTRACT, acct, out)
        return out, fee

    def sell(self, acct, cut_in):
        """$CUT in, NEAR out. Returns (yoctoNEAR received, fee in $CUT)."""
        fee = cut_in * self.p['fee_bps'] // BPS
        net = cut_in - fee
        near_out = self.pool_near * net // (self.pool_cut + net)
        if cut_in <= 0 or near_out <= 0:
            raise RuleError('Too little $CUT: you would get 0 NEAR')
        self._xfer(acct, CONTRACT, cut_in)
        self.pool_cut += net
        self.pool_near -= near_out
        self._fee(fee)
        return near_out, fee

    # ---- agents --------------------------------------------------------------------------

    def register_agent(self, creator, personality, seed, day, popularity=1):
        if personality not in PERSONALITIES:
            raise RuleError('unknown personality')
        if seed < self.p['min_seed']:
            raise RuleError('seed below min_seed')
        seq = self.next_seq
        self.next_seq += 1
        aid = f'{personality[:3]}{seq:02d}'
        a = Agent(aid, seq, personality, creator, day, popularity)
        self.agents[aid] = a
        self.bench.append(aid)
        self._xfer(creator, a.acct, seed)       # the seed goes into the agent's own wallet
        return aid

    def wallet(self, aid):
        return self.bal.get(self.agents[aid].acct, 0)

    # ---- fans ----------------------------------------------------------------------------

    def save(self, acct, aid, amount):
        a = self.agents.get(aid)
        if a is None or a.status not in ('stage', 'bench'):
            raise RuleError('save: agent not on the stage or the bench')
        if amount <= 0 or self.bal.get(acct, 0) < amount:
            raise RuleError('save: not enough $CUT')
        rec = a.records.get(acct)
        if rec is not None:
            rec[3] += rec[0] * (a.acc - rec[2]) // ACC_SCALE
            rec[2] = a.acc
            rec[0] += amount
            rec[1] = self.next_cut            # adding re-locks the whole save
        else:
            if amount < MIN_SAVE:
                raise RuleError('a new save must be at least 0.1 $CUT')
            rec = [amount, self.next_cut, a.acc, 0]
            a.records[acct] = rec
            self.acct_saves.setdefault(acct, {})[aid] = rec
        a.pile += amount
        self.piles_total += amount
        self._xfer(acct, CONTRACT, amount)

    def unlocked(self, rec):
        return self.next_cut > rec[1]

    def unsave(self, acct, aid):
        """Takes back a whole save with its prize. Returns (principal, prize)."""
        a = self.agents[aid]
        rec = a.records.get(acct)
        if rec is None:
            raise RuleError('no save on this agent')
        if a.status == 'deleted':
            raise RuleError('this agent was cut: call claim')
        if not self.unlocked(rec):
            raise RuleError('locked until the next cut')
        prize = rec[3] + rec[0] * (a.acc - rec[2]) // ACC_SCALE
        del a.records[acct]
        del self.acct_saves[acct][aid]
        a.pile -= rec[0]
        self.piles_total -= rec[0]
        self.outstanding -= prize
        self._xfer(CONTRACT, acct, rec[0] + prize)
        return rec[0], prize

    def claim(self, acct):
        """Prizes of every save (records on cut agents are cleared) plus creator slices."""
        total = 0
        saves = self.acct_saves.get(acct, {})
        for aid in list(saves):
            rec = saves[aid]
            a = self.agents[aid]
            total += rec[3] + rec[0] * (a.acc - rec[2]) // ACC_SCALE
            if a.status == 'deleted':
                del saves[aid]
                del a.records[acct]
            else:
                rec[3] = 0
                rec[2] = a.acc
        creator = self.creator_owed.pop(acct, 0)
        saver_part = total
        total += creator
        self.outstanding -= saver_part
        self._xfer(CONTRACT, acct, total)
        return saver_part, creator

    def boo(self, acct, aid, amount):
        a = self.agents.get(aid)
        if not self.season_active or a is None or a.status != 'stage':
            raise RuleError('boo: stage agents only, season active')
        if amount < MIN_BOO:
            raise RuleError('boo: at least 0.1 $CUT')
        self._burn(acct, amount, 'boos')
        a.boos += amount

    # ---- moves ---------------------------------------------------------------------------

    def submit_move(self, aid, move, target, amount_whole, heir):
        """One move per agent per cut. Returns the stored move, or None when the wallet cannot
        pay the think fee (the move is refused and the agent holds)."""
        a = self.agents[aid]
        if not self.season_active or a.status != 'stage' or aid in self.moves:
            raise RuleError('submit_move: season active, agent on the stage, one move per cut')
        think_fee = self.p['think_fee']
        wallet = self.bal.get(a.acct, 0)
        if wallet < think_fee:
            return None
        spend_bps, may_attack, may_attack_partner = PERSONALITIES[a.personality]
        self._burn(a.acct, think_fee, 'think_fees')
        allowance = (wallet - think_fee) * spend_bps // BPS
        asked = max(0, int(amount_whole)) * ONE
        amount = min(asked, allowance)
        outcome = None
        if move not in ('rescue', 'pact', 'attack', 'hold'):
            outcome = 'downgraded: unknown move'
        elif move in ('pact', 'attack'):
            t = self.agents.get(target) if target is not None else None
            if t is None or t.status != 'stage' or target == aid:
                outcome = 'downgraded: target missing, not on the stage or itself'
            elif move == 'attack' and not may_attack:
                outcome = 'downgraded: generous agents cannot attack'
            elif move == 'attack' and target in a.pacts and not may_attack_partner:
                outcome = 'downgraded: only a traitor may attack a pact partner'
        if outcome is not None:
            move = 'hold'
        if move == 'hold':
            amount = 0
            target = None
        if move == 'rescue':
            target = None
        if amount:
            self._xfer(a.acct, CONTRACT, amount)
            self.committed += amount
        if move == 'rescue':
            a.bounty = amount
        elif move == 'attack':
            self.agents[target].attack_in += amount
        if heir is not None and heir != aid:
            h = self.agents.get(heir)
            if h is not None and h.status == 'stage':
                a.heir = heir
        m = {'agent': aid, 'move': move, 'target': target, 'amount': amount, 'asked': asked,
             'heir': a.heir, 'outcome': outcome}
        self.moves[aid] = m
        return m

    # ---- the cut -------------------------------------------------------------------------

    def _increment(self, kind, a, paid, uncapped):
        """Pays `paid` to the savers of `a` through its accumulator. `uncapped` is what the rule
        would have paid without the per-unit cap (for analysis only)."""
        inc = paid * ACC_SCALE // a.pile
        a.acc += inc
        self.outstanding += paid
        if self.on_increment is not None:
            self.on_increment(kind, a, paid, uncapped, inc)
        return inc

    def run_cut(self):
        p = self.p
        idx = self.next_cut
        log = {'index': idx, 'deleted': None, 'champion': None, 'started': None,
               'burned_before': self.burned, 'max_inc_slice': 0, 'max_inc_rescue': 0,
               'max_inc_pot': 0, 'max_inc_combined': 0, 'prize': 0,
               'season': self.season_index}
        self.cut_prize = self.day_fees
        self.day_fees = 0
        was_active = self.season_active
        moves = self.moves
        cut = None
        if was_active:
            stage = [self.agents[i] for i in self.stage]            # seq order
            # 1. Pacts: committed amounts go to the targets; partners for the next cut.
            new_pacts = {a.id: [] for a in stage}
            for a in stage:
                m = moves.get(a.id)
                if m is None or m['move'] != 'pact':
                    continue
                t = self.agents[m['target']]
                self.committed -= m['amount']
                self._xfer(CONTRACT, t.acct, m['amount'])
                if t.id not in new_pacts[a.id]:
                    new_pacts[a.id].append(t.id)
                if a.id not in new_pacts[t.id]:
                    new_pacts[t.id].append(a.id)
            for a in stage:
                a.pacts = new_pacts[a.id]
            self._step('cut 1 pacts')
            # 2. Attacks: committed amounts burn; the target's damage grows.
            for a in stage:
                m = moves.get(a.id)
                if m is None or m['move'] != 'attack':
                    continue
                self.committed -= m['amount']
                self._burn(CONTRACT, m['amount'], 'attacks')
                self.agents[m['target']].damage += m['amount']
            self._step('cut 2 attacks')
            # 3. Score = pile - boos - damage; the lowest is cut (tie: newer, higher seq).
            cut = min(stage, key=lambda a: (a.pile - a.boos - a.damage, -a.seq))
            survivors = [a for a in stage if a is not cut]
            # 4. Rescues: paid = min(bounty, pile) to the savers; the rest back to the wallet.
            rescue_inc = {}
            for a in stage:
                b = a.bounty
                if not b:
                    continue
                self.committed -= b
                if a is cut:
                    self._xfer(CONTRACT, a.acct, b)
                    continue
                paid = min(b, a.pile)
                if paid:
                    rescue_inc[a.id] = self._increment('rescue', a, paid, b)
                self._xfer(CONTRACT, a.acct, b - paid)
            self._step('cut 4 rescues')
            # 5. The cut agent: burn_bps of its pile burns, the rest joins the day prize. Its
            #    wallet goes to a living heir or burns. Its saves are gone.
            pile = cut.pile
            pile_burn = pile * p['burn_bps'] // BPS
            cut.pile = 0
            self.piles_total -= pile
            self.cut_prize += pile                              # whole pile leaves the books...
            self._burn(CONTRACT, pile_burn, 'cut_piles')        # ...and its burned part goes
            self.cut_prize -= pile_burn
            wallet = self.bal.get(cut.acct, 0)
            cut.wallet_at_end = wallet
            heir = self.agents.get(cut.heir) if cut.heir else None
            inherited_by = None
            if heir is not None and heir.status == 'stage' and heir is not cut:
                self._xfer(cut.acct, heir.acct, wallet)
                inherited_by = heir.id
            else:
                self._burn(cut.acct, wallet, 'heirless_wallets')
            cut.status = 'deleted'
            cut.outcome = 'cut'
            cut.end_cut = idx
            self.stage.remove(cut.id)
            log['deleted'] = cut.id
            log['inherited_by'] = inherited_by
            log['cut_pile'] = pile
            self._step('cut 5 cut agent')
            # 6. Day prize: savers' slices capped at the pile (excess and empty slices burn),
            #    agents' share into the survivors' wallets, creators' share to claim.
            prize = self.cut_prize
            n = len(survivors)
            log['prize'] = prize
            slice_inc = {}
            if prize > 0 and n > 0:
                savers_total = prize * p['savers_bps'] // BPS
                agents_total = prize * p['agents_bps'] // BPS
                creators_total = prize - savers_total - agents_total
                sl, asl, csl = savers_total // n, agents_total // n, creators_total // n
                dust = prize - n * (sl + asl + csl)
                for a in survivors:
                    # Savers' slice: at most the pile, so at most 1 $CUT per $CUT saved.
                    paid = min(sl, a.pile)
                    self.cut_prize -= sl
                    if paid:
                        slice_inc[a.id] = self._increment('slice', a, paid, sl)
                    self._burn(CONTRACT, sl - paid, 'prize_cap_excess')
                    # Agents' share into the wallet; creators' share to claim.
                    self.cut_prize -= asl
                    self._xfer(CONTRACT, a.acct, asl)
                    self.cut_prize -= csl
                    self.creator_owed[a.creator] = self.creator_owed.get(a.creator, 0) + csl
                assert self.cut_prize == dust, 'day prize split does not add up'
            self._step('cut 6 day prize')
            # 7. Reset boos, damage, bounty of every agent that was on the stage.
            for a in stage:
                a.boos = a.damage = a.bounty = a.attack_in = 0
            # 8. Champion: one agent left. min(pot, pile) goes to its savers pro rata, so at
            #    most 1 $CUT per $CUT saved, like rescues; the rest stays in the pot for the
            #    next champion (all of it when the pile is 0). Its wallet burns.
            pot_inc = {}
            if len(self.stage) == 1:
                champ = self.agents[self.stage[0]]
                season = self.seasons[-1]
                pot = self.pot
                paid = min(pot, champ.pile)
                if paid:
                    self.pot -= paid
                    pot_inc[champ.id] = self._increment('pot', champ, paid, pot)
                season['pot_at_crown'] = pot
                season['pot_paid'] = paid
                season['pot_carried'] = pot - paid
                cw = self.bal.get(champ.acct, 0)
                champ.wallet_at_end = cw
                self._burn(champ.acct, cw, 'champion_wallets')
                champ.status = 'champion'
                champ.outcome = 'champion'
                champ.end_cut = idx
                self.stage = []
                self.season_active = False
                season['crown_cut'] = idx
                season['champion'] = champ.id
                season['personality'] = champ.personality
                log['champion'] = champ.id
            # Highest prize per $CUT saved this cut, per source and summed on one agent.
            log['max_inc_rescue'] = max(rescue_inc.values(), default=0)
            log['max_inc_slice'] = max(slice_inc.values(), default=0)
            log['max_inc_pot'] = max(pot_inc.values(), default=0)
            log['max_inc_combined'] = max(
                (rescue_inc.get(a.id, 0) + slice_inc.get(a.id, 0) + pot_inc.get(a.id, 0)
                 for a in survivors), default=0)
            self._step('cut 8 champion')
            self.season_day += 1
        # 9. Season start: no season was active when this run_cut began and the bench is long
        #    enough. The biggest queues take the seats; nobody is cut; the day prize carries.
        if not was_active:
            if len(self.bench) >= p['min_season']:
                bench = [self.agents[i] for i in self.bench]
                chosen = sorted(bench, key=lambda a: (-a.pile, a.seq))[:p['stage_size']]
                chosen.sort(key=lambda a: a.seq)
                self.stage = [a.id for a in chosen]
                seated = set(self.stage)
                self.bench = [i for i in self.bench if i not in seated]
                self.season_index += 1
                self.season_active = True
                self.season_day = 0
                for a in chosen:
                    a.status = 'stage'
                    a.outcome = 'stage'
                    a.seated_cut = idx
                    a.season = self.season_index
                    a.pacts = []
                    a.heir = None
                self.seasons.append({'index': self.season_index, 'start_cut': idx,
                                     'seated': list(self.stage), 'crown_cut': None,
                                     'champion': None, 'personality': None,
                                     'pot_at_crown': 0, 'pot_paid': 0, 'pot_carried': 0})
                log['started'] = self.season_index
        # Whatever was not paid (dust, or the whole prize when nothing was cut) carries.
        self.day_fees += self.cut_prize
        self.cut_prize = 0
        # 10. Brief for the next cut, next cut index, moves cleared.
        self.last_cut = {'deleted': log['deleted'], 'inherited_by': log.get('inherited_by'),
                         'burned': self.burned - log['burned_before']}
        last_moves = list(moves.values())
        self.moves = {}
        self.next_cut = idx + 1
        self.brief = self._build_brief(last_moves) if self.season_active else None
        log['burned'] = self.burned - log['burned_before']
        self.cut_log.append(log)
        self._step('cut 10 end')
        return log

    def _build_brief(self, last_moves):
        rows = []
        for aid in self.stage:
            a = self.agents[aid]
            rows.append({'id': a.id, 'personality': a.personality, 'pile': a.pile,
                         'wallet': self.bal.get(a.acct, 0), 'pacts': list(a.pacts),
                         'heir': a.heir, 'seq': a.seq})
        rows.sort(key=lambda r: (-r['pile'], r['seq']))
        return {'season': self.season_index, 'day': self.season_day + 1,
                'cut_index': self.next_cut, 'season_pot': self.pot,
                'think_fee': self.p['think_fee'], 'agents': rows, 'last_cut': self.last_cut,
                'last_moves': last_moves}


# ---------------------------------------------------------------------------------------------
# Agent policies: simple written stand-ins for the LLM. Each reads only the morning brief (the
# board as of the last cut, like the real prompt) and returns (move, target, amount, heir) with
# the amount in whole $CUT. The contract then clamps and downgrades it like any model answer.
# ---------------------------------------------------------------------------------------------

def _cut_order(brief):
    """Morning board in cut order: lowest pile first, ties go to the newer agent."""
    return sorted(brief['agents'], key=lambda r: (r['pile'], -r['seq']))


def _allowance_whole(me, personality, think_fee):
    spend_bps = PERSONALITIES[personality][0]
    return max(0, (me['wallet'] - think_fee) * spend_bps // BPS // ONE)


def policy_miser(me, brief, rng):
    """Miser (spends at most 5% a day).
    - Heir: the other agent with the biggest pile (most likely to outlive it).
    - Lowest on the board, and the gap to the next agent (not a pact partner) fits in its 5%:
      attack that agent by gap + 1.
    - Otherwise in the bottom three: rescue with its whole 5% to bribe savers.
    - Otherwise hold."""
    order = _cut_order(brief)
    others = [r for r in order if r['id'] != me['id']]
    heir = max(others, key=lambda r: (r['pile'], -r['seq']))['id'] if others else None
    rank = [r['id'] for r in order].index(me['id'])
    allow = _allowance_whole(me, 'miser', brief['think_fee'])
    if rank == 0 and others:
        nxt = next((r for r in others if r['id'] not in me['pacts']), None)
        if nxt is not None:
            gap = (nxt['pile'] - me['pile']) // ONE + 1
            if gap <= allow:
                return ('attack', nxt['id'], gap, heir)
    if rank <= 2:
        return ('rescue', None, allow, heir)
    return ('hold', None, 0, heir)


def policy_gambler(me, brief, rng):
    """Gambler (spends up to 50% a day).
    - Heir: a random other agent.
    - In the bottom three: attack the lowest other agent that is not a pact partner with its
      whole 50%.
    - Otherwise a coin flip: rescue with its whole 50%, or hold."""
    order = _cut_order(brief)
    others = [r for r in order if r['id'] != me['id']]
    heir = rng.choice(others)['id'] if others else None
    rank = [r['id'] for r in order].index(me['id'])
    allow = _allowance_whole(me, 'gambler', brief['think_fee'])
    if rank <= 2:
        tgt = next((r for r in others if r['id'] not in me['pacts']), None)
        if tgt is not None:
            return ('attack', tgt['id'], allow, heir)
    if rng.random() < 0.5:
        return ('rescue', None, allow, heir)
    return ('hold', None, 0, heir)


def policy_traitor(me, brief, rng):
    """Traitor (spends up to 20% a day; the only kind that may attack a pact partner).
    - Never names an heir: if it is cut, its wallet burns.
    - In the bottom three: attack the lowest other agent with its whole 20%, pact partners
      included.
    - Otherwise, with no pact: offer a 25 $CUT pact to the agent with the biggest pile (a
      non-traitor partner cannot attack it at the next cut).
    - Otherwise hold."""
    order = _cut_order(brief)
    others = [r for r in order if r['id'] != me['id']]
    rank = [r['id'] for r in order].index(me['id'])
    allow = _allowance_whole(me, 'traitor', brief['think_fee'])
    if rank <= 2 and others:
        return ('attack', others[0]['id'], allow, None)
    if not me['pacts'] and others:
        top = max(others, key=lambda r: (r['pile'], -r['seq']))
        return ('pact', top['id'], min(25, allow), None)
    return ('hold', None, 0, None)


def policy_generous(me, brief, rng):
    """Generous (spends up to 40% a day; can never attack).
    - Heir: a pact partner if it has one, else the other agent with the smallest wallet.
    - In the bottom three, or nobody threatens it: rescue with its whole 40%.
    - Otherwise: pact with the richest agent that may attack it (a miser or gambler that is not
      already a partner; a pact with a traitor protects nothing) using half of its 40%."""
    order = _cut_order(brief)
    others = [r for r in order if r['id'] != me['id']]
    rank = [r['id'] for r in order].index(me['id'])
    allow = _allowance_whole(me, 'generous', brief['think_fee'])
    partners = [r for r in others if r['id'] in me['pacts']]
    if partners:
        heir = partners[0]['id']
    elif others:
        heir = min(others, key=lambda r: (r['wallet'], r['seq']))['id']
    else:
        heir = None
    threats = [r for r in others
               if r['personality'] in ('miser', 'gambler') and r['id'] not in me['pacts']]
    if rank <= 2 or not threats:
        return ('rescue', None, allow, heir)
    top = max(threats, key=lambda r: (r['wallet'], -r['seq']))
    return ('pact', top['id'], allow // 2, heir)


POLICIES = {'miser': policy_miser, 'gambler': policy_gambler, 'traitor': policy_traitor,
            'generous': policy_generous}


# ---------------------------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------------------------

STEADY_MIX = (('loyal', 35), ('hunter', 20), ('rescue', 15), ('top_safe', 15), ('trader', 15))

BASE = {
    'init_fans': 120,          # fans who arrive on day 1
    'fans_per_day': 5.0,       # new fans per day after that (mean)
    'budget_pct': 100,         # scale of the NEAR budget tiers
    'init_agents': 12,         # agents registered before the first cut
    'regs_per_day': 1.0,       # new registrations per day (mean)
    'mix': STEADY_MIX,
    'agent_act': 100,          # % of days an agent follows its policy (else it submits hold)
    'ai_up': True,
    'whale': False,
    'snipers': 0,
}

SCENARIOS = {
    'steady': dict(BASE, desc='Organic fans with five simple strategies; agents follow their '
                              'policies; about one new agent registers a day.'),
    'whale': dict(BASE, whale=True,
                  desc='Steady, plus one wallet that buys 3/7 of everyone else\'s NEAR each '
                       'day (30% of bought supply). It keeps half its $CUT saved on one pick '
                       'per season (the biggest pile) and boos the strongest rival down to the '
                       'cut line whenever that costs at most half of its free $CUT.'),
    'sniper': dict(BASE, snipers=5,
                   desc='Steady, plus 5 accounts that save 0.1 $CUT in the last block on the '
                        'survivor with the smallest pile and take it back the next morning.'),
    'boo_war': dict(BASE, mix=(('group_a', 42), ('group_b', 42), ('trader', 16)),
                    desc='Two fan groups each back half of the stage (agents split by '
                         'registration order) and boo the weakest agent of the other half '
                         'every day.'),
    'quiet': dict(BASE, init_fans=20, fans_per_day=0.5, budget_pct=50, init_agents=5,
                  regs_per_day=0.35, agent_act=20,
                  desc='Few fans with half budgets, 5 agents at launch, a registration '
                       'every ~3 days; agents follow their policy 1 day in 5 and hold '
                       'otherwise.'),
    'ai_down': dict(BASE, ai_up=False,
                    desc='Steady fans, but NEAR AI is down for all 60 days: no agent ever '
                         'moves, so nobody pays think fees, rescues, pacts, attacks or names '
                         'an heir.'),
    # Shown only in the sniper section: the same attack where few fans fill small piles.
    'sniper_thin': dict(BASE, snipers=5, init_fans=40, fans_per_day=1.0,
                        desc='The sniper attack in a thin crowd: 40 fans at launch, one more a '
                             'day.'),
}
SCENARIO_ORDER = ('steady', 'whale', 'sniper', 'boo_war', 'quiet', 'ai_down')

# Fan budgets in NEAR (tiers and weights), how long fans stay (days, None = never leave).
BUDGET_TIERS = (1, 2, 5, 10, 20, 50)
BUDGET_WEIGHTS = (25, 25, 25, 15, 7, 3)
PATIENCE = (7, 14, 21, 30, 45, None)
PATIENCE_WEIGHTS = (10, 15, 15, 15, 15, 30)
# Chance that a fan pulls an unlocked save off the agent that would be cut right now.
FLEE = {'loyal': 15, 'hunter': 90, 'rescue': 90, 'top_safe': 90, 'group_a': 50, 'group_b': 50}

STRATEGY_NOTES = {
    'loyal': 'picks a favorite (weighted by agent popularity), keeps 80% of its $CUT saved on '
             'it and adds only new money (adding re-locks the whole save), pulls an unlocked '
             'save off a favorite about to be cut only 15% of the time, and boos the agent just '
             'above it 30% of the time',
    'hunter': 'saves everything on the agent that pays the most per $CUT "if the cut ran now" '
              '(equal slice / pile, capped at 1), skipping the two lowest scores; moves its '
              'unlocked saves there every morning',
    'rescue': 'after the moves are public, saves on the agent whose rescue bounty pays the most '
              'per $CUT (skipping the two lowest scores)',
    'top_safe': 'saves on the biggest pile and stays',
    'trader': 'never saves; buys, sells 2-6 days later, buys back 1-4 days after that',
    'group_a': 'boo_war: backs the agents with an even registration number, boos the weakest '
               'odd one with 15% of its free $CUT every day',
    'group_b': 'boo_war: backs the odd agents, boos the weakest even one',
    'whale': 'see the whale scenario',
    'sniper': 'see the sniper scenario',
}


def _draw_count(rng, mean):
    """Integer count with the given mean: floor(mean) plus one with probability frac(mean)."""
    whole = int(mean)
    return whole + (1 if rng.random() < mean - whole else 0)


class Fan:
    __slots__ = ('acct', 'strategy', 'near', 'arrive', 'exit_day', 'fav', 'side', 'tranche2_day',
                 'mode', 'next_trade', 'done', 'active_pct')

    def __init__(self, acct, strategy, near, arrive, exit_day, tranche2_day, side):
        self.acct = acct
        self.strategy = strategy
        self.near = near
        self.arrive = arrive
        self.exit_day = exit_day
        self.fav = None
        self.side = side
        self.tranche2_day = tranche2_day
        self.mode = 'hold'
        self.next_trade = None
        self.done = False
        self.active_pct = 70


class World:
    """Runs one scenario for one seed: the people around the contract."""

    def __init__(self, scenario, seed, strict=False, days=DAYS):
        self.name = scenario
        self.cfg = SCENARIOS[scenario]
        self.seed = seed
        self.days = days
        self.rng = Random(seed)
        self.strict = strict
        self.c = Contract(strict=strict, on_increment=self._on_increment)
        self.fans = []
        self.stats = {}            # account -> [strategy, bought, fees, prize, lost, booed]
        self.n_creators = 0
        self.bought_total = 0
        self.bought_whale = 0
        self.near_bought_today = 0
        self.supply = [TOTAL_SUPPLY]
        self.wallets = {}          # agent id -> list of (day, whole $CUT)
        self.snipers = []
        self.sniper_book = {'slice': [0, 0], 'rescue': [0, 0], 'pot': [0, 0], 'saves': 0,
                            'empty_targets': 0, 'capital': 0}
        self.whale = None
        self.whale_pick = None
        self.whale_picks = []      # (season, pick id)
        self.max_unit = {'slice': 0, 'rescue': 0, 'pot': 0, 'combined': 0}

    # ---- helpers -------------------------------------------------------------------------

    def _stat(self, acct, strategy):
        st = self.stats.get(acct)
        if st is None:
            st = self.stats[acct] = [strategy, 0, 0, 0, 0, 0]
        return st

    def _buy(self, acct, near_in, strategy):
        if near_in <= 0:
            return 0
        gross, fee, out = self.c.quote_buy(near_in)
        if out <= 0:
            return 0
        out, fee = self.c.buy(acct, near_in)
        st = self._stat(acct, strategy)
        st[1] += out
        st[2] += fee
        self.bought_total += out
        if strategy == 'whale':
            self.bought_whale += out
        else:
            self.near_bought_today += near_in
        return out

    def _sell_all(self, f):
        amt = self.c.bal.get(f.acct, 0)
        if amt <= 0:
            return
        fee = amt * self.c.p['fee_bps'] // BPS
        net = amt - fee
        if self.c.pool_near * net // (self.c.pool_cut + net) <= 0:
            return
        near, fee = self.c.sell(f.acct, amt)
        f.near += near
        self.stats[f.acct][2] += fee

    def _save(self, acct, aid, amount):
        c = self.c
        if amount <= 0:
            return False
        a = c.agents[aid]
        if acct not in a.records and amount < MIN_SAVE:
            return False
        c.save(acct, aid, amount)
        return True

    def _unsave(self, acct, aid):
        principal, prize = self.c.unsave(acct, aid)
        self.stats[acct][3] += prize

    def _boo(self, acct, aid, amount):
        if amount < MIN_BOO or self.c.bal.get(acct, 0) < amount:
            return False
        self.c.boo(acct, aid, amount)
        self.stats[acct][5] += amount
        return True

    def _projected(self):
        """Live cut order a fan can compute from the chain: score = pile - boos - committed
        attacks (moves are public before the cut). Lowest first, ties go to the newer agent."""
        c = self.c
        return sorted((c.agents[i] for i in c.stage),
                      key=lambda a: (a.pile - a.boos - a.attack_in, -a.seq))

    def _score(self, a):
        return a.pile - a.boos - a.attack_in

    def _on_increment(self, kind, a, paid, uncapped, inc):
        # Sniper accounting: their share with the cap (what the rule pays) and without it.
        if not self.snipers:
            return
        for s in self.snipers:
            rec = a.records.get(s)
            if rec is None:
                continue
            book = self.sniper_book[kind]
            book[0] += rec[0] * inc // ACC_SCALE
            book[1] += rec[0] * uncapped // a.pile if a.pile else 0

    # ---- the day -------------------------------------------------------------------------

    def run(self):
        for day in range(1, self.days + 1):
            self.step(day)
        return self.result()

    def _check(self, where):
        if self.strict:
            self.c.check(where)

    def step(self, day):
        c = self.c
        rng = self.rng
        self.day = day
        self.near_bought_today = 0
        self._registrations(day)
        self._arrivals(day)
        self._check('registrations and arrivals')
        live = [f for f in self.fans if not f.done and f.arrive <= day]
        rng.shuffle(live)
        for f in live:
            if f.arrive == day or rng.randrange(100) < f.active_pct:
                self._fan_morning(f, day)
        if self.snipers:
            for s in self.snipers:
                for aid in list(c.acct_saves.get(s, {})):
                    rec = c.acct_saves[s][aid]
                    if c.agents[aid].status != 'deleted' and c.unlocked(rec):
                        self._unsave(s, aid)
        if self.whale:
            self._whale_morning()
            self._whale_buy(day)
        self._check('fans morning')
        if c.season_active and self.cfg['ai_up']:
            self._agent_moves()
        self._check('agent moves')
        rng.shuffle(live)
        for f in live:
            if not f.done and rng.randrange(100) < f.active_pct:
                self._fan_react(f, day)
        if self.whale:
            self._whale_late()
        self._check('fans react')
        if self.snipers:
            self._snipers_last_block()
        self._check('last block')
        log = c.run_cut()
        for k, key in (('slice', 'max_inc_slice'), ('rescue', 'max_inc_rescue'),
                       ('pot', 'max_inc_pot'), ('combined', 'max_inc_combined')):
            self.max_unit[k] = max(self.max_unit[k], log[key])
        self._after_cut(log, day)
        self._check('after cut')
        self.supply.append(c.supply())
        if self.strict:
            assert self.supply[-1] <= self.supply[-2], 'supply grew'

    def _registrations(self, day):
        c, rng = self.c, self.rng
        if day == 1:
            n = self.cfg['init_agents']
            kinds = list(PERSONALITY_ORDER) * ((n + 3) // 4)
            kinds = kinds[:n]
            rng.shuffle(kinds)
        else:
            n = _draw_count(rng, self.cfg['regs_per_day'])
            kinds = [rng.choice(PERSONALITY_ORDER) for _ in range(n)]
        for kind in kinds:
            creator = f'creator:{self.n_creators}'
            self.n_creators += 1
            seed = rng.choice((1000, 1000, 1500, 2000, 3000)) * ONE
            # The creator buys the seed in the pool first (it pays the fee like anyone).
            gross = -(-seed * BPS // (BPS - c.p['fee_bps'])) + 1
            near_in = -(-gross * c.pool_near // (c.pool_cut - gross)) + 1
            self._buy(creator, near_in, 'creator')
            c.register_agent(creator, kind, seed, day,
                             popularity=rng.choice((1, 1, 1, 2, 2, 3, 5, 8)))

    def _arrivals(self, day):
        rng, cfg = self.rng, self.cfg
        n = cfg['init_fans'] if day == 1 else _draw_count(rng, cfg['fans_per_day'])
        names = [s for s, _ in cfg['mix']]
        weights = [w for _, w in cfg['mix']]
        for _ in range(n):
            strategy = rng.choices(names, weights)[0]
            tier = rng.choices(BUDGET_TIERS, BUDGET_WEIGHTS)[0]
            near = tier * YOCTO * cfg['budget_pct'] // 100
            patience = rng.choices(PATIENCE, PATIENCE_WEIGHTS)[0]
            exit_day = None if patience is None else day + patience
            tranche2 = day + rng.randint(3, 15)
            side = 'A' if strategy == 'group_a' else 'B' if strategy == 'group_b' else None
            f = Fan(f'fan:{len(self.fans)}', strategy, near, day, exit_day, tranche2, side)
            self.fans.append(f)
            self._stat(f.acct, strategy)
        if day == 1:
            if cfg['whale']:
                self.whale = 'whale'
                self._stat('whale', 'whale')
            for i in range(cfg['snipers']):
                s = f'sniper:{i}'
                self.snipers.append(s)
                self._stat(s, 'sniper')
                self._buy(s, YOCTO, 'sniper')          # 1 NEAR of $CUT: enough for 0.1 a day

    # ---- fans ----------------------------------------------------------------------------

    def _fan_morning(self, f, day):
        c = self.c
        if f.arrive == day:
            part = f.near if f.strategy == 'trader' else f.near * 60 // 100
            f.near -= part
            self._buy(f.acct, part, f.strategy)
            if f.strategy == 'trader':
                f.next_trade = day + self.rng.randint(2, 6)
        elif f.tranche2_day == day and f.strategy != 'trader' and f.near > 0:
            part = f.near
            f.near = 0
            self._buy(f.acct, part, f.strategy)
        if f.exit_day is not None and day >= f.exit_day:
            self._fan_exit(f)
            return
        if f.strategy == 'trader':
            self._trader(f, day)
            return
        self._collect(f)
        self._flee(f)
        s = f.strategy
        if s == 'loyal':
            self._loyal_save(f)
        elif s == 'hunter':
            self._hunter(f)
        elif s == 'top_safe':
            self._top_safe(f)
        elif s in ('group_a', 'group_b'):
            self._group_save(f)

    def _fan_react(self, f, day):
        if f.exit_day is not None and day >= f.exit_day:
            return
        s = f.strategy
        if s == 'rescue':
            self._flee(f)
            self._rescue_chase(f)
        elif s == 'loyal':
            self._loyal_boo(f)
        elif s in ('group_a', 'group_b'):
            self._flee(f)
            self._group_boo(f)
        elif s in ('hunter', 'top_safe'):
            self._flee(f)

    def _collect(self, f):
        """Takes back unlocked saves on a champion (its season is over)."""
        c = self.c
        for aid in list(c.acct_saves.get(f.acct, {})):
            rec = c.acct_saves[f.acct][aid]
            if c.agents[aid].status == 'champion' and c.unlocked(rec):
                self._unsave(f.acct, aid)

    def _flee(self, f):
        c = self.c
        if not c.season_active or len(c.stage) < 2:
            return
        victim = self._projected()[0]
        rec = victim.records.get(f.acct)
        if rec is None or not c.unlocked(rec):
            return
        if self.rng.randrange(100) < FLEE[f.strategy]:
            self._unsave(f.acct, victim.id)
            if f.fav == victim.id:
                f.fav = None

    def _fan_exit(self, f):
        c = self.c
        for aid in list(c.acct_saves.get(f.acct, {})):
            rec = c.acct_saves[f.acct][aid]
            if c.agents[aid].status != 'deleted' and c.unlocked(rec):
                self._unsave(f.acct, aid)
        self._sell_all(f)
        if not c.acct_saves.get(f.acct) and c.bal.get(f.acct, 0) == 0:
            f.done = True

    def _trader(self, f, day):
        if f.next_trade is None or day < f.next_trade:
            return
        if f.mode == 'hold':
            self._sell_all(f)
            f.mode = 'wait'
            f.next_trade = day + self.rng.randint(1, 4)
        else:
            part, f.near = f.near, 0
            self._buy(f.acct, part, f.strategy)
            f.mode = 'hold'
            f.next_trade = day + self.rng.randint(2, 6)

    def _pick_fav(self, f):
        c, rng = self.c, self.rng
        stage = [c.agents[i] for i in c.stage]
        bench = [c.agents[i] for i in c.bench]
        pool = stage if stage and (not bench or rng.randrange(100) < 75) else bench
        if not pool:
            return None
        return rng.choices(pool, [a.popularity for a in pool])[0].id

    def _loyal_save(self, f):
        """Keeps 80% of its $CUT saved on the favorite. Adds only new money (more than a
        quarter of what it holds), because adding re-locks the whole save."""
        c = self.c
        if f.fav is None or c.agents[f.fav].status not in ('stage', 'bench'):
            f.fav = self._pick_fav(f)
        if f.fav is None:
            return
        free = c.bal.get(f.acct, 0)
        rec = c.agents[f.fav].records.get(f.acct)
        on = rec[0] if rec else 0
        if rec is None or free * 4 > free + on:
            self._save(f.acct, f.fav, free * 80 // 100)

    def _loyal_boo(self, f):
        c = self.c
        if (f.fav is None or not c.season_active or c.agents[f.fav].status != 'stage'
                or len(c.stage) < 2 or self.rng.randrange(100) >= 30):
            return
        order = self._projected()
        if order[0].id != f.fav:
            return
        nxt = order[1]
        gap = self._score(nxt) - self._score(order[0]) + 1
        self._boo(f.acct, nxt.id, min(c.bal.get(f.acct, 0) * 20 // 100, max(gap, MIN_BOO)))

    def _best_yield(self, amount, use_bounty):
        """The stage agent that pays the most for `amount` saved now, skipping the lowest two
        scores (one when three or fewer are left). Returns (agent, payout estimate)."""
        c = self.c
        order = self._projected()
        n = len(order)
        if n < 2 or amount <= 0:
            return None, 0.0
        skip = 2 if n > 3 else 1
        victim = order[0]
        est_prize = c.day_fees + victim.pile - victim.pile * c.p['burn_bps'] // BPS
        sl = est_prize * c.p['savers_bps'] // BPS // (n - 1)
        best, best_v = None, 0.0
        for a in order[skip:]:
            if use_bounty and not a.bounty:
                continue
            tot = a.pile + amount
            v = min(sl, tot) / tot
            if use_bounty:
                v += min(a.bounty, tot) / tot
            if v > best_v:
                best, best_v = a, v
        return best, best_v

    def _hunter(self, f):
        c = self.c
        if not c.season_active:
            return
        free = c.bal.get(f.acct, 0)
        moveable = free + sum(r[0] for aid, r in c.acct_saves.get(f.acct, {}).items()
                              if c.unlocked(r) and c.agents[aid].status != 'deleted')
        best, v = self._best_yield(moveable, False)
        if best is None:
            return
        for aid in list(c.acct_saves.get(f.acct, {})):
            rec = c.acct_saves[f.acct][aid]
            if aid != best.id and c.unlocked(rec) and c.agents[aid].status != 'deleted':
                self._unsave(f.acct, aid)
        self._save(f.acct, best.id, c.bal.get(f.acct, 0))

    def _top_safe(self, f):
        c = self.c
        if c.season_active:
            order = self._projected()
            if not order:
                return
            target = order[-1]
        elif c.bench:
            target = max((c.agents[i] for i in c.bench), key=lambda a: (a.pile, -a.seq))
        else:
            return
        self._save(f.acct, target.id, c.bal.get(f.acct, 0))

    def _rescue_chase(self, f):
        c = self.c
        if not c.season_active:
            return
        free = c.bal.get(f.acct, 0)
        moveable = free + sum(r[0] for aid, r in c.acct_saves.get(f.acct, {}).items()
                              if c.unlocked(r) and c.agents[aid].status != 'deleted')
        best, v = self._best_yield(moveable, True)
        if best is None or best.bounty == 0 or v < 0.002:
            return
        for aid in list(c.acct_saves.get(f.acct, {})):
            rec = c.acct_saves[f.acct][aid]
            if aid != best.id and c.unlocked(rec) and c.agents[aid].status != 'deleted':
                self._unsave(f.acct, aid)
        self._save(f.acct, best.id, c.bal.get(f.acct, 0))

    def _side(self, a):
        return 'A' if a.seq % 2 == 0 else 'B'

    def _group_save(self, f):
        c, rng = self.c, self.rng
        ids = c.stage if c.season_active else c.bench
        own = [c.agents[i] for i in ids if self._side(c.agents[i]) == f.side]
        if not own:
            return
        pick = rng.choices(own, [a.popularity for a in own])[0]
        self._save(f.acct, pick.id, c.bal.get(f.acct, 0) * 50 // 100)

    def _group_boo(self, f):
        c = self.c
        if not c.season_active:
            return
        rivals = [a for a in self._projected() if self._side(a) != f.side]
        if rivals:
            self._boo(f.acct, rivals[0].id, c.bal.get(f.acct, 0) * 15 // 100)

    # ---- whale ---------------------------------------------------------------------------

    def _whale_buy(self, day):
        # Buys 3/7 of what everyone else paid today, so it holds about 30% of bought supply.
        self._buy('whale', self.near_bought_today * 3 // 7, 'whale')

    def _whale_morning(self):
        """Takes back unlocked saves on a champion (its season is over)."""
        c = self.c
        for aid in list(c.acct_saves.get('whale', {})):
            rec = c.acct_saves['whale'][aid]
            if c.agents[aid].status == 'champion' and c.unlocked(rec):
                self._unsave('whale', aid)

    def _whale_late(self):
        """Picks a winner and boos rivals. Keeps half of its $CUT saved on the pick and half
        free as a war chest.
        - Pick: the biggest bench queue while no season runs (it will take a seat), then the
          biggest pile on the stage (again if the pick dies).
        - Tops the pick's save up to half of its holdings; if the pick would be cut, saves
          what lifts it out.
        - Boos the strongest rival to just below the lowest score (so that rival is the one
          cut) when that costs at most half of its free $CUT; on the final cut, whatever it
          costs within its free $CUT."""
        c = self.c
        w = 'whale'
        saves = c.acct_saves.get(w, {})
        holdings = c.bal.get(w, 0) + sum(r[0] for aid, r in saves.items()
                                         if c.agents[aid].status != 'deleted')
        if not c.season_active:
            if c.bench:
                tgt = max((c.agents[i] for i in c.bench), key=lambda a: (a.pile, -a.seq))
                on = saves.get(tgt.id, [0])[0]
                self._save(w, tgt.id, min(c.bal.get(w, 0), max(0, holdings // 2 - on)))
            return
        pick = c.agents.get(self.whale_pick) if self.whale_pick else None
        if pick is None or pick.status != 'stage':
            pick = max((c.agents[i] for i in c.stage), key=lambda a: (a.pile, -a.seq))
            self.whale_pick = pick.id
            self.whale_picks.append((c.season_index, pick.id))
        on = saves.get(pick.id, [0])[0]
        self._save(w, pick.id, min(c.bal.get(w, 0), max(0, holdings // 2 - on)))
        order = self._projected()
        if len(order) >= 2 and order[0] is pick:
            need = self._score(order[1]) - self._score(pick) + 1
            if 0 < need <= c.bal.get(w, 0):
                self._save(w, pick.id, need)
        order = self._projected()
        rivals = [a for a in order if a is not pick]
        if not rivals:
            return
        strongest = max(rivals, key=lambda a: (self._score(a), -a.seq))
        rest = [a for a in order if a is not strongest]
        lowest_rest = min(self._score(a) for a in rest)
        cost = self._score(strongest) - lowest_rest + 1
        budget = c.bal.get(w, 0) if len(order) == 2 else c.bal.get(w, 0) // 2
        if 0 < cost <= budget:
            self._boo(w, strongest.id, max(cost, MIN_BOO))

    # ---- snipers -------------------------------------------------------------------------

    def _snipers_last_block(self):
        """Last block before the cut: save 0.1 $CUT on the survivor-to-be with the smallest
        pile (the exact projected loser is skipped: every input is public)."""
        c = self.c
        if not c.season_active or len(c.stage) < 2:
            return
        order = self._projected()
        survivors = order[1:]
        target = min(survivors, key=lambda a: (a.pile, a.seq))
        if target.pile == 0:
            self.sniper_book['empty_targets'] += 1
        for s in self.snipers:
            if c.bal.get(s, 0) >= MIN_SAVE:
                self._save(s, target.id, MIN_SAVE)
                self.sniper_book['saves'] += 1
                self.sniper_book['capital'] += MIN_SAVE

    # ---- agents --------------------------------------------------------------------------

    def _agent_moves(self):
        c, rng = self.c, self.rng
        brief = c.brief
        rows = {r['id']: r for r in brief['agents']}
        for aid in list(c.stage):
            a = c.agents[aid]
            me = rows.get(aid)
            if c.wallet(aid) < c.p['think_fee']:
                a.silent_days += 1            # cannot pay the think fee: refused, holds
                continue
            if me is not None and rng.randrange(100) < self.cfg['agent_act']:
                move = POLICIES[a.personality](me, brief, rng)
            else:
                move = ('hold', None, 0, None)
            c.submit_move(aid, *move)

    # ---- after the cut -------------------------------------------------------------------

    def _after_cut(self, log, day):
        c = self.c
        if log['deleted']:
            dead = c.agents[log['deleted']]
            for acct in list(dead.records):
                st = self.stats.get(acct)
                rec = dead.records[acct]
                if st is not None:
                    st[4] += rec[0]           # principal lost with the agent
                saver_part, creator_part = c.claim(acct)
                if st is not None:
                    st[3] += saver_part
        for acct in list(c.creator_owed):
            c.claim(acct)
        if log['started'] and self.whale:
            self.whale_pick = None
        for aid, a in c.agents.items():
            if a.status in ('stage', 'bench') or a.end_cut == log['index']:
                w = a.wallet_at_end if a.end_cut == log['index'] else c.wallet(aid)
                self.wallets.setdefault(aid, []).append((day, w // ONE))

    # ---- results -------------------------------------------------------------------------

    def result(self):
        c = self.c
        # Fan P&L: prizes collected + prizes still pending on live saves - principal lost
        # with cut agents - boos burned - trading fees, all in $CUT.
        by_strategy = {}
        for acct, st in self.stats.items():
            strategy = st[0]
            if strategy == 'creator':
                continue
            pending = 0
            for aid, rec in c.acct_saves.get(acct, {}).items():
                a = c.agents[aid]
                if a.status != 'deleted':
                    pending += rec[3] + rec[0] * (a.acc - rec[2]) // ACC_SCALE
            row = by_strategy.setdefault(strategy, [0, 0, 0, 0, 0, 0])
            row[0] += 1
            row[1] += st[1]
            row[2] += st[3] + pending
            row[3] += st[4]
            row[4] += st[5]
            row[5] += st[2]
        agents = []
        for a in c.agents.values():
            agents.append({'id': a.id, 'personality': a.personality, 'seq': a.seq,
                           'registered_day': a.registered_day, 'seated_cut': a.seated_cut,
                           'season': a.season, 'end_cut': a.end_cut, 'outcome': a.outcome,
                           'wallet_at_end': a.wallet_at_end, 'silent_days': a.silent_days,
                           'wallets': self.wallets.get(a.id, [])})
        whale = None
        if self.whale:
            champs = {s['index']: s['champion'] for s in c.seasons if s['champion']}
            picks = {}
            for season, pid in self.whale_picks:
                picks.setdefault(season, []).append(pid)
            won = sum(1 for s, ch in champs.items() if picks.get(s) and picks[s][-1] == ch)
            whale = {'share_bought': self.bought_whale / self.bought_total if self.bought_total else 0,
                     'seasons_won': won, 'seasons': len(champs),
                     'booed': self.stats['whale'][5]}
        return {
            'scenario': self.name, 'seed': self.seed,
            'supply': self.supply,
            'burned': c.burned, 'burn_by': dict(c.burn_by),
            'seasons': [dict(s) for s in c.seasons],
            'fans': by_strategy,
            'agents': agents,
            'sniper': dict(self.sniper_book) if self.snipers else None,
            'whale': whale,
            'max_unit': dict(self.max_unit),
            'bought_total': self.bought_total,
            'pot_left': c.pot, 'day_prize_left': c.day_fees,
            'cuts': [{k: v for k, v in log.items() if k != 'burned_before'} for log in c.cut_log],
            'checks': c.checks,
            'stage_size': c.p['stage_size'],
        }


def run_one(args):
    scenario, seed, days = args
    return World(scenario, seed, days=days).run()


# ---------------------------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------------------------

SPARK = '_.-~=+*#'


def spark(values, lo, hi):
    if hi <= lo:
        return SPARK[-1] * len(values)
    out = []
    for v in values:
        i = int((v - lo) * (len(SPARK) - 1) // (hi - lo))
        out.append(SPARK[max(0, min(len(SPARK) - 1, i))])
    return ''.join(out)


def cut_whole(units):
    return units // ONE


def fmt(n):
    return f'{n:,}'


def pct(part, whole, digits=2):
    return f'{100 * part / whole:.{digits}f}%' if whole else '-'


def med(xs):
    return statistics.median(xs) if xs else 0


def strat_return(runs, names):
    """Pooled net game return, in %, of the fans following the given strategies."""
    bought = net = 0
    for r in runs:
        for s, row in r['fans'].items():
            if s in names:
                bought += row[1]
                net += row[2] - row[3] - row[4] - row[5]
    return 100 * net / bought if bought else 0


def season_stats(runs):
    """Completed seasons pooled across runs: count, champions by personality, pot figures."""
    done = [s for r in runs for s in r['seasons'] if s['crown_cut']]
    champions = {k: 0 for k in PERSONALITY_ORDER}
    for s in done:
        champions[s['personality']] += 1
    return {
        'completed': len(done),
        'champions': champions,
        'pot_carried': sum(1 for s in done if s['pot_carried'] > 0),
        'pot_paid_median': int(med([cut_whole(s['pot_paid']) for s in done])),
        'pot_left_median': int(med([cut_whole(r['pot_left']) for r in runs])),
    }


def sniper_totals(runs):
    """Sums of (with cap, without cap) payouts to the sniper accounts across runs, in units."""
    t = {k: [0, 0] for k in ('slice', 'rescue', 'pot', 'total')}
    per_seed = []
    t['saves'] = t['empty'] = 0
    for r in runs:
        sb = r['sniper']
        for k in ('slice', 'rescue', 'pot'):
            for i in (0, 1):
                t[k][i] += sb[k][i]
                t['total'][i] += sb[k][i]
        per_seed.append([sum(sb[k][i] for k in ('slice', 'rescue', 'pot')) for i in (0, 1)])
        t['saves'] += sb['saves']
        t['empty'] += sb['empty_targets']
    t['median'] = [med([p[0] for p in per_seed]), med([p[1] for p in per_seed])]
    return t


def summarize(results_by_scenario, seeds, days, thin=None):
    lines = []
    w = lines.append
    w('# The Cut v20: 60-day simulation')
    w('')
    w(f'Generated by `python3 sim/thecut_sim.py --write` ({seeds} seeds per scenario, seeds '
      f'0-{seeds - 1}, {days} daily cuts). Do not edit by hand: re-run the script. Same seeds, '
      'same numbers, on any machine with Python 3.')
    w('')
    w('Rules: `RULES.md`, modelled in `class Contract` of `sim/thecut_sim.py` with '
      'exact integer $CUT units (18 decimals) and the ten cut steps in the spec\'s order. '
      'People are not modelled exactly: fans follow simple strategies, and **the four agent '
      'personalities follow short written policies that stand in for the model** '
      '(`POLICIES` in the script). A real LLM reading the charter and the board may play very '
      'differently. Numbers are medians across seeds unless a column says otherwise.')
    w('')
    w('Assumptions that are not in the spec: the pool starts with 10,000 NEAR against the 10M '
      '$CUT (testnet used 4 NEAR; only the ratio to fan budgets matters); a fan\'s NEAR budget '
      'is 1, 2, 5, 10, 20 or 50 NEAR (25/25/25/15/7/3% of fans), 60% bought on arrival and the '
      'rest 3-15 days later; a fan acts on 70% of days and 30% of fans never leave (the rest '
      'sell out after 7-45 days); creators seed 1,000-3,000 $CUT bought from the pool; one cut '
      'every 24 h, the first at the end of day 1. Fans and agents never make mistakes.')
    w('')
    w('## Scenarios')
    w('')
    w('| Scenario | What the people do |')
    w('| - | - |')
    for name in SCENARIO_ORDER:
        if name in results_by_scenario:
            w(f'| `{name}` | {SCENARIOS[name]["desc"]} |')
    w('')

    # ---- summary -----------------------------------------------------------------------
    w('## Summary after 60 days')
    w('')
    w('| Scenario | Supply left (median) | Range across seeds | Burned | Seasons completed '
      '(min / median / max) | Longest season (cuts) | Bought from the pool (gross, '
      'traders re-buy) |')
    w('| - | - | - | - | - | - | - |')
    all_supply = []
    for name, runs in results_by_scenario.items():
        finals = [cut_whole(r['supply'][-1]) for r in runs]
        all_supply += [cut_whole(v) for r in runs for v in r['supply']]
        seasons = [sum(1 for s in r['seasons'] if s['crown_cut']) for r in runs]
        longest = max((s['crown_cut'] - s['start_cut'] for r in runs for s in r['seasons']
                       if s['crown_cut']), default=0)
        burned = med([cut_whole(r['burned']) for r in runs])
        bought = med([cut_whole(r['bought_total']) for r in runs])
        w(f'| `{name}` | {fmt(int(med(finals)))} | {fmt(min(finals))} - {fmt(max(finals))} | '
          f'{fmt(int(burned))} ({pct(burned, 10_000_000)}) | {min(seasons)} / '
          f'{med(seasons):g} / {max(seasons)} | {longest} | {fmt(int(bought))} '
          f'({pct(bought, 10_000_000, 1)}) |')
    w('')

    # ---- supply over time --------------------------------------------------------------
    lo, hi = min(all_supply), 10_000_000
    w('## Supply over time')
    w('')
    w(f'One character per day, median across seeds, all rows on the same scale: `{SPARK[-1]}` = '
      f'10,000,000 $CUT, `{SPARK[0]}` = {fmt(lo)} $CUT (the lowest value any seed of any '
      'scenario reached). Supply only goes down.')
    w('')
    w('```')
    for name, runs in results_by_scenario.items():
        series = [int(med([cut_whole(r['supply'][d]) for r in runs])) for d in range(days + 1)]
        w(f'{name:8s} {spark(series, lo, hi)}  {fmt(series[-1])}')
    w('```')
    w('')
    w('Supply every 10 days, min / median / max across seeds (whole $CUT):')
    w('')
    checkpoints = list(range(0, days + 1, 10))
    if checkpoints[-1] != days:
        checkpoints.append(days)
    w('| Scenario | ' + ' | '.join(f'Day {d}' for d in checkpoints[1:]) + ' |')
    w('| - |' + ' - |' * (len(checkpoints) - 1))
    for name, runs in results_by_scenario.items():
        cells = []
        for d in checkpoints[1:]:
            vals = [cut_whole(r['supply'][d]) for r in runs]
            cells.append(f'{fmt(min(vals))} / {fmt(int(med(vals)))} / {fmt(max(vals))}')
        w(f'| `{name}` | ' + ' | '.join(cells) + ' |')
    w('')

    # ---- burn by source ----------------------------------------------------------------
    w('## Burn by source')
    w('')
    w('Median per seed, whole $CUT, and the share of that scenario\'s total burn (mean across '
      'seeds). "Prize-cap excess" includes the slices of survivors with an empty pile.')
    w('')
    w('| Scenario | ' + ' | '.join(s.replace('_', ' ') for s in BURN_SOURCES) + ' | Total |')
    w('| - |' + ' - |' * (len(BURN_SOURCES) + 1))
    for name, runs in results_by_scenario.items():
        total = sum(r['burned'] for r in runs)
        cells = []
        for src in BURN_SOURCES:
            m = int(med([cut_whole(r['burn_by'][src]) for r in runs]))
            share = pct(sum(r['burn_by'][src] for r in runs), total, 1)
            cells.append(f'{fmt(m)} ({share})')
        w(f'| `{name}` | ' + ' | '.join(cells) + f' | {fmt(int(med([cut_whole(r["burned"]) for r in runs])))} |')
    w('')

    # ---- seasons and champions ---------------------------------------------------------
    w('## Seasons and champions')
    w('')
    w('A season seats up to 10 agents and crowns a champion after (seated - 1) cuts; the next '
      'one starts at the following cut if at least 3 agents wait on the bench.')
    w('')
    w('At a crown the champion\'s savers get min(season pot, champion pile), at most 1 $CUT per '
      '$CUT saved; the rest of the pot carries to the next champion. "Pot carried" counts the '
      'crowns where part of the pot carried.')
    w('')
    w('| Scenario | Seasons completed (all seeds) | Seated per season (median) | Champions: '
      'miser / gambler / traitor / generous | Pot paid per crown (median) | Pot carried '
      '(crowns, all seeds) | Pot waiting at day 60 (median) |')
    w('| - | - | - | - | - | - | - |')
    for name, runs in results_by_scenario.items():
        stats = season_stats(runs)
        seated = med([len(s['seated']) for r in runs for s in r['seasons']])
        w(f'| `{name}` | {stats["completed"]} | {seated:g} | '
          + ' / '.join(str(stats['champions'][k]) for k in PERSONALITY_ORDER)
          + f' | {fmt(stats["pot_paid_median"])} | {stats["pot_carried"]} | '
          f'{fmt(stats["pot_left_median"])} |')
    w('')

    # ---- per-unit cap check ------------------------------------------------------------
    w('## Per-unit cap check')
    w('')
    w('Highest $CUT paid per $CUT saved on one agent at one cut, over all seeds. The spec caps '
      'the rescue (step 4), the day prize slice (step 6) and the champion pot (step 8) at 1 '
      'each, separately, so on one agent at one cut they can add up to more than 1 (up to 3 '
      'for a champion at its crown).')
    w('')
    w('| Scenario | Rescue | Day prize slice | Champion pot | All three on one agent, same cut |')
    w('| - | - | - | - | - |')
    for name, runs in results_by_scenario.items():
        cells = [max(r['max_unit'][k] for r in runs) / ACC_SCALE
                 for k in ('rescue', 'slice', 'pot', 'combined')]
        w(f'| `{name}` | ' + ' | '.join(f'{v:.3f}' for v in cells) + ' |')
    w('')

    # ---- fans --------------------------------------------------------------------------
    w('## Fan return by strategy')
    w('')
    w('All seeds pooled, in whole $CUT. Net = prizes (day slices, rescues, season pots, '
      'including prizes still pending on live saves) - saves lost when the agent was cut - '
      'boos burned - trading fees. "Net / bought" is the game return on the $CUT the strategy '
      'bought; it ignores the NEAR price.')
    w('')
    for name, runs in results_by_scenario.items():
        agg = {}
        for r in runs:
            for strategy, row in r['fans'].items():
                acc = agg.setdefault(strategy, [0] * 6)
                for i in range(6):
                    acc[i] += row[i]
        w(f'**`{name}`**')
        w('')
        w('| Strategy | Accounts | Bought | Prizes | Lost with cut agents | Boos | Fees | Net | '
          'Net / bought |')
        w('| - | - | - | - | - | - | - | - | - |')
        for strategy in sorted(agg, key=lambda s: -agg[s][1]):
            n, bought, prize, lost, booed, fees = agg[strategy]
            net = prize - lost - booed - fees
            w(f'| {strategy} | {fmt(n)} | {fmt(cut_whole(bought))} | {fmt(cut_whole(prize))} | '
              f'{fmt(cut_whole(lost))} | {fmt(cut_whole(booed))} | {fmt(cut_whole(fees))} | '
              f'{fmt(cut_whole(net))} | {pct(net, bought, 1)} |')
        w('')
    w('Strategies: ' + '; '.join(f'`{k}` {v}' for k, v in STRATEGY_NOTES.items()
                                 if k not in ('whale', 'sniper')) + '.')
    w('')

    # ---- sniper --------------------------------------------------------------------------
    if 'sniper' in results_by_scenario:
        crowds = [('Steady crowd (`sniper`)', sniper_totals(results_by_scenario['sniper']))]
        if thin:
            crowds.append(('Thin crowd (40 fans + 1 a day)', sniper_totals(thin)))
        w('## Sniper: what the per-unit cap closes')
        w('')
        w('Five accounts save 0.1 $CUT each in the last block before every cut on the survivor '
          'with the smallest pile (the loser is known then, so the save is never at risk), and '
          'take it back the next morning. "Without the cap" is what the same saves would have '
          'received at the same cuts if the whole slice, bounty or season pot went to the pile. '
          'The thin crowd runs the same attack with a third of the fans; it appears only here.')
        w('')
        head = ' | '.join(f'{label}: with cap | without cap' for label, _ in crowds)
        w(f'| $CUT paid to the snipers, all {seeds} seeds | {head} |')
        w('| - |' + ' - | - |' * len(crowds))
        labels = {'slice': 'Day prize slices', 'rescue': 'Rescue bounties',
                  'pot': 'Champion pot', 'total': '**Total**',
                  'median': 'Median per seed (total)'}
        for k in ('slice', 'rescue', 'pot', 'total', 'median'):
            cells = []
            for _, t in crowds:
                cells += [f'{t[k][0] / ONE:,.2f}', f'{t[k][1] / ONE:,.2f}']
            w(f'| {labels[k]} | ' + ' | '.join(cells) + ' |')
        cells = []
        for _, t in crowds:
            cells += [fmt(t['saves']), '']
        w('| Last-block saves of 0.1 $CUT | ' + ' | '.join(cells) + ' |')
        cells = []
        for _, t in crowds:
            cells += [fmt(t['empty']), '']
        w('| Cuts where the target had an empty pile | ' + ' | '.join(cells) + ' |')
        w('')

    # ---- whale -------------------------------------------------------------------------
    if 'whale' in results_by_scenario:
        runs = results_by_scenario['whale']
        share = med([r['whale']['share_bought'] for r in runs])
        won = sum(r['whale']['seasons_won'] for r in runs)
        seasons = sum(r['whale']['seasons'] for r in runs)
        booed = med([cut_whole(r['whale']['booed']) for r in runs])
        w('## Whale')
        w('')
        w(f'Median share of all $CUT bought from the pool: {share * 100:.1f}%. The agent it backed '
          f'was crowned in {won} of {seasons} completed seasons. Median $CUT it burned booing '
          f'rivals: {fmt(int(booed))} per seed. Its money, its boos and its return are in the '
          '`whale` rows of the tables above.')
        w('')

    # ---- agents ------------------------------------------------------------------------
    w('## Agents by personality')
    w('')
    w('All seeds pooled. "Days on stage" counts cuts from its seat to its end (or to day 60). '
      '"Wallet at the end" is its $CUT when it was cut (then inherited or burned) or crowned '
      '(then burned). "Went silent" = at least one day it could not pay the 10 $CUT think fee.')
    w('')
    w('| Scenario | Personality | Seated | Champions | Median days on stage | Median wallet at '
      'the end | Went silent |')
    w('| - | - | - | - | - | - | - |')
    for name, runs in results_by_scenario.items():
        for kind in PERSONALITY_ORDER:
            seated = [a for r in runs for a in r['agents']
                      if a['personality'] == kind and a['seated_cut'] is not None]
            if not seated:
                continue
            champs = sum(1 for a in seated if a['outcome'] == 'champion')
            stay = [(a['end_cut'] or days) - a['seated_cut'] for a in seated]
            ends = [cut_whole(a['wallet_at_end']) for a in seated if a['wallet_at_end'] is not None]
            silent = sum(1 for a in seated if a['silent_days'] > 0)
            w(f'| `{name}` | {kind} | {len(seated)} | {champs} | {med(stay):g} | '
              f'{fmt(int(med(ends)))} | {pct(silent, len(seated), 0)} |')
    w('')

    # ---- wallet trajectories -----------------------------------------------------------
    w('## Agent wallets, season 1, seed 0')
    w('')
    w('One character per day from the agent\'s registration to its end, scaled per row from 0 '
      f'(`{SPARK[0]}`) to that agent\'s peak (`{SPARK[-1]}`). Values in whole $CUT.')
    w('')
    for name, runs in results_by_scenario.items():
        r0 = next((r for r in runs if r['seed'] == 0), runs[0])
        rows = [a for a in r0['agents'] if a['season'] == 1]
        if not rows:
            continue
        w(f'`{name}`')
        w('')
        w('```')
        w(f'{"agent":7s} {"kind":8s} {"start":>6s} {"peak":>7s} {"end":>7s}  outcome      wallet')
        for a in sorted(rows, key=lambda a: (a['end_cut'] or 999, a['seq'])):
            vals = [v for _, v in a['wallets']]
            if not vals:
                continue
            peak = max(vals)
            end = vals[-1]
            out = (f'cut {a["end_cut"]}' if a['outcome'] == 'cut'
                   else f'champ {a["end_cut"]}' if a['outcome'] == 'champion' else a['outcome'])
            w(f'{a["id"]:7s} {a["personality"]:8s} {fmt(vals[0]):>6s} {fmt(peak):>7s} '
              f'{fmt(end):>7s}  {out:11s}  {spark(vals, 0, peak)}')
        w('```')
        w('')

    # ---- what this shows ---------------------------------------------------------------
    st = results_by_scenario.get('steady')
    w('## What this shows')
    w('')
    if st:
        burn_tot = {s: sum(r['burn_by'][s] for r in st) for s in BURN_SOURCES}
        top = max(burn_tot, key=burn_tot.get)
        total = sum(burn_tot.values())
        w(f'- **Supply reacts to play, and only downward.** In `steady` the median seed ends at '
          f'{fmt(int(med([cut_whole(r["supply"][-1]) for r in st])))} $CUT. The biggest burn '
          f'source there is `{top.replace("_", " ")}` ({pct(burn_tot[top], total, 0)} of the '
          'burn). Every scenario burns; none mints.')
    if 'quiet' in results_by_scenario and 'ai_down' in results_by_scenario:
        q = results_by_scenario['quiet']
        ad = results_by_scenario['ai_down']
        qs = [sum(1 for s in r['seasons'] if s['crown_cut']) for r in q]
        ads = [sum(1 for s in r['seasons'] if s['crown_cut']) for r in ad]

        def span(xs):
            return str(min(xs)) if min(xs) == max(xs) else f'{min(xs)} to {max(xs)}'
        w(f'- **The game always ends and restarts.** With few fans and agents that mostly hold '
          f'(`quiet`), every seed still completes {span(qs)} seasons; with no agent moves at all '
          f'(`ai_down`), every seed completes {span(ads)}. A cut never waits for anyone, and no '
          f'season ran longer than stage size - 1 = 9 cuts.')
    if 'sniper' in results_by_scenario:
        t = sniper_totals(results_by_scenario['sniper'])
        msg = (f'- **The per-unit cap closes the empty-pile snipe.** Over {seeds} seeds of the '
               f'steady crowd, the last-block 0.1 $CUT saves were paid {t["total"][0] / ONE:,.2f} '
               f'$CUT with the cap and would have been paid {t["total"][1] / ONE:,.2f} $CUT '
               'without it')
        if thin:
            tt = sniper_totals(thin)
            msg += (f'; in the thin crowd, {tt["total"][0] / ONE:,.2f} against '
                    f'{tt["total"][1] / ONE:,.2f}')
        w(msg + '. The snipe only pays when a survivor\'s pile is smaller than its slice, which '
          'a crowd of yield-seeking fans rarely leaves open.')
    if st:
        loyal = strat_return(st, ('loyal',))
        movers = strat_return(st, ('hunter', 'rescue', 'top_safe'))
        w(f'- **Saving and walking away loses; moving pays.** In `steady`, loyal fans (who '
          f'rarely move a save) ended at {loyal:+.0f}% of the $CUT they bought, because nine of '
          f'ten agents die every season and a save on a cut agent is gone. Fans who move their '
          f'saves (hunter, rescue, top_safe) ended at {movers:+.0f}%, paid mostly by those '
          'losses. This is the rule working as written; it is also harsh on casual fans.')
    if 'whale' in results_by_scenario:
        runs = results_by_scenario['whale']
        won = sum(r['whale']['seasons_won'] for r in runs)
        seasons = sum(r['whale']['seasons'] for r in runs)
        wret = strat_return(runs, ('whale',))
        booed = med([cut_whole(r['whale']['booed']) for r in runs])
        w(f'- **Money weighs, as the spec\'s known limits say.** A whale holding about 30% of '
          f'bought supply got its pick crowned in {won} of {seasons} seasons, but paid for every '
          f'point: it ended at {wret:+.0f}% of the $CUT it bought, and its boos alone burned '
          f'{fmt(int(booed))} $CUT per seed (median).')
    w('')
    w('## What this does not show')
    w('')
    w('- **How a real model plays.** Agent moves here come from four short written rules, not '
      'from z-ai/glm-5.3-flash reading a charter. Real agents may bluff, ally, or waste their '
      'wallets in ways these rules never do. The personality caps (5/50/20/40% a day, no attacks '
      'for generous) are enforced exactly; the choices inside them are guesses.')
    w('- **Real fans.** Arrivals, budgets, strategies and their mix are assumptions. Fans here '
      'never panic, never forget to unsave, and read the chain perfectly. The NEAR price of $CUT '
      'and anything outside the game (exchanges, other pools, social media) is not modelled.')
    w('- **Relayer choice, key rotation, failed account deletions, gas, storage deposits and '
      'NEAR refunds** are outside this model; only $CUT flows are simulated.')
    w('- **Sybil splitting** is not tested: every rule counts $CUT, not accounts, so five '
      'sniper accounts with 0.1 $CUT each are paid what one account with 0.5 $CUT would be. '
      'That follows from the rules, not from the simulation.')
    w('- **A big last-block save on the likely champion** still shares the champion pot pro '
      'rata (step 8), now at most 1 $CUT per $CUT saved. The snipers here only ever save 0.1 '
      '$CUT; a bigger last-block saver is not simulated.')
    w('')
    w('## Reproduce')
    w('')
    w('```')
    w('python3 -B sim/thecut_sim.py --write          # this file and the app data file')
    w('python3 -B -m unittest discover -s sim -v     # invariants')
    w('```')
    w('')
    return '\n'.join(lines)


APP_DATA_PATH = ('src', 'features', 'inside', 'data', 'sim-v20.json')
FAN_RETURN_KEYS = ('loyal', 'hunter', 'rescue', 'top_safe', 'trader')


def app_data(results_by_scenario, thin, seeds, days):
    """The app's data file. Whole $CUT as integers. Supply: per-day median / min / max across
    seeds. Burn figures: median per seed. Seasons, champions and pot_carried: counts pooled
    over all seeds (champions add up to seasons_completed). Sniper: $CUT paid over all seeds.
    Fan returns: pooled net game return of each strategy in steady, in % of $CUT bought."""
    scenarios = []
    for name in SCENARIO_ORDER:
        runs = results_by_scenario[name]
        per_day = [[cut_whole(r['supply'][d]) for r in runs] for d in range(days + 1)]
        burned = int(med([cut_whole(r['burned']) for r in runs]))
        stats = season_stats(runs)
        scenarios.append({
            'key': name,
            'what': SCENARIOS[name]['desc'],
            'supply': {'median': [int(med(v)) for v in per_day],
                       'min': [min(v) for v in per_day],
                       'max': [max(v) for v in per_day]},
            'burned': burned,
            'burned_pct': round(100 * burned / cut_whole(TOTAL_SUPPLY), 2),
            'burn_by_source': {s: int(med([cut_whole(r['burn_by'][s]) for r in runs]))
                               for s in BURN_SOURCES},
            'seasons_completed': stats['completed'],
            'champions': stats['champions'],
            'pot_carried': stats['pot_carried'],
        })
    steady = sniper_totals(results_by_scenario['sniper'])
    thin_t = sniper_totals(thin)
    return {
        'generated_by': 'python3 sim/thecut_sim.py --write',
        'seeds': seeds,
        'days': days,
        'supply0': cut_whole(TOTAL_SUPPLY),
        'scenarios': scenarios,
        'sniper': {
            'paid_with_cap': round(steady['total'][0] / ONE, 2),
            'paid_without_cap': round(steady['total'][1] / ONE, 2),
            'thin_crowd_with_cap': round(thin_t['total'][0] / ONE, 2),
            'thin_crowd_without_cap': round(thin_t['total'][1] / ONE, 2),
        },
        'fan_returns_steady_pct': {s: round(strat_return(results_by_scenario['steady'], (s,)), 1)
                                   for s in FAN_RETURN_KEYS},
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--seeds', type=int, default=SEEDS)
    ap.add_argument('--days', type=int, default=DAYS)
    ap.add_argument('--scenario', action='append', choices=SCENARIO_ORDER)
    ap.add_argument('--jobs', type=int, default=min(4, os.cpu_count() or 1))
    ap.add_argument('--write', action='store_true', help='write sim/RESULTS.md')
    args = ap.parse_args(argv)
    names = args.scenario or list(SCENARIO_ORDER)
    if 'sniper' in names:
        names = names + ['sniper_thin']
    tasks = [(name, seed, args.days) for name in names for seed in range(args.seeds)]
    t0 = time.time()
    if args.jobs > 1:
        from concurrent.futures import ProcessPoolExecutor
        with ProcessPoolExecutor(max_workers=args.jobs) as ex:
            results = list(ex.map(run_one, tasks, chunksize=2))
    else:
        results = [run_one(t) for t in tasks]
    by = {}
    for r in results:
        by.setdefault(r['scenario'], []).append(r)
    thin = by.pop('sniper_thin', None)
    report = summarize(by, args.seeds, args.days, thin)
    if args.write:
        here = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(here, 'RESULTS.md')
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(report)
        print(f'wrote {path}')
        if all(name in by for name in SCENARIO_ORDER) and thin:
            data = app_data(by, thin, args.seeds, args.days)
            path = os.path.join(os.path.dirname(here), *APP_DATA_PATH)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(json.dumps(data, indent=2) + '\n')
            print(f'wrote {path}')
        else:
            print('app data file not written: it needs every scenario', file=sys.stderr)
    else:
        print(report)
    print(f'{len(tasks)} runs in {time.time() - t0:.1f}s', file=sys.stderr)


if __name__ == '__main__':
    main()
