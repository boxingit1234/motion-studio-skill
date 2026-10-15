# Motion Studio - one-command installer for Windows (Claude Code skill + studio folder).
#
# Private repo (you were invited as a collaborator): one line in PowerShell
#   winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements; $env:Path += ";$env:ProgramFiles\GitHub CLI"; gh auth login -w; gh api -H "Accept: application/vnd.github.raw" /repos/boxingit1234/motion-studio-skill/contents/install.ps1 | Out-String | iex
# Public repo:
#   irm https://raw.githubusercontent.com/boxingit1234/motion-studio-skill/main/install.ps1 | iex
# With options: save the script as install.ps1, then  .\install.ps1 -Studio D:\motion-studio
#
# What it does (it asks before starting):
#   1. installs Node.js LTS, Python 3.12 and FFmpeg with winget if they are missing
#   2. copies the "motion-studio" skill to %USERPROFILE%\.claude\skills\motion-studio (an older copy is kept as a backup)
#   3. creates the studio folder and installs Playwright + Chromium, three.js and the Python audio packages into it (~270 MB)
#   4. renders a 4-frame test to prove everything works
#   5. prints (and saves to START-HERE.md) the steps to follow in Claude
param(
  [string]$Studio = "",          # studio folder (default: %USERPROFILE%\motion-studio)
  [switch]$Yes,                  # do not ask
  [switch]$SkipPrereqs,          # do not touch Node / Python / FFmpeg
  [string]$Source = "",          # use a local copy of the skill folder instead of downloading it from GitHub
  [string]$SkillsDir = "",       # default: %USERPROFILE%\.claude\skills
  [switch]$NoTest                # skip the 4-frame test render
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Repo = 'boxingit1234/motion-studio-skill'
if (-not $SkillsDir) { $SkillsDir = Join-Path $env:USERPROFILE '.claude\skills' }
if (-not $Studio) { $Studio = Join-Path $env:USERPROFILE 'motion-studio' }

function Say($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Step($t) { Write-Host ''; Write-Host "==> $t" -ForegroundColor Cyan }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Real-Python {
  # the "python" that Windows ships is a Microsoft Store shortcut, not Python: ask the py launcher first
  foreach ($c in @(@('py', '-3'), @('python'), @('python3'))) {
    if (-not (Has $c[0])) { continue }
    try { $exe = & $c[0] @($c | Select-Object -Skip 1) -c "import sys; print(sys.executable)" 2>$null; if ($LASTEXITCODE -eq 0 -and $exe -and (Test-Path $exe.Trim())) { return $exe.Trim() } } catch {}
  }
  return $null
}

Say ''
Say '  MOTION STUDIO  -  promo reels & product films made by Claude, in code' 'Green'
Say '  -------------------------------------------------------------------'
Say "  Skill  -> $SkillsDir\motion-studio"
Say "  Studio -> $Studio   (Playwright + Chromium, three.js, Python audio: about 270 MB)"
if (-not $SkipPrereqs) { Say '  Also installs, if missing: Node.js LTS, Python 3.12, FFmpeg (with winget)' }
Say ''
if (-not $Yes) {
  $a = Read-Host "  Studio folder [$Studio] (Enter to keep, or type another path)"
  if ($a) { $Studio = $a }
  $go = Read-Host '  Start the installation? (y/n)'
  if ($go -ne 'y') { Say 'Nothing was installed.' 'Yellow'; return }
}

# 1 - prerequisites
if (-not $SkipPrereqs) {
  Step 'Checking Node.js, Python, FFmpeg'
  $need = @()
  if (-not (Has 'node')) { $need += @{ id = 'OpenJS.NodeJS.LTS'; name = 'Node.js LTS' } }
  if (-not (Real-Python)) { $need += @{ id = 'Python.Python.3.12'; name = 'Python 3.12' } }
  if (-not (Has 'ffmpeg')) { $need += @{ id = 'Gyan.FFmpeg'; name = 'FFmpeg' } }
  if ($need.Count -gt 0) {
    if (-not (Has 'winget')) { Say 'winget is missing: install "App Installer" from the Microsoft Store, then run this again.' 'Red'; return }
    foreach ($p in $need) {
      Say "  installing $($p.name) ..."
      winget install --id $p.id -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
    }
    Refresh-Path
  }
  foreach ($c in 'node', 'npm', 'ffmpeg') { if (-not (Has $c)) { Say "  $c is still not found. Close PowerShell, open a new one and run the installer again." 'Red'; return } }
  Say "  node $(node -v), ffmpeg ok"
}
$Py = Real-Python
if (-not $Py) { Say '  Python was not found. Install Python 3.12 (winget install Python.Python.3.12), open a new PowerShell and run again.' 'Red'; return }
Say "  python: $Py"

# 2 - the skill
Step 'Installing the motion-studio skill for Claude'
$tmp = Join-Path $env:TEMP ("motion-studio-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
if ($Source) { $src = (Resolve-Path $Source).Path }
else {
  $zip = Join-Path $tmp 'repo.zip'
  # private repo: download through the GitHub API with the GitHub CLI's login (gh auth login); public: the plain archive
  $tok = $null
  if (Has 'gh') { try { $tok = (gh auth token 2>$null) } catch {} }
  if ($tok) { Invoke-WebRequest -UseBasicParsing -Headers @{ Authorization = "Bearer $($tok.Trim())"; 'User-Agent' = 'motion-studio-installer' } -Uri "https://api.github.com/repos/$Repo/zipball/main" -OutFile $zip }
  else {
    try { Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/$Repo/archive/refs/heads/main.zip" -OutFile $zip }
    catch { Say '  could not download the skill. If the repo is private: install the GitHub CLI (winget install GitHub.cli), run "gh auth login", accept the repo invitation, then run this again.' 'Red'; return }
  }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $src = Get-ChildItem -Path $tmp -Directory | ForEach-Object { Join-Path $_.FullName 'motion-studio' } | Where-Object { Test-Path (Join-Path $_ 'SKILL.md') } | Select-Object -First 1
  if (-not $src) { Say '  could not find the skill in the download.' 'Red'; return }
}
New-Item -ItemType Directory -Force -Path $SkillsDir | Out-Null
$dst = Join-Path $SkillsDir 'motion-studio'
if (Test-Path $dst) { $bak = "$dst.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"; Move-Item $dst $bak; Say "  previous version kept as $bak" }
Copy-Item -Recurse -Path $src -Destination $dst
Say "  skill installed: $dst\SKILL.md" 'Green'

# 3 - the studio
Step "Setting up the studio in $Studio (this downloads ~270 MB, a few minutes)"
& (Join-Path $dst 'scripts\setup_studio.ps1') -Studio $Studio -Yes -Python $Py
Refresh-Path

# 4 - a 4-frame test
if (-not $NoTest) {
  Step 'Test: rendering 4 frames of the example reel'
  $film = Join-Path $Studio 'films\hello-reel'
  if (-not (Test-Path $film)) { node (Join-Path $dst 'scripts\new_film.mjs') $Studio 'hello-reel' 'film' | Out-Null }
  Push-Location $film
  try { node render.mjs beats 0,9,16,28 1 install-check | Where-Object { $_ -notmatch 'page:warning' } | Out-Host }
  finally { Pop-Location }
  $chk = Join-Path $film 'out\install-check.jpg'
  if (Test-Path $chk) { Say "  test OK: $chk" 'Green' } else { Say '  the test render did not produce an image: see the messages above (often: open a new PowerShell and run again).' 'Yellow' }
}
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

# 5 - what to do in Claude
$guide = @"
# Motion Studio - start here

Everything is installed.
- Skill:  $dst
- Studio: $Studio   (your videos will be in $Studio\films\<name>\out\)

## In Claude (do this once)
1. Open the **Claude desktop app** and go to the **Code** tab (or open a terminal and type ``claude``).
   Claude Code needs a Claude plan that includes it. Get the app from https://claude.ai/download
2. If Claude was already open, **close it completely and open it again**, so it sees the new skill.
3. In the Code tab, **choose the folder** ``$Studio`` as the project / working folder.
4. Check that the skill is there. Type:
   > What does the motion-studio skill do?

## Your first video (about 5 minutes)
Type:
> Use the motion-studio skill. Render the hello-reel example in films\hello-reel to an mp4 with sound.

Claude makes the sound, renders the frames and gives you ``films\hello-reel\out\hello-reel.mp4``.

## A real video
Describe it like you would to a motion designer. Examples:
> Make a 15-second 9:16 reel for https://your-site.com/product. Use the brand colours and fonts from the site and end with "Order now".

> Make a 30-second product video for <product> from this datasheet: C:\path\datasheet.pdf. Exact specs only, premium style: start in a living room, then show where the product is.

> Make a 20-second launch video for our app with the 3 main features, 9:16 for TikTok and 16:9 for YouTube.

What Claude does:
1. It reads the site or files and writes every fact into ``CLAIMS.md``, with its source.
2. It plans the film on a beat grid and builds it.
3. It shows you **contact sheets** (stills of the film). Tell it what to change.
4. It **asks before long renders**. 3D films take 1-2 hours on the graphics card; you can choose a gentle mode or a time when you don't need the PC.
5. It delivers ``<name>.mp4`` (to post) and ``<name>-share.mp4`` (small, for WhatsApp).

## Good to know
- To stop a render, just tell Claude **"stop"**. Renders resume later from where they stopped.
- Give Claude your logo / fonts / brand files: put them in the film's ``assets`` folder, or send their path.
- If Windows Defender slows renders, you can add an exclusion for ``$Studio\films`` (Windows Security > Virus & threat protection > Manage settings > Exclusions).
- Re-run the install command any time to update the skill (your films are kept).
"@
$guideFile = Join-Path $Studio 'START-HERE.md'
$guide | Out-File -Encoding utf8 $guideFile
Step 'Done!'
Write-Host $guide
Say ''
Say "  (saved in $guideFile)" 'Green'
