// Properties of a file or folder in the Explorer.

import { useEffect, useState } from "react";
import type { FileProperties, FolderStats } from "@shared/protocol";
import { backend } from "@frontend/ipc/backend";
import { Modal } from "@frontend/app/Modal";
import { detectLanguage } from "@frontend/workspace/language";
import { extensionOf, formatSize, relativeTo } from "./paths";
import { setExplorer } from "./state";
import { formatTime } from "./Explorer";

const SOURCE = /\.(rkt|rktl|scm|ss)$/i;

const TYPES: Record<string, string> = {
  rkt: "Racket source",
  rktl: "Racket source (load file)",
  scm: "Scheme source",
  ss: "Scheme source",
  rktd: "Racket data",
  zo: "Compiled Racket code",
  dep: "Racket compilation dependencies",
  txt: "Text",
  md: "Markdown",
  pdf: "PDF document",
  png: "PNG image",
  jpg: "JPEG image",
  jpeg: "JPEG image",
  gif: "GIF image",
  svg: "SVG image",
  zip: "ZIP archive",
  html: "HTML page",
  json: "JSON data",
  csv: "CSV table",
};

function typeOf(p: FileProperties): string {
  if (p.isDir) return "Folder";
  const ext = extensionOf(p.name);
  return TYPES[ext] ?? (ext ? `${ext.toUpperCase()} file` : "File");
}

/** The teaching language or #lang, as the status bar names it. */
function languageOf(p: FileProperties): string | null {
  if (p.head === null || !SOURCE.test(p.name)) return null;
  return detectLanguage(p.head.replace(/\r/g, "")).name;
}

export function PropertiesDialog({ root, path }: { root: string; path: string }) {
  const [props, setProps] = useState<FileProperties | null>(null);
  const [stats, setStats] = useState<FolderStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => setExplorer({ properties: null });

  useEffect(() => {
    let live = true;
    setProps(null);
    setStats(null);
    backend
      .fsProperties(root, path)
      .then((p) => {
        if (!live) return;
        setProps(p);
        if (p.isDir) void backend.fsFolderStats(root, path).then((s) => live && setStats(s), () => {});
      })
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [root, path]);

  const rows: [string, string][] = props
    ? [
        ["Type", typeOf(props)],
        ...(languageOf(props) ? ([["Language", languageOf(props)!]] as [string, string][]) : []),
        ["Location", props.path],
        ["Relative path", relativeTo(props.path, root) || "(the open folder)"],
        props.isDir
          ? ["Contains", stats ? `${stats.files.toLocaleString()} files, ${stats.folders.toLocaleString()} folders${stats.truncated ? " (stopped counting)" : ""}` : "Counting…"]
          : ["Size", `${formatSize(props.size)} (${props.size.toLocaleString()} bytes)`],
        ...(props.isDir && stats ? ([["Size", `${formatSize(stats.size)} (${stats.size.toLocaleString()} bytes)`]] as [string, string][]) : []),
        ...(props.lines !== null ? ([["Lines", props.lines.toLocaleString()]] as [string, string][]) : []),
        ["Created", formatTime(props.created)],
        ["Modified", formatTime(props.modified)],
        ["Read-only", props.readonly ? "Yes" : "No"],
      ]
    : [];

  return (
    <Modal title={props ? `${props.name} Properties` : "Properties"} onClose={close} className="properties-modal">
      {error && <p className="status-warn">{error}</p>}
      {!props && !error && <p className="muted">Reading…</p>}
      {props && (
        <dl className="properties">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="row end">
        <button className="primary" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}
