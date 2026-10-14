/* Installable door scanner: its own home-screen app, scoped to /door. */
export const dynamic = "force-static";

export function GET() {
  return Response.json({
    name: "Nepthic Door",
    short_name: "Nepthic Door",
    description: "Ticket check-in for Nepthic Events door staff.",
    start_url: "/door",
    scope: "/door",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0E0B14",
    theme_color: "#0E0B14",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }, { headers: { "content-type": "application/manifest+json" } });
}
