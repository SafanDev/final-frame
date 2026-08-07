import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

interface FieldFrameProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}

export function FieldFrame({ label, htmlFor, hint, error, optional, children, className }: FieldFrameProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-semibold leading-5 text-zinc-100">
          {label}
        </label>
        {optional ? <span className="text-xs leading-5 text-zinc-500">Optional</span> : null}
      </div>
      {children}
      {error ? <p className="text-sm leading-5 text-rose-300" role="alert">{error}</p> : hint ? <p className="text-sm leading-5 text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export const fieldControlClass =
  "min-h-12 w-full rounded-xl border border-white/12 bg-black/30 px-4 text-base text-white shadow-inner shadow-black/20 transition placeholder:text-zinc-600 hover:border-white/20 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-55 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20";

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id?: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  wrapperClassName?: string;
}

export function TextField({ id, label, hint, error, optional, wrapperClassName, className, ...props }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = hint || error ? `${fieldId}-description` : undefined;
  return (
    <FieldFrame label={label} htmlFor={fieldId} hint={error ? undefined : hint} error={error} optional={optional} className={wrapperClassName}>
      <input
        id={fieldId}
        className={cn(fieldControlClass, className)}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={descriptionId}
        {...props}
      />
      {descriptionId ? <span id={descriptionId} className="sr-only">{error ?? hint}</span> : null}
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

export function TextAreaField({ id, label, hint, error, optional, wrapperClassName, className, ...props }: TextAreaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame label={label} htmlFor={fieldId} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      <textarea id={fieldId} className={cn(fieldControlClass, "resize-y py-3 leading-6", className)} aria-invalid={Boolean(error) || undefined} {...props} />
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

export function SelectField({ id, label, hint, error, optional, wrapperClassName, className, children, ...props }: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame label={label} htmlFor={fieldId} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      <select id={fieldId} className={cn(fieldControlClass, "appearance-none pr-10 text-sm font-semibold", className)} aria-invalid={Boolean(error) || undefined} {...props}>
        {children}
      </select>
    </FieldFrame>
  );
}
