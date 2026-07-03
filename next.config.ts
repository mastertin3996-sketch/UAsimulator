import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions enabled by default in Next.js 16
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Source map upload only activates once SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT are set.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
