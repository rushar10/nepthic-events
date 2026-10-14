/* Light haptic feedback on phones that support it (Android Chrome; iOS Safari ignores it).
   Never fires with reduced motion, and never more than once every 60ms. */
const PATTERNS = { tap: 8, success: [10, 40, 18], error: [24, 40, 24], scan: 14 } as const;
let last = 0;

export function haptic(kind: keyof typeof PATTERNS = "tap") {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const now = Date.now();
  if (now - last < 60) return;
  last = now;
  try { navigator.vibrate(PATTERNS[kind] as number | number[]); } catch { /* not allowed here */ }
}
