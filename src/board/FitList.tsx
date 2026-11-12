import { useLayoutEffect, useRef } from "react";

/**
 * A column on a wall cannot scroll. Show every child that fits whole, hide the rest,
 * and report how many were hidden so the column can say so.
 */
export function FitList({
  children,
  onHidden,
  className,
}: {
  children: React.ReactNode;
  onHidden: (count: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;

    const fit = () => {
      const limit = box.getBoundingClientRect().bottom;
      let hidden = 0;
      let full = false;
      for (const child of Array.from(box.children) as HTMLElement[]) {
        child.style.visibility = "";
        if (full || child.getBoundingClientRect().bottom > limit + 0.5) {
          full = true;
          child.style.visibility = "hidden";
          if (child.dataset.item !== undefined) hidden += 1;
        }
      }
      onHidden(hidden);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  });

  return (
    <div
      ref={ref}
      className={`flex min-h-0 flex-1 flex-col gap-[0.5rem] overflow-hidden ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
