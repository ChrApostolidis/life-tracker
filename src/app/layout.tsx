import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "react-calendar/dist/Calendar.css";
import "react-date-picker/dist/DatePicker.css";
import "./globals.css";
import AppShell from "./components/AppShell";
import { AppProvider } from "@/lib/app-context";
import CaptureModal from "./components/CaptureModal";
import Fab from "./components/Fab";

// Self-hosted so Docker builds never depend on Google Fonts being reachable.
// Variable font covers Latin + Greek and every weight the app uses.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Life Tracker",
  description: "Your personal life tracking app",
};


export const viewport: Viewport = {
  themeColor: "#0e0f12",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
          <Fab />
          <CaptureModal />
        </AppProvider>
      </body>
    </html>
  );
}
