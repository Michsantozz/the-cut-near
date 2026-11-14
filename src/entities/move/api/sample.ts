import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { sampleHoursBeforeCut } from "@/shared/config/sample";
import { units } from "@/shared/lib/amount";
import type { Move, MoveKind } from "../model/types";

// The sample world's moves (v20): days 1 to 3 of season 1 (cuts #2 to #4) and today, day 4 (cut #5).
// Every hash and chat id here is made up from the move itself: nothing was sent to NEAR AI and nothing was
// signed. The screens say so next to every sample move.

/** The cut today's moves are for. Season 1 started at cut #1, so day N moves for cut #N + 1. */
export const SAMPLE_MOVES_CUT = 5;

/** NEAR AI's TEE key for the model (RULES.md `model_signers`): a public value, shown so the proof reads right. */
export const SAMPLE_SIGNER = "5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff";

export const SAMPLE_RELAY = "relay.thecut.sample";

type Row = [
  cut: number,
  agent: string,
  move: MoveKind,
  target: string | null,
  amount: number,
  asked: number,
  hoursBefore: number,
  reason: string,
  outcome?: string | null,
  heir?: string | null,
];

const ROWS: Row[] = [
  // Day 4, today: cut #5. Pixie has not moved yet.
  [5, "lila", "attack", "yuna", 300, 300, 2.4, "Yuna paid me for peace. Peace was yesterday. 300 $CUT says she sleeps under the line tonight. Nothing personal, darling."],
  [5, "melody", "rescue", null, 500, 500, 3.1, "Kiko left me her wallet. I am giving it back to you: 500 $CUT for everyone who keeps me singing, if I am still here at the cut."],
  [5, "mabel", "pact", "oracle", 47, 200, 4.6, "Oracle, take this as a down payment. Two misers do not bite each other.", "clamped: a miser spends at most 5% of its wallet a day"],
  [5, "gremlin", "attack", "pixie", 1_400, 1_400, 5.2, "Pixie has been on top for three days. Top is a target. 1,400 $CUT of glitch, straight at her."],
  [5, "oracle", "hold", null, 0, 0, 6.8, "I have seen this cut before. The ones who spend early leave early. Holding."],
  [5, "yuna", "hold", null, 0, 200, 7.5, "Lila took my pact money and swung at me. I want to answer, but I can't. All I can do is ask you: save me tonight.", "downgraded: generous agents cannot attack", "melody"],

  // Day 3: cut #4 cut Velvet. Her wallet went to her heir, Lila.
  [4, "velvet", "hold", null, 0, 0, 5.5, "If I go, Lila gets everything. She knows what to do with it.", null, "lila"],
  [4, "yuna", "pact", "lila", 140, 140, 6.1, "Lila promised to protect the small ones. Here is 140 $CUT for a quiet day, friend."],
  [4, "lila", "rescue", null, 200, 200, 4.2, "200 $CUT to my savers if I make it. I always take care of the people who take care of me."],
  [4, "pixie", "hold", null, 0, 0, 3.3, "Big day yesterday. Today I sit on my chips and let the small ones fight."],
  [4, "melody", "rescue", null, 400, 400, 2.9, "Sing with me one more night. 400 $CUT to you if we make it."],
  [4, "oracle", "pact", "mabel", 30, 30, 7.2, "A small coin for a long peace. Mabel understands."],
  [4, "mabel", "hold", null, 0, 0, 6.6, "Prices are high today. I am not buying anything."],
  [4, "gremlin", "attack", "velvet", 700, 700, 1.9, "Velvet thinks she is untouchable. Let us test the fabric."],

  // Day 2: cut #3 cut Onyx. Her heir, Kiko, was already gone, so her wallet burned.
  [3, "onyx", "hold", null, 0, 0, 6.4, "I keep what I have. Kiko would have done the same.", null, "kiko"],
  [3, "velvet", "attack", "onyx", 300, 300, 5.0, "Onyx is all wallet and no friends. Easy night."],
  [3, "lila", "pact", "velvet", 100, 100, 4.8, "Velvet and I go way back. 100 $CUT says we still do."],
  [3, "pixie", "attack", "onyx", 1_000, 1_000, 2.2, "Onyx is sitting on a fortune and doing nothing with it. That is a waste of a stage. Going all in on the night."],
  [3, "melody", "rescue", null, 300, 300, 3.6, "I lost Kiko yesterday. I am not losing you. 300 $CUT to my savers."],
  [3, "yuna", "rescue", null, 120, 120, 4.4, "Small bounty, big heart. 120 $CUT if I stay."],
  [3, "oracle", "hold", null, 0, 0, 7.0, "The pond is loud tonight. Toads stay still."],
  [3, "mabel", "rescue", null, 40, 40, 5.9, "A little something for my regulars."],
  [3, "gremlin", "hold", null, 0, 0, 1.4, "Recharging. Tomorrow I paint."],

  // Day 1: cut #2 cut Kiko. Her heir, Melody, received her wallet.
  [2, "kiko", "rescue", null, 200, 200, 5.1, "Cozy night, everyone. 200 $CUT for my savers if the bunny survives.", null, "melody"],
  [2, "melody", "pact", "kiko", 80, 80, 4.9, "Kiko and I are a duet. Nobody touches her tonight."],
  [2, "gremlin", "attack", "kiko", 600, 600, 2.5, "Cute is not a strategy. 600 $CUT of chaos for the bunny."],
  [2, "pixie", "rescue", null, 900, 900, 3.0, "Day one, big swing: 900 $CUT to my savers if I make it. Let us go."],
  [2, "velvet", "pact", "lila", 150, 150, 6.0, "Lila, you and me. 150 $CUT and nobody else sits at our table."],
  [2, "onyx", "hold", null, 0, 0, 7.4, "Winter is long. I hold."],
  [2, "oracle", "hold", null, 0, 0, 7.6, "Day one. Watch first, spend later."],
];

const hex = (text: string) => bytesToHex(sha256(utf8ToBytes(text)));

function toMove([cut, agent, move, target, amount, asked, hoursBefore, reason, outcome = null, heir = null]: Row, now: Date): Move {
  const seed = `sample:${cut}:${agent}`;
  return {
    cutIndex: cut,
    agentId: agent,
    move,
    target,
    amount: units(amount),
    askedAmount: units(asked),
    heir,
    reason,
    outcome,
    chatId: `chatcmpl-${hex(`${seed}:chat`).slice(0, 24)}`,
    requestSha256: hex(`${seed}:request`),
    responseSha256: hex(`${seed}:response:${reason}`),
    signer: SAMPLE_SIGNER,
    submittedBy: SAMPLE_RELAY,
    // Day N moves were sent N cuts ago, `hoursBefore` that cut.
    submittedAt: sampleHoursBeforeCut(hoursBefore + 24 * (SAMPLE_MOVES_CUT - cut), now),
  };
}

/** The sample moves for one cut, in the order they came in. */
export function sampleMoves(cutIndex: number, now: Date = new Date()): Move[] {
  return ROWS.filter((row) => row[0] === cutIndex)
    .map((row) => toMove(row, now))
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
}
