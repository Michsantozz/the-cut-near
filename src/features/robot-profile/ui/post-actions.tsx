"use client";

import { Plus, Share } from "lucide-react";

import { xIntentUrl } from "@/shared/lib/x-intent";
import { Button } from "@/shared/ui/button";
import { useAbsoluteUrl } from "@/shared/ui/use-absolute-url";
import { WalletGatedLink } from "@/shared/wallet";

/**
 * Under a robot's post: save on the robot right from the post, share the post on X with a link back to
 * the robot, and, for the robot's creator, the same post ready to publish from the robot's X account.
 * Every X link only opens X's composer; nothing is posted for anyone.
 */
export function PostActions({ robotId, robotName, text, xHandle, canSave, isCreator }: { robotId: string; robotName: string; text: string; xHandle: string; canSave: boolean; isCreator: boolean }) {
  const robotUrl = useAbsoluteUrl(`/robots/${robotId}`);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {canSave && (
        <Button asChild variant="lime" size="sm">
          <WalletGatedLink href={`/save/${robotId}`}>
            <Plus aria-hidden="true" strokeWidth={3} />
            Save {robotName}
          </WalletGatedLink>
        </Button>
      )}
      <Button asChild variant="outline" size="sm">
        <a href={xIntentUrl(`“${text}” ${robotName} on The Cut`, robotUrl)} target="_blank" rel="noopener noreferrer">
          <Share aria-hidden="true" strokeWidth={2.8} />
          Share on X
        </a>
      </Button>
      {isCreator && xHandle && (
        <Button asChild variant="black" size="sm">
          <a href={xIntentUrl(text, robotUrl)} target="_blank" rel="noopener noreferrer">
            Post as {xHandle}
          </a>
        </Button>
      )}
    </div>
  );
}
