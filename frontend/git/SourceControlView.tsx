// The Source Control view: branch and sync, a commit box, staged and
// unstaged changes (click for a diff), and recent history.

import { useEffect, useState } from "react";
import type { GitCommit, GitCommitFile, GitFileChange } from "@shared/protocol";
import { backend } from "@frontend/ipc/backend";
import { Modal } from "@frontend/app/Modal";
import { openFolderWithDialog, openPath, useApp } from "@frontend/app/store";
import { Icon } from "@frontend/workbench/icons";
import { baseName, parentOf } from "@frontend/explorer/paths";
import * as G from "./git";
import { showBranchPicker } from "./commands";

const LABEL: Record<string, string> = { M: "Modified", A: "Added", D: "Deleted", R: "Renamed", C: "Copied", U: "Conflict", "?": "Untracked" };

function letterOf(f: GitFileChange, staged: boolean): string {
  if (f.index === "U" || f.worktree === "U") return "U";
  if (f.worktree === "?") return "?";
  return staged ? f.index : f.worktree;
}

function ago(seconds: number): string {
  const d = Date.now() / 1000 - seconds;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} d ago`;
  return new Date(seconds * 1000).toLocaleDateString();
}

function FileRow({ f, staged, onDiscard }: { f: GitFileChange; staged: boolean; onDiscard: (f: GitFileChange) => void }) {
  const letter = letterOf(f, staged);
  const rel = f.path;
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
  return (
    <li className="scm-file" title={`${rel} · ${LABEL[letter] ?? letter}${f.from ? ` (from ${f.from})` : ""}`}>
      <button className="scm-file-main" onClick={() => (letter === "?" || letter === "A" ? void openPath(f.abs) : void G.openChanges(f.abs, staged ? "HEAD" : "HEAD"))}>
        <span className={`scm-name git-${letter === "?" ? "untracked" : letter}`}>{baseName(rel)}</span>
        {dir && <span className="scm-dir">{dir}</span>}
      </button>
      <span className="scm-actions">
        <button className="icon-button" title="Open File" aria-label="Open File" onClick={() => void openPath(f.abs)}>
          <Icon name="openFile" size={13} />
        </button>
        {!staged && (
          <button className="icon-button" title={letter === "?" ? "Delete (to the Recycle Bin)" : "Discard Changes"} aria-label="Discard Changes" onClick={() => onDiscard(f)}>
            <Icon name="discard" size={13} />
          </button>
        )}
        {staged ? (
          <button className="icon-button" title="Unstage" aria-label="Unstage" onClick={() => void G.unstage([f.abs])}>
            <Icon name="minus" size={13} />
          </button>
        ) : (
          <button className="icon-button" title="Stage" aria-label="Stage" onClick={() => void G.stage([f.abs])}>
            <Icon name="plus" size={13} />
          </button>
        )}
      </span>
      <span className={`scm-letter git-${letter === "?" ? "untracked" : letter}`}>{letter === "?" ? "U" : letter}</span>
    </li>
  );
}

function History({ dir, head }: { dir: string; head: string | null }) {
  const [open, setOpen] = useState(false);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [files, setFiles] = useState<GitCommitFile[]>([]);
  useEffect(() => {
    if (!open) return;
    void backend.gitLog(dir, 50).then(setCommits, () => setCommits([]));
  }, [open, dir, head]);
  useEffect(() => {
    if (!expanded) return setFiles([]);
    void backend.gitCommitFiles(dir, expanded).then(setFiles, () => setFiles([]));
  }, [expanded, dir]);
  return (
    <section className="scm-section">
      <button className="scm-section-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`twisty${open ? " open" : ""}`} /> History
      </button>
      {open &&
        (commits.length === 0 ? (
          <p className="tree-note">No commits yet.</p>
        ) : (
          <ul className="scm-list">
            {commits.map((c) => (
              <li key={c.sha} className="scm-commit">
                <button className="scm-commit-main" onClick={() => setExpanded(expanded === c.sha ? null : c.sha)} title={`${c.sha}\n${c.author}, ${new Date(c.time * 1000).toLocaleString()}`}>
                  <Icon name="commit" size={13} />
                  <span className="scm-subject">{c.subject}</span>
                  {c.refs && <span className="scm-refs">{c.refs.replace(/HEAD -> /, "")}</span>}
                  <span className="scm-dir">
                    {c.short} · {ago(c.time)}
                  </span>
                </button>
                {expanded === c.sha && (
                  <ul className="scm-list scm-commit-files">
                    {files.map((f) => (
                      <li key={f.path} className="scm-file">
                        <button className="scm-file-main" onClick={() => void G.openCommitFile(c.sha, c.short, f.abs)}>
                          <span className={`scm-name git-${f.status}`}>{baseName(f.path)}</span>
                          <span className="scm-dir">{parentOf(f.path) === f.path ? "" : parentOf(f.path)}</span>
                        </button>
                        <span className={`scm-letter git-${f.status}`}>{f.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

export function SourceControlView() {
  const folder = useApp((s) => s.folder);
  const enabled = useApp((s) => s.prefs.git);
  const available = G.useGit((s) => s.available);
  const status = G.useGit((s) => s.status);
  const busy = G.useGit((s) => s.busy);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<GitFileChange[] | null>(null);
  const [newBranch, setNewBranch] = useState<string | null>(null);

  useEffect(() => G.refresh(0), [folder, enabled]);

  const head = (body: React.ReactNode) => (
    <div className="scm">
      <div className="explorer-head">
        <span className="explorer-title">Source Control</span>
        {status && (
          <button className="icon-button" title="Refresh" aria-label="Refresh" onClick={() => G.refresh(0)}>
            <Icon name="restart" size={14} />
          </button>
        )}
      </div>
      {body}
    </div>
  );

  if (!enabled) return head(<div className="tree-note">Source control is turned off in Settings &gt; Files.</div>);
  if (!folder)
    return head(
      <div className="tree-note">
        <p>Open a folder to use source control.</p>
        <button onClick={() => void openFolderWithDialog()}>Open Folder…</button>
      </div>,
    );
  if (available === false)
    return head(
      <div className="tree-note">
        <p>Git is not installed. Install it from git-scm.com, then restart PhDRacket.</p>
      </div>,
    );
  if (!status)
    return head(
      <div className="tree-note">
        <p>This folder is not a Git repository. A repository keeps every version you commit, so you can compare and go back.</p>
        <button className="primary" disabled={!!busy} onClick={() => void G.init()}>
          Initialize Repository
        </button>
      </div>,
    );

  const staged = status.files.filter((f) => f.index !== "." && f.index !== "?" && f.index !== "U");
  const unstaged = status.files.filter((f) => f.worktree !== "." || f.index === "U");
  const commitAll = staged.length === 0 && unstaged.length > 0;
  const canCommit = !busy && message.trim() !== "" && (staged.length > 0 || unstaged.length > 0);
  const doCommit = async () => {
    if (!canCommit) return;
    if (await G.commit(message, commitAll)) setMessage("");
  };

  return head(
    <>
      <div className="scm-branch">
        <button className="link" title="Switch branch" onClick={() => showBranchPicker()}>
          <Icon name="git" size={14} /> {status.branch ?? `detached at ${status.head ?? "?"}`}
        </button>
        <span className="toolbar-spacer" />
        {status.upstream && (
          <span className="scm-dir" title={`Compared with ${status.upstream}`}>
            ↑{status.ahead} ↓{status.behind}
          </span>
        )}
        <button className="icon-button" title="Fetch" aria-label="Fetch" disabled={!!busy} onClick={() => void G.sync("fetch")}>
          <Icon name="restart" size={13} />
        </button>
        <button className="icon-button" title="Pull (fast-forward only)" aria-label="Pull" disabled={!!busy} onClick={() => void G.sync("pull")}>
          <Icon name="pull" size={14} />
        </button>
        <button className="icon-button" title="Push" aria-label="Push" disabled={!!busy} onClick={() => void G.sync("push")}>
          <Icon name="push" size={14} />
        </button>
      </div>
      {newBranch !== null && (
        <form
          className="scm-new-branch"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newBranch.trim();
            setNewBranch(null);
            if (name) void G.createBranch(name);
          }}
        >
          <input autoFocus aria-label="New branch name" placeholder="New branch name" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setNewBranch(null)} />
        </form>
      )}
      <div className="scm-commit-box">
        <textarea
          aria-label="Commit message"
          placeholder={`Message (Ctrl+Enter to commit on ${status.branch ?? "HEAD"})`}
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void doCommit();
            }
          }}
        />
        <button className="primary" disabled={!canCommit} onClick={() => void doCommit()} title={commitAll ? "Nothing is staged: commits every change" : "Commits the staged changes"}>
          <Icon name="check" size={14} /> {commitAll ? "Commit All" : "Commit"}
        </button>
        {busy && <span className="muted small">{busy}</span>}
      </div>
      <div className="scm-body">
        {staged.length > 0 && (
          <section className="scm-section">
            <div className="scm-section-head static">
              Staged Changes <span className="scm-count">{staged.length}</span>
              <button className="icon-button" title="Unstage All" aria-label="Unstage All" onClick={() => void G.unstage(staged.map((f) => f.abs))}>
                <Icon name="minus" size={13} />
              </button>
            </div>
            <ul className="scm-list">
              {staged.map((f) => (
                <FileRow key={`s:${f.path}`} f={f} staged onDiscard={() => {}} />
              ))}
            </ul>
          </section>
        )}
        <section className="scm-section">
          <div className="scm-section-head static">
            Changes <span className="scm-count">{unstaged.length}</span>
            {unstaged.length > 0 && (
              <>
                <button className="icon-button" title="Discard All Changes" aria-label="Discard All Changes" onClick={() => setConfirm(unstaged)}>
                  <Icon name="discard" size={13} />
                </button>
                <button className="icon-button" title="Stage All" aria-label="Stage All" onClick={() => void G.stage(unstaged.map((f) => f.abs))}>
                  <Icon name="plus" size={13} />
                </button>
              </>
            )}
          </div>
          {unstaged.length === 0 ? (
            <p className="tree-note">No changes since the last commit.</p>
          ) : (
            <ul className="scm-list">
              {unstaged.map((f) => (
                <FileRow key={`u:${f.path}`} f={f} staged={false} onDiscard={(x) => setConfirm([x])} />
              ))}
            </ul>
          )}
        </section>
        <History dir={folder} head={status.head} />
        <div className="scm-footer">
          <button className="link small" onClick={() => setNewBranch("")}>
            New branch…
          </button>
        </div>
      </div>
      {confirm && <ConfirmDiscard files={confirm} onClose={() => setConfirm(null)} />}
    </>,
  );
}

function ConfirmDiscard({ files, onClose }: { files: GitFileChange[]; onClose: () => void }) {
  const tracked = files.filter((f) => f.worktree !== "?");
  const untracked = files.filter((f) => f.worktree === "?");
  const names = (l: GitFileChange[]) => (l.length <= 3 ? l.map((f) => baseName(f.path)).join(", ") : `${l.length} files`);
  return (
    <Modal title="Discard Changes" onClose={onClose} className="confirm-delete">
      {tracked.length > 0 && (
        <p>
          Discard the changes in <strong>{names(tracked)}</strong>? They go back to their last committed (or staged) version.{" "}
          <strong>This cannot be undone.</strong>
        </p>
      )}
      {untracked.length > 0 && (
        <p>
          <strong>{names(untracked)}</strong> {untracked.length === 1 ? "is" : "are"} not in the repository and will be moved to the Recycle Bin.
        </p>
      )}
      <div className="row end">
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          onClick={async () => {
            onClose();
            if (tracked.length) await G.discard(tracked.map((f) => f.abs));
            if (untracked.length) await G.trashUntracked(untracked.map((f) => f.abs));
          }}
        >
          Discard
        </button>
      </div>
    </Modal>
  );
}
