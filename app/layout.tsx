import type { Metadata, Viewport } from "next";
import { Inter, Space_Mono, Bebas_Neue } from "next/font/google";
import "./globals.css";
import Polyfills from "@/components/Polyfills";
import Providers from "@/components/Providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BOLT XR | Spatial Wallet",
  description: "Multi-chain Web3 wallet for VR/AR/XR with hand-tracking controls.",
  icons: {
    icon: "/0logov3.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceMono.variable} ${bebasNeue.variable}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <Polyfills />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
