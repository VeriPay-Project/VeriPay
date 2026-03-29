import React from "react"
import Script from "next/script"
import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Source_Code_Pro } from "next/font/google";
import "./globals.css";
import AppShell from "./ui/AppShell";
import { AuthProvider } from "./context/AuthContext";
import RequireAuth from "./ui/RequireAuth";
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import CursorSpotlight from "@/components/ui/cursor-spotlight"

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VeriPay — AI Invoice Verification",
  description:
    "Track verifications, anomaly scores, and issuer trust signals across your finance workflow.",
}

export const viewport: Viewport = {
  themeColor: "#1f5e5b",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${sourceCodePro.variable}`}>
        <Script
          src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
          strategy="afterInteractive"
        />
        <ThemeProvider attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange>
          <AuthProvider>
            <AppShell>
              <RequireAuth>{children}</RequireAuth>
            </AppShell>
          </AuthProvider>
        </ThemeProvider>
        <Toaster />
        <CursorSpotlight />
      </body>
    </html>
  );
}
