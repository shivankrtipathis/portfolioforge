/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep libSQL out of the server bundle so its optional native binding
  // (used only for the local file fallback) doesn't break serverless builds.
  experimental: {
    serverComponentsExternalPackages: ["@libsql/client", "libsql"],
  },
};

export default nextConfig;
