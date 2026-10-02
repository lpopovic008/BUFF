"use client";

import { useEffect, useRef, useState } from "react";
import {
  FOCAL,
  MAP_H,
  MAP_W,
  MapCamera,
  MapView,
  OUTLINE_POINTS,
  RISE_PER_METER,
  SLAB_HEIGHT,
  STATE_LINE_POLYLINES,
} from "@/lib/map-perspective";
import { Heightfield, loadHeightfield } from "@/lib/us-heightfield";
import { US_SIMPLE_OUTLINE_PATH } from "@/lib/warroom-team-cities";

// Line widths, in map units at the map's middle — scaled by perspective and zoom like everything else.
const STATE_LINE_WIDTH = 0.38;
const BORDER_WIDTH = 0.38;
// The US mask's resolution, texels per map unit.
const MASK_SCALE = 4;
// Light from the northwest, high in the sky — the usual hillshade convention.
const LIGHT = (() => {
  const v = [-0.55, -0.55, 0.63];
  const n = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / n);
})();

// The camera, mirrored from map-perspective.ts's cameraTransform — keep in step.
const CAMERA_GLSL = /* glsl */ `
uniform vec4 uCam;      // sin tilt, cos tilt, sin yaw, cos yaw
uniform vec4 uView;     // projected-space rect the canvas shows: x, y, w, h
uniform sampler2D uHeight;
uniform vec2 uHfSize;   // texels
uniform float uRes;     // map units per texel
const vec2 MAP = vec2(${MAP_W.toFixed(1)}, ${MAP_H.toFixed(1)});
const float FOCAL = ${FOCAL.toFixed(1)};
const float SLAB = ${SLAB_HEIGHT.toFixed(1)};
const float RISE = ${RISE_PER_METER.toFixed(6)};

float elevation(vec2 p) {
  return textureLod(uHeight, (p / uRes + 0.5) / uHfSize, 0.0).r;
}

// xy: projected position, z: depth (larger is farther), w: perspective scale.
vec4 project(vec2 p, float h) {
  vec2 c = MAP * 0.5;
  vec2 d = p - c;
  float rx = c.x + d.x * uCam.w - d.y * uCam.z;
  float ry = c.y + d.x * uCam.z + d.y * uCam.w;
  float back = MAP.y - ry;
  float up = back * uCam.y + h * uCam.x;
  float depth = back * uCam.x - h * uCam.y;
  float s = FOCAL / (FOCAL + depth);
  return vec4(c.x + (rx - c.x) * s, MAP.y - up * s, depth, s);
}

vec4 toClip(vec4 pr) {
  vec2 ndc = vec2((pr.x - uView.x) / uView.z * 2.0 - 1.0, 1.0 - (pr.y - uView.y) / uView.w * 2.0);
  return vec4(ndc, clamp((pr.z + 400.0) / 1000.0, 0.0, 1.0) * 2.0 - 1.0, 1.0);
}
`;

// Slope lighting is worked out per vertex (one vertex per heightfield texel,
// so nothing is lost) and interpolated, keeping the per-pixel work to a mask
// lookup and a blend.
const TERRAIN_VS = /* glsl */ `#version 300 es
in vec2 aPos;
${CAMERA_GLSL}
uniform vec3 uLight;
uniform float uRelief;
out vec2 vPos;
out float vElev;
out float vShade;
void main() {
  vElev = elevation(aPos);
  vPos = aPos;
  float dzdx = (elevation(aPos + vec2(uRes, 0.0)) - elevation(aPos - vec2(uRes, 0.0))) * RISE / (2.0 * uRes);
  float dzdy = (elevation(aPos + vec2(0.0, uRes)) - elevation(aPos - vec2(0.0, uRes))) * RISE / (2.0 * uRes);
  // Lit as if the relief were half as steep as drawn: the vertical
  // exaggeration that makes the mountains read would otherwise shade every
  // basin near-black.
  vec3 n = normalize(vec3(-dzdx * 0.5, -dzdy * 0.5, 1.0));
  float lambert = max(dot(n, uLight), 0.0);
  vShade = clamp(1.0 + uRelief * (lambert - uLight.z), 0.6, 1.3);
  gl_Position = toClip(project(aPos, SLAB + vElev * RISE));
}`;

const TERRAIN_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vPos;
in float vElev;
in float vShade;
uniform sampler2D uMask;
uniform vec3 uLand;
uniform vec3 uPeak;
uniform float uPeakElev;
const vec2 MAP = vec2(${MAP_W.toFixed(1)}, ${MAP_H.toFixed(1)});
out vec4 outColor;
void main() {
  if (texture(uMask, vPos / MAP).r < 0.5) discard;
  vec3 base = mix(uLand, uPeak, pow(clamp(vElev / uPeakElev, 0.0, 1.0), 0.8));
  outColor = vec4(min(base * vShade, vec3(1.0)), 1.0);
}`;

const WALL_VS = /* glsl */ `#version 300 es
in vec2 aPos;
in float aTop;
${CAMERA_GLSL}
void main() {
  float hgt = aTop > 0.5 ? SLAB + elevation(aPos) * RISE : 0.0;
  gl_Position = toClip(project(aPos, hgt));
}`;

const FLAT_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = vec4(uColor.rgb * uColor.a, uColor.a); }`;

// One quad per line segment, expanded in screen space so the width holds at
// any angle; `uOutward` keeps it all on the segment's outward side (the
// national border, which must never eat into small coastal states).
const LINE_VS = /* glsl */ `#version 300 es
in vec2 aCorner;  // x: 0 at A, 1 at B; y: across the line
in vec2 aA;
in vec2 aB;
in vec2 aN;       // outward normal (border only)
${CAMERA_GLSL}
uniform vec2 uCanvasPx;
uniform float uWidth;
uniform bool uOutward;
void main() {
  float lift = 0.05;
  vec4 pa = project(aA, SLAB + elevation(aA) * RISE + lift);
  vec4 pb = project(aB, SLAB + elevation(aB) * RISE + lift);
  vec4 ca = toClip(pa);
  vec4 cb = toClip(pb);
  vec2 halfPx = uCanvasPx * 0.5;
  vec2 sa = ca.xy * halfPx;
  vec2 sb = cb.xy * halfPx;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float side = 1.0;
  float across = aCorner.y - 0.5;
  if (uOutward) {
    vec2 so = toClip(project(aA + aN * 0.5, SLAB + elevation(aA) * RISE + lift)).xy * halfPx;
    side = dot(so - sa, nrm) >= 0.0 ? 1.0 : -1.0;
    across = aCorner.y;
  }
  vec4 base = mix(ca, cb, aCorner.x);
  float s = mix(pa.w, pb.w, aCorner.x);
  float widthPx = max(1.0, uWidth * s * uCanvasPx.x / uView.z);
  vec2 off = nrm * side * across * widthPx;
  gl_Position = vec4(base.xy + off / halfPx, base.z - 0.002, 1.0);
}`;

function compileProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
  return program;
}

/** The US outline rasterized to a mask: 255 on land, 0 off it. */
function rasterizeMask(): { data: Uint8Array; width: number; height: number } {
  const width = MAP_W * MASK_SCALE;
  const height = MAP_H * MASK_SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.scale(MASK_SCALE, MASK_SCALE);
  ctx.fillStyle = "#fff";
  ctx.fill(new Path2D(US_SIMPLE_OUTLINE_PATH));
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3];
  return { data, width, height };
}

/** Splits a polyline's segments so none is longer than `step` — lines follow the terrain between their corners. */
function densify(points: number[], step: number, closed: boolean): number[][] {
  const segs: number[][] = [];
  const n = points.length / 2;
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const ax = points[i * 2];
    const ay = points[i * 2 + 1];
    const bx = points[((i + 1) % n) * 2];
    const by = points[((i + 1) % n) * 2 + 1];
    const parts = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < parts; k++) {
      segs.push([ax + ((bx - ax) * k) / parts, ay + ((by - ay) * k) / parts, ax + ((bx - ax) * (k + 1)) / parts, ay + ((by - ay) * (k + 1)) / parts]);
    }
  }
  return segs;
}

/** Parses a CSS color (hex, rgb(), rgba()) into linear-ish 0..1 RGBA. */
function parseColor(css: string): [number, number, number, number] {
  const c = css.trim();
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const v = parseInt(hex[1], 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, 1];
  }
  const rgb = c.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const [r, g, b, a = "1"] = rgb[1].split(/[,\s/]+/).filter(Boolean);
    return [Number(r) / 255, Number(g) / 255, Number(b) / 255, Number(a)];
  }
  return [0.5, 0.5, 0.5, 1];
}

function readColors() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => parseColor(style.getPropertyValue(name));
  return {
    land: token("--map-land"),
    peak: token("--map-peak"),
    wall: token("--map-wall"),
    edge: token("--map-edge"),
    stateLine: token("--map-state-line"),
    relief: parseFloat(style.getPropertyValue("--map-relief")) || 1.1,
  };
}

interface GLState {
  gl: WebGL2RenderingContext;
  hf: Heightfield;
  terrain: { program: WebGLProgram; vao: WebGLVertexArrayObject; count: number };
  wall: { program: WebGLProgram; vao: WebGLVertexArrayObject; count: number };
  line: { program: WebGLProgram; stateVao: WebGLVertexArrayObject; stateCount: number; borderVao: WebGLVertexArrayObject; borderCount: number };
  heightTex: WebGLTexture;
  maskTex: WebGLTexture;
}

function setup(gl: WebGL2RenderingContext, hf: Heightfield): GLState {
  // Heightfield: elevation in meters, filtered on the GPU so the surface is smooth.
  const heightTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, heightTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, hf.width, hf.height, 0, gl.RED, gl.FLOAT, hf.meters);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const mask = rasterizeMask();
  const maskTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mask.width, mask.height, 0, gl.RED, gl.UNSIGNED_BYTE, mask.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const landAt = (x: number, y: number) => {
    const mx = Math.min(mask.width - 1, Math.max(0, Math.round(x * MASK_SCALE)));
    const my = Math.min(mask.height - 1, Math.max(0, Math.round(y * MASK_SCALE)));
    return mask.data[my * mask.width + mx] > 0;
  };

  // Terrain mesh: one vertex per texel, triangles only for cells touching land.
  const terrainProgram = compileProgram(gl, TERRAIN_VS, TERRAIN_FS);
  const verts = new Float32Array(hf.width * hf.height * 2);
  for (let j = 0; j < hf.height; j++) {
    for (let i = 0; i < hf.width; i++) {
      verts[(j * hf.width + i) * 2] = i * hf.res;
      verts[(j * hf.width + i) * 2 + 1] = j * hf.res;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < hf.height - 1; j++) {
    for (let i = 0; i < hf.width - 1; i++) {
      const x = i * hf.res;
      const y = j * hf.res;
      const r = hf.res;
      if (!(landAt(x, y) || landAt(x + r, y) || landAt(x, y + r) || landAt(x + r, y + r) || landAt(x + r / 2, y + r / 2))) continue;
      const a = j * hf.width + i;
      indices.push(a, a + 1, a + hf.width, a + 1, a + hf.width + 1, a + hf.width);
    }
  }
  const terrainVao = gl.createVertexArray()!;
  gl.bindVertexArray(terrainVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(terrainProgram, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

  // The slab's side wall, from the ground up to the land surface along the outline.
  const wallProgram = compileProgram(gl, WALL_VS, FLAT_FS);
  const wallVerts: number[] = [];
  for (const [ax, ay, bx, by] of densify(OUTLINE_POINTS, 0.5, true)) {
    wallVerts.push(ax, ay, 0, bx, by, 0, ax, ay, 1, bx, by, 0, bx, by, 1, ax, ay, 1);
  }
  const wallVao = gl.createVertexArray()!;
  gl.bindVertexArray(wallVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wallVerts), gl.STATIC_DRAW);
  const wPos = gl.getAttribLocation(wallProgram, "aPos");
  const wTop = gl.getAttribLocation(wallProgram, "aTop");
  gl.enableVertexAttribArray(wPos);
  gl.vertexAttribPointer(wPos, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(wTop);
  gl.vertexAttribPointer(wTop, 1, gl.FLOAT, false, 12, 8);

  // Lines: instanced quads, one per (densified) segment.
  const lineProgram = compileProgram(gl, LINE_VS, FLAT_FS);
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const signedArea = (() => {
    let a = 0;
    const p = OUTLINE_POINTS;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] - p[i]) * (p[j + 1] + p[i + 1]);
    return a;
  })();
  const lineVao = (segs: number[][], withNormals: boolean) => {
    const data: number[] = [];
    for (const [ax, ay, bx, by] of segs) {
      let nx = 0;
      let ny = 0;
      if (withNormals) {
        const len = Math.hypot(bx - ax, by - ay) || 1;
        // Left normal, flipped by the ring's winding so it points off the land.
        const s = signedArea > 0 ? -1 : 1;
        nx = (-(by - ay) / len) * s;
        ny = ((bx - ax) / len) * s;
      }
      data.push(ax, ay, bx, by, nx, ny);
    }
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    const aCorner = gl.getAttribLocation(lineProgram, "aCorner");
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    for (const [name, offset] of [["aA", 0], ["aB", 8], ["aN", 16]] as const) {
      const loc = gl.getAttribLocation(lineProgram, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 24, offset);
      gl.vertexAttribDivisor(loc, 1);
    }
    return { vao, count: segs.length };
  };
  const state = lineVao(STATE_LINE_POLYLINES.flatMap((pl) => densify(pl, 1, false)), false);
  const border = lineVao(densify(OUTLINE_POINTS, 1, true), true);
  gl.bindVertexArray(null);

  return {
    gl,
    hf,
    terrain: { program: terrainProgram, vao: terrainVao, count: indices.length },
    wall: { program: wallProgram, vao: wallVao, count: wallVerts.length / 3 },
    line: { program: lineProgram, stateVao: state.vao, stateCount: state.count, borderVao: border.vao, borderCount: border.count },
    heightTex,
    maskTex,
  };
}

function draw(s: GLState, camera: MapCamera, view: MapView, colors: ReturnType<typeof readColors>) {
  const { gl, hf } = s;
  const ts = Math.sin((camera.tilt * Math.PI) / 180);
  const tc = Math.cos((camera.tilt * Math.PI) / 180);
  const ys = Math.sin((camera.yaw * Math.PI) / 180);
  const yc = Math.cos((camera.yaw * Math.PI) / 180);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  const common = (program: WebGLProgram) => {
    gl.useProgram(program);
    gl.uniform4f(gl.getUniformLocation(program, "uCam"), ts, tc, ys, yc);
    gl.uniform4f(gl.getUniformLocation(program, "uView"), view.x, view.y, view.width, view.height);
    gl.uniform2f(gl.getUniformLocation(program, "uHfSize"), hf.width, hf.height);
    gl.uniform1f(gl.getUniformLocation(program, "uRes"), hf.res);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, s.heightTex);
    gl.uniform1i(gl.getUniformLocation(program, "uHeight"), 0);
  };

  gl.disable(gl.BLEND);
  gl.depthMask(true);
  const { terrain } = s;
  common(terrain.program);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
  gl.uniform1i(gl.getUniformLocation(terrain.program, "uMask"), 1);
  gl.uniform3fv(gl.getUniformLocation(terrain.program, "uLand"), colors.land.slice(0, 3));
  gl.uniform3fv(gl.getUniformLocation(terrain.program, "uPeak"), colors.peak.slice(0, 3));
  gl.uniform1f(gl.getUniformLocation(terrain.program, "uPeakElev"), Math.max(1, hf.peak));
  gl.uniform3fv(gl.getUniformLocation(terrain.program, "uLight"), LIGHT);
  gl.uniform1f(gl.getUniformLocation(terrain.program, "uRelief"), colors.relief);
  gl.bindVertexArray(terrain.vao);
  gl.drawElements(gl.TRIANGLES, terrain.count, gl.UNSIGNED_INT, 0);

  const { wall } = s;
  common(wall.program);
  gl.uniform4fv(gl.getUniformLocation(wall.program, "uColor"), colors.wall);
  gl.bindVertexArray(wall.vao);
  gl.drawArrays(gl.TRIANGLES, 0, wall.count);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  const { line } = s;
  common(line.program);
  gl.uniform2f(gl.getUniformLocation(line.program, "uCanvasPx"), gl.drawingBufferWidth, gl.drawingBufferHeight);
  const lines: [WebGLVertexArrayObject, number, number, boolean, number[]][] = [
    [line.stateVao, line.stateCount, STATE_LINE_WIDTH, false, colors.stateLine],
    [line.borderVao, line.borderCount, BORDER_WIDTH, true, colors.edge],
  ];
  for (const [vao, count, width, outward, color] of lines) {
    gl.uniform1f(gl.getUniformLocation(line.program, "uWidth"), width);
    gl.uniform1i(gl.getUniformLocation(line.program, "uOutward"), outward ? 1 : 0);
    gl.uniform4fv(gl.getUniformLocation(line.program, "uColor"), color);
    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }
  gl.bindVertexArray(null);
  gl.depthMask(true);
}

/**
 * The dashboard map's land as a real 3D surface: the US heightfield draped
 * over a fine mesh on the GPU, lifted by the same camera math as everything
 * else on the map (map-perspective.ts), lit like a hillshade from the
 * northwest and tinted lighter with altitude, standing on the slab's side
 * wall, with state lines and the national border riding the terrain (and
 * hidden behind mountains, since they're depth-tested). Draws into a canvas
 * covering `view` — the projected-space rectangle the caller places it over.
 * Reports `onReady(false)` if WebGL2 or the heightfield isn't available, so
 * the caller can keep its flat SVG fallback.
 */
export function TerrainCanvas({
  camera,
  view,
  className,
  onReady,
}: {
  camera: MapCamera;
  view: MapView;
  className?: string;
  onReady: (ready: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GLState | null>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [colorsVersion, setColorsVersion] = useState(0);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: true, alpha: true });
    if (!gl) {
      onReadyRef.current(false);
      return;
    }
    loadHeightfield()
      .then((hf) => {
        if (cancelled) return;
        stateRef.current = setup(gl, hf);
        setReady(true);
        onReadyRef.current(true);
      })
      .catch((err) => {
        // Not fatal — the map keeps its flat fallback — but worth a trace.
        console.warn("3D terrain unavailable:", err);
        if (!cancelled) onReadyRef.current(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Track the canvas's on-page size (in device pixels, capped at 2x for speed).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      setSize({ w: Math.max(1, Math.round(canvas.clientWidth * dpr)), h: Math.max(1, Math.round(canvas.clientHeight * dpr)) });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // Redraw in the new palette whenever the theme flips.
  useEffect(() => {
    const observer = new MutationObserver(() => setColorsVersion((v) => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!ready || !s || !canvas || !size) return;
    if (canvas.width !== size.w || canvas.height !== size.h) {
      canvas.width = size.w;
      canvas.height = size.h;
    }
    draw(s, camera, view, readColors());
  }, [ready, size, camera, view, colorsVersion]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
