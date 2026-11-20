/* ملف في المشروع. */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/costs/material-requests/print": ["./node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2"],
    "/api/customers/export-pdf": ["./node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2"],
    "/api/kitchen/export": ["./node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2"],
  },
  images: {
    domains: [],
  },
};

export default nextConfig;
