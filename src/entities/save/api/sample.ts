import { SAMPLE_ACCOUNT_ID } from "@/shared/config/sample";
import { units } from "@/shared/lib/amount";
import type { Save } from "../model/types";

/** The design's signed-in member (also the sample-mode session in shared/auth). */
export const SAMPLE_MEMBER = SAMPLE_ACCOUNT_ID;

export const SAMPLE_SAVES: Save[] = [{ accountId: SAMPLE_MEMBER, robotId: "melody", amount: units(400), lockedForCut: 1 }];
