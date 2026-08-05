/** Inline stroke icons — one family, 1.75 stroke, currentColor, decorative by default. */

const PATHS = {
  library: "M12 7c-1.7-1.3-3.8-2-6-2H4v12h2c2.2 0 4.3.7 6 2m0-12c1.7-1.3 3.8-2 6-2h2v12h-2c-2.2 0-4.3.7-6 2m0-12v12",
  study: "M3.5 9.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM8 5.5h10a2 2 0 0 1 2 2v8",
  check: "M5 12.5 9.5 17 19 7",
  cross: "m6.5 6.5 11 11m0-11-11 11",
  up: "M12 19V5m0 0-5.5 5.5M12 5l5.5 5.5",
  down: "M12 5v14m0 0 5.5-5.5M12 19l-5.5-5.5",
  upload: "M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16",
  download: "M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16",
  trash: "M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M6 7l.9 12.1A2 2 0 0 0 8.9 21h6.2a2 2 0 0 0 2-1.9L18 7",
  bulb: "M9.5 18.5h5M10.5 21.5h3M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.7.5 1.1 1.2 1.3 1.9h5.2c.2-.7.6-1.4 1.3-1.9A6.5 6.5 0 0 0 12 2.5Z",
  left: "M19 12H5m0 0 6-6m-6 6 6 6",
  right: "M5 12h14m0 0-6-6m6 6-6 6",
  retry: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 3.5v4h-4",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({
  name,
  size = 20,
  label,
}: {
  name: IconName;
  size?: number;
  /** Set only when the icon is the sole content of a control. */
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
