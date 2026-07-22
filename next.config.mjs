/** @type {import('next').NextConfig} */
const nextConfig = {
  // The CVM image runs the traced server directly. This keeps the runtime
  // small and avoids requiring the source tree or npm on the application
  // container while retaining Node.js route handlers and streaming support.
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

export default nextConfig;
