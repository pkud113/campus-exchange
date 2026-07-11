import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? "http://localhost:3000"),
  title: { default: "Campus Exchange", template: "%s · Campus Exchange" },
  description: "A safer marketplace and campus community, verified for students.",
  applicationName: "Campus Exchange",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Campus Exchange" },
  formatDetection: { telephone: false },
  openGraph: { type: "website", title: "Campus Exchange", description: "Campus life, all in one place.", images: [{ url: "/og.png", width: 1732, height: 909, alt: "Campus Exchange — Campus life, all in one place." }] },
  twitter: { card: "summary_large_image", title: "Campus Exchange", description: "Campus life, all in one place.", images: ["/og.png"] }
};
export const viewport: Viewport = { themeColor: "#f6f3ec", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
