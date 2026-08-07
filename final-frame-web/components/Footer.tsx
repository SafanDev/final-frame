"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLink from "@/components/navigation/BrandLink";
import { isProductRoute } from "@/lib/utils/productRoutes";

const trustLinks = [
  ["Security", "/security"],
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Support", "/support"],
] as const;

export default function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/project/") || isProductRoute(pathname)) return null;

  return (
    <footer className="ff-site-footer">
      <div className="ff-container ff-footer-inner">
        <div className="ff-footer-brand">
          <BrandLink compact />
          <p>Focused review. Accountable approval.</p>
        </div>
        <nav aria-label="Trust and support" className="ff-footer-links">
          {trustLinks.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
