import { Suspense } from "react";

import { LineupScreen, lineupSubtitle } from "@/features/lineup";
import { loadLineup } from "@/features/lineup/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

/**
 * The laptop's trade dialogs sit over the dimmed lineup (DeskBuy, DeskSell, DeskClub "vote"). It is scenery:
 * inert and hidden from screen readers, and not rendered on the phone, where the trade step is the whole page.
 */
export function LineupBackdrop() {
  return (
    <div inert aria-hidden="true" className="hidden lg:block">
      <Suspense fallback={<AppHeader title="Today’s cut" />}>
        <Backdrop />
      </Suspense>
    </div>
  );
}

async function Backdrop() {
  const lineup = await loadLineup(await getViewerAccountId());
  return (
    <>
      <AppHeader title="Today’s cut" sub={lineupSubtitle(lineup)} />
      <LineupScreen lineup={lineup} />
    </>
  );
}
