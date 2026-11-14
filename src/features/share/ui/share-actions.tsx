"use client";

import { Pencil, Send, X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/shared/ui/button";
import { CopyButton } from "@/shared/ui/copy-button";
import { Textarea } from "@/shared/ui/textarea";
import { useAbsoluteUrl } from "@/shared/ui/use-absolute-url";

import { POST_LIMIT, postLength, telegramShareUrl, xIntentUrl } from "../model/post";

/** "Your post": an editable post with X's count, then Post on X, Telegram and Copy link. Nothing is posted for you. */
export function ShareActions({ path, defaultPost }: { path: string; defaultPost: string }) {
  const [post, setPost] = useState(defaultPost);
  const url = useAbsoluteUrl(path);
  const id = useId();
  const length = postLength(post, true);
  const tooLong = length > POST_LIMIT;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col rounded-2xl border-2 border-ink bg-paper px-4 pt-3 pb-3 lg:min-h-[340px] lg:rounded-3xl lg:px-[18px] lg:pt-4">
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="text-xs font-extrabold tracking-[0.06em] text-ink-2 uppercase">
            Your post
          </label>
          <Pencil aria-hidden="true" className="size-3.5 text-ink-3" strokeWidth={2.6} />
        </div>
        <Textarea
          id={id}
          value={post}
          onChange={(event) => setPost(event.target.value)}
          aria-invalid={tooLong}
          aria-describedby={`${id}-count`}
          className="mt-1 min-h-[96px] grow resize-none border-0 bg-transparent p-0 text-[15px] leading-6 text-ink shadow-none focus-visible:ring-0 md:text-base lg:min-h-[220px]"
        />
        <p id={`${id}-count`} className={tooLong ? "self-end text-xs font-bold text-danger tabular-nums" : "self-end text-xs font-bold text-ink-3 tabular-nums"}>
          {length} / {POST_LIMIT}
        </p>
      </div>
      <Button asChild variant="black" size="xl" className="h-14 w-full rounded-2xl text-[17px] shadow-hard-violet aria-disabled:pointer-events-none aria-disabled:opacity-50">
        <a href={xIntentUrl(post, url)} target="_blank" rel="noopener noreferrer" aria-disabled={tooLong || undefined}>
          <X aria-hidden="true" className="size-5" strokeWidth={2.6} />
          Post on X
        </a>
      </Button>
      <div className="grid grid-cols-2 gap-2.5">
        <Button asChild variant="outline" size="xl" className="h-[50px] rounded-2xl bg-violet text-paper hover:bg-violet/90">
          <a href={telegramShareUrl(post, url)} target="_blank" rel="noopener noreferrer">
            <Send aria-hidden="true" className="size-[17px]" strokeWidth={2.6} />
            Telegram
          </a>
        </Button>
        <CopyButton text={url} icon label="Copy link" variant="outline" size="xl" className="h-[50px] rounded-2xl" />
      </div>
    </div>
  );
}
