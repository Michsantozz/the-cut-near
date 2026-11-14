import { SAMPLE_ACCOUNT_ID } from "@/shared/config/sample";
import { units } from "@/shared/lib/amount";
import type { Save } from "../model/types";

/** The design's signed-in member (also the sample-mode session in shared/auth). */
export const SAMPLE_MEMBER = SAMPLE_ACCOUNT_ID;

/** mika.near saved 400 on Melody-9 on day 3 of season 1, before cut #4 (the sample journal has the save). */
export const SAMPLE_SAVES: Save[] = [{ accountId: SAMPLE_MEMBER, agentId: "melody", amount: units(400), lockedForCut: 4 }];

/**
 * Melody-9 survived cut #4: its savers shared one slice of 981 $CUT (Velvet's 11,400 pile, half burned, plus 1,930 of
 * fees, 90% to savers, 7 survivors). mika's 400 of Melody's 20,700 at that cut, floored like the contract.
 */
export const SAMPLE_CLAIMABLE = new Map<string, bigint>([[SAMPLE_MEMBER, (units(981) * units(400)) / units(20_700)]]);

/** Accounts that already hold $CUT have paid their storage. */
export const SAMPLE_REGISTERED = new Set<string>([SAMPLE_MEMBER]);
