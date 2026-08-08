import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import { cn } from "@/lib/utils/cn";

interface BrandLinkProps {
  className?: string;
  compact?: boolean;
}

export default function BrandLink({ className, compact = false }: BrandLinkProps) {
  return (
    <Link
      href="/"
      prefetch={false}
      className={cn("ff-brand-link", compact && "ff-brand-link-compact", className)}
      aria-label="FinalFrame home"
    >
      <span className="ff-brand-mark" aria-hidden="true">
        <BrandMark className="h-5 w-5" />
      </span>
      <span>FinalFrame</span>
    </Link>
  );
}
