#!/usr/bin/env bash
# setup_studio.sh — create a motion studio folder and install what it needs (macOS / Linux).
#   bash setup_studio.sh ~/motion-studio [--yes]
# Downloads (asked before, unless --yes): npm packages playwright 1.63.0, three 0.186.1, three-mesh-bvh 0.9.15, pngjs 5 (~60 MB),
# Chromium for Playwright (~150 MB), Python wheels numpy, scipy, soundfile, pillow, opencv-python-headless (~110 MB). ffmpeg is NOT installed here.
set -euo pipefail
STUDIO="${1:?usage: setup_studio.sh <studio-folder> [--yes]}"; YES="${2:-}"
need() { command -v "$1" >/dev/null 2>&1 || { echo "MISSING: $1 -> $2"; return 1; }; }
ok=1
need node "install Node.js 20+ (brew install node / nvm)" || ok=0
need python3 "install Python 3.10+" || ok=0
FF=1; need ffmpeg "install ffmpeg (brew install ffmpeg / apt install ffmpeg)" || FF=0
[ "$ok" = 1 ] || exit 1
echo "Studio folder: $STUDIO"
echo "Will download: npm packages (~60 MB), Chromium for Playwright (~150 MB), Python packages (~60 MB)."
if [ "$YES" != "--yes" ]; then read -r -p "Continue? (y/n) " a; [ "$a" = "y" ] || { echo "Nothing installed."; exit 0; }; fi
mkdir -p "$STUDIO/films"; cd "$STUDIO"
[ -f package.json ] || npm init -y >/dev/null
npm install --save-dev playwright@1.63.0 three@0.186.1 three-mesh-bvh@0.9.15 pngjs@5
npx playwright install chromium
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install numpy scipy soundfile pillow opencv-python-headless
if [ ! -f CLAUDE.md ]; then cat > CLAUDE.md <<'EOF'
# Motion studio

Films live in `films/<name>/` (start one with the motion-studio skill: `node <skill>/scripts/new_film.mjs . <name> [film|film-3d]`).
- Python for audio: `.venv/bin/python` (not the global python).
- Ask the person before any render that loads the machine for more than a few minutes; prefer `render.mjs chunks`.
- Client files stay in their film's `assets/`; every on-screen claim goes in that film's `CLAIMS.md`.
EOF
fi
echo; echo "Done."
[ "$FF" = 1 ] || echo "Remember: install ffmpeg before rendering."
echo "Next: node <skill>/scripts/new_film.mjs \"$STUDIO\" my-first-film film"
