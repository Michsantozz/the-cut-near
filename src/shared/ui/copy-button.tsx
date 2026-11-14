"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Button } from "./button";

type Props = Omit<ComponentProps<typeof Button>, "onClick" | "children" | "asChild"> & {
  text: string;
  label?: string;
  /** Shows a copy icon before the label. */
  icon?: boolean;
  /** Keeps the label for screen readers only (an icon button). */
  iconOnly?: boolean;
};

/** Copies a command or an account name to the clipboard and says "Copied" for two seconds. */
export function CopyButton({ text, label = "Copy", icon = false, iconOnly = false, ...props }: Props) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      {...props}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2_000);
        });
      }}
    >
      {(icon || iconOnly) && (copied ? <Check aria-hidden="true" strokeWidth={3} /> : <Copy aria-hidden="true" strokeWidth={2.6} />)}
      <span aria-live="polite" className={iconOnly ? "sr-only" : undefined}>{copied ? "Copied" : label}</span>
    </Button>
  );
}
