import { Suspense } from "react";

import { ClubScreen } from "@/features/club";
import { loadClub } from "@/features/club/server";
import { formatCount } from "@/shared/ui/format";
import { Skeleton } from "@/shared/ui/skeleton";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Club · The Cut" };

// The club: the member's card, this week's perks, their save and the top savers. Visitors see the locked card.
export default function ClubPage() {
  return (
    <Suspense
      fallback={
        <>
          <AppHeader title="Club" />
          <Skeleton className="mx-5 mt-3 h-[300px] rounded-3xl bg-paper lg:mx-8" />
        </>
      }
    >
      <ClubContent />
    </Suspense>
  );
}

async function ClubContent() {
  const club = await loadClub(await getViewerAccountId());
  const sub = [club.day !== null ? `Day ${club.day}` : null, club.members !== null ? `${formatCount(club.members)} members` : null].filter(Boolean).join(" · ");
  return (
    <>
      <AppHeader title="Club" sub={sub} />
      <ClubScreen club={club} />
    </>
  );
}
