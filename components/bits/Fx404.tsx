"use client";

/** React Bits 404 pair, tokenized: FuzzyText-style SVG turbulence headline.
 *  Static under reduced-motion (filter disabled in bits.css).
 *  Content-page decorative allowance only. Pair with .star-border CTA
 *  (Link with star-border classes at the call site). */
export function FuzzyCode({ code }: { code: string }) {
  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <filter id="hl-fuzzy">
            <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" result="n">
              <animate
                attributeName="baseFrequency"
                values="0.015;0.02;0.015"
                dur="6s"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="6" />
          </filter>
        </defs>
      </svg>
      <h1 className="nf-code fuzzy" aria-label={code}>
        {code}
      </h1>
    </>
  );
}
