import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Spinner from "@/components/ui/Spinner";
import {
  getButtonClassName,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/buttonStyles";

export type { ButtonSize, ButtonVariant } from "@/components/ui/buttonStyles";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  loadingLabel = "Working…",
  leadingIcon,
  trailingIcon,
  children,
  className,
  disabled,
  type = "button",
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={getButtonClassName(variant, size, className)}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" label={loadingLabel} /> : leadingIcon}
      {loading ? loadingLabel : children}
      {!loading ? trailingIcon : null}
    </button>
  );
});

export default Button;
