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
export const viewport: Viewport = { themeColor: [{media:"(prefers-color-scheme: light)",color:"#f6f3ec"},{media:"(prefers-color-scheme: dark)",color:"#101613"}], colorScheme: "light dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const themeScript=`(()=>{try{const value=localStorage.getItem('campus-theme')||'system';const resolved=value==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):value;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved}catch{}})()`;
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body>{children}</body></html>;
}
