import { units } from "@/shared/lib/amount";
import type { Save } from "../model/types";

/** The design's signed-in member. */
export const SAMPLE_MEMBER = "mika.near";

export const SAMPLE_SAVES: Save[] = [{ accountId: SAMPLE_MEMBER, robotId: "melody", amount: units(400), lockedForCut: 1 }];
