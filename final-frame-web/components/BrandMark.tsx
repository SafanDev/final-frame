import type { SVGProps } from "react";

export default function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="FinalFrame"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="32" height="32" rx="6" fill="currentColor" />
      <path
        d="M9 9.5A1.5 1.5 0 0 1 10.5 8h11A1.5 1.5 0 0 1 23 9.5v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 9 13.5v-4Z"
        fill="#050505"
      />
      <path
        d="M9 18.5a1.5 1.5 0 0 1 1.5-1.5h6a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 9 22.5v-4Z"
        fill="#050505"
      />
    </svg>
  );
}
