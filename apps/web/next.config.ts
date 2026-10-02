import type { NextConfig } from "next";

/**
 * The browser talks to the API through this app (`/api/*` is proxied to API_ORIGIN), so the
 * admin session cookie is first-party on the web domain. The realtime socket connects to the
 * game server directly via NEXT_PUBLIC_REALTIME_URL.
 */
const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/$/, "");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  transpilePackages: ["@quizarena/shared"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The admin portal must never be framed; the projector page may be embedded by event tooling.
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
