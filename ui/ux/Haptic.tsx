"use client";
import { useEffect } from "react";
import { haptic } from "./haptics";

/** Fires one haptic pulse when shown (e.g. on the "You're in" confirmation). */
export function Haptic({ kind = "success" }: { kind?: "tap" | "success" | "error" | "scan" }) {
  useEffect(() => { haptic(kind); }, [kind]);
  return null;
}
