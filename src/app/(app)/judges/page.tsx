import { JudgeDeskScreen } from "@/features/judges";
import { loadJudgeDesk } from "@/features/judges/server";

import { AppHeader } from "../_shell/app-header";
import { GITHUB_URL } from "../_shell/nav";

export const metadata = { title: "The judge desk · The Cut" };

// The judge desk: every claim of the app, checked live against NEAR from the reader's browser.
export default function JudgesPage() {
  return (
    <>
      <AppHeader title="The judge desk" sub="Every claim, checked live against NEAR" />
      <JudgeDeskScreen desk={loadJudgeDesk()} repoUrl={GITHUB_URL} />
    </>
  );
}
