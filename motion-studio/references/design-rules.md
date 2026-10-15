# Design rules

These rules come from real client reviews of reels made with this pipeline. Most rules carry the complaint that produced them, so you can judge new cases by the reason, not just the rule.

## Contents
1. Story and pacing
2. Layout, safe areas, legibility
3. Typography and kinetic type
4. Motion, cameras and transitions
5. Using real assets
6. The audit
7. A storyboard template

## 1. Story and pacing
- **A reel needs a hook, a product, proof and an ask.**
  1. A 2–5-word hook that's readable on frame 0 (the thumbnail);
  2. the product appears;
  3. 2–4 features, one per beat-group;
  4. one hero number;
  5. the lockup (logo + CTA + URL).
- **Balance information and pace.**
  - A fast, info-dense 30 s reel was liked.
  - A slow, emotional 3D keynote was rejected as "too slow, lacks information".
  - A 15 s cut was rejected as "too rushed, can't keep up".
  - The sweet spot: captions ≥ 1.5 s, ≤ 7 words each, a new visual idea every 1–2 s, no idea longer than ~3 s without movement.
- **One idea per beat.** A feature is one full-screen moment (headline + the thing itself), never a small container floating on black. Asked once: "why these containers when you could make it full screen, focusing on exactly what's important".
- **Avoid long blank intervals.** Every second should carry either a readable word or a clear picture.
- **The ask.**
  - The CTA uses the client's own wording ("Solicită ofertă", "Comandă acum").
  - It shows what happens next (the URL, or "an engineer checks your site").
  - Don't call an assessment "free" unless the client says so.
- **Bookends.** Echo the opening at the end (e.g. "Soarele apune. / Energia rămâne." → "Ziua o produci. / Seara o folosești."). It makes 30 s feel like a story.

## 2. Layout, safe areas, legibility
- **9:16 safe area for Reels/TikTok:** keep text in x 60–1020 and y 200–1640. The UI covers the bottom ~280 px and the right-hand button column.
- **Meta Reels *ads* are stricter:** text and taps only in x 65–1015, y 270–1250.
- **16:9 title-safe margin:** 96 px.
- **Zones.** Give the stack of elements fixed zones (e.g. label 158–213, headline 308–458, card 500–1240, info 1280–1496) and keep minimum gaps (≥ 14 px of ink between blocks). Measure ink, not boxes: use `Range.getBoundingClientRect()` on text nodes, or the `canvas.measureText` ink extents.
- **Never overlap.**
  - Text over text, text over the product, a decoration over text: each was called out ("overlapping, just as I told you to avoid").
  - An outgoing title is gone before an incoming one occupies that space.
  - A caption must not linger into the next scene, even fading.
- **Contrast.**
  - White text on bright footage needs a static gradient scrim (brand dark, 55–90 %), designed per shot.
  - **Never** drive scrim opacity per frame from the footage's luminance: it flickers.
  - Aim for 3:1 on large text, 4.5:1 on small text.
- **Decoration never competes with captions.** A glowing "spark" that moved near the text was "distracting, chaotic". Decorative motion happens in text-free windows, parks small and dim while a caption is read, and never crosses a word.
- **Hard masks read as clipped text.** A reveal through an `overflow:hidden` box looked like a rendering bug mid-move. Use a soft rise (opacity + 20–40 px travel + a few px of blur) or letter-by-letter springs, with enough padding for diacritics.

## 3. Typography and kinetic type
- **Fonts.** Use the brand's fonts. Otherwise use one clean family (Inter / Barlow / Montserrat) in two to three weights. Uppercase condensed headlines (100–200 px at 1080 wide) + a sentence-case body at 34–44 px + small tracked labels in the accent colour (26–30 px, `letter-spacing .15em`).
- **Case-sensitive tokens.** `text-transform: uppercase` breaks units and formulas ("KWH", "LIFEPO4"). Wrap them in `<span style="text-transform:none">kWh</span>`. Write subscripts with a smaller, lowered span, because many fonts lack ₂ ₄.
- **Fit headlines by ink width** (`white-space:nowrap`, measure, scale `font-size` down to the column). Never let a headline wrap by surprise.
- **Fit gradient text.** `background-clip:text` paints only inside the element's box. Give vertical padding for Ă Î Ș Ț and widen the box for negative letter-spacing. Put the gradient on each transformed child, not on the parent.
- **Kinetic letters.** Split big titles into letter spans. Each letter rises 30–45 px with a 20–30 ms stagger on a **critically damped spring** (`1 − e^{−ωu}(1+ωu)`, no overshoot).
- **Counters.** Change digit by digit on the same spring: the old value lifts out first, then the new one rises in. Never use a half-visible rolling drum.
- **Capital I.** In some sans fonts it looks like a lowercase l ("Iar" read as "lar"). Reword if needed.
- **Fonts and frames.** Preload every weight before frame 0, and check `document.fonts.check` for each face.

## 4. Motion, cameras and transitions
- **Easing.**
  - Continuous acceleration and deceleration. Critically damped springs or `cubicOut`/`io`.
  - No repeated bouncing, no large elastic overshoot.
  - Cursor taps and UI state changes are instant cuts on the tap.
- **Transitions with a reason**, not generic pushes and crossfades:
  - **Match cut:** an element keeps its exact screen position and size across the cut while everything else changes. Verify it numerically.
  - **Dive:** the camera falls into a detail (an LED, a letter's stem); the cut lands on the same detail elsewhere.
  - **Light/dark switch:** a hard cut from a warm/bright world to a dark studio on a downbeat, with the drums dropping out and slamming back in later.
  - **Scale journey:** zoom out until the subject is a point, then back into the next context.
  - **Lime→black:** a cross-fade between a saturated brand colour and black looks muddy (olive mud). Dive into a shape of that colour and open an iris instead.
- **Hand-drawn annotations.** A line or circle drawn on with a growing arc / `stroke-dashoffset` in the accent colour pointing at a product detail, with a short label. Use them sparingly, one per film.
- **Motion blur.**
  - 2D: render N sub-frames across a 180° shutter and average them (ffmpeg `tmix` or in-page). 10 sub-frames for whip pans; 4 sub-frames ghost.
  - 3D: the path tracer jitters time per sample.
- **Camera beat bumps** (+1 % on a kick) live inside the camera function, so overlays that project points use the same camera.
- **Product shots.**
  - Keep the product's identity and orientation consistent across shots.
  - The product never shrinks into a corner while text talks about it.
  - When the camera pushes in, lock the product's top edge below the title zone. A slow push that slid the product under the title was a real bug.

## 5. Using real assets
- **The client's own website is the best asset library.**
  - Capture UI with Playwright at high DPR (4–8×) as transparent crops (`omitBackground`).
  - Save every element's rect, and animate the real crops: never redraw UI.
  - For long pages that virtualise content, scroll screen by screen and hide sticky/fixed bars while capturing.
- **Never click** buy/cart/submit/send on a real site; fake state changes with overlays.
- **Cookie banners:** choose the most private option ("Reject all" / "Only necessary").
- **Client footage:** decode lazily (never all clips at once), crop with fractional Lanczos, and read contact moments from dense timestamped strips to sync foley.
- **Logos:** use the real mark + wordmark files (SVG preferred, a large PNG otherwise). A light/negative variant exists on most sites for dark backgrounds. Never recreate a logo.
- **Third-party brands** (e.g. the manufacturer of a product a reseller sells): show the product and its name; use their logo only as it appears on the product itself. Mention in the delivery note that the client should check their partner agreement for ad usage.

## 6. The audit
Implement `window.auditAt(t)` in every comp. `render.mjs audit 0.25` then walks the film and reports:
- `OVERLAP`: a text ink box intersects another text, the product box, or a decoration (14 px margin);
- `SAFE`: text outside the platform safe area while settled;
- `GHOST`: an element at 0 < opacity < 0.05 that still catches the eye (left from a fade);
- `EMPTY`: a container/shell visible with nothing in it;
- `TAP-OUT-OF-SAFE`: (ads) a finger tap outside the ad safe zone.

Every time a person points at a frame with a problem the audit missed, add a rule for that class of problem, then sweep the whole film at 0.05 s steps.

## 7. Storyboard template
```
| beats   | seconds    | picture                          | text (≤ 7 words)            | sound                       |
|---------|------------|----------------------------------|-----------------------------|-----------------------------|
| 0–4     | 0.0–2.0    | hook type on brand bg            | "Ziua o produci."           | soft pad, kick on 1         |
| 4–10    | 2.0–5.0    | product card rises (spring)      | product name + 1-line sub   | riser → impact on b4        |
| …       |            |                                  |                             |                             |
| 26–30   | 13.0–15.0  | lockup: logo, CTA button, URL    | CTA in client's wording     | logo hit, tap, final chord  |
```
