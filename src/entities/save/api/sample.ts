import { SAMPLE_ACCOUNT_ID } from "@/shared/config/sample";
import { units } from "@/shared/lib/amount";
import type { Save } from "../model/types";

/** The design's signed-in member (also the sample-mode session in shared/auth). */
export const SAMPLE_MEMBER = SAMPLE_ACCOUNT_ID;

export const SAMPLE_SAVES: Save[] = [{ accountId: SAMPLE_MEMBER, agentId: "melody", amount: units(400), lockedForCut: 1 }];

/** After cut #1 (SPEC-v19 §2): mika's 400 of Melody-9's 112,300 × the 1,775.4 slice = 6.32 $CUT, floored like the contract. */
export const SAMPLE_CLAIMABLE = new Map<string, bigint>([[SAMPLE_MEMBER, ((units(17_754) / 10n) * units(400)) / units(112_300)]]);

/** Accounts that already hold $CUT have paid their storage. */
export const SAMPLE_REGISTERED = new Set<string>([SAMPLE_MEMBER]);
