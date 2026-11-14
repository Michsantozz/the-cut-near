import { LegalScreen } from "@/features/account";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Privacy · The Cut" };

// Privacy, in plain words, linked from Settings' fine print.
export default function PrivacyPage() {
  return (
    <>
      <AppHeader title="Privacy" sub="What we see, keep and never sell" />
      <LegalScreen kind="privacy" />
    </>
  );
}
