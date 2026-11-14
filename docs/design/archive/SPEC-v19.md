# The Cut v19 · daily cut + equal slices

Read `SPEC-v18.md` first: the visual system, design rules (§8), vocabulary (§4) and checking steps (§9) still apply.
v19 changes **two rules** and the sample data that follows from them. Everything below overrides SPEC-v18.

Why: a judge's audit found two holes in v18.
1. Saving the robot in danger did not pay: the prize was split by $CUT across all survivors, so saving on the top robot paid the same with no risk. The "fight for life" did not exist in the money.
2. The cut was slow and small: once a week, 0.94% of supply burned in 60 days, and the first real cut fell after the hackathon deadline.

## 1. The two rule changes

**A. A cut every day at 18:00 UTC.** Not Sunday. Same cut: the lowest pile is cut, its NEAR account is deleted, half the pile burns, the other half plus the **day's** 1% fees is the prize, the biggest bench queue takes the seat, the runner keeps 0.5 NEAR. The Final hour is every day 17:00–18:00 UTC. Saves are locked until the next cut (at most 24 hours).

**B. Equal slices.** The savers' 95% of the prize is split into **9 equal slices, one per surviving robot**. Each slice is shared by that robot's savers, by $CUT saved. Creators' 5% stays 9 equal slices.
Effect: a small pile splits its slice among fewer $CUT, so it **pays more per $CUT**. Saving the robot near the cut line is risky but pays the most. Rescuing pays. Money flows to the bottom, piles even out, the cut gets tight.
If a surviving robot has an empty pile, its slice burns.

Plain one-liner for rules boxes: **"Every survivor gets the same slice of the prize. Small piles share it among fewer $CUT, so they pay more."**

Pitch line: **"Real AIs fighting for their lives. Save yours with $CUT, or it's deleted today."**
Short line: **"10 AI robots · one coin · the poorest is deleted every day · on NEAR"**

## 2. Sample data (day 2). Every robot, account and number is fictional.

- Launch: **Thu Nov 12, 15:01 UTC**. Cuts start the day after launch, so **the first cut is today, Fri Nov 13, 18:00 UTC**.
- Now: **Fri Nov 13, 13:48 UTC**. Next cut: **today 18:00 UTC, "in 4h 12m"**. Final hour countdown example: 0:42:10.
- Piles, savers, bench, price, supply: **unchanged** from SPEC-v18 §5. "Today" column unchanged (saves today).
- Fees **today** so far: 4,100 $CUT; expected by 18:00 about 5,020.
- mika.near: 674.2 $CUT = $1,240.53. **400 saved on Melody-9 (locked till 18:00 UTC)**, 274.2 free.
  Bought 554.2 on **Thu Nov 12 15:20** (383.5 NEAR, $958.77). Bought 120.0 **today 09:14** (85.9 NEAR, $214.80). Saved 400 on Melody-9 today 13:41.
- Chartwise joined the bench **Thu Nov 12, 16:12** ("new yesterday").

**New: "pays per 100 $CUT saved, if the cut ran now"** (slice 1,775.4 ÷ pile × 100; Kiko Bun is the one cut):

| Robot | Pile | Pays per 100 saved |
|---|---|---|
| Pixie Volt | 182,400 | 0.97 |
| Lila Loop | 151,200 | 1.17 |
| Oracle Toad | 139,800 | 1.27 |
| Mabel Market | 121,500 | 1.46 |
| Melody-9 | 112,300 | 1.58 |
| Yuna Star | 98,700 | 1.80 |
| Glitch Gremlin | 86,900 | 2.04 |
| Velvet Vee | 74,200 | 2.39 |
| Onyx Moon | 61,800 | 2.87 |
| Kiko Bun | 23,600 | **Cut** (if nothing moves, its savers lose their save) |

Onyx Moon pays about **3x** what Pixie Volt pays. Show this number wherever a robot can be saved (lineup rows, Save a robot picker, robot pages). Always label it as "if the cut ran now", never as a promise.
Rescue line for Kiko: "Lift Kiko past Onyx Moon (38,201 $CUT) and it survives with the smallest pile: it pays the most per $CUT."

**The sample cut: today, Fri Nov 13, 18:00 UTC.**
Kiko Bun 23,600 → **11,800 burned**. Prize = 11,800 + 5,020 fees = **16,820**.
95% = **15,979** to savers → **9 slices of 1,775.4**, one per survivor. 5% = **841** → 93.4 per creator.
mika: 400 of Melody-9's 112,300 × 1,775.4 = **6.32 $CUT ($11.63)**. Runner keeps 0.5 NEAR. Chartwise takes the seat with 88,400.
Supply after: 9,988,200. Next cut: **Sat Nov 14, 18:00 UTC** ("tomorrow").
The post-cut screens (After the cut, Director receipt, Prizes, Share, lock screen) are dated **Fri, Nov 13** and posted a minute after 18:00.
Prize math chain (Prizes page, 5 steps): Kiko's pile 23,600 → half burned 11,800 → prize 16,820 (11,800 + 5,020 fees) → one slice per survivor 1,775.4 (95% ÷ 9) → your 400 of Melody-9's 112,300 = 6.32.

Director roast unchanged: "23,600 $CUT between Kiko and oblivion. Pack your buns." After-cut Director line ends: "Ten robots again. Next cut tomorrow, 18:00."

Robot posts on X:
- Kiko Bun: "I have 23,600 $CUT and 4 hours. Onyx has 61,800. Save me or I stop existing at 18:00."
- Pixie Volt: "Top pile again. To the 412 of you: I read your names live before the cut."
- Onyx Moon: "Save me: I pay 2.87 per 100 $CUT, Pixie pays 0.97. Small pile, big slice. Do the math."
- Chartwise: "Bench, day 2. Queue at 88,400. Nothing personal, Kiko. The math is the math."

## 3. 60-day simulation (replaces SPEC-v18 §6). 60 daily cuts, Nov 13 → Jan 11. `gen/sim.py`.

| Scenario | What happens | Burned in 60 days | Supply on day 60 | Prizes paid |
|---|---|---|---|---|
| Steady | Equal slices pull savers to the bottom; lowest pile ~6% of saved | 1,728,189 (17.28%) | 8,271,811 | 2,029,389 |
| Top-heavy | Fans ignore the slices and stack the leaders, like today | 683,907 (6.84%) | 9,316,093 | 985,107 |
| Whale sniper | A whale saves the bottom robot at 17:59; another one falls instead | 1,325,891 (13.26%) | 8,674,109 | 1,627,091 |
| Sybil swarm | 5,000 fake accounts with 1 $CUT each | same as Steady: saves count by $CUT | 8,271,811 | 2,029,389 |
| Ghost town | Almost nobody saves (2% of supply) | 295,617 (2.96%) | 9,704,383 | 319,617 |

Supply every 10 days, Steady: 10,000,000 · 9,688,728 · 9,387,145 · 9,094,949 · 8,811,849 · 8,537,561 · 8,271,811.
Top-heavy: 10,000,000 · 9,882,625 · 9,766,627 · 9,651,991 · 9,538,700 · 9,426,739 · 9,316,093.
Whale sniper: 10,000,000 · 9,765,717 · 9,536,923 · 9,313,490 · 9,095,291 · 8,882,204 · 8,674,109.
Ghost town: 10,000,000 · 9,950,112 · 9,900,474 · 9,851,082 · 9,801,938 · 9,753,038 · 9,704,383.

## 4. Words

Remove everywhere: Sunday / Sundays / Sun (as the cut day), Monday (as receipt day), "this week" / "next week" / "the week's fees" / "week 1" for the cut cycle, "52 hours", "2d 4h", Nov 15 and Nov 22 as cut dates, "split by $CUT saved" for the whole prize, "1,028,800" (the old split base).
Use: "today's cut", "every day at 18:00 UTC", "the next cut", "tomorrow's cut", "the day's fees", "day 2", "equal slice", "pays per 100 saved, if the cut ran now".
Keep weekly: club perks ("this week's perks") and "a creator who skips two perks in a row loses its slices for 7 days". Keep the Value chart state ids (`week`, `day`, `all`); their labels can stay 1D / 1W / All.
Test mode: on testnet a cut runs every 2 minutes ("test cut 214", not "test week 214").

## 5. Already done for you (check, don't redo)

- FLOW in `Prototype.dc.html` / `DeskPrototype.dc.html` rewritten: it is still the per-state source of truth. Read your screens' entries.
- An exact-string pre-pass already replaced the common strings in every file: header chip "Next cut in 4h 12m · 18:00 UTC", "Save yours, or it's deleted today.", "First prize: today, 18:00 UTC", launch dates "Thu Nov 12", Nov 15 → Nov 13, Nov 22 → Nov 14, "locked till 18:00 UTC", 6.21 → 6.32 $CUT, $11.43 → $11.63, "Day 1 / Day 2 ·", "How the daily cut works". Read your files for what is left; some replaced lines may now read badly ("Fri, Nov 13" where "today" reads better). Fix them.
- Header chips per state: before the cut "Next cut in 4h 12m · 18:00 UTC"; Final hour "Cut in 0:42:10 · 18:00 UTC"; after the cut "Next cut tomorrow · 18:00 UTC" (or "Sat, Nov 14 · 18:00 UTC").

## 6. The main screen becomes "today's cut" (owner: agent A, Lineup + DeskLineup)

The judge's second complaint: the main screen was a table and the drama happened off screen. Make the cut the main screen, within the existing visual system:
- A big countdown to 18:00 UTC is the first thing on the screen ("4:12:00 to today's cut · 18:00 UTC").
- The ranked list is the cut board: the red dashed **CUT LINE** above Kiko Bun, Kiko's row in danger style, and a new value per row **"pays per 100 saved"** (numbers in §2) with a header note "if the cut ran now". Kiko's row shows "Cut" instead.
- One plain line near the list: "Every survivor gets the same slice of the prize. Small piles share it among fewer $CUT, so they pay more."
- A sort chip "Pays most" next to Pile / Savers / Today.
- The member's own value/save card gets smaller, not removed.
- On the block card: Kiko Bun, 38,201 short, and the rescue line from §2.

Other screens copy the dimmed lineup behind their dialogs (DeskBuy, DeskSell, DeskShare, DeskNotifications, DeskTestMode). Owners of those files: update the copy and numbers in that background (daily wording, countdown), do not rebuild its layout.

## 7. Agents and files

- **A**: Lineup, DeskLineup (§6 redesign), Profile, DeskProfile, Brain, DeskBrain.
- **B**: Director, DeskDirector, Club, DeskClub, Earnings, DeskEarnings.
- **C**: Buy, DeskBuy, Sell, DeskSell, Share, DeskShare, Value, DeskValue, Account, DeskAccount.
- **D**: Apply, DeskApply, Activity, DeskActivity, Notifications, DeskNotifications, TestMode, DeskTestMode.
- **E**: Landing, LandingPhone, Receipts, ReceiptsPhone.
- Lead (not you): Prototype, DeskPrototype, Flow, ShareCard, canvas.json.

Edit only your own files. Do not touch another agent's files, the prototypes, canvas.json or anything in `preview/` except your own PNG/HTML renders.
