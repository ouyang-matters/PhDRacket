#!/bin/bash
# PhDRacket quick installer for macOS (Apple Silicon and Intel).
#
# Downloads the newest PhDRacket release from GitHub, verifies its SHA-256
# checksum, copies PhDRacket into Applications and opens it. The first
# launch shows the Beta Terms of Use.
#
#   curl -fsSL https://raw.githubusercontent.com/ouyang-matters/PhDRacket/main/install/install-macos.sh | bash
#
# Set PHDRACKET_DRY_RUN=1 to download and verify without installing.

set -euo pipefail

REPO="ouyang-matters/PhDRacket"
API="https://api.github.com/repos/$REPO/releases?per_page=20"

echo "PhDRacket installer"
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
rm -rf "$target"
ditto "$app" "$target"
# Files downloaded by curl are not quarantined; clear the flag in case it is set.
xattr -dr com.apple.quarantine "$target" 2>/dev/null || true

echo "PhDRacket is installed in $dest."
open "$target"
