"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** A path as an absolute URL on the page's own origin; the server renders the path until it hydrates. */
export function useAbsoluteUrl(path: string): string {
  return useSyncExternalStore(
    noop,
    () => new URL(path, window.location.origin).toString(),
    () => path,
  );
}
