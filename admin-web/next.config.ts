import type { NextConfig } from "next";

// The browser is what calls the API, so its address has to be baked into the
// bundle at build time. Render knows the API's hostname but cannot build a full
// URL out of it in the blueprint, so it passes the bare host and we assemble it
// here. A full NEXT_PUBLIC_API_URL still wins when one is given.
const API_HOST = process.env.API_HOST;
const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  (API_HOST ? `https://${API_HOST}/api/v1` : "http://127.0.0.1:8000/api/v1");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
};

export default nextConfig;
