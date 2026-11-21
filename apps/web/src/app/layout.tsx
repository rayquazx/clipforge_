import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { MswProvider } from "@/components/providers/MswProvider";

export const metadata: Metadata = {
  title: "ClipForge — AI Stream & Video Highlight Clipper",
  description:
    "Automatically generate viral clips from Twitch, YouTube and Kick streams with emotion analysis, speech-to-text, and browser editing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased bg-background text-text-primary font-sans">
        <QueryProvider>
          <MswProvider>
            <ToastProvider>{children}</ToastProvider>
          </MswProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
