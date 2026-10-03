import { parseTerms, TERMS_MARKDOWN } from "./terms";

const blocks = parseTerms(TERMS_MARKDOWN);

/** Renders the Terms of Use as plain elements (no HTML from the source). */
export function TermsView({ className = "" }: { className?: string }) {
  return (
    <div className={`terms ${className}`} tabIndex={0} aria-label="PhDRacket Beta Terms of Use">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "title":
            return <h3 key={i}>{b.text}</h3>;
          case "heading":
            return <h4 key={i}>{b.text}</h4>;
          case "list":
            return (
              <ul key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i} className="pre-line">
                {b.text}
              </p>
            );
        }
      })}
    </div>
  );
}
