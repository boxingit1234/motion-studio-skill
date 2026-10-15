// pt.js — a small progressive GPU path tracer on top of three-mesh-bvh (WebGL2, GLSL 3).
//   • one static "set" per shot: all parts merged into one BVH (position / normal / uv / material id)
//   • materials: albedo, roughness, metalness, emission (+ an emission group whose gain is animated),
//     flags: GLASS (thin, transmissive), PROXY (visible lamp body: never casts shadows, its light comes
//     from the analytic light at the same place), DECAL (product front print + LED channels)
//   • lights: sun (cone NEE), rect lights (emitters or sky portals for windows), sphere lights
//   • camera: thin lens (aperture / focus), shutter (camera interpolated per sample = true motion blur)
//   • every pixel's random sequence depends only on (pixel, sample) → the same frame renders identically
//   • resolve: à-trous denoiser on albedo-demodulated light (guided by first-hit albedo / normal / depth),
//     bloom, AgX, grade, dither → the visible canvas
import * as THREE from "three";
import { MeshBVH, MeshBVHUniformStruct, FloatVertexAttributeTexture, BVHShaderGLSL, SAH } from "three-mesh-bvh";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const F = { GLASS: 1, PROXY: 2, DECAL: 4, LINE: 8 };

// ───────────────────────── materials ─────────────────────────
export class Materials {
  constructor() { this.list = []; this.byName = {}; }
  add(name, m) {
    const d = Object.assign({ albedo: [.8, .8, .8], rough: .6, metal: 0, emit: [0, 0, 0], group: 0, flags: 0, pattern: 0, p: [1, 0, 0, 0], tint: [1, 1, 1] }, m);
    d.id = this.list.length; this.list.push(d); this.byName[name] = d; return d.id;
  }
  id(name) { const m = this.byName[name]; if (!m) throw new Error("no material " + name); return m.id; }
  texture() {
    const n = this.list.length, data = new Float32Array(5 * 4 * n);
    this.list.forEach((m, i) => {
      const o = i * 20;
      data.set([...m.albedo, m.rough], o);
      data.set([...m.emit, m.metal], o + 4);
      data.set([m.flags, m.pattern, m.group, 0], o + 8);
      data.set(m.p, o + 12);
      data.set([...m.tint, 0], o + 16);
    });
    const t = new THREE.DataTexture(data, 5, n, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true; return t;
  }
}

// ───────────────────────── geometry → one BVH ─────────────────────────
// parts: [{ geo: BufferGeometry, mat: id, m: Matrix4? }]
export function buildSet(parts) {
  const geos = [];
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (p.m) g.applyMatrix4(p.m);
    const n = g.attributes.position.count;
    g.setAttribute("matId", new THREE.BufferAttribute(new Float32Array(n).fill(p.mat), 1));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  const idx = new Uint32Array(merged.attributes.position.count); for (let i = 0; i < idx.length; i++) idx[i] = i;
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  const bvh = new MeshBVH(merged, { strategy: SAH, targetLeafSize: 6 });
  const s = new MeshBVHUniformStruct(); s.updateFrom(bvh);
  const nrm = new FloatVertexAttributeTexture(); nrm.updateFrom(merged.attributes.normal);
  const uv = new FloatVertexAttributeTexture(); uv.updateFrom(merged.attributes.uv);
  const mid = new FloatVertexAttributeTexture(); mid.updateFrom(merged.attributes.matId);
  return { bvh, struct: s, nrm, uv, mid, tris: idx.length / 3, geometry: merged };
}
export function disposeSet(S) { if (!S) return; S.struct.dispose(); S.nrm.dispose(); S.uv.dispose(); S.mid.dispose(); S.geometry.dispose(); }

// ───────────────────────── shaders ─────────────────────────
const VS = /* glsl */`
out vec2 vUv;
void main() { vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`;

const MAXL = 16;
const TRACE = /* glsl */`
precision highp float; precision highp int; precision highp sampler2D; precision highp usampler2D;
#define BVH_STACK_DEPTH 48
${BVHShaderGLSL.common_functions}
${BVHShaderGLSL.bvh_struct_definitions}
${BVHShaderGLSL.bvh_ray_functions}
#define PI 3.14159265359
#define MAXL ${MAXL}
uniform BVH bvh;
uniform sampler2D nrmTex, uvTex, midTex, matTex, decalA, decalE;
uniform float emitGain[8];
uniform vec3 decalCol[3]; uniform float decalGain[3]; uniform vec2 socC; uniform float socLevel, socR0, socR1;
uniform vec2 res; uniform int sampleIndex; uniform int seed;
uniform vec3 cO0, cO1; uniform mat3 cR0, cR1; uniform float tanHalf, aspect, aperture, focusDist;
uniform vec3 sunDir, sunE; uniform float sunCos;
uniform vec3 skyTop, skyHor, skyGround, glowCol; uniform float glowPow, skyGain, skyExp;
uniform int portalMode, maxBounce; uniform vec3 inMin, inMax;
bool inside(vec3 p) { return all(greaterThan(p, inMin)) && all(lessThan(p, inMax)); }
uniform int nL; uniform int lType[MAXL]; uniform vec3 lA[MAXL], lB[MAXL], lC[MAXL], lE[MAXL]; uniform float lCdf[MAXL];
uniform float clampInd;
layout(location = 0) out vec4 oCol;
layout(location = 1) out vec4 oAlb;
layout(location = 2) out vec4 oNrm;

uint rs;
uint pcg(inout uint s) { s = s * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd() { return float(pcg(rs) >> 8u) / 16777216.0; }
float lum(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
vec2 concentric(vec2 u) { u = 2. * u - 1.; if (u == vec2(0)) return u; float r, th; if (abs(u.x) > abs(u.y)) { r = u.x; th = PI / 4. * (u.y / u.x); } else { r = u.y; th = PI / 2. - PI / 4. * (u.x / u.y); } return r * vec2(cos(th), sin(th)); }
void basis(vec3 n, out vec3 t, out vec3 b) { float s = n.z >= 0. ? 1. : -1.; float a = -1. / (s + n.z); float c = n.x * n.y * a; t = vec3(1. + s * n.x * n.x * a, s * c, -s * n.x); b = vec3(c, s + n.y * n.y * a, -n.y); }
vec3 cosHemi(vec3 n) { vec2 d = concentric(vec2(rnd(), rnd())); float z = sqrt(max(0., 1. - dot(d, d))); vec3 t, b; basis(n, t, b); return normalize(t * d.x + b * d.y + n * z); }
vec3 coneDir(vec3 axis, float cmax) { float u = rnd(), v = rnd(); float c = 1. - u * (1. - cmax); float s = sqrt(max(0., 1. - c * c)); float p = 2. * PI * v; vec3 t, b; basis(axis, t, b); return normalize(t * cos(p) * s + b * sin(p) * s + axis * c); }

// value noise
float h31(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= .5; } return s; }

vec3 skyRad(vec3 d, bool withSun) {
  float h = d.y;
  vec3 c = h > 0. ? mix(skyHor, skyTop, pow(clamp(h, 0., 1.), skyExp)) : mix(skyHor, skyGround, clamp(-h * 4., 0., 1.));
  float g = max(dot(d, sunDir), 0.);
  c += glowCol * pow(g, glowPow) * smoothstep(-.15, .05, h);
  c *= skyGain;
  if (withSun && dot(d, sunDir) > sunCos) c += sunE / (2. * PI * (1. - sunCos));
  return c;
}

struct Mat { vec3 alb; float rough; vec3 emit; float metal; int flags; int pat; vec3 tint; };
Mat getMat(int id) {
  Mat m;
  vec4 a = texelFetch(matTex, ivec2(0, id), 0), b = texelFetch(matTex, ivec2(1, id), 0), c = texelFetch(matTex, ivec2(2, id), 0), e = texelFetch(matTex, ivec2(4, id), 0);
  m.alb = a.rgb; m.rough = a.a; m.emit = b.rgb * emitGain[int(c.z)]; m.metal = b.a; m.flags = int(c.x); m.pat = int(c.y); m.tint = e.rgb;
  return m;
}
vec4 matP(int id) { return texelFetch(matTex, ivec2(3, id), 0); }

// procedural surface patterns (world-space)
void pattern(inout Mat m, int id, vec3 P, vec3 N, vec2 uv) {
  vec4 p = matP(id);
  if (m.pat == 1) {            // wood planks along x (p.x plank width, p.y plank length)
    float w = p.x, L = p.y; float row = floor(P.z / w); float off = h31(vec3(row, 3., 7.)) * L;
    float col = floor((P.x + off) / L); float r = h31(vec3(row, col, 1.));
    float grain = fbm(vec3((P.x + off) * 2.5, P.z * 60., row * 7.)) ;
    float ring = sin((P.z * 90. + grain * 9.) ) * .5 + .5;
    vec3 tone = m.alb * mix(.78, 1.12, r) * mix(.86, 1.06, ring * .6 + grain * .4);
    float gapz = smoothstep(.0, .0025, abs(fract(P.z / w) * w - 0.)) * smoothstep(.0, .0025, abs(fract(P.z / w) * w - w));
    float gapx = smoothstep(.0, .002, abs(fract((P.x + off) / L) * L)) * smoothstep(.0, .002, abs(fract((P.x + off) / L) * L - L));
    m.alb = tone * mix(.45, 1., gapz * gapx); m.rough = mix(.62, .38, ring * .5 + r * .3);
  } else if (m.pat == 2) {     // plaster / paint: faint mottling
    float n = fbm(P * p.x); m.alb *= mix(.95, 1.03, n);
  } else if (m.pat == 3) {     // fabric weave
    float n = fbm(P * 40.) * .6 + .4 * (sin(P.x * 900.) * sin(P.y * 900.) * .5 + .5); m.alb *= mix(.86, 1.06, n); m.rough = .9;
  } else if (m.pat == 4) {     // PV module: cells + busbars in local uv (p.x cols, p.y rows)
    vec2 g = uv * p.xy; vec2 f = fract(g); float edge = step(.03, f.x) * step(f.x, .97) * step(.03, f.y) * step(f.y, .97);
    float bus = 1. - step(abs(f.x - .33), .006) - step(abs(f.x - .66), .006);
    m.alb = mix(vec3(.75), m.alb, edge * bus); m.rough = mix(.35, .12, edge); m.metal = 0.;
    float frame = step(.012, uv.x) * step(uv.x, .988) * step(.012, uv.y) * step(uv.y, .988); m.alb = mix(vec3(.55), m.alb, frame);
  } else if (m.pat == 5) {     // ground: grass / gravel mottling
    float n = fbm(P * p.x), n2 = fbm(P * p.x * 7.3); m.alb *= mix(.6, 1.2, n) * mix(.85, 1.1, n2); m.rough = .95;
  } else if (m.pat == 6) {     // concrete
    float n = fbm(P * 3.), n2 = vnoise(P * 60.); m.alb *= mix(.82, 1.08, n) * mix(.94, 1.04, n2);
  } else if (m.pat == 7) {     // rug: soft stripes
    float s = smoothstep(.45, .55, fract(P.x * p.x)); m.alb = mix(m.alb, m.alb * vec3(.82, .8, .76), s * .7); m.alb *= mix(.9, 1.05, fbm(P * 50.)); m.rough = .95;
  } else if (m.pat == 8) {     // brushed metal along y
    float n = vnoise(vec3(P.x * 400., P.y * 4., P.z * 400.)); m.rough = mix(m.rough * .7, m.rough * 1.3, n);
  } else if (m.pat == 9) {     // leaves: vary tone
    m.alb *= mix(.7, 1.15, h31(floor(P * 37.)));
  } else if (m.pat == 10) {    // abstract painting on the face uv: soft fields of earth colours
    vec2 q = uv * vec2(1.45, 1.);
    float n1 = fbm(vec3(q * 1.6, 3.1)), n2 = fbm(vec3(q * 2.3 + 7., 1.7)), n3 = fbm(vec3(q * 4. + 2., 9.));
    vec3 c = vec3(.86, .8, .7);
    c = mix(c, vec3(.62, .33, .2), smoothstep(.5, .56, n1));
    c = mix(c, vec3(.78, .6, .33), smoothstep(.55, .6, n2) * (1. - smoothstep(.5, .56, n1)));
    c = mix(c, vec3(.16, .15, .14), smoothstep(.62, .66, n3) * .9);
    c *= mix(.92, 1.04, vnoise(vec3(uv * 300., 1.)));
    m.alb = c;
  } else if (m.pat == 11) {    // vertical boards (cladding): per-board tone + dark joints, p.x board width
    float u = (abs(N.z) > abs(N.x) ? P.x : P.z) / p.x; float id = floor(u); float f = fract(u);
    float j = smoothstep(.0, .04, f) * smoothstep(1., .96, f);
    m.alb *= mix(.8, 1.15, h31(vec3(id, 2., 5.))) * mix(.35, 1., j) * mix(.9, 1.05, vnoise(vec3(id * 3., P.y * 8., 1.)));
  }
}

bool trace(vec3 ro, vec3 rd, out vec3 P, out vec3 N, out vec3 Ng, out vec2 uv, out int mid, out float dist) {
  uvec4 fi; vec3 fn, bc; float side; dist = 0.;
  bool hit = bvhIntersectFirstHit(bvh, ro, rd, fi, fn, bc, side, dist);
  if (!hit) return false;
  P = ro + rd * dist; Ng = fn;
  N = normalize(textureSampleBarycoord(nrmTex, bc, fi.xyz).xyz);
  if (dot(N, Ng) < 0.) N = -N;
  uv = textureSampleBarycoord(uvTex, bc, fi.xyz).xy;
  mid = int(texelFetch1D(midTex, fi.x).r + .5);
  return true;
}

// visibility along a segment: glass attenuates, lamp bodies (PROXY) never shadow
vec3 transmit(vec3 ro, vec3 rd, float maxT) {
  vec3 T = vec3(1);
  for (int i = 0; i < 4; i++) {
    vec3 P, N, Ng; vec2 uv; int mid; float d;
    if (!trace(ro, rd, P, N, Ng, uv, mid, d) || d >= maxT) return T;
    Mat m = getMat(mid);
    if ((m.flags & 3) == 0) return vec3(0);
    if ((m.flags & 1) != 0) T *= m.tint;
    ro = P + rd * 2e-3; maxT -= d + 2e-3;
  }
  return T;
}

float D_GGX(float a2, float nh) { float d = nh * nh * (a2 - 1.) + 1.; return a2 / (PI * d * d); }
float G_SmithJ(float a2, float nv, float nl) { float gv = nl * sqrt(nv * nv * (1. - a2) + a2); float gl = nv * sqrt(nl * nl * (1. - a2) + a2); return .5 / max(gv + gl, 1e-6); }
vec3 F_Schlick(vec3 f0, float c) { return f0 + (1. - f0) * pow(1. - c, 5.); }

// f·cos for light direction L (spec only for rough lobes: sharp lobes get their light from BSDF sampling)
vec3 evalBRDF(Mat m, vec3 N, vec3 V, vec3 L) {
  float nl = dot(N, L), nv = dot(N, V); if (nl <= 0. || nv <= 0.) return vec3(0);
  vec3 f0 = mix(vec3(.04), m.alb, m.metal);
  vec3 H = normalize(V + L); float vh = max(dot(V, H), 0.);
  vec3 F = F_Schlick(f0, vh);
  vec3 diff = (1. - m.metal) * m.alb / PI * (1. - F_Schlick(vec3(.04), nl).x);
  vec3 spec = vec3(0);
  if (m.rough >= .25) { float a = m.rough * m.rough, a2 = a * a; spec = D_GGX(a2, max(dot(N, H), 0.)) * G_SmithJ(a2, nv, nl) * F; }
  return (diff + spec) * nl;
}

vec3 sampleGGX(vec3 N, float a) {
  float u = rnd(), v = rnd(); float a2 = a * a;
  float ct = sqrt((1. - u) / (1. + (a2 - 1.) * u)), st = sqrt(1. - ct * ct), ph = 2. * PI * v;
  vec3 t, b; basis(N, t, b); return normalize(t * cos(ph) * st + b * sin(ph) * st + N * ct);
}

// one light, picked by power
vec3 directLight(Mat m, vec3 P, vec3 N, vec3 V) {
  if (nL == 0) return vec3(0);
  float u = rnd(); int k = 0; float prev = 0.;
  for (int i = 0; i < MAXL; i++) { if (i >= nL) break; k = i; if (u <= lCdf[i]) break; prev = lCdf[i]; }
  float pk = lCdf[k] - prev; if (pk <= 0.) return vec3(0);
  vec3 L; float dist; vec3 Le;
  vec3 o = P + N * 1.5e-3;
  if (lType[k] == 0) {                       // sun
    L = coneDir(sunDir, sunCos); dist = 1e5;
    float nl = dot(N, L); if (nl <= 0.) return vec3(0);
    Le = sunE;                               // irradiance-normalised: radiance × solid angle
  } else if (lType[k] == 1 || lType[k] == 2) { // rect emitter / sky portal: lA centre, lB half-u, lC half-v
    if (lType[k] == 2 && !inside(P)) return vec3(0);
    vec3 q = lA[k] + lB[k] * (2. * rnd() - 1.) + lC[k] * (2. * rnd() - 1.);
    vec3 d = q - o; dist = length(d); L = d / dist;
    vec3 nlv = cross(lB[k], lC[k]); float area = 4. * length(nlv); nlv = normalize(nlv);
    float cl = abs(dot(nlv, L)); if (cl < 1e-4 || dot(N, L) <= 0.) return vec3(0);
    vec3 rad = lType[k] == 1 ? lE[k] : skyRad(L, false) * lE[k];
    Le = rad * area * cl / (dist * dist);
    dist -= 2e-3;
  } else {                                   // sphere: lA centre, lB.x radius
    vec3 d = lA[k] - o; float dc = length(d); float r = lB[k].x; if (dc <= r) return vec3(0);
    float cmax = sqrt(max(0., 1. - r * r / (dc * dc)));
    L = coneDir(d / dc, cmax); if (dot(N, L) <= 0.) return vec3(0);
    Le = lE[k] * 2. * PI * (1. - cmax);
    dist = dc - r;
  }
  vec3 f = evalBRDF(m, N, V, L); if (f == vec3(0)) return vec3(0);
  vec3 vis = transmit(o, L, dist); if (vis == vec3(0)) return vec3(0);
  return f * Le * vis / pk;
}

void main() {
  rs = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uint(sampleIndex) * 26699u + uint(seed) * 1117u;
  pcg(rs); rs ^= uint(sampleIndex) * 0x9E3779B9u; pcg(rs);
  vec2 px = gl_FragCoord.xy - .5 + vec2(rnd(), rnd());
  vec2 ndc = px / res * 2. - 1.;
  float tm = rnd();
  vec3 O = mix(cO0, cO1, tm); mat3 R = cR0 * (1. - tm) + cR1 * tm;
  vec3 dc = normalize(vec3(ndc.x * tanHalf * aspect, ndc.y * tanHalf, -1.));
  vec3 fp = dc * (focusDist / -dc.z);
  vec3 lens = vec3(concentric(vec2(rnd(), rnd())) * aperture, 0.);
  vec3 ro = O + R * lens, rd = normalize(R * normalize(fp - lens));

  vec3 Lo = vec3(0), T = vec3(1);
  bool spec = true;          // previous bounce was a camera ray / sharp lobe
  bool first = true; vec3 a0 = vec3(1); vec3 n0 = -rd; float d0 = 1e4, travel = 0.;
  for (int b = 0; b < 12; b++) {
    if (b > maxBounce) break;
    vec3 P, N, Ng; vec2 uv; int mid; float dist;
    if (!trace(ro, rd, P, N, Ng, uv, mid, dist)) {
      vec3 s = (portalMode == 1 && !spec && inside(ro)) ? vec3(0) : skyRad(rd, spec);
      vec3 c = T * s; if (b > 0) c = min(c, vec3(clampInd));
      Lo += c;
      if (first) { a0 = vec3(1); n0 = -rd; d0 = 1e4; first = false; }
      break;
    }
    travel += dist;
    Mat m = getMat(mid);
    if ((m.flags & 1) != 0) {              // thin glass: reflect or pass straight through
      float c = abs(dot(rd, N)); float Fr = F_Schlick(vec3(.04), c).x;
      if (rnd() < Fr) { rd = reflect(rd, N); ro = P + rd * 2e-3; }
      else { T *= m.tint; ro = P + rd * 2e-3; }
      continue;
    }
    pattern(m, mid, P, N, uv);
    if ((m.flags & 4) != 0) {             // product decal: print + LED channels
      // explicit LOD from the ray footprint (implicit derivatives are meaningless inside the path loop)
      float lod = clamp(log2(max(travel, 1e-3) * 2. * tanHalf / res.y / (.2 / 1024.)), 0., 7.);
      vec4 da = textureLod(decalA, uv, lod); m.alb = mix(m.alb, da.rgb, da.a); m.rough = mix(m.rough, .55, da.a * .5);
      vec4 de = textureLod(decalE, uv, lod);
      vec2 q = (uv - socC) * vec2(2.5, 1.); float ang = atan(q.y, q.x); float seg = floor(mod(PI * .5 - ang, 2. * PI) / (2. * PI) * 8.);
      float socLit = seg < socLevel * 8. - .01 ? 1. : .0;
      m.emit += decalCol[0] * decalGain[0] * de.r + decalCol[1] * decalGain[1] * de.g * socLit + decalCol[2] * decalGain[2] * de.b;
    }
    vec3 V = -rd;
    if (m.emit != vec3(0) && (spec || (m.flags & 2) == 0)) { vec3 c = T * m.emit; if (b > 0) c = min(c, vec3(clampInd)); Lo += c; }
    if (first) { a0 = mix(m.alb, vec3(.5 + .5 * m.alb), m.metal); if (lum(m.emit) > lum(a0)) a0 = vec3(1); n0 = N; d0 = travel; first = false; }
    if ((m.flags & 2) != 0) break;        // lamp bodies end the path
    // direct light
    vec3 dl = T * directLight(m, P, N, V); if (b > 0) dl = min(dl, vec3(clampInd));
    Lo += dl;
    // continue the path
    vec3 f0 = mix(vec3(.04), m.alb, m.metal);
    float ps = m.metal > .5 ? 1. : clamp(mix(.06, .5, 1. - m.rough), .04, .6);
    vec3 L;
    if (rnd() < ps) {
      float a = max(m.rough * m.rough, .002);
      vec3 H = sampleGGX(N, a); L = reflect(-V, H);
      if (dot(L, N) <= 0. || dot(L, Ng) <= 0.) break;
      float vh = max(dot(V, H), 0.);
      vec3 Fs = F_Schlick(f0, vh);
      float nv = max(dot(N, V), 1e-4), nl = max(dot(N, L), 1e-4), nh = max(dot(N, H), 1e-4);
      float a2 = a * a;
      // weight = f·cos/pdf = F·G·vh / (nv·nh) for the visible-normal-free GGX sampling
      T *= Fs * G_SmithJ(a2, nv, nl) * 4. * nl * vh / nh / ps;
      spec = m.rough < .25;
      if (!spec) { /* rough spec already in NEE → this path continues only for indirect light */ }
    } else {
      L = cosHemi(N); if (dot(L, Ng) <= 0.) break;
      T *= (1. - m.metal) * m.alb / (1. - ps);
      spec = false;
    }
    ro = P + Ng * 1.5e-3; rd = L;
    if (b >= 2) { float q = clamp(max(T.r, max(T.g, T.b)), .05, .95); if (rnd() > q) break; T /= q; }
  }
  uvec3 eb = floatBitsToUint(Lo) & 0x7f800000u;                 // exponent all ones = NaN or Inf (isnan() is optimised away by D3D)
  if (any(equal(eb, uvec3(0x7f800000u)))) Lo = vec3(0);
  Lo = max(Lo, vec3(0));
  Lo = min(Lo, vec3(200.));
  oCol = vec4(Lo, lum(Lo) * lum(Lo));
  oAlb = vec4(a0, d0);
  oNrm = vec4(n0, 1.);
}`;

// à-trous step (demodulated irradiance, guided by albedo / normal / depth / variance)
const ATROUS = /* glsl */`
precision highp float;
uniform sampler2D col, gb, nb; uniform vec2 res; uniform int stepw; uniform float sz, sn, sl;
in vec2 vUv; out vec4 o;
void main() {
  vec2 px = 1. / res; vec4 c0 = texture(col, vUv); vec4 g0 = texture(gb, vUv); vec3 n0 = texture(nb, vUv).xyz; n0 = dot(n0, n0) > 1e-8 ? normalize(n0) : vec3(0, 0, 1); float l0 = dot(c0.rgb, vec3(.2126, .7152, .0722));
  float sd = sqrt(max(c0.a, 0.)) + .04 * l0 + 1e-3;           // + a relative floor: a few % of luminance is never an "edge"
  float k[3] = float[3](3. / 8., 1. / 4., 1. / 16.);
  vec3 acc = vec3(0); float wsum = 0., vacc = 0.;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 uv = vUv + vec2(x, y) * float(stepw) * px;
    vec4 c = texture(col, uv); vec4 g = texture(gb, uv); vec3 n = texture(nb, uv).xyz; n = dot(n, n) > 1e-8 ? normalize(n) : vec3(0, 0, 1);
    float l = dot(c.rgb, vec3(.2126, .7152, .0722));
    float w = k[abs(x)] * k[abs(y)];
    w *= exp(-abs(g.a - g0.a) / (sz * max(g0.a, .05) * float(stepw) + 1e-4));
    w *= pow(max(dot(n, n0), 0.), sn);
    w *= exp(-length(g.rgb - g0.rgb) * 6.);
    w *= exp(-abs(l - l0) / (sl * sd + 1e-3));
    acc += c.rgb * w; vacc += w * w * c.a; wsum += w;
  }
  wsum = max(wsum, 1e-6);
  vec4 r = vec4(acc / wsum, min(vacc / (wsum * wsum), 1e4));
  if (any(isnan(r)) || any(isinf(r))) r = c0;
  o = r;
}`;

const RESOLVE = /* glsl */`
precision highp float;
uniform sampler2D acc, alb, nrm; uniform float invN, N_;
in vec2 vUv;
layout(location = 0) out vec4 oD;   // demodulated light, variance of the mean (luminance)
layout(location = 1) out vec4 oG;   // albedo, depth
float varAt(ivec2 p) {
  vec4 c = texelFetch(acc, p, 0) * invN; vec3 A = max(texelFetch(alb, p, 0).rgb * invN, vec3(.03));
  float l = dot(c.rgb, vec3(.2126, .7152, .0722)); float la = max(dot(A, vec3(.2126, .7152, .0722)), .03);
  return max(c.a - l * l, 0.) / max(N_ - 1., 1.) / (la * la);
}
void main() {
  vec4 c = texture(acc, vUv) * invN; vec4 a = texture(alb, vUv) * invN;
  vec3 A = max(a.rgb, vec3(.03));
  ivec2 p = ivec2(gl_FragCoord.xy), sz = textureSize(acc, 0) - 1;
  float v = 0., ws = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { float w = (x == 0 ? 2. : 1.) * (y == 0 ? 2. : 1.); v += w * varAt(clamp(p + ivec2(x, y), ivec2(0), sz)); ws += w; }
  oD = vec4(c.rgb / A, v / ws);
  oG = vec4(a.rgb, a.a);
}`;

const FINAL = /* glsl */`
precision highp float;
uniform sampler2D den, gb, bloom; uniform float exposure, bloomGain, sat, contrast, vig, mixRaw; uniform sampler2D raw; uniform float invN;
uniform vec3 lift, gain; uniform vec2 res; uniform float grain, frameSeed;
in vec2 vUv; out vec4 o;
${THREE.ShaderChunk.tonemapping_pars_fragment.replace("uniform float toneMappingExposure;", "float toneMappingExposure = 1.;")}
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 A = max(texture(gb, vUv).rgb, vec3(.03));
  vec3 c = texture(den, vUv).rgb * A;
  c = mix(c, texture(raw, vUv).rgb * invN, mixRaw);
  c += texture(bloom, vUv).rgb * bloomGain;
  c *= exposure;
  c = AgXToneMapping(c);                 // → linear sRGB in 0..1
  c = mix(c * 12.92, 1.055 * pow(max(c, 0.), vec3(1. / 2.4)) - .055, step(.0031308, c));   // sRGB encode
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(vec3(l), c, sat);
  c = clamp((c - .5) * contrast + .5, 0., 1.);
  c = c * gain + lift * (1. - c);
  vec2 q = vUv - .5; c *= 1. - vig * dot(q * vec2(1., 1.25), q * vec2(1., 1.25)) * 1.6;
  float gr = h12(gl_FragCoord.xy + frameSeed * 17.31) + h12(gl_FragCoord.yx * 1.37 + frameSeed * 3.7) - 1.;
  c += gr * grain * (1.1 - l);
  c += (h12(gl_FragCoord.xy) - .5) / 255.;
  o = vec4(c, 1.);
}`;

const BRIGHT = /* glsl */`
precision highp float; uniform sampler2D src; uniform float thr; uniform sampler2D gb; uniform float useA; in vec2 vUv; out vec4 o;
void main() { vec3 c = texture(src, vUv).rgb; if (useA > .5) c *= max(texture(gb, vUv).rgb, vec3(.03)); float l = dot(c, vec3(.2126, .7152, .0722)); o = vec4(c * smoothstep(thr, thr * 2., l), 1.); }`;
const BLUR = /* glsl */`
precision highp float; uniform sampler2D src; uniform vec2 dir; in vec2 vUv; out vec4 o;
void main() { vec3 c = vec3(0); float w[5] = float[5](.227027, .1945946, .1216216, .054054, .016216);
  c += texture(src, vUv).rgb * w[0]; for (int i = 1; i < 5; i++) { c += texture(src, vUv + dir * float(i)).rgb * w[i]; c += texture(src, vUv - dir * float(i)).rgb * w[i]; } o = vec4(c, 1.); }`;
const COMPOSE = /* glsl */`
precision highp float; uniform sampler2D a, b; uniform float k, fade; uniform vec3 fadeCol; in vec2 vUv; out vec4 o;
void main() { vec3 c = mix(texture(a, vUv).rgb, texture(b, vUv).rgb, k); c = mix(c, fadeCol, fade); o = vec4(c, 1.); }`;
const COPYADD = /* glsl */`
precision highp float; uniform sampler2D a, b; uniform float wb; in vec2 vUv; out vec4 o; void main() { o = vec4(texture(a, vUv).rgb + texture(b, vUv).rgb * wb, 1.); }`;

// ───────────────────────── the tracer ─────────────────────────
export class PathTracer {
  constructor(canvas, W, H) {
    this.W = W; this.H = H;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    r.setPixelRatio(1); r.setSize(W, H, false); r.autoClear = false;
    const gl = r.getContext();
    if (!gl.getExtension("EXT_float_blend")) console.warn("EXT_float_blend missing");
    gl.getExtension("EXT_color_buffer_float");
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    this.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "?";
    this.gl = gl;
    const rt = (opts = {}) => new THREE.WebGLRenderTarget(W, H, Object.assign({ type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false }, opts));
    this.acc = rt({ count: 3 });
    this.res = rt({ count: 2 });
    this.tA = rt(); this.tB = rt();
    const half = (d) => new THREE.WebGLRenderTarget(W >> d, H >> d, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.bl = [1, 2, 3, 4].map((d) => [half(d), half(d)]);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    const sm = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial(Object.assign({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false }, extra));
    const L = [...Array(MAXL)];
    this.u = {
      bvh: { value: null }, nrmTex: { value: null }, uvTex: { value: null }, midTex: { value: null }, matTex: { value: null },
      decalA: { value: null }, decalE: { value: null },
      emitGain: { value: [1, 1, 1, 1, 1, 1, 1, 1] },
      decalCol: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, .1, .05)] }, decalGain: { value: [0, 0, 0] },
      socC: { value: new THREE.Vector2(.5, .5) }, socLevel: { value: 0 }, socR0: { value: 0 }, socR1: { value: 0 },
      res: { value: new THREE.Vector2(W, H) }, sampleIndex: { value: 0 }, seed: { value: 1 },
      cO0: { value: new THREE.Vector3() }, cO1: { value: new THREE.Vector3() }, cR0: { value: new THREE.Matrix3() }, cR1: { value: new THREE.Matrix3() },
      tanHalf: { value: .5 }, aspect: { value: W / H }, aperture: { value: 0 }, focusDist: { value: 3 },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunE: { value: new THREE.Vector3() }, sunCos: { value: Math.cos(.0047 * 2) },
      skyTop: { value: new THREE.Vector3(.2, .3, .5) }, skyHor: { value: new THREE.Vector3(.5, .5, .5) }, skyGround: { value: new THREE.Vector3(.1, .1, .1) },
      glowCol: { value: new THREE.Vector3() }, glowPow: { value: 8 }, skyGain: { value: 1 }, skyExp: { value: .55 },
      portalMode: { value: 0 }, maxBounce: { value: 4 }, clampInd: { value: 12 }, inMin: { value: new THREE.Vector3(-1e9, -1e9, -1e9) }, inMax: { value: new THREE.Vector3(1e9, 1e9, 1e9) },
      nL: { value: 0 }, lType: { value: L.map(() => 0) }, lA: { value: L.map(() => new THREE.Vector3()) }, lB: { value: L.map(() => new THREE.Vector3()) },
      lC: { value: L.map(() => new THREE.Vector3()) }, lE: { value: L.map(() => new THREE.Vector3()) }, lCdf: { value: L.map(() => 1) },
    };
    this.mTrace = sm(TRACE, this.u, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, transparent: true });
    this.mResolve = sm(RESOLVE, { acc: { value: null }, alb: { value: null }, nrm: { value: null }, invN: { value: 1 }, N_: { value: 1 } });
    this.mAtrous = sm(ATROUS, { col: { value: null }, gb: { value: null }, nb: { value: null }, res: { value: new THREE.Vector2(W, H) }, stepw: { value: 1 }, sz: { value: .02 }, sn: { value: 64 }, sl: { value: 4 } });
    this.mFinal = sm(FINAL, { den: { value: null }, gb: { value: null }, bloom: { value: null }, raw: { value: null }, invN: { value: 1 }, mixRaw: { value: 0 }, exposure: { value: 1 }, bloomGain: { value: .06 }, sat: { value: 1 }, contrast: { value: 1 }, vig: { value: .25 },
      lift: { value: new THREE.Vector3(0, 0, 0) }, gain: { value: new THREE.Vector3(1, 1, 1) }, res: { value: new THREE.Vector2(W, H) }, grain: { value: .012 }, frameSeed: { value: 0 } });
    this.mBright = sm(BRIGHT, { src: { value: null }, thr: { value: 1 }, gb: { value: null }, useA: { value: 1 } });
    this.mBlur = sm(BLUR, { src: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mAdd = sm(COPYADD, { a: { value: null }, b: { value: null }, wb: { value: 1 } });
    this.mCompose = sm(COMPOSE, { a: { value: null }, b: { value: null }, k: { value: 0 }, fade: { value: 0 }, fadeCol: { value: new THREE.Vector3() } });
    const ldr = () => new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    this.outA = ldr(); this.outB = ldr();
    this.post = { exposure: 1, bloomGain: .06, bloomThr: 1.2, sat: 1, contrast: 1, vig: .25, lift: [0, 0, 0], gain: [1, 1, 1], atrous: 5, sz: .02, sn: 64, sl: 4, mixRaw: 0 };
  }
  setSet(S, mats) {
    this.S = S;
    this.u.bvh.value = S.struct; this.u.nrmTex.value = S.nrm; this.u.uvTex.value = S.uv; this.u.midTex.value = S.mid;
    if (mats) { if (this.u.matTex.value) this.u.matTex.value.dispose(); this.u.matTex.value = mats.texture(); }
  }
  setDecal(a, e) { this.u.decalA.value = a; this.u.decalE.value = e; }
  // cam: { pos:[x,y,z], target:[x,y,z], up?, fov (deg, vertical), aperture (m), focus (m) } for shutter open and close
  setCamera(c0, c1) {
    const put = (c, O, R) => {
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...c.pos), new THREE.Vector3(...c.target), new THREE.Vector3(...(c.up || [0, 1, 0])));
      if (c.roll) m.multiply(new THREE.Matrix4().makeRotationZ(c.roll));
      O.set(...c.pos); R.setFromMatrix4(m);
    };
    put(c0, this.u.cO0.value, this.u.cR0.value); put(c1 || c0, this.u.cO1.value, this.u.cR1.value);
    this.u.tanHalf.value = Math.tan(THREE.MathUtils.degToRad(c0.fov || 40) / 2);
    this.u.aperture.value = c0.aperture || 0; this.u.focusDist.value = c0.focus || 3;
  }
  // env: { sunDir, sunE:[rgb], sunAngle(rad), skyTop, skyHor, skyGround, glowCol, glowPow, skyGain, portal }
  setEnv(e) {
    const u = this.u, v3 = (a) => new THREE.Vector3(...a);
    u.sunDir.value.copy(v3(e.sunDir || [0, 1, 0]).normalize()); u.sunE.value.set(...(e.sunE || [0, 0, 0])); u.sunCos.value = Math.cos(e.sunAngle || .0093);
    u.skyTop.value.set(...(e.skyTop || [0, 0, 0])); u.skyHor.value.set(...(e.skyHor || [0, 0, 0])); u.skyGround.value.set(...(e.skyGround || [0, 0, 0]));
    u.glowCol.value.set(...(e.glowCol || [0, 0, 0])); u.glowPow.value = e.glowPow || 8; u.skyGain.value = e.skyGain ?? 1; u.skyExp.value = e.skyExp ?? .55; u.portalMode.value = e.portal ? 1 : 0;
    u.maxBounce.value = e.bounces ?? 4; u.clampInd.value = e.clamp ?? 12;
    u.inMin.value.set(...(e.inMin || [-1e9, -1e9, -1e9])); u.inMax.value.set(...(e.inMax || [1e9, 1e9, 1e9]));
  }
  // lights: [{type:'sun'} | {type:'rect', c, u, v, E} | {type:'portal', c, u, v, E(tint)} | {type:'sphere', c, r, E}], power weights w
  setLights(list) {
    const u = this.u; const n = Math.min(list.length, MAXL); let sum = 0; const w = list.map((l) => l.w ?? 1);
    for (let i = 0; i < n; i++) sum += w[i];
    let cum = 0;
    for (let i = 0; i < MAXL; i++) {
      const l = list[i];
      if (i < n) { cum += w[i] / sum; u.lCdf.value[i] = i === n - 1 ? 1 : cum; } else u.lCdf.value[i] = 2;
      if (!l || i >= n) continue;
      u.lType.value[i] = { sun: 0, rect: 1, portal: 2, sphere: 3 }[l.type];
      if (l.type === "rect" || l.type === "portal") { u.lA.value[i].set(...l.c); u.lB.value[i].set(...l.u); u.lC.value[i].set(...l.v); }
      if (l.type === "sphere") { u.lA.value[i].set(...l.c); u.lB.value[i].set(l.r, 0, 0); }
      u.lE.value[i].set(...(l.E || [1, 1, 1]));
    }
    u.nL.value = n;
  }
  draw(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.scene, this.cam); }
  // render N samples (async: syncs with the GPU every few passes so no single GPU task gets long)
  async render(N, { seed = 1, sync = 2, yieldMs = 0 } = {}) {
    const r = this.renderer;
    r.setRenderTarget(this.acc); r.setClearColor(0x000000, 0); r.clear(true, false, false);
    const px = new Float32Array(4);
    for (let i = 0; i < N; i++) {
      this.u.sampleIndex.value = i; this.u.seed.value = seed;
      this.draw(this.mTrace, this.acc);
      if ((i + 1) % sync === 0 || i === N - 1) { r.readRenderTargetPixels(this.acc, 0, 0, 1, 1, px); await new Promise((res) => setTimeout(res, yieldMs)); }
    }
    this.N = N;
  }
  resolve(target = null) {
    const p = this.post, N = this.N;
    const mr = this.mResolve.uniforms;
    mr.acc.value = this.acc.textures[0]; mr.alb.value = this.acc.textures[1]; mr.nrm.value = this.acc.textures[2]; mr.invN.value = 1 / N; mr.N_.value = N;
    this.draw(this.mResolve, this.res);
    // normals: accumulated sum → the à-trous only needs the direction
    const ma = this.mAtrous.uniforms; ma.gb.value = this.res.textures[1]; ma.nb.value = this.acc.textures[2]; ma.sz.value = p.sz; ma.sn.value = p.sn; ma.sl.value = p.sl;
    let src = this.res.textures[0], tgt = this.tA;
    for (let i = 0; i < p.atrous; i++) { ma.col.value = src; ma.stepw.value = 1 << i; this.draw(this.mAtrous, tgt); src = tgt.texture; tgt = tgt === this.tA ? this.tB : this.tA; }
    const den = src;
    // bloom from the remodulated image
    const mb = this.mBright.uniforms; mb.src.value = den; mb.gb.value = this.res.textures[1]; mb.thr.value = p.bloomThr; mb.useA.value = 1;
    this.draw(this.mBright, this.bl[0][0]);
    let prev = this.bl[0][0];
    for (let i = 0; i < this.bl.length; i++) {
      const [a, b] = this.bl[i];
      if (i > 0) { this.mAdd.uniforms.a.value = prev.texture; this.mAdd.uniforms.b.value = prev.texture; this.mAdd.uniforms.wb.value = 0; this.draw(this.mAdd, a); }
      const w = a.width, h = a.height;
      this.mBlur.uniforms.src.value = a.texture; this.mBlur.uniforms.dir.value.set(1.5 / w, 0); this.draw(this.mBlur, b);
      this.mBlur.uniforms.src.value = b.texture; this.mBlur.uniforms.dir.value.set(0, 1.5 / h); this.draw(this.mBlur, a);
      prev = a;
    }
    // sum the bloom levels into level 0
    for (let i = this.bl.length - 1; i > 0; i--) { this.mAdd.uniforms.a.value = this.bl[i - 1][0].texture; this.mAdd.uniforms.b.value = this.bl[i][0].texture; this.mAdd.uniforms.wb.value = 1; this.draw(this.mAdd, this.bl[i - 1][1]); this.mBlur.uniforms.src.value = this.bl[i - 1][1].texture; this.mBlur.uniforms.dir.value.set(0, 0); this.draw(this.mBlur, this.bl[i - 1][0]); }
    const mf = this.mFinal.uniforms;
    mf.den.value = den; mf.gb.value = this.res.textures[1]; mf.bloom.value = this.bl[0][0].texture; mf.raw.value = this.acc.textures[0]; mf.invN.value = 1 / N; mf.mixRaw.value = p.mixRaw;
    mf.exposure.value = p.exposure; mf.bloomGain.value = p.bloomGain; mf.sat.value = p.sat; mf.contrast.value = p.contrast; mf.vig.value = p.vig;
    mf.lift.value.set(...p.lift); mf.gain.value.set(...p.gain); mf.grain.value = p.grain ?? .012; mf.frameSeed.value = p.frameSeed || 0;
    this.draw(this.mFinal, target);
  }
  // put the resolved image(s) on the canvas: a (and b with weight k), then a fade towards fadeCol
  compose(a, b = null, k = 0, fade = 0, fadeCol = [0, 0, 0]) {
    const u = this.mCompose.uniforms; u.a.value = a.texture; u.b.value = (b || a).texture; u.k.value = b ? k : 0; u.fade.value = fade; u.fadeCol.value.set(...fadeCol);
    this.draw(this.mCompose, null);
  }
}
