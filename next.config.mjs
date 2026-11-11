/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Token logos are rendered with plain <img> tags (src validated server-side
    // via isSafeImageUrl before storage). next/image is not used anywhere, so
    // remotePatterns is intentionally NOT wildcard-opened — the image
    // optimizer must never proxy arbitrary attacker-supplied hosts.
    remotePatterns: [],
  },
  eslint: {
    // Lint is run as an explicit `npm run lint` step (passes with 0 errors);
    // production builds must not be blocked by style-only warnings.
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking: the terminal must never be framed.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No geolocation/camera/mic; payments & webhooks not used by the app.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
