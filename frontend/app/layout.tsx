import "./globals.css";

export const metadata = {
  title: "LLM Portfolio Lab",
  description: "Hypothetical portfolios • research only • not investment advice",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}