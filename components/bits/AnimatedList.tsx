"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** React Bits AnimatedList pattern, one-shot stagger. Static list under
 *  reduced-motion. Items keep their own semantics — this only staggers. */
export default function AnimatedList({
  children,
  className = "alist",
  itemClassName = "alist__item",
}: {
  children: ReactNode[];
  className?: string;
  itemClassName?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <ul className={className}>
        {children.map((child, i) => (
          <li key={i} className={itemClassName}>
            {child}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <motion.ul
      className={className}
      initial="hidden"
      animate="visible"
      transition={{ staggerChildren: 0.05 }}
    >
      {children.map((child, i) => (
        <motion.li
          key={i}
          className={itemClassName}
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: {
              opacity: 1,
              y: 0,
              transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
            },
          }}
        >
          {child}
        </motion.li>
      ))}
    </motion.ul>
  );
}
