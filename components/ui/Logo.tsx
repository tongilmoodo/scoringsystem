/** Placeholder brand mark: a gold ring with the crimson TMD monogram. */
export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="Tong-Il Moo-Do">
      <circle cx="24" cy="24" r="21" stroke="#ffd700" strokeWidth="3" />
      <circle cx="24" cy="24" r="14" fill="#e94560" />
      <text x="24" y="29" textAnchor="middle" fontFamily="Oswald, sans-serif" fontWeight="700" fontSize="12" fill="#ffffff">
        TMD
      </text>
    </svg>
  );
}
