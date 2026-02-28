/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
  async rewrites() {
    // If you run FastAPI separately (default port 10000), this proxies API calls from Next -> FastAPI.
    // Outlook is served by FastAPI too (backend/outlook.json). If you instead want Next to serve it,
    // remove this rewrite and add an app route handler.
    // Strip any trailing path so the base is always just the origin.
    const raw = process.env.NEXT_PUBLIC_API_BASE || "https://llm-portfolio-lab.onrender.com";
    const apiBase = raw.replace(/\/api\/.*$/, "");
    return [
      { source: "/api/health",            destination: `${apiBase}/api/health` },
      { source: "/api/portfolio-series",  destination: `${apiBase}/api/portfolio-series` },
      { source: "/api/outlook",           destination: `${apiBase}/api/outlook` },
      { source: "/api/sync",              destination: `${apiBase}/api/sync` },
      { source: "/api/ff5/sync",          destination: `${apiBase}/api/ff5/sync` },
      { source: "/api/ff5/loadings",      destination: `${apiBase}/api/ff5/loadings` },
    ];
  },
};

module.exports = nextConfig;
