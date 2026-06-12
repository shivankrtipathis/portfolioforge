/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // node:sqlite is a Node builtin; keep it external to the server bundle.
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
