"use client";

import { motion, useReducedMotion } from "motion/react";

/** React Bits BlurText pattern, one-shot. Words fade + unblur on first
 *  view; static text when reduced-motion is requested. */
export default function BlurText({
  text,
  className = "blur-text",
  delay = 0,
  as: Tag = "span",
}: {
  text: string;
  className?: string;
  delay?: number;
  as?: "span" | "h1" | "h2" | "p";
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  const MotionTag = motion[Tag] as typeof motion.span;
  if (reduce) return <Tag className={className}>{text}</Tag>;
  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      transition={{ staggerChildren: 0.06, delayChildren: delay }}
      aria-label={text}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="blur-text__word"
          aria-hidden="true"
          variants={{
            hidden: { opacity: 0, filter: "blur(8px)", y: 6 },
            visible: {
              opacity: 1,
              filter: "blur(0px)",
              y: 0,
              transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
            },
          }}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </MotionTag>
  );
}
