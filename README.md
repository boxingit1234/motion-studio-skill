# Motion Studio: a Claude Code skill for promo reels & product films

Claude makes finished videos **in code**:
- reels (9:16), 16:9 / 1:1 / 4:5 ads;
- product and launch films, kinetic typography, logo stings;
- photoreal **3D product scenes**: the product in a living room, on a house at dusk, in a studio.

It builds the animation, an original soundtrack (−14 LUFS) and the final mp4, from your website, datasheet, deck or brand files.

## Install (Windows, one command)

This repo is **private**, so you need a GitHub account with access:
1. The owner invites you: **Settings → Collaborators → Add people**.
2. Accept the invitation from the e-mail, or at https://github.com/boxingit1234/motion-studio-skill.

Then open **PowerShell** (Start → type *PowerShell* → Enter) and paste this **one line**:

```powershell
winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements; $env:Path += ";$env:ProgramFiles\GitHub CLI"; gh auth status *> $null; if ($LASTEXITCODE) { gh auth login -w }; gh api -H "Accept: application/vnd.github.raw" /repos/boxingit1234/motion-studio-skill/contents/install.ps1 | Out-String | iex
```

- It installs the GitHub command-line tool.
- It logs you in: a browser opens, you enter the 8-character code it shows, and you click **Authorize**.
- Then it runs the installer.

It asks for a folder and a yes. A **progress bar** with a live status line shows every step, so you always see that it's working. Then it:
1. installs **Node.js, Python 3.12 and FFmpeg** if they are missing (with `winget`; Windows may ask for permission);
2. installs the skill to `%USERPROFILE%\.claude\skills\motion-studio`;
3. sets up the studio folder (default `%USERPROFILE%\motion-studio`): Playwright + Chromium, three.js, the Python audio + OpenCV packages (~320 MB);
4. renders a 4-frame test;
5. shows the **steps to follow in Claude** and saves them to `START-HERE.md` in the studio folder.

Run the same line again later to update the skill (already installed parts are skipped). Your films are kept.

## Then, in Claude

1. Open the **Claude desktop app → Code tab** (or `claude` in a terminal). You need a Claude plan that includes Claude Code. Download the app at https://claude.ai/download.
2. If Claude was open during the install, **quit it completely and reopen it**.
3. In the Code tab, choose your **studio folder** (e.g. `C:\Users\<you>\motion-studio`) as the working folder.
4. First video: type
   > Use the motion-studio skill. Render the hello-reel example in films\hello-reel to an mp4 with sound.
5. A real one, for example:
   > Make a 15-second 9:16 reel for https://your-site.com/product, brand colours from the site, ending with "Order now".

Claude researches the facts into `CLAIMS.md` and shows contact sheets for your feedback. It **asks before long renders** (3D films take 1–2 h on the graphics card), and it delivers `films\<name>\out\<name>.mp4` plus a small `-share.mp4`.

## Requirements
- Windows 10/11 with `winget` (the "App Installer" from the Microsoft Store).
- About 1 GB free.
- Any GPU for 2D videos; for 3D scenes, an NVIDIA GTX 1650-class card or better.
- macOS / Linux: copy the `motion-studio` folder to `~/.claude/skills/`, install Node, Python and ffmpeg, then run `bash ~/.claude/skills/motion-studio/scripts/setup_studio.sh ~/motion-studio`.

## Manual install
1. Download this repo as a zip (Code → Download ZIP).
2. Copy the `motion-studio` folder to `%USERPROFILE%\.claude\skills\`.
3. Run `powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\.claude\skills\motion-studio\scripts\setup_studio.ps1" -Studio D:\motion-studio`.

## Troubleshooting
- **"node / ffmpeg not found" right after install:** close PowerShell, open a new one and run the command again. The PATH updates only in new windows.
- **"running scripts is disabled":** fixed in the current installer (it no longer runs `.ps1` files). Just run the line again.
- **"Not Found" / 404 when downloading:** the invitation isn't accepted yet, or you logged in with another GitHub account (`gh auth status` shows which).
- **Claude doesn't use the skill:** check that `%USERPROFILE%\.claude\skills\motion-studio\SKILL.md` exists, restart Claude, or say "use the motion-studio skill".
- **Renders slow the PC:** tell Claude "stop", or ask it for the gentle mode. Windows Defender rescanning files can also slow things; you may add an exclusion for the studio's `films` folder yourself.

## What's inside
| Path | Contents |
|---|---|
| `install.ps1` | the one-command installer |
| `motion-studio/SKILL.md` | the workflow Claude follows |
| `motion-studio/references/` | setup, render pipeline, design rules, sound, 3D path tracer, claims & sources |
| `motion-studio/templates/film` | a complete 15 s 2D reel |
| `motion-studio/templates/film-3d` | a complete 30 s path-traced product film |
| `motion-studio/scripts/` | studio setup + new-film scaffolding |

No client material is included: the templates use placeholder text and a generic product.
