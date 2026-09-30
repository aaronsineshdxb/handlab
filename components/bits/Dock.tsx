"use client";

import { memo } from "react";

import { motion, useReducedMotion } from "motion/react";

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

/** Static control bar for the lab. Buttons never grow on hover — the bar
 *  keeps one entrance fade plus a press tick. Labels stay single-line;
 *  the bar reflows to a grid under 720 px. */
function Dock({ items, label }: { items: DockItem[]; label: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.nav
      className="dock"
      aria-label={label}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
    >
      {items.map((item) => (
        <motion.button
          key={item.id}
          type="button"
          className={
            "dock__item" + (item.primary ? " dock__item--primary" : " dock__item--ghost")
          }
          onClick={item.onClick}
          disabled={item.disabled}
          title={item.title ?? item.label}
          aria-label={item.label}
          aria-expanded={item.expanded}
          aria-controls={item.controls}
          whileTap={reduce ? undefined : { scale: 0.96 }}
        >
          {item.label}
          {item.active && <span className="dock__dot" aria-hidden="true" />}
        </motion.button>
      ))}
    </motion.nav>
  );
}

export default memo(Dock);
