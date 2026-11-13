import "server-only";
import { cutContract } from "@/shared/near/contract";
import type { ParamsView } from "@/shared/near/views";
import type { Params } from "../model/types";

/** The launch parameters the app shows; the pool's initial reserves stay on the view. */
export function toParams(view: ParamsView): Params {
  const { totalSupply, feeBps, burnBps, saversBps, stageSize, firstCutAt, cutIntervalMs, robotFunding, registerDeposit } = view;
  return { totalSupply, feeBps, burnBps, saversBps, stageSize, firstCutAt, cutIntervalMs, robotFunding, registerDeposit };
}

export async function getLiveParams(): Promise<Params> {
  return toParams(await cutContract().getParams());
}
