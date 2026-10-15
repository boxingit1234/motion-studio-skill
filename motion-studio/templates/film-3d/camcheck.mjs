// camcheck.mjs — verify match cuts with camera math only (no GPU, no rendering):
// the same 3D point must land on the same screen pixel on both sides of a cut.   node camcheck.mjs
import * as THREE from "three";
import { SHOTS, DIVE, PILL } from "./film.js";
import { PRODUCT, HOUSE } from "./world.js";
const W = 1080, H = 1920, by = Object.fromEntries(SHOTS.map((s) => [s.id, s]));
function project(cam, p) {
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...cam.pos), new THREE.Vector3(...cam.target), new THREE.Vector3(0, 1, 0));
  const R = new THREE.Matrix3().setFromMatrix4(m).transpose();
  const v = new THREE.Vector3(p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]).applyMatrix3(R);
  const th = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
  return [Math.round((v.x / -v.z / (th * W / H) * .5 + .5) * W), Math.round((1 - (v.y / -v.z / th * .5 + .5)) * H)];
}
const row = (label, shot, b, pts) => console.log(label.padEnd(30), `b${b}`.padEnd(9), pts.map((p) => JSON.stringify(project(by[shot].cam(b), p))).join("  "));
// 1 · the dive: the LED pill in the room ↔ the same pill in the studio
const e = 1e-3;
row("room   pill", "room", DIVE.cut - e, [PILL.room]); row("studio pill", "macro", DIVE.cut, [PILL.studio]);
// 2 · studio → house: the product's top-left-front and bottom-right-front corners
const { W: w, D: d } = PRODUCT, h = 1.23, L = HOUSE.productAt;
row("studio product corners", "stack", 32 - e, [[-w / 2, h, d / 2], [w / 2, 0, d / 2]]);
row("house  product corners", "house", 32, [[L[0] - w / 2, L[1] + h, L[2] + d / 2], [L[0] + w / 2, L[1], L[2] + d / 2]]);
console.log("each pair of rows must print the same pixels");
