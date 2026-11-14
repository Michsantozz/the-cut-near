# 60-day model of $CUT supply under the v19 rule: a cut every day at 18:00 UTC (Nov 13 .. Jan 11, 60 cuts).
# Each day: saved = share of supply; lowest pile = share of saved; half the lowest pile burns.
# The prize is split into equal slices per surviving agent, so a small pile pays more per $CUT
# and savers chase the bottom: piles even out and the lowest pile grows.
SUPPLY0 = 10_000_000
SCEN = {
    # name: (saved share of supply, lowest pile share of saved, daily fees in $CUT)
    'Steady':       (0.10524, 0.0600, 5_020),   # equal slices pull money to the bottom; lowest pile ~6% of saved
    'Top-heavy':    (0.10524, 23600/1052400, 5_020),   # fans ignore the slices and stack the leaders, like the sample day
    'Whale sniper': (0.10524, 0.0450, 5_020),   # a whale saves the bottom agent at 17:59; another one falls instead
    'Sybil swarm':  (0.10524, 0.0600, 5_020),   # 5,000 fake accounts with 1 $CUT each: saves count by $CUT, so nothing changes
    'Ghost town':   (0.020, 0.0500, 400),       # almost nobody saves
}
for name, (sv, low, fee) in SCEN.items():
    s = SUPPLY0; series = [s]; burned = 0; prize = 0
    for d in range(60):
        b = s * sv * low / 2
        s -= b; burned += b; prize += b + fee
        series.append(s)
    first = SUPPLY0 * sv * low / 2
    print(f"{name:13s} day-1 burn {first:>7,.0f}  burned {burned:>10,.0f} ({burned/SUPPLY0*100:.2f}%)  supply day60 {s:>12,.0f}  prizes {prize:>11,.0f}")
    print('   supply every 10 days:', ', '.join(f"{series[i]:,.0f}" for i in range(0, 61, 10)))
