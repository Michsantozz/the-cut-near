"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";

/** Copies a command or an account name. Says "Copied" for two seconds. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="lime"
      size="sm"
      className="h-[34px] rounded-[10px] border-0 px-3.5 text-[13px]"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2_000);
        });
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}
