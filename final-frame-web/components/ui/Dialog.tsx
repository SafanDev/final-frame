"use client";

import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";

const subscribeToClientEnvironment = () => () => undefined;

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
  maxWidthClassName?: string;
}

export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy = false,
  role = "dialog",
  initialFocusRef,
  returnFocusRef,
  closeLabel = "Close dialog",
  maxWidthClassName = "max-w-lg",
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  const mounted = useSyncExternalStore(
    subscribeToClientEnvironment,
    () => true,
    () => false,
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);


  useEffect(() => {
    if (!open) return;

    const returnFocusTarget = returnFocusRef?.current ?? null;
    const activeElement = document.activeElement;

    previousFocusRef.current =
      returnFocusTarget ??
      (
        activeElement instanceof HTMLElement &&
        activeElement !== document.body
          ? activeElement
          : null
      );

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTarget =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(focusableSelector) ??
      panelRef.current;

    focusTarget?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);

      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const previousFocus = previousFocusRef.current;

      previousFocusRef.current = null;

      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) {
          previousFocus.focus({ preventScroll: true });
        }
      });
    };
  }, [initialFocusRef, open, returnFocusRef]);

  if (!mounted || !open) return null;

  function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !busy) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center overflow-y-auto bg-black/78 px-3 pb-3 pt-10 backdrop-blur-md sm:items-center sm:px-4 sm:py-8"
      onMouseDown={handleBackdropMouseDown}
      data-dialog-root="true"
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={`relative max-h-[calc(100dvh-1.5rem)] w-full ${maxWidthClassName} overflow-hidden rounded-2xl border border-white/14 bg-[rgba(12,13,15,0.98)] shadow-[0_36px_120px_rgba(0,0,0,0.72)] sm:max-h-[calc(100dvh-4rem)]`}
      >
        <div className="h-px bg-emerald-300/70" aria-hidden="true" />
        <div className="flex items-start justify-between gap-6 border-b border-white/10 px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-bold tracking-[-0.025em] text-white sm:text-2xl">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-2 max-w-prose text-sm leading-6 text-zinc-400">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={busy}
            aria-label={closeLabel}
            className="-mr-1 -mt-1 text-xl text-zinc-400"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>
        <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">{children}</div>
        {footer ? (
          <div className="ff-safe-bottom flex flex-col-reverse gap-3 border-t border-white/10 bg-white/[0.025] px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
