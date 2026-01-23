import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Companies Market Cap - US Stock Rankings",
  description: "Real-time ranking of US companies by market capitalization, earnings, revenue, and more",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
