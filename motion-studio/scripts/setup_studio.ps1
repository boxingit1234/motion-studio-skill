# setup_studio.ps1 - create a motion studio folder and install what it needs (Windows).
#   powershell -ExecutionPolicy Bypass -File setup_studio.ps1 -Studio D:\motion-studio [-Yes]
# Downloads (asked before, unless -Yes): npm packages playwright 1.63.0, three 0.186.1, three-mesh-bvh 0.9.15, pngjs 5 (~60 MB),
# Chromium for Playwright (~150 MB), Python wheels numpy, scipy, soundfile, pillow (~60 MB). ffmpeg is NOT installed here.
param([Parameter(Mandatory = $true)][string]$Studio, [switch]$Yes, [string]$Python = '')
$ErrorActionPreference = 'Stop'

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "MISSING: $cmd -> $hint" -ForegroundColor Yellow; return $false }
  return $true
}
$ok = Need node 'install Node.js 20+ (winget install OpenJS.NodeJS.LTS)'
if (-not $Python) {
  # the plain 'python' on a fresh Windows is a Microsoft Store shortcut: prefer the py launcher
  if (Get-Command py -ErrorAction SilentlyContinue) { $Python = (& py -3 -c "import sys; print(sys.executable)").Trim() }
  elseif (Need python 'install Python 3.10+ (winget install Python.Python.3.12)') { $Python = 'python' } else { $ok = $false }
}
$ff = Need ffmpeg 'install ffmpeg (winget install Gyan.FFmpeg), then open a new terminal'
if (-not $ok) { exit 1 }

Write-Host "Studio folder: $Studio"
Write-Host 'Will download: npm packages (~60 MB), Chromium for Playwright (~150 MB), Python packages (~60 MB).'
if (-not $Yes) {
  $a = Read-Host 'Continue? (y/n)'
  if ($a -ne 'y') { Write-Host 'Nothing installed.'; exit 0 }
}

New-Item -ItemType Directory -Force -Path (Join-Path $Studio 'films') | Out-Null
Push-Location $Studio
try {
  # npm.cmd / npx.cmd, not npm / npx: those resolve to npm.ps1, which a default execution policy blocks
  function Run($what) { if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $what" -ForegroundColor Red; exit 1 } }
  if (-not (Test-Path 'package.json')) { & npm.cmd init -y | Out-Null; Run 'npm init' }
  & npm.cmd install --save-dev --no-fund --no-audit playwright@1.63.0 three@0.186.1 three-mesh-bvh@0.9.15 pngjs@5; Run 'npm install'
  & npx.cmd playwright install chromium; Run 'playwright install chromium'
  if (-not (Test-Path '.venv')) { & $Python -m venv .venv; Run 'python -m venv' }
  & .\.venv\Scripts\python.exe -m pip install --upgrade pip; Run 'pip upgrade'
  & .\.venv\Scripts\python.exe -m pip install numpy scipy soundfile pillow; Run 'pip install'
  if (-not (Test-Path 'CLAUDE.md')) {
@'
# Motion studio

Films live in `films/<name>/` (start one with the motion-studio skill: `node <skill>/scripts/new_film.mjs . <name> [film|film-3d]`).
- Python for audio: `.venv\Scripts\python.exe` (not the global python).
- Ask the person before any render that loads the machine for more than a few minutes; prefer `render.mjs chunks`.
- Client files stay in their film's `assets/`; every on-screen claim goes in that film's `CLAIMS.md`.
'@ | Out-File -Encoding utf8 'CLAUDE.md'
  }
} finally { Pop-Location }

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
if (-not $ff) { Write-Host 'Remember: install ffmpeg before rendering (winget install Gyan.FFmpeg).' -ForegroundColor Yellow }
Write-Host "Next: node <skill>\scripts\new_film.mjs `"$Studio`" my-first-film film"
