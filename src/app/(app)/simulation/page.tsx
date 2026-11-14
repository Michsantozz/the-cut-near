import { SimulationScreen } from "@/features/inside";

import { AppHeader } from "../_shell/app-header";
import { repoFileHref } from "../_shell/nav";

export const metadata = { title: "The simulation · The Cut" };

// The simulation: the 60-day supply model (sim/thecut_sim.py) under six scenarios, with what it does and does not show.
export default function SimulationPage() {
  const report = repoFileHref("sim/RESULTS.md", "");
  return (
    <>
      <AppHeader title="The simulation" sub="60 days of $CUT supply under six scenarios" />
      <SimulationScreen reportHref={report.external ? report.href : null} />
    </>
  );
}
