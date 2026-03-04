import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "JiMeaning - AI短剧视频创作平台",
  description: "AI-powered short video creation platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
