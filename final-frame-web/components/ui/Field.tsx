import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils/cn";

interface FieldFrameProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  descriptionId?: string;
  children: ReactNode;
  className?: string;
}

export function FieldFrame({
  label,
  htmlFor,
  hint,
  error,
  optional,
  descriptionId,
  children,
  className,
}: FieldFrameProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-semibold leading-5 text-[var(--text)]">
          {label}
        </label>
        {optional ? (
          <span className="text-xs leading-5 text-[var(--text-subtle)]">Optional</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={descriptionId} className="text-sm leading-5 text-rose-300" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={descriptionId} className="text-sm leading-5 text-[var(--text-subtle)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const fieldControlClass =
  "min-h-12 w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-subtle)] px-4 text-base text-[var(--text)] shadow-[0_1px_0_rgba(255,255,255,0.025)_inset] transition-[border-color,background-color,box-shadow] placeholder:text-[var(--text-disabled)] hover:border-[var(--border-emphasis)] focus:border-[var(--focus)] focus:bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id?: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  wrapperClassName?: string;
}

export function TextField({
  id,
  label,
  hint,
  error,
  optional,
  wrapperClassName,
  className,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = hint || error ? `${fieldId}-description` : undefined;

  return (
    <FieldFrame
      label={label}
      htmlFor={fieldId}
      hint={error ? undefined : hint}
      error={error}
      optional={optional}
      descriptionId={descriptionId}
      className={wrapperClassName}
    >
      <input
        id={fieldId}
        className={cn(fieldControlClass, className)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={descriptionId}
        {...props}
      />
    </FieldFrame>
  );
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id?: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  wrapperClassName?: string;
}

export function TextAreaField({
  id,
  label,
  hint,
  error,
  optional,
  wrapperClassName,
  className,
  ...props
}: TextAreaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = hint || error ? `${fieldId}-description` : undefined;

  return (
    <FieldFrame
      label={label}
      htmlFor={fieldId}
      hint={error ? undefined : hint}
      error={error}
      optional={optional}
      descriptionId={descriptionId}
      className={wrapperClassName}
    >
      <textarea
        id={fieldId}
        className={cn(fieldControlClass, "resize-y py-3 leading-6", className)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={descriptionId}
        {...props}
      />
    </FieldFrame>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id?: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  wrapperClassName?: string;
}

export function SelectField({
  id,
  label,
  hint,
  error,
  optional,
  wrapperClassName,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = hint || error ? `${fieldId}-description` : undefined;

  return (
    <FieldFrame
      label={label}
      htmlFor={fieldId}
      hint={error ? undefined : hint}
      error={error}
      optional={optional}
      descriptionId={descriptionId}
      className={wrapperClassName}
    >
      <select
        id={fieldId}
        className={cn(fieldControlClass, "appearance-none pr-10 text-sm font-semibold", className)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={descriptionId}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}
