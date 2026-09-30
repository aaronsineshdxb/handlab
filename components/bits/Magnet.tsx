"use client";

import {
  memo,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useFinePointer } from "../../lib/useFinePointer";

/** React Bits Magnet pattern, tokenized. Pulls the child toward the cursor
 *  with a spring, releases on leave. Plain passthrough on touch /
 *  reduced-motion so the affordance never depends on the effect. */
function Magnet({
  children,
  strength = 0.3,
  className = "magnet",
  style,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const fine = useFinePointer();
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 180, damping: 22 });
  const sy = useSpring(y, { stiffness: 180, damping: 22 });

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  if (!fine || reduce)
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: sx, y: sy, ...style }}
      onMouseMove={(e) => {
        if (rafRef.current) return;
        // getBoundingClientRect is a forced layout read, and this handler runs
        // on every mousemove. Coalesce to one read per frame instead.
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          const el = ref.current;
          if (!el) return;
          const r = el.getBoundingClientRect();
          x.set((e.clientX - (r.left + r.width / 2)) * strength);
          y.set((e.clientY - (r.top + r.height / 2)) * strength);
        });
      }}
      onMouseLeave={() => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

export default memo(Magnet);
