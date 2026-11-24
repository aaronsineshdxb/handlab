"use client";

import type { SVGProps } from "react";
import type { ShapeName } from "../lib/engine";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

const base = (size: number, props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  ...props,
});

/* ---------- Rail icons ---------- */

export function ShapesIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M10 2.5L16.5 6.25V13.75L10 17.5L3.5 13.75V6.25L10 2.5Z" />
      <path d="M10 10L16.5 6.25" />
      <path d="M10 10L3.5 6.25" />
      <path d="M10 10V17.5" />
    </svg>
  );
}

export function LineToolIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <circle cx="4.5" cy="15.5" r="2" />
      <circle cx="15.5" cy="4.5" r="2" />
      <path d="M6 14L14 6" />
      <path d="M8.5 7.5L10 9" />
      <path d="M11 10L12.5 11.5" />
    </svg>
  );
}

export function CameraIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <rect x="2.5" y="5.5" width="10.5" height="9" rx="2" />
      <path d="M13 8.5L17.5 6.25V13.75L13 11.5" />
    </svg>
  );
}

export function MathSigmaIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M15.5 4.5H5L11.5 10L5 15.5H15.5" />
    </svg>
  );
}

export function LessonsIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M3.5 4.5C5.5 4.5 8 5 10 6.5C12 5 14.5 4.5 16.5 4.5V15C14.5 15 12 15.5 10 17C8 15.5 5.5 15 3.5 15V4.5Z" />
      <path d="M10 6.5V17" />
    </svg>
  );
}

export function SettingsIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <line x1="3.5" y1="6" x2="5.25" y2="6" />
      <line x1="8.75" y1="6" x2="16.5" y2="6" />
      <circle cx="7" cy="6" r="1.75" />
      <line x1="3.5" y1="10" x2="11.25" y2="10" />
      <line x1="14.75" y1="10" x2="16.5" y2="10" />
      <circle cx="13" cy="10" r="1.75" />
      <line x1="3.5" y1="14" x2="6.75" y2="14" />
      <line x1="10.25" y1="14" x2="16.5" y2="14" />
      <circle cx="8.5" cy="14" r="1.75" />
    </svg>
  );
}

export function HelpIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M7.75 7.75A2.25 2.25 0 0 1 12.25 7.75C12.25 9.25 10 9.6 10 11.25" />
      <circle cx="10" cy="14" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function HeadsetIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M3 8.25A2.25 2.25 0 0 1 5.25 6H14.75A2.25 2.25 0 0 1 17 8.25V12.25A2 2 0 0 1 15 14.25H12.5L11.25 12.5A1.5 1.5 0 0 0 8.75 12.5L7.5 14.25H5A2 2 0 0 1 3 12.25V8.25Z" />
      <circle cx="7" cy="10" r="1.25" />
      <circle cx="13" cy="10" r="1.25" />
    </svg>
  );
}

/* ---------- UI utility icons ---------- */

export function SunIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 2.75V4.25M10 15.75V17.25M2.75 10H4.25M15.75 10H17.25M4.9 4.9L6 6M14 14L15.1 15.1M15.1 4.9L14 6M6 14L4.9 15.1" />
    </svg>
  );
}

export function MoonIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M15.5 12.5A6.25 6.25 0 0 1 7.5 4.5A6.5 6.5 0 1 0 15.5 12.5Z" />
    </svg>
  );
}

export function CloseXIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M5.5 5.5L14.5 14.5M14.5 5.5L5.5 14.5" />
    </svg>
  );
}

export function DownloadIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M10 3.5V12.5" />
      <path d="M6.5 9.5L10 13L13.5 9.5" />
      <path d="M4 15.5H16" />
    </svg>
  );
}

export function UploadIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M10 13V4" />
      <path d="M6.5 7L10 3.5L13.5 7" />
      <path d="M4 15.5H16" />
    </svg>
  );
}

export function SaveIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M4.5 3.5H13.5L16.5 6.5V15.5A1 1 0 0 1 15.5 16.5H4.5A1 1 0 0 1 3.5 15.5V4.5A1 1 0 0 1 4.5 3.5Z" />
      <path d="M6.5 3.5V7.5H12.5V3.5" />
      <rect x="6.5" y="11" width="7" height="5.5" />
    </svg>
  );
}

export function FolderOpenIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M3 6A1.5 1.5 0 0 1 4.5 4.5H8L9.5 6.5H15.5A1.5 1.5 0 0 1 17 8V14.5A1.5 1.5 0 0 1 15.5 16H4.5A1.5 1.5 0 0 1 3 14.5V6Z" />
    </svg>
  );
}

export function RotateCwIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M15.5 9.5A5.5 5.5 0 1 1 13.8 5.6" />
      <path d="M15.5 3.5V6.5H12.5" />
    </svg>
  );
}

export function GridIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <rect x="3.5" y="3.5" width="13" height="13" rx="1.5" />
      <path d="M3.5 10H16.5M10 3.5V16.5" />
    </svg>
  );
}

export function CrosshairIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <circle cx="10" cy="10" r="5" />
      <path d="M10 2.5V5M10 15V17.5M2.5 10H5M15 10H17.5" />
    </svg>
  );
}

export function CheckIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M4.5 10.5L8.25 14L15.5 6" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 14, ...props }: IconProps) {
  return (
    <svg {...base(size, props)}>
      <path d="M15.5 10H4.5" />
      <path d="M8.5 6L4.5 10L8.5 14" />
    </svg>
  );
}

/* ---------- 15 geometric solid wireframe glyphs ---------- */

export function ShapeGlyph({
  shape,
  size = 16,
  ...props
}: IconProps & { shape: ShapeName }) {
  switch (shape) {
    case "cube":
      return (
        <svg {...base(size, props)}>
          <path d="M10 2.75L16.25 6.25V13.75L10 17.25L3.75 13.75V6.25L10 2.75Z" />
          <path d="M10 10L16.25 6.25M10 10L3.75 6.25M10 10V17.25" />
        </svg>
      );
    case "prism":
      return (
        <svg {...base(size, props)}>
          <path d="M3 7.5L10 4L17 7.5V12.5L10 16L3 12.5V7.5Z" />
          <path d="M10 11L17 7.5M10 11L3 7.5M10 11V16" />
        </svg>
      );
    case "sphere":
      return (
        <svg {...base(size, props)}>
          <circle cx="10" cy="10" r="6.75" />
          <ellipse cx="10" cy="10" rx="6.75" ry="2.6" />
          <ellipse cx="10" cy="10" rx="2.8" ry="6.75" />
        </svg>
      );
    case "cylinder":
      return (
        <svg {...base(size, props)}>
          <ellipse cx="10" cy="5.5" rx="5.5" ry="2.25" />
          <path d="M4.5 5.5V14.5C4.5 15.74 6.96 16.75 10 16.75C13.04 16.75 15.5 15.74 15.5 14.5V5.5" />
        </svg>
      );
    case "cone":
      return (
        <svg {...base(size, props)}>
          <ellipse cx="10" cy="14.75" rx="5.75" ry="2.25" />
          <path d="M4.25 14.75L10 3.25L15.75 14.75" />
        </svg>
      );
    case "pyramid":
      return (
        <svg {...base(size, props)}>
          <path d="M10 3L16.5 13.5L10 16.75L3.5 13.5L10 3Z" />
          <path d="M10 3V16.75" />
        </svg>
      );
    case "torus":
      return (
        <svg {...base(size, props)}>
          <ellipse cx="10" cy="10" rx="7" ry="4.75" />
          <ellipse cx="10" cy="10" rx="3" ry="1.6" />
        </svg>
      );
    case "dome":
      return (
        <svg {...base(size, props)}>
          <path d="M3.25 13.5A6.75 6.75 0 0 1 16.75 13.5" />
          <ellipse cx="10" cy="13.5" rx="6.75" ry="2.25" />
          <path d="M10 6.75C8.2 8.5 7.4 10.8 7.4 13.5M10 6.75C11.8 8.5 12.6 10.8 12.6 13.5" />
        </svg>
      );
    case "hexPrism":
      return (
        <svg {...base(size, props)}>
          <polygon points="10,2.75 15.25,4.75 15.25,7.25 10,9.25 4.75,7.25 4.75,4.75" />
          <path d="M4.75 7.25V14L10 16.75L15.25 14V7.25" />
          <path d="M10 9.25V16.75" />
        </svg>
      );
    case "triPrism":
      return (
        <svg {...base(size, props)}>
          <polygon points="7,4 12.5,13 2.75,13" />
          <path d="M7 4L13.5 5.5L17.25 13L12.5 13" />
          <path d="M13.5 5.5L12.5 13" />
        </svg>
      );
    case "capsule":
      return (
        <svg {...base(size, props)}>
          <rect x="6" y="2.75" width="8" height="14.5" rx="4" />
          <path d="M6 7.25H14M6 12.75H14" />
        </svg>
      );
    case "icosa":
      return (
        <svg {...base(size, props)}>
          <polygon points="10,2.5 16.25,6.25 16.25,13.75 10,17.5 3.75,13.75 3.75,6.25" />
          <polygon points="10,6.25 14.5,12.5 5.5,12.5" />
          <path d="M10 2.5V6.25M16.25 6.25L14.5 12.5M3.75 6.25L5.5 12.5M10 17.5L14.5 12.5M10 17.5L5.5 12.5" />
        </svg>
      );
    case "tetra":
      return (
        <svg {...base(size, props)}>
          <path d="M10 3L16.5 14.75H3.5L10 3Z" />
          <path d="M10 3L11.5 11.75L16.5 14.75M11.5 11.75L3.5 14.75" />
        </svg>
      );
    case "octa":
      return (
        <svg {...base(size, props)}>
          <path d="M10 2.5L16.25 10L10 17.5L3.75 10L10 2.5Z" />
          <path d="M3.75 10L10 12.25L16.25 10" />
          <path d="M10 2.5V17.5" />
        </svg>
      );
    case "knot":
      return (
        <svg {...base(size, props)}>
          <path d="M6.5 14.25C3.75 14.25 3.25 10 6.5 8.25C9.75 6.5 13.5 11.75 13.5 14.25C16.25 14.25 16.75 10 13.5 8.25C10.25 6.5 6.5 11.75 6.5 14.25Z" />
          <path d="M10 3.25C12.5 3.25 13.5 6.25 10 8.5C6.5 6.25 7.5 3.25 10 3.25Z" />
        </svg>
      );
  }
}

export const SHAPE_LABELS: Record<ShapeName, string> = {
  cube: "Cube",
  prism: "Rect prism",
  sphere: "Sphere",
  cylinder: "Cylinder",
  cone: "Cone",
  pyramid: "Pyramid",
  torus: "Torus",
  dome: "Geo dome",
  hexPrism: "Hex prism",
  triPrism: "Tri prism",
  capsule: "Capsule",
  icosa: "Icosahedron",
  tetra: "Tetrahedron",
  octa: "Octahedron",
  knot: "Torus knot",
};
