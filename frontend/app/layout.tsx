import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "LLM Portfolio Lab",
  description: "Hypothetical portfolios • research only • not investment advice",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}