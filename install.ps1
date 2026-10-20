# Motion Studio - one-command installer for Windows (Claude Code skill + studio folder).
#
# Private repo (you were invited as a collaborator): one line in PowerShell
#   winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements; $env:Path += ";$env:ProgramFiles\GitHub CLI"; gh auth status *> $null; if ($LASTEXITCODE) { gh auth login -w }; gh api -H "Accept: application/vnd.github.raw" /repos/boxingit1234/motion-studio-skill/contents/install.ps1 | Out-String | iex
# Public repo:
#   irm https://raw.githubusercontent.com/boxingit1234/motion-studio-skill/main/install.ps1 | iex
# With options: save the script as install.ps1, then  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Studio D:\motion-studio
#
# What it does (it asks before starting):
#   1. installs Node.js LTS, Python 3.12 and FFmpeg with winget if they are missing
#   2. copies the "motion-studio" skill to %USERPROFILE%\.claude\skills\motion-studio (an older copy goes to .claude\skill-backups)
#   3. creates the studio folder and installs Playwright + Chromium, three.js and the Python audio packages into it (~270 MB)
#   4. renders a 4-frame test to prove everything works
#   5. prints (and saves to START-HERE.md) the steps to follow in Claude
# Every step shows a progress bar and a live status line. No .ps1 file is executed (Windows blocks them by default).
param(
  [string]$Studio = "",          # studio folder (default: %USERPROFILE%\motion-studio)
  [switch]$Yes,                  # do not ask
  [switch]$SkipPrereqs,          # do not touch Node / Python / FFmpeg
  [string]$Source = "",          # use a local copy of the skill folder instead of downloading it from GitHub
  [string]$SkillsDir = "",       # default: %USERPROFILE%\.claude\skills
  [switch]$NoTest                # skip the 4-frame test render
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Repo = 'boxingit1234/motion-studio-skill'
if (-not $SkillsDir) { $SkillsDir = Join-Path $env:USERPROFILE '.claude\skills' }
if (-not $Studio) { $Studio = Join-Path $env:USERPROFILE 'motion-studio' }
$Total = [Diagnostics.Stopwatch]::StartNew()
$ESC = [string][char]27

function Say($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Q($s) { '"' + $s + '"' }
function Real-Python {
  # the "python" that Windows ships is a Microsoft Store shortcut, not Python: ask the py launcher first
  foreach ($c in @(@('py', '-3'), @('python'), @('python3'))) {
    if (-not (Has $c[0])) { continue }
    try { $exe = & $c[0] @($c | Select-Object -Skip 1) -c "import sys; print(sys.executable)" 2>$null; if ($LASTEXITCODE -eq 0 -and $exe -and (Test-Path $exe.Trim())) { return $exe.Trim() } } catch {}
  }
  return $null
}
function Tail-Line($paths) {
  # the last meaningful line written to the step's log files (read while the tool is still writing them)
  $best = ''
  foreach ($p in $paths) {
    if (-not (Test-Path $p)) { continue }
    try {
      $fs = [IO.File]::Open($p, 'Open', 'Read', 'ReadWrite'); $len = $fs.Length; [void]$fs.Seek([Math]::Max(0, $len - 4096), 'Begin')
      $buf = New-Object byte[] ([Math]::Min(4096, $len)); [void]$fs.Read($buf, 0, $buf.Length); $fs.Close()
      $txt = [Text.Encoding]::UTF8.GetString($buf) -replace ($ESC + '\[[0-9;?]*[A-Za-z]'), ''
      $lines = $txt -split "[`r`n]+" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '^[-\\|/ ]+$' }
      if ($lines) { $best = [string]$lines[-1] }
    } catch {}
  }
  $best = -join ($best.ToCharArray() | Where-Object { [int]$_ -ge 32 -and [int]$_ -lt 127 })       # plain ASCII for the console
  if ($best.Length -gt 100) { $best = $best.Substring(0, 97) + '...' }
  return $best
}

# ----- the plan: every step has a weight in the overall bar; tools that print no % get a bar estimated from the expected time -----
$Plan = New-Object System.Collections.ArrayList
$script:Done = 0; $script:StepNo = 0; $script:CurW = 0
function Overall($label, $sub) {
  $sum = 0; foreach ($s in $Plan) { $sum += $s.w }
  $pct = [Math]::Min(99, [int](100 * ($script:Done + $script:CurW * $sub / 100) / [Math]::Max(1, $sum)))
  Write-Progress -Id 1 -Activity 'Installing Motion Studio' -Status ("Step {0}/{1}: {2}   -   {3}% overall, {4:mm\:ss} elapsed" -f $script:StepNo, $Plan.Count, $label, $pct, $Total.Elapsed) -PercentComplete $pct
}
function Begin-Step($label) {
  $script:StepNo++; $script:CurW = ($Plan | Where-Object { $_.n -eq $script:StepNo }).w
  Say ''; Say ("[{0}/{1}] {2}" -f $script:StepNo, $Plan.Count, $label) 'Cyan'
  Overall $label 0
}
function End-Step($label, $sw) {
  $script:Done += $script:CurW; $script:CurW = 0
  Write-Progress -Id 2 -ParentId 1 -Activity $label -Completed
  Say ("      OK  {0}  ({1:mm\:ss})" -f $label, $sw.Elapsed) 'Green'
}
# run one external program (exe or cmd) with a live bar + status line; returns $true on success
function Run-Step($label, $file, $argLine, $expect, $wd) {
  Begin-Step $label
  if (-not $wd) { $wd = $PWD.Path }
  $log = Join-Path $script:Tmp ("step{0}.out.log" -f $script:StepNo); $err = Join-Path $script:Tmp ("step{0}.err.log" -f $script:StepNo)
  $sw = [Diagnostics.Stopwatch]::StartNew(); $spin = '|', '/', '-', '\'; $k = 0
  $p = Start-Process -FilePath $file -ArgumentList $argLine -WorkingDirectory $wd -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError $err
  $null = $p.Handle                                                      # keeps ExitCode readable after the process ends
  while (-not $p.HasExited) {
    Start-Sleep -Milliseconds 400
    $line = Tail-Line @($log, $err)
    $sub = $null; $m = [regex]::Matches($line, '(\d{1,3}(?:[.,]\d+)?)\s?%')
    if ($m.Count -gt 0) { $v = [double]($m[$m.Count - 1].Groups[1].Value -replace ',', '.'); if ($v -le 100) { $sub = [int]$v } }
    if ($null -eq $sub) { $sub = [Math]::Min(95, [int](100 * $sw.Elapsed.TotalSeconds / $expect)) }
    $k++
    if (-not $line) { $line = 'working...' }
    Write-Progress -Id 2 -ParentId 1 -Activity $label -Status ("{0}  {1:mm\:ss} elapsed  -  {2}%" -f $spin[$k % 4], $sw.Elapsed, $sub) -CurrentOperation $line -PercentComplete $sub
    Overall $label $sub
  }
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) {
    Write-Progress -Id 2 -ParentId 1 -Activity $label -Completed
    Say ("      FAILED  {0}  (exit code {1}). Last messages:" -f $label, $p.ExitCode) 'Red'
    foreach ($f in $err, $log) { if (Test-Path $f) { Get-Content $f -Tail 12 | ForEach-Object { Say "        $_" 'DarkGray' } } }
    return $false
  }
  End-Step $label $sw
  return $true
}
function Quick-Step($label, [scriptblock]$body) {
  Begin-Step $label; $sw = [Diagnostics.Stopwatch]::StartNew()
  Write-Progress -Id 2 -ParentId 1 -Activity $label -Status 'working...' -PercentComplete 50
  & $body
  End-Step $label $sw
}

Say ''
Say '  MOTION STUDIO  -  promo reels & product films made by Claude, in code' 'Green'
Say '  -------------------------------------------------------------------'
Say "  Skill  -> $SkillsDir\motion-studio"
Say "  Studio -> $Studio   (Playwright + Chromium, three.js, Python audio: about 270 MB)"
if (-not $SkipPrereqs) { Say '  Also installs, if missing: Node.js LTS, Python 3.12, FFmpeg (with winget)' }
Say '  Takes about 5-10 minutes. The bars at the top show what is happening at every moment.'
Say ''
if (-not $Yes) {
  $a = Read-Host "  Studio folder [$Studio] (Enter to keep, or type another path)"
  if ($a) { $Studio = $a }
  $go = Read-Host '  Start the installation? (y/n)'
  if ($go -ne 'y') { Say 'Nothing was installed.' 'Yellow'; return }
}
$script:Tmp = Join-Path $env:TEMP ("motion-studio-" + [guid]::NewGuid().ToString('N').Substring(0, 8)); New-Item -ItemType Directory -Force -Path $script:Tmp | Out-Null

# ----- build the plan -----
$need = @()
if (-not $SkipPrereqs) {
  if (-not (Has 'node')) { $need += @{ id = 'OpenJS.NodeJS.LTS'; name = 'Node.js LTS'; t = 90 } }
  if (-not (Real-Python)) { $need += @{ id = 'Python.Python.3.12'; name = 'Python 3.12'; t = 120 } }
  if (-not (Has 'ffmpeg')) { $need += @{ id = 'Gyan.FFmpeg'; name = 'FFmpeg'; t = 90 } }
  if ($need.Count -gt 0 -and -not (Has 'winget')) { Say 'winget is missing: install "App Installer" from the Microsoft Store, then run this again.' 'Red'; return }
}
$n = 0
foreach ($p in $need) { $n++; [void]$Plan.Add(@{ n = $n; w = 14 }) }
foreach ($w in 4, 18, 26, 5, 20) { $n++; [void]$Plan.Add(@{ n = $n; w = $w }) }      # skill, npm, chromium, venv, pip
if (-not $NoTest) { $n++; [void]$Plan.Add(@{ n = $n; w = 8 }) }

# ----- 1. prerequisites -----
foreach ($p in $need) {
  if (-not (Run-Step "Installing $($p.name) (Windows may ask for permission)" 'winget.exe' "install --id $($p.id) -e --silent --accept-source-agreements --accept-package-agreements --disable-interactivity" $p.t)) {
    Say '  If Windows asked for permission and it was refused, run the install line again and allow it.' 'Yellow'; return
  }
  Refresh-Path
}
if (-not $SkipPrereqs) {
  foreach ($c in 'node', 'ffmpeg') { if (-not (Has $c)) { Say "  $c is installed but not visible yet. Close PowerShell, open a new one and run the install line again." 'Yellow'; return } }
}
$Py = Real-Python
if (-not $Py) { Say '  Python is installed but not visible yet. Close PowerShell, open a new one and run the install line again.' 'Yellow'; return }
if (-not (Has 'npm.cmd')) { Say '  npm was not found (it comes with Node.js). Close PowerShell, open a new one and run again.' 'Yellow'; return }

# ----- 2. the skill -----
$dst = Join-Path $SkillsDir 'motion-studio'
Quick-Step 'Installing the motion-studio skill for Claude' {
  if ($Source) { $src = (Resolve-Path $Source).Path }
  else {
    $zip = Join-Path $script:Tmp 'repo.zip'
    $tok = $null
    if (Has 'gh') { try { $tok = (gh auth token 2>$null) } catch {} }
    if ($tok) { Invoke-WebRequest -UseBasicParsing -Headers @{ Authorization = "Bearer $($tok.Trim())"; 'User-Agent' = 'motion-studio-installer' } -Uri "https://api.github.com/repos/$Repo/zipball/main" -OutFile $zip }
    else { Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/$Repo/archive/refs/heads/main.zip" -OutFile $zip }
    Expand-Archive -Path $zip -DestinationPath $script:Tmp -Force
    $src = Get-ChildItem -Path $script:Tmp -Directory | ForEach-Object { Join-Path $_.FullName 'motion-studio' } | Where-Object { Test-Path (Join-Path $_ 'SKILL.md') } | Select-Object -First 1
    if (-not $src) { throw 'could not find the skill in the download (private repo: accept the invitation and run "gh auth login" first)' }
  }
  New-Item -ItemType Directory -Force -Path $SkillsDir | Out-Null
  if (Test-Path $dst) {
    # keep the old copy OUTSIDE the skills folder (a copy inside it would load as a second skill with the same name)
    $bakDir = Join-Path (Split-Path $SkillsDir -Parent) 'skill-backups'; New-Item -ItemType Directory -Force -Path $bakDir | Out-Null
    Move-Item $dst (Join-Path $bakDir "motion-studio-$(Get-Date -Format yyyyMMdd-HHmmss)")
  }
  Copy-Item -Recurse -Path $src -Destination $dst
  Say "      skill: $dst\SKILL.md" 'DarkGray'
}

# ----- 3. the studio -----
New-Item -ItemType Directory -Force -Path (Join-Path $Studio 'films') | Out-Null
if (-not (Test-Path (Join-Path $Studio 'package.json'))) { '{ "name": "motion-studio", "private": true, "version": "1.0.0" }' | Out-File -Encoding ascii (Join-Path $Studio 'package.json') }
if (-not (Test-Path (Join-Path $Studio 'CLAUDE.md'))) {
@'
# Motion studio

Films live in `films/<name>/` (start one with the motion-studio skill: `node <skill>/scripts/new_film.mjs . <name> [film|film-3d]`).
- Python for audio: `.venv\Scripts\python.exe` (not the global python).
- Ask the person before any render that loads the machine for more than a few minutes; prefer `render.mjs chunks`.
- Client files stay in their film's `assets/`; every on-screen claim goes in that film's `CLAIMS.md`.
'@ | Out-File -Encoding utf8 (Join-Path $Studio 'CLAUDE.md')
}
# npm.cmd / npx.cmd, not npm / npx: those resolve to .ps1 files, which Windows blocks by default
if (-not (Run-Step 'Installing Playwright + three.js (npm, ~60 MB)' 'npm.cmd' '--loglevel=http --no-fund --no-audit install --save-dev playwright@1.63.0 three@0.186.1 three-mesh-bvh@0.9.15 pngjs@5' 90 $Studio)) { return }
if (-not (Run-Step 'Downloading Chromium for rendering (~150 MB)' 'npx.cmd' 'playwright install chromium' 150 $Studio)) { return }
$venvPy = Join-Path $Studio '.venv\Scripts\python.exe'
if (Test-Path $venvPy) { Quick-Step 'Python environment (already there)' { } }
elseif (-not (Run-Step 'Creating the Python environment' $Py ('-m venv ' + (Q (Join-Path $Studio '.venv'))) 40 $Studio)) { return }
if (-not (Run-Step 'Installing the Python packages (~110 MB)' $venvPy '-m pip install --disable-pip-version-check numpy scipy soundfile pillow opencv-python-headless' 120 $Studio)) { return }

# ----- 4. a 4-frame test -----
if (-not $NoTest) {
  $film = Join-Path $Studio 'films\hello-reel'
  if (-not (Test-Path $film)) { & node (Join-Path $dst 'scripts\new_film.mjs') $Studio 'hello-reel' 'film' | Out-Null }
  if (-not (Run-Step 'Test render: 4 frames of the example reel' 'node.exe' 'render.mjs beats 0,9,16,28 1 install-check' 60 $film)) {
    Say '  The test did not finish. Everything else is installed: you can still try it in Claude.' 'Yellow'
  }
}
Write-Progress -Id 1 -Activity 'Installing Motion Studio' -Completed
Remove-Item -Recurse -Force $script:Tmp -ErrorAction SilentlyContinue

# ----- 5. what to do in Claude -----
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
Say ''
Say ("  ALL DONE in {0:mm\:ss}" -f $Total.Elapsed) 'Green'
Say '  ===================================================================' 'Green'
Write-Host $guide
Say "  (saved in $guideFile)" 'Green'
