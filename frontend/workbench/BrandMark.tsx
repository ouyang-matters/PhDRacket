// The PhDRacket mark: a mortarboard resting on a pair of parentheses, the
// same drawing as the application icon (apps/desktop/icon.svg) without its
// background tile. The board and parentheses take the text color; the
// tassel takes the theme's accent.

export function BrandMark({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={`brand-mark${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="148 150 728 728"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d="M512 196 L864 352 L512 508 L160 352 Z" fill="currentColor" />
      <path d="M512 352 L760 448 L760 600" stroke="var(--c-accent-primary, #f2b134)" strokeWidth={30} />
      <circle cx="760" cy="626" r="34" fill="var(--c-accent-primary, #f2b134)" />
      <path d="M404 470 C 330 560, 330 740, 404 830" stroke="currentColor" strokeWidth={62} />
      <path d="M620 470 C 694 560, 694 740, 620 830" stroke="currentColor" strokeWidth={62} />
    </svg>
  );
}
