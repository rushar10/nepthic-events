import type { CSSProperties } from "react";
import { dayMonth } from "./format";
import { BlurImage } from "./ux/BlurImage";

/* Placeholder artwork until real product photography and event posters are linked.
   Products with imageUrl, and events with a cover upload, use the real image instead. */

const SHAPES: Record<string, string> = {
  Tees: '<path d="M31 18 42 13q8 9 16 0l11 5 17 14-10 12-8-6v48H32V38l-8 6-10-12z"/>',
  Hoodies: '<path d="M33 22q2-15 17-15t17 15l16 9 5 41H76l-4-30v46H28V42l-4 30H12l5-41z"/><path d="M38 64h24v12H38z" fill="none" stroke="var(--stroke)" stroke-width="1.6"/>',
  Crewnecks: '<path d="M32 16l11-3q7 6 14 0l11 3 16 11 6 51H78l-6-36v46H28V42l-6 36H10l6-51z"/><path d="M28 82h44" stroke="var(--stroke)" stroke-width="2"/>',
  Outerwear: '<path d="M32 15l11-3 7 7 7-7 11 3 16 11 6 54H78l-6-38v46H28V42l-6 38H10l6-54z"/><path d="M50 20v68" stroke="var(--stroke)" stroke-width="1.6"/>',
  Bottoms: '<path d="M30 10h40l5 80H56l-6-50-6 50H25z"/><path d="M30 18h40" stroke="var(--stroke)" stroke-width="2"/>',
  Headwear: '<path d="M18 64q1-34 30-35 29 1 30 35z"/><path d="M46 64h46q-2 9-14 9l-32-3z"/>',
};

/* `vt` names the image for shared-element page transitions: the card's picture grows into
   the product page's picture. Real photos blur up from a colour placeholder. */
export function Garment({ category, hue, imageUrl, alt, vt, priority }: { category: string; hue: number; imageUrl?: string | null; alt: string; vt?: string; priority?: boolean }) {
  if (imageUrl) return <BlurImage src={imageUrl} alt={alt} ratio="4 / 3" placeholder={`hsl(${hue} 30% 22%)`} vt={vt} priority={priority} sizes="(max-width: 760px) 50vw, 300px" />;
  return (
    <div className="garment" style={{ "--h": hue, viewTransitionName: vt } as CSSProperties}>
      <svg viewBox="0 0 100 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SHAPES[category] ?? SHAPES.Tees }} />
    </div>
  );
}

export function Poster({ name, venue, city, startsAt, hue, big, imageUrl, vt, priority }: { name: string; venue: string; city: string; startsAt: Date; hue: number; big?: boolean; imageUrl?: string | null; vt?: string; priority?: boolean }) {
  return (
    <div className={`poster${big ? " big" : ""}${imageUrl ? " has-img" : ""}`} style={{ "--h": hue, viewTransitionName: vt } as CSSProperties}>
      {imageUrl && <BlurImage className="poster-img" src={imageUrl} alt="" ratio="auto" placeholder={`hsl(${hue} 40% 18%)`} priority={priority} sizes="(max-width: 760px) 100vw, 600px" />}
      <span className="poster-date mono">{dayMonth(startsAt)}</span>
      <span className="poster-name">{name}</span>
      <span className="poster-venue">{venue} · {city}</span>
    </div>
  );
}
