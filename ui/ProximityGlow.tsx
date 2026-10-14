import type { ComponentPropsWithoutRef, ElementType } from "react";

export type GlowSettings = {
  /** Activation distance in px for this element (default: the page's radius, 150). */
  radius?: number;
  /** Strength multiplier for this element, e.g. 0.6 for a subtle nav item. */
  intensity?: number;
  /** false: never pick this element for the touch "nearest the centre" glow. */
  center?: boolean;
};

/**
 * Attributes that opt an element into the glow. Works anywhere, including server
 * components and plain JSX: `<a {...glowProps({ radius: 90 })} className="btn">`.
 */
export function glowProps({ radius, intensity, center }: GlowSettings = {}) {
  return {
    "data-glow": "",
    ...(radius != null && { "data-glow-radius": String(radius) }),
    ...(intensity != null && { "data-glow-intensity": String(intensity) }),
    ...(center === false && { "data-glow-center": "off" }),
  } as Record<string, string>;
}

/** Hook form of glowProps, for components that spread props onto their root. */
export const useProximityGlow = (settings: GlowSettings = {}) => glowProps(settings);

type Props<T extends ElementType> = GlowSettings & { as?: T } & Omit<ComponentPropsWithoutRef<T>, keyof GlowSettings | "as">;

/**
 * A glowing element. Renders a <div> by default; pick any tag or component with `as`.
 *
 *   <ProximityGlow as="article" className="card" radius={150}>…</ProximityGlow>
 *   <ProximityGlow as="button" className="btn btn-primary" radius={90}>Add to order</ProximityGlow>
 *
 * Needs <GlowProvider /> once in the layout. Without it the element still gets the
 * keyboard-focus glow and the still hover highlight from CSS.
 */
export function ProximityGlow<T extends ElementType = "div">({ as, radius, intensity, center, ...rest }: Props<T>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag {...glowProps({ radius, intensity, center })} {...rest} />;
}
