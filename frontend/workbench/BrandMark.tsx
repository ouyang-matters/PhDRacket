// The PhDRacket mark: a "P" built from parentheses (a tall "(" for the stem,
// a ")" for the bowl) with a λ as its leg. The same geometry is used by the
// application icon (apps/desktop/icon.svg) and the splash screen
// (apps/desktop/index.html).

export const MARK_PATHS = {
  stem: "M27 8 C 15 20, 15 44, 27 56",
  bowl: "M31 9 C 47 13, 47 33, 31 37",
  lambdaLong: "M36 33 L 50 56",
  lambdaShort: "M43 44.5 L 35 56",
};

export function BrandMark({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={`brand-mark${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={MARK_PATHS.stem} stroke="currentColor" strokeWidth={6} />
      <path d={MARK_PATHS.bowl} stroke="currentColor" strokeWidth={6} />
      <path d={MARK_PATHS.lambdaLong} stroke="var(--c-accent-primary, #5b9bf0)" strokeWidth={6} />
      <path d={MARK_PATHS.lambdaShort} stroke="var(--c-accent-primary, #5b9bf0)" strokeWidth={6} />
    </svg>
  );
}
