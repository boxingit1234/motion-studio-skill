# Setup: one studio folder per machine

The studio is a plain folder (e.g. `~/motion-studio` or `D:\motion-studio`). It holds one `node_modules` and one Python venv, and every film lives in `films/<name>/`. Each film's local server serves `/node_modules/*` from the studio root, so films never install anything themselves.

## Requirements
| Tool | Why | Check |
|---|---|---|
| Node.js ≥ 20 | runs the render scripts, Playwright | `node -v` |
| ffmpeg + ffprobe on PATH | encode, mux, loudness, frame extraction | `ffmpeg -version` |
| Python ≥ 3.10 | sound synthesis + measurements | `python --version` |
| npm packages (studio root): `playwright` (pin the version you test with), `three`, `three-mesh-bvh`, `pngjs` | capture, 3D, chunked renders | `npm ls` |
| Chromium for Playwright | the renderer | `npx playwright install chromium` |
| Python venv: `numpy`, `scipy`, `soundfile` (+ optional `librosa`) | audio | `.venv` python `-c "import scipy, soundfile"` |
| A GPU (any for 2D; for 3D path tracing an NVIDIA GTX 1650-class or better) | WebGL2 + float render targets | see GPU check |

**Install with the scripts.**
- Windows: `scripts/setup_studio.ps1 -Studio D:\motion-studio`.
- macOS/Linux: `bash scripts/setup_studio.sh ~/motion-studio`.

Both scripts print what they will download (npm packages, Chromium, pip wheels) and ask before doing it. If you install for someone else, tell them the sizes first: Chromium is ≈ 150 MB, and the npm and pip packages ≈ 100 MB together.

When Claude runs the script: tell the person the sizes, get a yes in chat, then run it with `-Yes` / `--yes`. The script's own y/n prompt can't be answered from a non-interactive shell.

ffmpeg is not installed by the scripts:
- Windows: `winget install Gyan.FFmpeg`.
- macOS: `brew install ffmpeg`.
- Linux: the distro package.

## GPU check (needed for 3D, nice for 2D)
Chromium is launched with `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist --force_high_performance_gpu --disable-gpu-watchdog` (Windows). On macOS/Linux, drop the ANGLE flag.

Verify which GPU WebGL actually got:
```js
const gl = document.createElement("canvas").getContext("webgl2");
const dbg = gl.getExtension("WEBGL_debug_renderer_info");
gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);   // e.g. "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 … Direct3D11 …)"
```
On a laptop with two GPUs, a string with "Intel" or "SwiftShader" means you got the integrated or software renderer. The path tracer will then be 5–50× slower. Set the browser to "High performance" in the OS graphics settings.

For 3D you also need the `EXT_float_blend` and `EXT_color_buffer_float` WebGL2 extensions (all desktop GPUs from the last decade have them).

## Fonts
- **Google Fonts.** Load them in `comp.html` via `<link>` (the font CSS is fetched at render time, nothing is saved), then preload every weight.
- **Brand fonts.** Put brand-supplied files in the film's `assets/` and use `@font-face`. Check the licence allows video use; most desktop licences do, some web-only ones don't.
- **Romanian and other diacritics.** Pick fonts that contain them (ă â î ș ț). Test with the real copy.

## Windows notes (learned the hard way)
- **`.ps1` files with non-ASCII text.** Save them as UTF-8 **with BOM**. Smart quotes („ ”) inside PowerShell 5.1 strings break parsing, so use « » or ASCII.
- **Git-bash `tar` misreads `D:`.** Use `C:\Windows\System32\tar.exe`.
- **Kill whole process trees** with `taskkill /T /F /PID <pid>`. Killing only `node` leaves Chromium children holding files.
- **Bash heredocs mangle backslash escapes** in code you're writing (e.g. `\1`, `\d`, `\n`). Write source files with an editor/Write tool, not `cat <<EOF`.
- **Windows Defender rescans every frame file.** Prefer `render.mjs chunks`. If the person wants, they can add a Defender folder exclusion for `<studio>\films`; only they should change security settings.
- **Python scripts that print non-ASCII.** Run them with `PYTHONIOENCODING=utf-8`.
