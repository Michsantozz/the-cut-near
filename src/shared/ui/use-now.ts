"use client";

import { useSyncExternalStore } from "react";

// One clock for every live countdown on the page: a single timer, aligned to whole seconds.

const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function schedule() {
  timer = setTimeout(() => {
    now = Date.now();
    listeners.forEach((listener) => listener());
    schedule();
  }, 1_000 - (Date.now() % 1_000));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    // React reads the snapshot again right after subscribing, so a stale time is replaced at once.
    now = Date.now();
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  if (now === 0) now = Date.now();
  return now;
}

/**
 * The current time in ms, ticking every second. `renderedAt` is the server's request time: the server render
 * and hydration both use it, so the markup matches, and the live clock takes over right after.
 */
export function useNow(renderedAt: number): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => renderedAt);
}
