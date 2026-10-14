"use client";
import { useEffect, useRef, useState } from "react";

/* Image with a fixed aspect ratio and a blurred colour placeholder that sharpens into the
   real image once it has loaded. Nothing around it moves while it loads. */
export function BlurImage({ src, alt, ratio = "4 / 3", placeholder, sizes, priority = false, className, vt }: {
  src: string; alt: string; ratio?: string; placeholder?: string; sizes?: string; priority?: boolean; className?: string; vt?: string;
}) {
  const img = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { if (img.current?.complete && img.current.naturalWidth) setLoaded(true); }, []);
  return (
    <div className={`bimg${className ? ` ${className}` : ""}`} style={{ ["--ratio" as string]: ratio, ["--ph" as string]: placeholder, viewTransitionName: vt }}>
      <img ref={img} src={src} alt={alt} sizes={sizes} loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"}
        data-loaded={loaded || undefined} onLoad={() => setLoaded(true)} />
    </div>
  );
}
