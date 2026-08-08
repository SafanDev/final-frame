"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils/cn";

export interface SelectMenuOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface SelectMenuProps<T extends string> {
  value: T;
  options: ReadonlyArray<SelectMenuOption<T>>;
  onChange: (value: T) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
}

export default function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  label,
  hideLabel = false,
  disabled = false,
  className,
  buttonClassName,
  menuClassName,
}: SelectMenuProps<T>) {
  const buttonId = useId();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );

  useEffect(() => {
    if (!open) return;

    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    const frame = window.requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
      window.cancelAnimationFrame(frame);
    };
  }, [activeIndex, open]);

  function move(delta: number) {
    if (!options.length) return;
    let next = activeIndex;
    for (let attempt = 0; attempt < options.length; attempt += 1) {
      next = (next + delta + options.length) % options.length;
      if (!options[next]?.disabled) break;
    }
    setActiveIndex(next);
    optionRefs.current[next]?.focus();
  }

  function choose(nextValue: T) {
    onChange(nextValue);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const first = options.findIndex((option) => !option.disabled);
      if (first >= 0) {
        setActiveIndex(first);
        optionRefs.current[first]?.focus();
      }
    } else if (event.key === "End") {
      event.preventDefault();
      let last = options.length - 1;
      while (last >= 0 && options[last]?.disabled) last -= 1;
      if (last >= 0) {
        setActiveIndex(last);
        optionRefs.current[last]?.focus();
      }
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[index];
      if (option && !option.disabled) choose(option.value);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)} data-pin-ignore="true">
      <label htmlFor={buttonId} className={hideLabel ? "sr-only" : "mb-2 block text-sm font-semibold text-[var(--text)]"}>
        {label}
      </label>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-label={`${label}: ${selected?.label ?? "Select"}`}
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setOpen((current) => !current);
        }}
        onKeyDown={handleButtonKeyDown}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-subtle)] px-3.5 text-left text-sm font-semibold text-[var(--text)] outline-none transition hover:border-[var(--border-emphasis)] hover:bg-[var(--surface)] focus-visible:border-[var(--focus)] focus-visible:ring-2 focus-visible:ring-[color:rgb(165_239_210_/_16%)] disabled:cursor-not-allowed disabled:opacity-50",
          buttonClassName,
        )}
      >
        <span className="min-w-0 truncate">{selected?.label ?? "Select"}</span>
        <span aria-hidden="true" className={`shrink-0 text-[var(--text-subtle)] transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="listbox"
          aria-label={label}
          className={cn(
            "absolute z-[120] mt-2 max-h-72 w-full min-w-[12rem] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-md)]",
            menuClassName,
          )}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              tabIndex={index === activeIndex ? 0 : -1}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option.value)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
                option.value === value
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "text-[var(--text-muted)] hover:bg-white/[0.055] hover:text-[var(--text)]",
                option.disabled && "cursor-not-allowed opacity-45",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{option.label}</span>
                {option.description ? <span className={`mt-0.5 block text-xs ${option.value === value ? "text-[#1f362e]" : "text-[var(--text-subtle)]"}`}>{option.description}</span> : null}
              </span>
              {option.value === value ? <span aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
