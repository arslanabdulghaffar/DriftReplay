import type { CSSProperties, ReactNode } from "react";

export type IconName =
  "overview" | "fixture" | "evidence" | "status" | "arrow" | "file" | "link" | "check";

const paths: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  fixture: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.3l8 4.5" />
    </>
  ),
  evidence: (
    <>
      <path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5M9 12h5M9 16h5" />
    </>
  ),
  status: (
    <>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </>
  ),
  file: (
    <>
      <path d="M7 3h7l5 5v13H5V3h2Z" />
      <path d="M14 3v6h5M9 13h6M9 17h6" />
    </>
  ),
  link: (
    <>
      <path
        d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
        transform="translate(0 -1)"
      />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
};

export function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg aria-hidden="true" width="33" height="33" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="11" fill="currentColor" />
      <path d="M10 11h7a7 7 0 0 1 0 14h-7V11Z" stroke="var(--brand-mark-line)" strokeWidth="2" />
      <path
        d="m17 7 4 4-4 4M10 18h11"
        stroke="var(--brand-mark-line)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
