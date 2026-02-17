/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/outlook.json",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
  async rewrites() {
    // If you run FastAPI separately (default port 10000), this proxies API calls from Next -> FastAPI.
    // Outlook is served by FastAPI too (backend/outlook.json). If you instead want Next to serve it,
    // remove this rewrite and add an app route handler.
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || "https://llm-portfolio-lab.onrender.com/api/portfolio-series";
    return [
      { source: "/api/health", destination: `${apiBase}/api/health` },
      { source: "/api/portfolio-series", destination: `${apiBase}/api/portfolio-series` },
      { source: "/api/outlook", destination: `${apiBase}/api/outlook` },
    ];
  },
};

module.exports = nextConfig;
