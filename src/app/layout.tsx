import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "react-calendar/dist/Calendar.css";
import "react-date-picker/dist/DatePicker.css";
import "./globals.css";
import NavBar from "./components/NavBar";
import { AppProvider } from "@/lib/app-context";
import CaptureModal from "./components/CaptureModal";
import Fab from "./components/Fab";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Life Tracker",
  description: "Your personal life tracking app",
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
          <div className="app-shell">
            <NavBar />
            <main className="app-main">{children}</main>
          </div>
          <Fab />
          <CaptureModal />
        </AppProvider>
      </body>
    </html>
  );
}
