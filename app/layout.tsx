import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Toaster as RadixToaster } from "@/components/ui/toaster";
import NextTopLoader from "nextjs-toploader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SwiftFlow — Social Media Manager",
  description: "AI-powered social media management platform for Instagram and Facebook. Schedule posts, manage your inbox, build automations, and track analytics — all in one place.",
  keywords: ["social media manager", "Instagram automation", "Facebook automation", "AI content generation", "social media scheduling", "SwiftFlow"],
  authors: [{ name: "SwiftFlow" }],
  creator: "SwiftFlow",
  metadataBase: new URL("https://swiftflow.app"),
  openGraph: {
    title: "SwiftFlow — Social Media Manager",
    description: "AI-powered social media management for Instagram and Facebook. Automate, schedule, and scale your presence.",
    type: "website",
    locale: "en_US",
    siteName: "SwiftFlow",
  },
  twitter: {
    card: "summary_large_image",
    title: "SwiftFlow — Social Media Manager",
    description: "AI-powered social media management for Instagram and Facebook.",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "manifest", url: "/site.webmanifest" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: '#070710', colorScheme: 'dark' }}
        suppressHydrationWarning
      >
        <NextTopLoader
          color="#8b5cf6"
          initialPosition={0.08}
          crawlSpeed={200}
          height={2}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 10px #8b5cf6,0 0 5px #7c3aed"
        />
        {children}
        <Toaster position="top-right" richColors />
        {/* Renders toasts from components using @/components/ui/use-toast
            (automation builder, posts, settings, …) — without this mount
            those toasts are silently dropped. */}
        <RadixToaster />
      </body>
    </html>
  );
}
