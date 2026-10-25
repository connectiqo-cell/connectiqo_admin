import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Shared behaviour for the app's backdrop+dialog modals:
 * GSAP enter/exit animation, Esc to close, focus trap + restore, and body scroll lock.
 * Pass `onClose` to enable Esc; omit it (or pass null) while a modal must stay open (e.g. saving).
 */
export function useModalAnimation(open, onClose = null) {
  const [isRendered, setIsRendered] = useState(open);
  const backdropRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (open) setIsRendered(true);
  }, [open]);

  useEffect(() => {
    if (!isRendered) return;
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!backdrop || !dialog) return;
    const reduced = prefersReducedMotion();

    if (open) {
      if (reduced) return;
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power2.out", clearProps: "opacity" });
      gsap.fromTo(
        dialog,
        { opacity: 0, y: 24, scale: 0.965 },
        { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "power3.out", clearProps: "transform,opacity" }
      );
    } else if (reduced) {
      setIsRendered(false);
    } else {
      gsap.to(dialog, { opacity: 0, y: 14, scale: 0.98, duration: 0.2, ease: "power2.in" });
      gsap.to(backdrop, {
        opacity: 0,
        duration: 0.18,
        ease: "power2.in",
        onComplete: () => setIsRendered(false),
      });
    }
  }, [open, isRendered]);

  // Keyboard handling, focus management and scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.contains(document.activeElement)) return;
      const target =
        dialog.querySelector("[autofocus]") ||
        dialog.querySelector(".modal-body " + FOCUSABLE) ||
        dialog.querySelector(FOCUSABLE);
      target?.focus();
    }, 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape" && onCloseRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  return { isRendered, backdropRef, dialogRef };
}
