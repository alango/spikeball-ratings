import type { NextConfig } from "next";

// Next 16 no longer runs ESLint during build, so no config is needed here —
// linting is a separate `npm run lint` step.
const nextConfig: NextConfig = {};

export default nextConfig;
