import type { Metadata } from "next";
import { Syne, DM_Sans, DM_Mono } from "next/font/google";
import { QueryProvider } from "@/providers/QueryProvider";
import { AppMantineProvider } from "@/providers/AppMantineProvider";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
});

const dmMono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "Casa Sonia — Compras",
  description: "Sistema de órdenes de compra Casa Sonia",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${syne.variable} ${dmSans.variable} ${dmMono.variable} h-full`}
    >
      <body className="min-h-full" suppressHydrationWarning>
        <AppMantineProvider>
          <QueryProvider>{children}</QueryProvider>
        </AppMantineProvider>
      </body>
    </html>
  );
}
