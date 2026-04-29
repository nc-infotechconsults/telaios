// ─── TelaiOS Logo ─────────────────────────────────────────────────────────────

export function TelaiOSLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      {/* Warp threads (vertical) */}
      <rect x="7"    y="4" width="3"   height="24" rx="1.5" fill="currentColor" opacity="0.55" />
      <rect x="14.5" y="4" width="3"   height="24" rx="1.5" fill="currentColor" />
      <rect x="22"   y="4" width="3"   height="24" rx="1.5" fill="currentColor" opacity="0.55" />
      {/* Weft threads (horizontal) */}
      <rect x="4" y="7"  width="24" height="3"   rx="1.5"  fill="currentColor" opacity="0.9" />
      <rect x="4" y="14" width="24" height="2.5" rx="1.25" fill="currentColor" opacity="0.45" />
      <rect x="4" y="20" width="24" height="2.5" rx="1.25" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

export default TelaiOSLogo;
