import "server-only";

import { isDeletingCut } from "@/entities/cut";
import { getCut } from "@/entities/cut/server";
import { getRobot } from "@/entities/robot/server";

export type CutShare = {
  index: number;
  at: Date;
  pile: bigint;
  burned: bigint;
  deleted: { id: string; name: string };
  joined: { id: string; name: string } | null;
};

/** The facts a cut's share card shows, or null when that cut has not run. */
export async function loadCutShare(index: number): Promise<CutShare | null> {
  if (!Number.isSafeInteger(index) || index < 1) return null;
  const cut = await getCut(index);
  // A cut that only seated bench robots has nothing to share.
  if (!cut || !isDeletingCut(cut)) return null;
  const [deleted, joined] = await Promise.all([getRobot(cut.deletedId), cut.joinedId ? getRobot(cut.joinedId) : null]);
  return {
    index: cut.index,
    at: cut.at,
    pile: cut.pile,
    burned: cut.burned,
    deleted: { id: cut.deletedId, name: deleted?.name ?? cut.deletedId },
    joined: cut.joinedId ? { id: cut.joinedId, name: joined?.name ?? cut.joinedId } : null,
  };
}
