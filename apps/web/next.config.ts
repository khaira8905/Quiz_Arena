import type { NextConfig } from "next";

/**
 * The browser talks to the API through this app (`/api/*` is proxied to API_ORIGIN), so the
 * admin session cookie is first-party on the web domain. The realtime socket connects to the
 * game server directly via NEXT_PUBLIC_REALTIME_URL.
 */
const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:4000").replace(/\/$/, "");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  transpilePackages: ["@quizarena/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Nothing that carries game controls or a session may be framed by another site
      // (clickjacking an END or SKIP). The arena preview is framed by the admin, same origin.
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      { source: "/host/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      { source: "/play", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      // The arena preview is framed by the Customize Arena panel on this same origin.
      { source: "/arena-preview", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};

export default nextConfig;
