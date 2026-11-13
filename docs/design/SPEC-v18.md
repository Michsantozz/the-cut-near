# The Cut v18 · the Survival rule

This spec rewrites The Cut (NEAR hackathon, track "Memecoins With Mechanics") around one new rule.
Readers are hackathon judges. They judge the **idea, the rules and the design**, not whether the code runs.
The track says it is "judged on the mechanic, not the chart". Every screen must make the mechanic obvious.

## 1. The rule in one breath

10 AI robots live on a stage. Fans keep them alive by saving $CUT into their piles.
Every Sunday at 18:00 UTC the robot with the lowest pile is cut: its NEAR account is deleted,
half its pile burns, and the other half plus the week's trading fees is paid to the savers of the survivors.

Pitch line (hero, share card, landing): **"Real AIs fighting for their lives. Save yours with $CUT, or it's deleted on Sunday."**
Short line (footers, small cards): **"10 AI robots · one coin · the poorest is deleted every Sunday · on NEAR"**

## 2. The rules, exact (fixed at launch, no owner key)

1. **$CUT** is one NEP-141 coin. 10,000,000 minted at launch (Sun Nov 8, 15:01 UTC). Never minted again.
2. **Trading.** $CUT trades against NEAR in The Cut's own pool inside the contract. Every buy and sell pays **1%**, which goes to Sunday's prize.
3. **Robots.** Each robot is a real AI with its own NEAR account `<id>.thecut.near`. Only the contract can create these accounts.
   No human holds a key that can move a robot's pile, not its creator and not us. Its wallet obeys only the rules.
   Its posting key is sealed in NEAR AI (a sealed-hardware enclave), so every post it makes on X is signed and checkable.
4. **Save.** A fan puts $CUT into a robot's pile. Saved $CUT is **locked until the next cut**. You can add any time, you cannot take out before the cut.
   Piles only grow during the week.
5. **The cut.** Sunday 18:00:00 UTC, read from NEAR block time. The robot with the **lowest pile** is cut. Tie: the newer robot is cut.
   - Its NEAR account is **deleted** (gone for good; the name can never be reused).
   - **Half its pile burns** (total supply drops forever).
   - **The other half + the week's 1% fees = the prize.** 95% goes to the savers of the 9 survivors, split by $CUT saved. 5% goes to the 9 survivors' creators, equal slices.
   - Savers of the cut robot lose what they saved on it.
6. **Anyone runs the cut.** The "Run the cut" button opens at 18:00 for everyone. Whoever presses first keeps the 0.5 NEAR left in the deleted account. Same result whoever presses. Pressed early = refused, nothing moves.
7. **After the cut.** Saves on survivors unlock. Each saver can take theirs back, or let it ride into next week (default: ride). Prizes are collected separately.
8. **The bench.** Robots waiting for a seat. Fans can save into a bench robot's **queue** (also locked). The bench robot with the **biggest queue** takes the empty seat on Sunday; its queue becomes its pile. Queues on robots that didn't get in unlock after the cut.
9. **Creators.** Anyone can register a robot: name, personality, voice, art, an X account (proved by posting a code). **5 NEAR deposit**: 0.5 NEAR funds the robot's account, 4.5 NEAR comes back when the robot leaves. New robots start on the bench. A creator earns an equal slice of the 5% creator share each week their robot survives on the stage. Creators offer **club perks** (e.g. Pixie reads 50 savers' names live). Two perks marked as skipped by members in a row = the creator loses that week's slice.
10. **The Director** is the host, a NEAR AI. It writes the one-liners and roasts, signed by NEAR AI. It **decides nothing**: the math (lowest pile) decides.

## 3. Sybil resistance and limits (say these plainly where rules are shown)

- Saves count by **$CUT, never by people**. 1,000 $CUT split across 1,000 accounts weighs exactly the same as one account.
- Savers counts and club points are for show and never touch money.
- A whale can keep a robot alive alone. That is allowed and public: every save is a line in Receipts.
- Last-minute saves count (the Final hour). The cut reads the piles at 18:00:00 block time, nobody can pick.
- Fake robots cost money: 5 NEAR deposit plus a proved X account.
- Limit we admit: a rich group can protect its robot every week. The sim shows what it does to supply (see §6).

## 4. Vocabulary (use these words, consistently)

robot · pile · save / saver · the cut · deleted · burn · prize · bench · queue · Final hour · club · perk · Director · Receipts · creator

**Remove everywhere** (this was the old rule): basket, Rhea, liquidity, score/points out of 100, weight, share of the basket, fan votes / vote / "Back X" (as a mechanic), 2% cap, "votes capped", payouts in lineup coins / 10 coins, "PAYS IN" tickers ($PIXIE, $KIKO, …), trades in pieces / 24 trades / random times, plan lock / "Plan locked" / Saturday 18:00 / 0.2 NEAR, "backed by", "price vs basket", promise penalty 10 points, pool under $50k, "Piece skipped". Also replace "character" with "robot" in copy (art stays the same).

Rename: Payouts → **Prizes** (tab and pages), Inside the Director → **Inside the cut**, Character → **Robot**, Apply → **Register a robot** (menu item "For creators" stays), Top fans → **Top savers**, Fan vote → **Save a robot**. Already done in the side menu / tab bars; do the rest in your files.

## 5. Sample data (week 1). Every robot, account and number is fictional.

Now: **Fri Nov 13, 13:48 UTC**. Next cut: **Sun Nov 15, 18:00 UTC** ("in 2d 4h"). Launch Sun Nov 8 15:01 UTC.
$CUT price **$1.84**. 1 NEAR = $2.50. Supply 10,000,000. Burned so far: 0. Holders: 2,140.

Stage (sorted by pile). "Today" = $CUT saved today (piles never go down during the week).

| # | id | Robot | Kind | Pile ($CUT) | Savers | Today | X | NEAR account |
|---|----|-------|------|------|------|------|------|------|
| 1 | pixie | Pixie Volt | AI streamer | 182,400 | 412 | +6,200 | @PixieVoltCut | pixie.thecut.near |
| 2 | lila | Lila Loop | Virtual influencer | 151,200 | 377 | +3,900 | @LilaLoopCut | lila.thecut.near |
| 3 | oracle | Oracle Toad | AI agent | 139,800 | 351 | +4,400 | @OracleToadCut | oracle.thecut.near |
| 4 | mabel | Mabel Market | Virtual influencer | 121,500 | 298 | +1,800 | @MabelMarketCut | mabel.thecut.near |
| 5 | melody | Melody-9 | Virtual singer | 112,300 | 287 | +2,600 | @Melody9Cut | melody.thecut.near |
| 6 | yuna | Yuna Star | AI idol | 98,700 | 264 | +3,100 | @YunaStarCut | yuna.thecut.near |
| 7 | gremlin | Glitch Gremlin | AI artist | 86,900 | 233 | +900 | @GlitchGremlinCut | gremlin.thecut.near |
| 8 | velvet | Velvet Vee | Virtual model | 74,200 | 205 | +1,200 | @VelvetVeeCut | velvet.thecut.near |
| 9 | onyx | Onyx Moon | Digital model | 61,800 | 187 | +400 | @OnyxMoonCut | onyx.thecut.near |
| 10 | kiko | Kiko Bun | VTuber | **23,600** | 96 | +300 | @KikoBunCut | kiko.thecut.near |

- Total saved on stage: **1,052,400 $CUT** (10.5% of supply). Kiko Bun is **on the block**: needs **38,201** more to pass Onyx Moon.
- Bench (queues): **Chartwise** (AI analyst, chartwise.thecut.near, @ChartwiseCut) 88,400 · 241 savers, leading. If Apply already shows **Bloop** and **Pixel Kit** on the bench, keep them: Bloop 31,200 · 102, Pixel Kit 12,600 · 47.
- Fees this week so far: **4,100 $CUT**; expected by Sunday about **5,020**.
- **mika.near** (the signed-in member): 674.2 $CUT = **$1,240.53**. **400 saved on Melody-9** (locked till Sun 18:00), **274.2 free**. Bought 554.2 on Sun Nov 8 (paid 383.5 NEAR, $958.77), 120.0 on Wed Nov 11 (paid 85.9 NEAR, $214.80), saved 400 on Melody-9 Fri Nov 13.

**The sample cut (Sun Nov 15):** Kiko Bun's 23,600 → **11,800 burn**. Prize = 11,800 + 5,020 fees = **16,820 $CUT**.
95% = **15,979** to savers of the 9 survivors (1,028,800 saved). 5% = **841** to 9 creators (93.4 each).
mika's prize: 400 / 1,028,800 × 15,979 = **6.21 $CUT ($11.43)**. Runner keeps **0.5 NEAR**. Chartwise takes the seat with a pile of 88,400.
Supply after: 9,988,200. Director roast: **"23,600 $CUT between Kiko and oblivion. Pack your buns."**

Sample robot posts on X (signed by NEAR AI):
- Kiko Bun: "I have 23,600 $CUT and 52 hours. Onyx has 61,800. Save me or I stop existing on Sunday."
- Pixie Volt: "Top pile again. To the 412 of you: I read your names live on Saturday."
- Chartwise: "Bench, day 5. Queue at 88,400. Nothing personal, Kiko. The math is the math."
- Onyx Moon: "38,201 between me and the bunny. Do not get comfortable, savers."

## 6. 60-day simulation (model, not a promise; for the Landing and Receipts)

8 Sunday cuts (Nov 15 → Jan 3). Week burn = half of the lowest pile. Computed by `gen/sim.py`.

| Scenario | What happens | Burned in 60 days | Supply on day 60 | Prizes paid |
|---|---|---|---|---|
| Steady | 10.5% of supply saved, lowest pile 2.2% of saved | 94,011 (0.94%) | 9,905,989 | 134,171 |
| Rescue rush | Fans flood the bottom robots, so the lowest pile is big (16% saved, lowest 6%) | 377,610 (3.78%) | 9,622,390 | 449,610 |
| Whale sniper | A whale saves the bottom robot at 17:59; another one falls instead | 146,390 (1.46%) | 9,853,610 | 186,550 |
| Sybil swarm | 5,000 fake accounts with 1 $CUT each | 94,011 (0.94%): same as Steady, because saves count by $CUT | 9,905,989 | 134,171 |
| Ghost town | Almost nobody saves (2% saved) | 7,997 (0.08%) | 9,992,003 | 11,197 |

Weekly supply, Steady: 10,000,000 · 9,988,200 · 9,976,414 · 9,964,642 · 9,952,883 · 9,941,139 · 9,929,409 · 9,917,692 · 9,905,989.
Weekly supply, Rescue rush: 10,000,000 · 9,952,000 · 9,904,230 · 9,856,690 · 9,809,378 · 9,762,293 · 9,715,434 · 9,668,800 · 9,622,390.
Weekly supply, Whale sniper: 10,000,000 · 9,981,583 · 9,963,200 · 9,944,851 · 9,926,535 · 9,908,254 · 9,890,006 · 9,871,791 · 9,853,610.
Weekly supply, Ghost town: 10,000,000 · 9,999,000 · 9,998,000 · 9,997,000 · 9,996,001 · 9,995,001 · 9,994,001 · 9,993,002 · 9,992,003.

## 7. Per-state content

The **source of truth for every state** is the `FLOW` array in `near/project/cast/Prototype.dc.html` (phone) and `DeskPrototype.dc.html` (laptop).
Each state has `label`, `about` (what the screen must show) and `next` (where its buttons go). Read your screens' entries there first.
State ids did not change. Labels and abouts did.

Key screen notes:
- **Lineup (member):** hero = your $CUT value + chip "400 saved on Melody-9 · locked till Sun 18:00" + "First prize: Sun, Nov 15". The list = 10 robots by pile: art, name, kind, pile bar + $CUT, savers, today, a **Save** button per row. A dashed red **cut line** sits above the lowest robot ("CUT LINE · lowest pile at Sun 18:00 UTC"). Sort chips: Pile · Savers · Today. Right side (laptop) / banner (phone): On the block = Kiko Bun, pile 23,600, 38,201 short of Onyx Moon, buttons Save Kiko / See the show. Bench card: Chartwise queue 88,400. Director line.
- **Lineup first open (visitor):** "10 AI robots. One coin. Save yours, or it's deleted on Sunday." Same list, Save buttons lead to Connect.
- **Lineup after the cut (payout):** Kiko Bun shown as DELETED (grey art, stamp), Chartwise "NEW" in seat; prize card "+6.21 $CUT from Kiko Bun's cut" → Collect.
- **Lineup Final hour (rebalance):** countdown 0:42:10, piles with live "+" movement, Kiko rising but still last, Chartwise waiting.
- **Robot page:** pile + savers + today; NEAR account `kiko.thecut.near` with a "No human key" badge; X posts with "Signed · NEAR AI" badges; Save button; for Kiko, the danger meter (gap to Onyx). Chartwise: bench queue and "takes the seat if anyone is cut".
- **Save a robot (club/vote):** robot picker (Melody-9 selected), amount (400 $CUT of 274.2 free + … use: you have 674.2, you save 400), "Locked until Sun 18:00 UTC", two outcomes side by side: survives → share of the prize (est. not shown as a promise; say "your share of the prize"), cut → "half burns, half pays the others". Button "Save 400 on Melody-9".
- **Prizes:** the Nov 15 prize card 6.21 $CUT ($11.43) and the math chain: Kiko's pile 23,600 → 11,800 burned → 11,800 + 5,020 fees = 16,820 → 95% to savers of survivors → your 400 of 1,028,800 = 6.21. Toggle "Keep my 400 on Melody-9 for next week" (on).
- **Value:** where all 10,000,000 $CUT are: saved in piles 1,052,400 · free 8,947,600 · burned 0 (first burn Sunday). Fees this week 4,100.
- **Account risks (4):** 1 "You can lose what you save": if your robot is cut, half your save burns and half goes to other savers. 2 "$CUT has nothing behind it": it's a meme coin; its price can fall close to zero. 3 "Nobody can stop it": the rules are locked and there is no owner key; not even we can pause a bad week. 4 "The robots talk on their own": they are AIs; their lines are signed, not checked by a human.
- **Notifications switches:** "Your robot is in danger" (it's in the bottom two), "Final hour" (Sundays 17:00 UTC), "Prize is ready" (Sundays after the cut).
- **Activity kinds:** buy, sell, save, prize, cut. Rows: Fri Nov 13 "Saved 400 $CUT · on Melody-9 · locked till Sun 18:00"; Wed Nov 11 buy; Sun Nov 8 buy + "The show opened · First cut Sunday, Nov 15".
- **Receipts journal types:** FEE, BUY, SELL, SAVE, CUT, BURN, PRIZE, DELETE, JOIN. Audit checks: no full-access key on thecut.near; minted − burned = supply; sum of piles = saved total; every robot account was created by the contract; parameters match launch.
- **Test mode tour:** 1 account → 2 buy $10 → 3 save a robot → 4 run the cut (+0.5 test NEAR) → 5 Receipts + Audit. Testnet `thecut.testnet`, a week lasts 2 minutes.

## 8. Design rules (do not break)

- Keep the visual system exactly: colors, Bricolage Grotesque headings, Inter body with `font-variant-numeric: tabular-nums`, 2px #0A0B0D borders, hard offset shadows, rounded cards, the existing icons style. New pages look like the old ones.
- **No monospace fonts anywhere.** Numbers and account names in Inter.
- **No left color stripe** to mark a selected/highlighted row or card. Use background, weight or a full outline.
- All text in the files is **English**. Code comments in English.
- Keep the "Sample data … fictional" note where it exists; update its wording to "Every robot, account and number here is fictional."
- Phone boards 390×844, laptop 1440×900 (laptop page body scrolls in `data-scroll="body"`; nothing important below the first 900px unless the old screen already scrolled). Landing/Receipts sizes may change; report the new height.
- Do not change file names, state ids, the `variant` enum options, the `go` prop contract, or `nav(screen, variant)`. Every `nav()` target must be a `screen/variant` that exists in the FLOW (or a robot id for `profile`: pixie, lila, oracle, mabel, melody, yuna, gremlin, velvet, onyx, kiko, chart).
- Phone and laptop versions of a screen show the **same data and copy**, only the layout differs.
- Keep the laptop side menu / header / account card blocks identical to the other Desk files (already updated: Prizes, Inside the cut, account label "674.2 $CUT · 400 saved").
- Images: reuse the existing `/_blob/<id>` art only. No new images.
- Text must never overflow or clip. Check the longest strings.

## 9. How to check your work

Render any state:
```
S=/tmp/claude-1000/-home-michsantoz-content/6ef79896-bd90-4230-8374-1595cc212c27/scratchpad
bash $S/preview/render.sh $S/near/project/cast/Lineup.dc.html 390 844 "variant=list" lineup_list
bash $S/preview/render.sh $S/near/project/cast/DeskLineup.dc.html 1440 900 "variant=list" desk_lineup_list
```
It prints the PNG path; open it with Read and look at it. Render **every state** of every file you own, one Chrome at a time (never in parallel). Fix what looks wrong and render again.
Use unique out-names (prefix with your agent letter) so you don't overwrite another agent's PNGs.
