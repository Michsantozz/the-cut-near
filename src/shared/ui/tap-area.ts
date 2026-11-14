/**
 * On touch screens, a hit area at least 44px tall around a small control, without making it look bigger:
 * an invisible ::after centered on it. The control must not clip overflow (no `truncate` on it).
 */
export const TAP_AREA =
  "relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-[max(100%,44px)] pointer-coarse:after:-translate-y-1/2 pointer-coarse:after:content-['']";
