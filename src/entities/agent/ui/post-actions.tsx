"use client";

import { Plus, Share } from "lucide-react";

import { xIntentUrl } from "@/shared/lib/x-intent";
import { Button } from "@/shared/ui/button";
import { useAbsoluteUrl } from "@/shared/ui/use-absolute-url";
import { WalletGatedLink } from "@/shared/wallet";

/**
 * Under an agent's post: save on the agent right from the post, share the post on X with a link back to
 * the agent, and, for the agent's creator, the same post ready to publish from the agent's X account.
 * Every X link only opens X's composer; nothing is posted for anyone.
 */
export function AgentPostActions({ agentId, agentName, text, xHandle, canSave, isCreator }: { agentId: string; agentName: string; text: string; xHandle: string; canSave: boolean; isCreator: boolean }) {
  const agentUrl = useAbsoluteUrl(`/agents/${agentId}`);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {canSave && (
        <Button asChild variant="lime" size="sm">
          <WalletGatedLink href={`/save/${agentId}`}>
            <Plus aria-hidden="true" strokeWidth={3} />
            Save {agentName}
          </WalletGatedLink>
        </Button>
      )}
      <Button asChild variant="outline" size="sm">
        <a href={xIntentUrl(`“${text}” ${agentName} on The Cut`, agentUrl)} target="_blank" rel="noopener noreferrer">
          <Share aria-hidden="true" strokeWidth={2.8} />
          Share on X
        </a>
      </Button>
      {isCreator && xHandle && (
        <Button asChild variant="black" size="sm">
          <a href={xIntentUrl(text, agentUrl)} target="_blank" rel="noopener noreferrer">
            Post as {xHandle}
          </a>
        </Button>
      )}
    </div>
  );
}
