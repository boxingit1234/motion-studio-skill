// make.mjs — a footage promo end to end (env EDIT = edit file, default edit.json; OUTD = out/<edit name>; NAME = output file name).
//   node make.mjs footage   tools/edit_render.py part + join → <OUTD>/base.mp4         (minutes: ASK first for long edits)
//   node make.mjs overlay   comp.html over the footage → <OUTD>/video.mp4
//   node make.mjs audio     audio.py → <OUTD>/mix.wav (songs, DJ transitions, sfx)
//   node make.mjs finish    one exact gain to −14 LUFS, mux onto the picture → <OUTD>/<NAME>.mp4 + a lighter -share copy, then verify
//   node make.mjs all       footage + overlay + audio + finish
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO = path.resolve(HERE, "../..");
const PY = [path.join(STUDIO, ".venv", "Scripts", "python.exe"), path.join(STUDIO, ".venv", "bin", "python")].find((p) => fs.existsSync(p)) || "python";
const run = (cmd, args, env = {}) => {
  console.log(`> ${path.basename(cmd)} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: HERE, stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8", ...env } });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
};
const EDIT = process.env.EDIT || "edit.json";
const OUTD = process.env.OUTD || path.join("out", path.basename(EDIT, ".json"));
process.env.EDIT = EDIT; process.env.OUTD = OUTD;
const LUFS = -14, TP = -1.5, MIX = `${OUTD}/mix.wav`;
const NAME = process.env.NAME || path.basename(HERE);
const FINAL = path.join(HERE, OUTD, `${NAME}.mp4`), SHARE = FINAL.replace(/\.mp4$/, "-share.mp4");

const steps = {
  footage: () => { run(PY, ["tools/edit_render.py", "part", "0", "9999"]); run(PY, ["tools/edit_render.py", "join"]); },
  overlay: () => run("node", ["overlay.mjs", "render"]),
  audio: () => run(PY, ["audio.py", MIX]),
  finish: () => {
    const m = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", MIX, "-af", `loudnorm=I=${LUFS}:TP=${TP}:LRA=11:print_format=json`, "-f", "null", "-"], { cwd: HERE, encoding: "utf8" });
    const j = JSON.parse(m.stderr.match(/\{[^{]*"input_i"[\s\S]*?\}/)[0]);
    console.log(`mix measured ${j.input_i} LUFS, ${j.input_tp} dBTP`);
    // the picture is the master clock: pad / trim the audio to the video's exact length (never -shortest)
    const vdur = parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${OUTD}/video.mp4`], { cwd: HERE, encoding: "utf8" }).stdout);
    // one exact gain to −14 LUFS (loudnorm's second pass can silently fall back to dynamic mode and lift quiet passages into overs)
    const gain = LUFS - parseFloat(j.input_i);
    if (parseFloat(j.input_tp) + gain > TP) console.log(`warning: true peak would be ${(parseFloat(j.input_tp) + gain).toFixed(1)} dBTP — limit the mix harder`);
    const ln = `volume=${gain.toFixed(2)}dB,aresample=48000,apad=whole_dur=${vdur.toFixed(4)}`;
    run("ffmpeg", ["-v", "error", "-y", "-i", `${OUTD}/video.mp4`, "-i", MIX, "-map", "0:v", "-map", "1:a", "-af", ln,
      "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-t", vdur.toFixed(4), "-movflags", "+faststart", FINAL]);
    run("ffmpeg", ["-v", "error", "-y", "-i", FINAL, "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-maxrate", "10M", "-bufsize", "20M", "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "copy", "-movflags", "+faststart", SHARE]);
    const chk = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", FINAL, "-af", "ebur128=peak=true", "-f", "null", "-"], { cwd: HERE, encoding: "utf8" }).stderr;
    const I = chk.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop(), P = chk.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop();
    const nf = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", FINAL], { cwd: HERE, encoding: "utf8" }).stdout.trim();
    console.log(`final: ${I}, true ${P}, ${nf} frames -> ${FINAL}`);
  },
};
const order = { all: ["footage", "overlay", "audio", "finish"] };
for (const s of order[process.argv[2]] || [process.argv[2] || "finish"]) steps[s]();
