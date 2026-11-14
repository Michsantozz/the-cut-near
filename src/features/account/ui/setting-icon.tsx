import { cn } from "cn";
import type { LucideIcon } from "lucide-react";

/** The colored square in front of a settings row: 32px on the phone, 36px on the laptop. */
export function SettingIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) {
  return (
    <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-sm border-2 border-ink lg:size-9 lg:rounded-[11px]", tone)}>
      <Icon className="size-4 lg:size-[17px]" strokeWidth={2.6} />
    </span>
  );
}
