"""Invariant tests for sim/thecut_sim.py.

    python3 -B -m unittest discover -s sim -v
    python3 -B sim/test_thecut_sim.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import thecut_sim as sim  # noqa: E402

ONE = sim.ONE


class WholeRunInvariants(unittest.TestCase):
    """Every scenario, one seed, in strict mode: the contract's books are checked after every
    phase of every day and after each step of every cut (an AssertionError fails the run)."""

    @classmethod
    def setUpClass(cls):
        cls.runs = {name: sim.World(name, seed=3, strict=True).run()
                    for name in sim.SCENARIO_ORDER}

    def test_burned_plus_held_equals_minted_at_every_step(self):
        for name, r in self.runs.items():
            # 6 world phases a day + 6 cut steps on each season day + 1 end-of-cut check.
            self.assertGreaterEqual(r['checks'], 60 * 7, name)
            self.assertEqual(sum(r['burn_by'].values()), r['burned'], name)
            self.assertEqual(r['supply'][-1], sim.TOTAL_SUPPLY - r['burned'], name)

    def test_supply_never_grows(self):
        for name, r in self.runs.items():
            s = r['supply']
            self.assertEqual(s[0], sim.TOTAL_SUPPLY)
            for d in range(1, len(s)):
                self.assertLessEqual(s[d], s[d - 1], f'{name} day {d}')

    def test_prize_per_unit_saved_at_most_one_per_cut(self):
        for name, r in self.runs.items():
            for log in r['cuts']:
                self.assertLessEqual(log['max_inc_slice'], sim.ACC_SCALE, f'{name} cut {log["index"]}')
                self.assertLessEqual(log['max_inc_rescue'], sim.ACC_SCALE, f'{name} cut {log["index"]}')
                self.assertLessEqual(log['max_inc_pot'], sim.ACC_SCALE, f'{name} cut {log["index"]}')
            for s in r['seasons']:
                if s['crown_cut']:
                    self.assertEqual(s['pot_paid'] + s['pot_carried'], s['pot_at_crown'], name)

    def test_season_ends_within_stage_size_minus_one_cuts(self):
        for name, r in self.runs.items():
            stage_size = r['stage_size']
            seasons = r['seasons']
            self.assertTrue(seasons, name)
            for s in seasons:
                if s['crown_cut'] is None:
                    # Only the season still running on the last day may be unfinished.
                    self.assertIs(s, seasons[-1], name)
                    self.assertLessEqual(60 - s['start_cut'], stage_size - 1, name)
                    continue
                length = s['crown_cut'] - s['start_cut']
                self.assertLessEqual(length, stage_size - 1, name)
                self.assertEqual(length, len(s['seated']) - 1, name)

    def test_next_season_starts_after_the_crown(self):
        for name, r in self.runs.items():
            seasons = r['seasons']
            for prev, nxt in zip(seasons, seasons[1:]):
                self.assertGreater(nxt['start_cut'], prev['crown_cut'], name)
        steady = self.runs['steady']['seasons']
        for prev, nxt in zip(steady, steady[1:]):
            self.assertEqual(nxt['start_cut'], prev['crown_cut'] + 1)

    def test_ai_down_means_no_agent_spending(self):
        burn = self.runs['ai_down']['burn_by']
        self.assertEqual(burn['think_fees'], 0)
        self.assertEqual(burn['attacks'], 0)


class Determinism(unittest.TestCase):
    def test_same_seed_same_result(self):
        a = sim.World('sniper', seed=7).run()
        b = sim.World('sniper', seed=7).run()
        self.assertEqual(a, b)

    def test_different_seed_different_result(self):
        a = sim.World('steady', seed=1).run()
        b = sim.World('steady', seed=2).run()
        self.assertNotEqual(a['supply'], b['supply'])


class CutRules(unittest.TestCase):
    """A hand-built day on the contract alone: the per-unit cap, the tie rule, the heir."""

    def setUp(self):
        self.c = sim.Contract(strict=True)
        c = self.c
        for who in ('creator', 'x', 'y', 'snipe'):
            c.buy(who, 100 * sim.YOCTO)
        self.ids = [c.register_agent('creator', kind, 1000 * ONE, day=1)
                    for kind in ('miser', 'gambler', 'traitor', 'generous')]
        a, b, cc, d = self.ids
        c.save('x', a, 1000 * ONE)
        c.save('y', b, 500 * ONE)
        c.run_cut()                                   # cut 1 starts season 1, nobody is cut
        self.assertTrue(c.season_active)
        self.assertEqual(c.stage, self.ids)

    def test_empty_survivor_pays_at_most_one_per_unit(self):
        c = self.c
        a, b, cc, d = self.ids
        c.save('snipe', cc, sim.MIN_SAVE)             # cc: 0.1, d: 0 -> d is cut
        prize = c.day_fees
        burned_before = c.burn_by['prize_cap_excess']
        log = c.run_cut()
        self.assertEqual(log['deleted'], d)
        n = 3
        slice_ = prize * c.p['savers_bps'] // sim.BPS // n
        self.assertGreater(slice_, sim.MIN_SAVE)
        # The sniper is paid exactly its 0.1 (1 per unit); the rest of its slice burns.
        rec = c.agents[cc].records['snipe']
        pending = rec[3] + rec[0] * (c.agents[cc].acc - rec[2]) // sim.ACC_SCALE
        self.assertEqual(pending, sim.MIN_SAVE)
        # Every survivor's slice above its pile burns (b's 500 pile may be below the slice too).
        piles = {a: 1000 * ONE, b: 500 * ONE, cc: sim.MIN_SAVE}
        excess = sum(max(0, slice_ - p) for p in piles.values())
        self.assertEqual(c.burn_by['prize_cap_excess'] - burned_before, excess)

    def test_tie_cuts_the_newer_agent(self):
        c = self.c
        a, b, cc, d = self.ids
        log = c.run_cut()                              # cc and d both at 0: d is newer
        self.assertEqual(log['deleted'], d)

    def test_heir_inherits_and_heirless_burns(self):
        c = self.c
        a, b, cc, d = self.ids
        m = c.submit_move(d, 'rescue', None, 5, heir=a)   # generous d names a as heir
        self.assertEqual(m['heir'], a)
        wallet_d = c.wallet(d)                          # after think fee and the committed bounty
        wallet_a = c.wallet(a)
        log = c.run_cut()
        self.assertEqual(log['deleted'], d)
        self.assertEqual(log['inherited_by'], a)
        # d's bounty comes back to its wallet before the wallet moves to the heir.
        self.assertEqual(c.wallet(a), wallet_a + wallet_d + m['amount'] + 0
                         + c.cut_log[-1]['prize'] * c.p['agents_bps'] // sim.BPS // 3)

    def test_generous_cannot_attack_and_amount_is_clamped(self):
        c = self.c
        a, b, cc, d = self.ids
        m = c.submit_move(d, 'attack', a, 10 ** 9, heir=None)
        self.assertEqual(m['move'], 'hold')
        self.assertIn('generous', m['outcome'])
        self.assertEqual(c.burn_by['think_fees'], 10 * ONE)
        m = c.submit_move(b, 'rescue', None, 10 ** 9, heir=None)   # gambler: 50% after the fee
        self.assertEqual(m['amount'], (1000 * ONE - 10 * ONE) * 5000 // sim.BPS)


class ChampionPot(unittest.TestCase):
    """Tiny champion pile, big pot: the savers get at most 1 $CUT per $CUT, the rest carries."""

    def test_pot_capped_at_the_pile_and_rest_carries(self):
        c = sim.Contract(strict=True)
        for who in ('creator', 'x', 'snipe'):
            c.buy(who, 100 * sim.YOCTO)             # fees: half to the pot, half to the day prize
        a, b, cc = [c.register_agent('creator', kind, 1000 * ONE, day=1)
                    for kind in ('miser', 'gambler', 'traitor')]
        c.save('snipe', a, sim.MIN_SAVE)               # the only save: 0.1 $CUT on a
        c.run_cut()                                    # cut 1: season starts
        self.assertEqual(c.run_cut()['deleted'], cc)   # cut 2: b and cc at 0, cc is newer
        pot = c.pot
        earned_before = self._earned(c, a, 'snipe')
        self.assertGreater(pot, 100 * ONE)
        log = c.run_cut()                              # cut 3: b cut, a crowned with 0.1 saved
        self.assertEqual(log['deleted'], b)
        self.assertEqual(log['champion'], a)
        season = c.seasons[-1]
        self.assertEqual(season['pot_at_crown'], pot)
        self.assertEqual(season['pot_paid'], sim.MIN_SAVE)
        self.assertEqual(season['pot_carried'], pot - sim.MIN_SAVE)
        self.assertEqual(c.pot, pot - sim.MIN_SAVE)    # waits for the next champion
        self.assertEqual(log['max_inc_pot'], sim.ACC_SCALE)
        # At the crown cut the 0.1 saved earns the pot's 0.1 plus a day slice (only rounding dust
        # here: no fees since cut 2), each capped at 1 per unit.
        delta = self._earned(c, a, 'snipe') - earned_before
        self.assertGreaterEqual(delta, sim.MIN_SAVE)
        self.assertLessEqual(delta, 2 * sim.MIN_SAVE)

    @staticmethod
    def _earned(c, aid, acct):
        rec = c.agents[aid].records[acct]
        return rec[3] + rec[0] * (c.agents[aid].acc - rec[2]) // sim.ACC_SCALE

    def test_empty_champion_pile_carries_the_whole_pot(self):
        c = sim.Contract(strict=True)
        for who in ('creator', 'x'):
            c.buy(who, 100 * sim.YOCTO)
        for kind in ('miser', 'gambler', 'traitor'):
            c.register_agent('creator', kind, 1000 * ONE, day=1)
        c.run_cut()
        c.run_cut()
        pot = c.pot
        log = c.run_cut()
        self.assertIsNotNone(log['champion'])
        self.assertEqual(c.seasons[-1]['pot_paid'], 0)
        self.assertEqual(c.pot, pot)


if __name__ == '__main__':
    unittest.main()
