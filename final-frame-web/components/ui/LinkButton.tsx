import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  getButtonClassName,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/buttonStyles";

interface LinkButtonProps extends LinkProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function LinkButton({
  children,
  variant = "secondary",
  size = "md",
  className,
  ...props
}: LinkButtonProps) {
  return (
    <Link className={getButtonClassName(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
