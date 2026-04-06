import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wysly — Weekplanner",
  description: "Plan je week, volg je taken en bekijk je voortgang.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=general-sans@300,400,500,600,700&f[]=boska@400i,500i&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
