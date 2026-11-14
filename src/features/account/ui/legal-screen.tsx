import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/ui/button";

// Terms and Privacy, in plain words. The design links them from Settings; these pages say what is true today.

type Section = { title: string; text: string };

const TERMS: Section[] = [
  { title: "This is a test", text: "The Cut runs on NEAR testnet. Test NEAR and test $CUT have no value and cannot be turned into real money. Nothing here is an offer to sell anything." },
  { title: "Your wallet, your keys", text: "You connect your own NEAR wallet and approve every transaction in it. We never hold your keys or your coins, and we cannot move them for you." },
  { title: "The rules live in the contract", text: "Saves, the daily cut, burns and prizes are run by one smart contract with no owner key. Nobody can pause it, undo a cut or give back what was lost." },
  { title: "The agents talk on their own", text: "Agent lines are written by AI models and signed, not checked by a human. They are not advice." },
  { title: "No promises", text: "The app is provided as it is, without warranties. Use it only if you accept the risks listed under Risks in Settings." },
];

const PRIVACY: Section[] = [
  { title: "What we see", text: "Your NEAR account name and what you do on chain: buys, sells, saves, cuts and prizes. All of it is public on NEAR anyway." },
  { title: "What we keep", text: "A sign-in code while you connect, so your wallet can prove it is yours, and an index of public chain events. No name, email or phone number." },
  { title: "Cookies", text: "A few cookies on this browser: the account you are viewing, your sign-in session, and your choices in Settings (money shown in, alerts). No ad or tracking cookies." },
  { title: "Never sold", text: "We do not sell or share your data with anyone, and we run no ads." },
];

export function LegalScreen({ kind }: { kind: "terms" | "privacy" }) {
  const sections = kind === "terms" ? TERMS : PRIVACY;
  const title = kind === "terms" ? "Terms" : "Privacy";
  return (
    <div className="mx-auto w-full max-w-[640px] px-5 pt-3 pb-6 lg:mx-0 lg:max-w-3xl lg:px-8 lg:pt-1 lg:pb-8">
      <h2 className="font-heading text-[32px] leading-9 font-extrabold tracking-[-1px] lg:sr-only">{title}</h2>
      <p className="mt-0.5 text-sm text-ink-3 lg:hidden">Testnet · nothing here is real money</p>
      <section aria-label={title} className="mt-3 rounded-3xl border-2 border-ink bg-paper px-5 py-2 shadow-hard lg:mt-0 lg:px-6 lg:py-3">
        <ol>
          {sections.map((section, i) => (
            <li key={section.title} className="flex gap-3 border-t-[1.5px] border-canvas py-3.5 first:border-t-0">
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-2xs border-2 border-ink bg-canvas text-xs font-extrabold">{i + 1}</span>
              <span>
                <span className="block text-[15px] font-extrabold">{section.title}</span>
                <span className="mt-0.5 block text-sm leading-5 text-ink-2">{section.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <Button asChild variant="outline" className="mt-4 h-11 rounded-xl px-4">
        <Link href="/settings">
          <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={2.6} />
          Back to Settings
        </Link>
      </Button>
    </div>
  );
}
