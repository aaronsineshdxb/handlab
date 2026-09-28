"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useReducedMotion } from "motion/react";
import { useDockScale } from "./Magnet";

export interface DockItem {
  id: string;
  label: string;
  title?: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  active?: boolean;
  expanded?: boolean;
  controls?: string;
}

/** React Bits Dock pattern for the lab control bar. Icon magnification is
 *  driven by cursor distance; touch + reduced-motion get a static bar.
 *  Labels stay single-line; the bar reflows to a grid under 720 px. */
export default function Dock({ items, label }: { items: DockItem[]; label: string }) {
  const mouseX = useMotionValue(Infinity);
  const reduce = useReducedMotion();
  const [fine, setFine] = useState(false);
  useEffect(() => {
    setFine(window.matchMedia("(pointer: fine)").matches);
  }, []);
  const magnify = fine && !reduce;
  return (
    <motion.nav
      className="dock"
      aria-label={label}
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
    >
      {items.map((item) => (
        <DockButton key={item.id} item={item} mouseX={mouseX} magnify={magnify} />
      ))}
    </motion.nav>
  );
}

function DockButton({
  item,
  mouseX,
  magnify,
}: {
  item: DockItem;
  mouseX: ReturnType<typeof useMotionValue<number>>;
  magnify: boolean;
}) {
  const { ref, scale, lift } = useDockScale(mouseX);
  return (
    <motion.button
      ref={ref}
      type="button"
      className={
        "dock__item" + (item.primary ? " dock__item--primary" : " dock__item--ghost")
      }
      style={magnify ? { scale, y: lift } : undefined}
      onClick={item.onClick}
      disabled={item.disabled}
      title={item.title ?? item.label}
      aria-label={item.label}
      aria-expanded={item.expanded}
      aria-controls={item.controls}
      whileTap={magnify ? { scale: 0.94 } : undefined}
    >
      {item.label}
      {item.active && <span className="dock__dot" aria-hidden="true" />}
    </motion.button>
  );
}
