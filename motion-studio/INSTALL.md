# Motion Studio: how to install it (about 15 minutes)

This skill lets Claude make promo reels and product videos in code. It builds the animation, an original soundtrack and the final mp4, and can add photoreal 3D product scenes.

It renders on your own computer, so it needs **Claude Code**: the Claude desktop app's "Code" tab, or the `claude` CLI. In plain claude.ai chat the skill can plan and write the code, but it cannot render.

---

## Step 1: install the three programs it needs (once)

**Windows.** Open **PowerShell** and run these three commands, one at a time:
```
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install Gyan.FFmpeg
```
Then **close PowerShell and open it again**, so the new programs are found. Check:
```
node -v
python --version
ffmpeg -version
```

**macOS** (with Homebrew): `brew install node python ffmpeg`.

## Step 2: put the skill where Claude finds it

1. Unzip `motion-studio.zip`.
2. Move the **`motion-studio`** folder into your Claude skills folder:
   - Windows: `C:\Users\<your name>\.claude\skills\` (create the `skills` folder if it doesn't exist; `.claude` is a hidden folder in your user folder).
   - macOS: `~/.claude/skills/`.
3. Check: the file `...\.claude\skills\motion-studio\SKILL.md` must exist. It must not be one level deeper, like `motion-studio\motion-studio\SKILL.md`.
4. **Restart** the Claude app (or the `claude` CLI).

**Alternative for claude.ai** (if your plan or organisation has Skills enabled): upload `motion-studio.skill` where claude.ai manages skills (in Settings). Rendering still needs Claude Code.

## Step 3: let Claude set up the studio (once)

In Claude Code, write:
> Set up the motion studio in D:\motion-studio

(or any folder, e.g. `C:\Users\<you>\motion-studio`, or `~/motion-studio` on a Mac)

Claude runs the skill's setup script:
- It tells you what it will download: Playwright + Chromium, three.js, Python audio packages; about 270 MB in total.
- It asks for your OK, then installs everything into that folder only.

To do it yourself instead, in PowerShell:
```
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\skills\motion-studio\scripts\setup_studio.ps1" -Studio D:\motion-studio
```

## Step 4: test it

Ask Claude:
> Make a test reel from the motion-studio 2D template in D:\motion-studio

It creates `films/<name>`, shows you a contact sheet, makes the sound and renders a 15-second mp4 (a few minutes).

Then ask for a real video, for example:
> Make a 15-second 9:16 reel for https://our-site.com/product, brand colours from the site, ending with "Order now".

---

## Good to know
- **3D product films** (rooms, a house at dusk, a studio) need a decent graphics card (NVIDIA GTX 1650 or better). They render for 1–2 hours. Claude asks before starting and can use a gentle mode, so the computer stays usable.
- **You can stop a render any time.** It continues later from where it stopped.
- **Windows Defender** may scan the render files and slow things down. You can add an exclusion for your studio's `films` folder (Windows Security → Virus & threat protection → Manage settings → Exclusions).
- **Facts.** Claude puts every fact shown in a video in that film's `CLAIMS.md`, with its source. Check it before publishing.
- **The skill isn't triggering?** Make sure the folder is exactly `.claude\skills\motion-studio\SKILL.md`, restart Claude, or say "use the motion-studio skill".
