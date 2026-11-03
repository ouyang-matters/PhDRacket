#!/bin/bash
# PhDRacket quick installer for macOS (Apple Silicon and Intel).
#
# Shows the Beta Terms of Use and asks you to accept them, then downloads the
# newest PhDRacket release from GitHub, verifies its SHA-256 checksum, copies
# PhDRacket into Applications and opens it. Accepting here is remembered, so
# the first launch's Setup has the Terms already ticked.
#
#   curl -fsSL https://raw.githubusercontent.com/ouyang-matters/PhDRacket/main/install/install-macos.sh | bash
#
# Set PHDRACKET_DRY_RUN=1 to download and verify without installing, and
# PHDRACKET_ACCEPT_TERMS=1 to accept the Terms without being asked (for
# scripted installs). Without a terminal to ask in, the app asks instead.

set -euo pipefail

REPO="ouyang-matters/PhDRacket"
API="https://api.github.com/repos/$REPO/releases?per_page=20"
TERMS_URL="https://raw.githubusercontent.com/$REPO/main/apps/desktop/src-tauri/TERMS.txt"
SETTINGS="$HOME/Library/Application Support/io.github.ouyang-matters.phdracket/settings.json"

echo "PhDRacket installer"

# --- Beta Terms of Use -------------------------------------------------------
# The script itself arrives on standard input (curl ... | bash), so questions
# are read from the terminal, /dev/tty.

terms_version=""
if [ "${PHDRACKET_ACCEPT_TERMS:-}" = "1" ] || (exec </dev/tty) 2>/dev/null; then
  terms=$(curl -fsSL "$TERMS_URL") || { echo "Could not download the Beta Terms of Use. Nothing was installed." >&2; exit 1; }
  version=$(printf '%s\n' "$terms" | sed -n 's/^Last Updated: *//p' | head -n 1 | sed 's/[[:space:]]*$//')
  if [ "${PHDRACKET_ACCEPT_TERMS:-}" = "1" ]; then
    echo "Accepting the PhDRacket Beta Terms of Use ($version), as PHDRACKET_ACCEPT_TERMS=1 asks."
  else
    echo
    echo "PhDRacket is beta software. Installing and using it requires accepting"
    echo "the PhDRacket Beta Terms of Use (Last Updated: $version)."
    printf 'Press Return to read them'
    if [ -t 1 ] && command -v less >/dev/null 2>&1; then
      printf ' (Space: next page, q: done reading)'
    fi
    printf '... '
    read -r _ </dev/tty || true
    if [ -t 1 ] && command -v less >/dev/null 2>&1; then
      printf '%s\n' "$terms" | less -P "PhDRacket Beta Terms of Use - Space for the next page, b to go back, q when done"
    else
      printf '%s\n\n' "$terms"
    fi
    echo "Full text: https://github.com/$REPO/blob/main/docs/TERMS.md"
    printf 'Do you agree to the PhDRacket Beta Terms of Use? Type "yes" to agree: '
    answer=""
    read -r answer </dev/tty || true
    case "$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')" in
      yes | y) echo "Thank you. Continuing with the installation." ;;
      *)
        echo "You did not agree to the Beta Terms of Use. Nothing was installed." >&2
        exit 1
        ;;
    esac
  fi
  terms_version=$version
else
  echo "No terminal to ask in: PhDRacket will show the Beta Terms of Use when it opens."
fi

# Records the acceptance in PhDRacket's settings (its Setup then has the Terms
# ticked). An unreadable settings file is left alone; Setup asks instead.
record_terms() {
  [ -n "$terms_version" ] && command -v osascript >/dev/null 2>&1 || return 0
  local js=""
  IFS= read -r -d '' js <<'JS' || true
ObjC.import("Foundation");
function run(argv) {
  const [path, version] = argv;
  const text = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  let data = {};
  if (!text.isNil()) {
    try { data = JSON.parse(text.js); } catch (e) { return "unreadable"; }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "unreadable";
  if (typeof data.ui !== "object" || data.ui === null || Array.isArray(data.ui)) data.ui = {};
  data.ui.termsAccepted = version;
  $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
    $(path).stringByDeletingLastPathComponent, true, null, null);
  $(JSON.stringify(data, null, 2)).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
  return "ok";
}
JS
  osascript -l JavaScript -e "$js" "$SETTINGS" "$terms_version" >/dev/null 2>&1 || true
}

# --- Download ----------------------------------------------------------------

echo "Looking for the latest release..."
releases=$(curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: PhDRacket-installer" "$API")

# Pick the newest published release and its universal disk image. JavaScript
# for Automation is available on every Mac; python3 is used elsewhere (tests).
pick='
function pick(text) {
  for (const r of JSON.parse(text)) {
    if (r.draft) continue;
    for (const a of r.assets || []) {
      if (a.name.endsWith("_universal.dmg")) return [a.browser_download_url, a.digest || "-", a.name].join(" ");
    }
  }
  return "";
}'
if command -v osascript >/dev/null 2>&1; then
  choice=$(RELEASES="$releases" osascript -l JavaScript -e "$pick
function run() {
  ObjC.import(\"Foundation\");
  return pick($.NSProcessInfo.processInfo.environment.objectForKey(\"RELEASES\").js);
}")
else
  choice=$(printf '%s' "$releases" | python3 -c '
import json, sys
for r in json.load(sys.stdin):
    if r.get("draft"): continue
    for a in r.get("assets", []):
        if a["name"].endswith("_universal.dmg"):
            print(a["browser_download_url"], a.get("digest") or "-", a["name"]); sys.exit(0)
')
fi
read -r url digest name <<< "$choice"
if [ -z "${url:-}" ]; then
  echo "No PhDRacket release with a macOS disk image was found." >&2
  exit 1
fi

work=$(mktemp -d)
trap 'hdiutil detach "$work/mnt" -quiet >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
dmg="$work/$name"
echo "Downloading $name..."
curl -fL --progress-bar -o "$dmg" "$url"

if [[ "$digest" == sha256:* ]]; then
  if command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$dmg" | awk '{print $1}')
  else
    actual=$(sha256sum "$dmg" | awk '{print $1}')
  fi
  if [ "$actual" != "${digest#sha256:}" ]; then
    echo "The download does not match the checksum published by GitHub. Nothing was installed." >&2
    exit 1
  fi
  echo "Checksum verified."
fi

if [ "${PHDRACKET_DRY_RUN:-}" = "1" ]; then
  echo "Dry run: $name was downloaded and verified, and was not installed."
  exit 0
fi

echo "Installing..."
mkdir -p "$work/mnt"
hdiutil attach -nobrowse -readonly -quiet -mountpoint "$work/mnt" "$dmg"
app=$(find "$work/mnt" -maxdepth 1 -name "*.app" -print -quit)
if [ -z "$app" ]; then
  echo "The disk image does not contain the PhDRacket app." >&2
  exit 1
fi

dest="/Applications"
if [ ! -w "$dest" ]; then
  dest="$HOME/Applications"
  mkdir -p "$dest"
fi
target="$dest/$(basename "$app")"
if pgrep -x phdracket >/dev/null 2>&1; then
  echo "Please quit PhDRacket and run this command again." >&2
  exit 1
fi
record_terms
rm -rf "$target"
ditto "$app" "$target"
# Files downloaded by curl are not quarantined; clear the flag in case it is set.
xattr -dr com.apple.quarantine "$target" 2>/dev/null || true

echo "PhDRacket is installed in $dest."
open "$target"
