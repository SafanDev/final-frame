import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

interface NavItemProps {
  href: string;
  active?: boolean;
  children: ReactNode;
  className?: string;
}

export default function NavItem({ href, active = false, children, className }: NavItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("ff-nav-link", active && "is-active", className)}
    >
      {children}
    </Link>
  );
}
