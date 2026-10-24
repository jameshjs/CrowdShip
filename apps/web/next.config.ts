import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@crowdship/db", "@crowdship/shared", "@crowdship/ai", "@crowdship/integrations"],
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
        ],
      },
    ];
  },
};
export default config;
