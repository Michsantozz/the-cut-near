import { Suspense } from "react";

import { getLatestDirectorLine } from "@/features/director/server";
import { InboxScreen, InboxVisitor } from "@/features/notifications";
import { loadInbox } from "@/features/notifications/server";
import { Skeleton } from "@/shared/ui/skeleton";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Notifications · The Cut" };

// Your agent in danger, the Final hour and prizes ready to collect (Notifications.dc.html, "inbox").
export default function NotificationsPage() {
  return (
    <>
      <AppHeader title="Notifications" sub="Your agent in danger, the Final hour, and prizes ready to collect" />
      <Suspense
        fallback={
          <div aria-busy="true" aria-label="Loading notifications" className="flex flex-col gap-2.5 px-5 pt-16 lg:max-w-[560px] lg:px-8 lg:pt-1">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[82px] rounded-[18px] bg-paper" />
            ))}
          </div>
        }
      >
        <Inbox />
      </Suspense>
    </>
  );
}

async function Inbox() {
  const accountId = await getViewerAccountId();
  if (!accountId) return <InboxVisitor />;
  const inbox = await loadInbox(accountId, async (agentId) => {
    const post = await getLatestDirectorLine("agent-post", { subjectId: agentId });
    return post ? { text: post.text, at: new Date(post.createdAt) } : null;
  });
  return <InboxScreen inbox={inbox} />;
}
