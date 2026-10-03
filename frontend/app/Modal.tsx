import { useEffect, type ReactNode } from "react";

/** A dialog with a title bar; Escape and clicking outside close it. */
export function Modal({
  title,
  children,
  onClose,
  dismissable = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** False while the user must make a choice (no close button, Escape or outside click). */
  dismissable?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => dismissable && e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dismissable]);
  return (
    <div className="modal-backdrop" onMouseDown={() => dismissable && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          {dismissable && (
            <button className="icon" aria-label="Close" onClick={onClose}>
              ×
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
