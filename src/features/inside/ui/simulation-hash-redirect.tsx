"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Old links to `/inside#simulation` land on the simulation's own page. The hash never reaches the server, so this runs here. */
export function SimulationHashRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (window.location.hash === "#simulation") router.replace("/simulation");
  }, [router]);
  return null;
}
