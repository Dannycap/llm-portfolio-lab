/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // If you run FastAPI separately (default port 10000), this proxies API calls from Next -> FastAPI.
    // Outlook is served by FastAPI too (backend/outlook.json). If you instead want Next to serve it,
    // remove this rewrite and add an app route handler.
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:10000";
    return [
      { source: "/api/health", destination: `${apiBase}/api/health` },
      { source: "/api/portfolio-series", destination: `${apiBase}/api/portfolio-series` },
      { source: "/api/outlook", destination: `${apiBase}/api/outlook` },
    ];
  },
};

module.exports = nextConfig;
