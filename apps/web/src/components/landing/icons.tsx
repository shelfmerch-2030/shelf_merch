export function ArrowIcon({ width = 18, height = 18 }: { width?: number; height?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M14 7l5 5-5 5" />
    </svg>
  );
}
