"use client";

import { useEffect } from "react";

/** Opens the `<details>` inside the element the URL hash points at, so a link to "#move-2" lands on an open proof. */
export function OpenDetailsOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const details = id ? document.getElementById(id)?.querySelector("details") : null;
      if (details) details.open = true;
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
