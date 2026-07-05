import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/** Shared GSAP enter/exit choreography for the app's backdrop+dialog modals. */
export function useModalAnimation(open) {
  const [isRendered, setIsRendered] = useState(open);
  const backdropRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (open) setIsRendered(true);
  }, [open]);

  useEffect(() => {
    if (!isRendered) return;
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!backdrop || !dialog) return;

    if (open) {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power2.out" });
      gsap.fromTo(
        dialog,
        { opacity: 0, y: 24, scale: 0.965 },
        { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: "power3.out" }
      );
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

  return { isRendered, backdropRef, dialogRef };
}
