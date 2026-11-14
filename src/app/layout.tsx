import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AquaOne Health",
  description: "Your cat's daily health companion, from PureStream.",
  appleWebApp: { capable: true, title: "AquaOne", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png?v=2", apple: "/apple-touch-icon.png?v=2" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071D3C",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <main className="mx-auto min-h-dvh max-w-[480px]">{children}</main>
      </body>
    </html>
  );
}
