"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

/** Animate UI Tabs pattern: sliding indicator via shared layoutId.
 *  One signal only. Buttons keep native semantics + aria-pressed. */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "seg",
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const layoutId = useId();
  return (
    <div className={className} role="group" aria-label={label}>
      {options.map(({ id, label: text }) => {
        const pressed = value === id;
        return (
          <button
            key={id}
            type="button"
            className="seg__btn"
            aria-pressed={pressed}
            onClick={() => onChange(id)}
          >
            {pressed && !reduce && (
              <motion.span
                className="seg__thumb"
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 400, damping: 40 }}
                style={{ left: 0, right: 0 }}
                aria-hidden="true"
              />
            )}
            {pressed && reduce && (
              <span className="seg__thumb" style={{ left: 0, right: 0 }} aria-hidden="true" />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>{text}</span>
          </button>
        );
      })}
    </div>
  );
}
