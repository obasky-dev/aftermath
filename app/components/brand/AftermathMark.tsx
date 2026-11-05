export function AftermathMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 14"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 8h22"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="6" cy="8" r="2.2" fill="currentColor" />
      <circle cx="12" cy="8" r="2.2" fill="currentColor" />
      <circle cx="18.5" cy="4" r="2.2" fill="currentColor" />
    </svg>
  );
}
