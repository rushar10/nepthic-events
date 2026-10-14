import type { NextConfig } from "next";

/* Nepthic Events is a standalone project: it reads its own .env and shares nothing at runtime. */
const config: NextConfig = {
  poweredByHeader: false,
  // Put <title>/<meta description> in the <head> for every client (not streamed), so link
  // previews and audits always see them. Our data is fast, so this costs nothing noticeable.
  htmlLimitedBots: /.*/,
  serverExternalPackages: ["sharp", "passkit-generator"],
  experimental: { serverActions: { bodySizeLimit: "32mb" } },
  async headers() {
    return [{
      source: "/sw.js",
      headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }],
    }, {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default config;
