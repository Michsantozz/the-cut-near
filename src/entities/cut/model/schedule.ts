/** `at` moved forward by whole intervals until it is after `now`. Unchanged when already in the future. */
export function rollForward(at: Date, now: Date, intervalMs: number): Date {
  if (at > now) return at;
  const missed = Math.floor((now.getTime() - at.getTime()) / intervalMs) + 1;
  return new Date(at.getTime() + missed * intervalMs);
}
