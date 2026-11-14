import { LegalScreen } from "@/features/account";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Terms · The Cut" };

// Terms, in plain words, linked from Settings' fine print.
export default function TermsPage() {
  return (
    <>
      <AppHeader title="Terms" sub="The rules of using The Cut, plainly" />
      <LegalScreen kind="terms" />
    </>
  );
}
