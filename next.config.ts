import type { NextConfig } from "next";

// Baseline security headers applied to every response. Conservative on CSP — we
// set frame-ancestors (clickjacking) via CSP and rely on the explicit headers
// for the rest, so resource loading isn't broken by an over-tight policy.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  compress: true,
  // Tree-shake barrel imports so only the used members ship to the client.
  experimental: {
    optimizePackageImports: ["zod"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
