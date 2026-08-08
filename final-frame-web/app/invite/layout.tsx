import type { ReactNode } from "react";
import AuthProvider from "@/components/AuthProvider";
import "../../styles/workspace.css";

export default function InviteLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <AuthProvider>{children}</AuthProvider>;
}