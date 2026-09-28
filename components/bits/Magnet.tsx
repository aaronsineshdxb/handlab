"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

/** React Bits Magnet pattern, tokenized. Pulls the child toward the cursor
 *  with a spring, releases on leave. Plain passthrough on touch /
 *  reduced-motion so the affordance never depends on the effect. */
export default function Magnet({
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
  const [active, setActive] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 180, damping: 22 });
  const sy = useSpring(y, { stiffness: 180, damping: 22 });

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) setActive(true);
  }, []);

  if (!active) return <div className={className} style={style}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: sx, y: sy, ...style }}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Distance-driven scale for one Dock item (React Bits Dock pattern). */
export function useDockScale(mouseX: ReturnType<typeof useMotionValue<number>>) {
  const ref = useRef<HTMLButtonElement>(null);
  const distance = useTransform(mouseX, (val: number) => {
    const b = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - b.x - b.width / 2;
  });
  const scale = useTransform(distance, [-120, 0, 120], [1, 1.45, 1]);
  const lift = useTransform(distance, [-120, 0, 120], [0, -7, 0]);
  return { ref, scale, lift };
}
