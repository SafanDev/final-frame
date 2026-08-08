import type { ReactNode } from "react";
import "../../../styles/workspace.css";

export default function ProjectLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
