import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perspective — time is a map",
  description:
    "Explore history the way you explore a map. Pan and zoom through time, and discover how close events really are.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
