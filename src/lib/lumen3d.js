// Lumenium の3Dグラフィック。
//
// ロゴ（八角形の枠の中の、8方向に伸びる星）をそのまま立体にした結晶が、
// 光を受けてゆっくり回り、そのまわりを光の粒が渦を巻きながら中心へ集まって
// いきます。社名の由来の「光（lumen）」と、「散文化した目的に焦点を当てる」
// をそのまま絵にしたものです。
//
// 外部ライブラリを使わず WebGL を直接叩いています。three.js を足すと
// 数百KBを全ページに配ることになり、表示の速さ（とそれに引きずられる検索
// 順位）を削ってまで得るものがないためです。形は星と枠の2つだけなので、
// 手で書いても小さく収まります。
//
// 1つの部品を、公開サイト・静的ページ・管理画面で共通に使います。
// 違うのは mode だけです。
//   hero    … トップ。結晶が主役。ロゴの位置にぴったり重ねます
//   ambient … サービス案内。背景として控えめに。スクロールで回ります
//   subtle  … 静的ページと管理画面。文章を読む邪魔をしない強さ
//
// 守っていること。
//   ・画面外やタブが裏にあるときは描かない（電池と他の処理のため）
//   ・「動きを減らす」設定の端末では、1枚だけ描いて止める
//   ・3Dが使えない端末では何もしない（null を返すので、呼んだ側が
//     いままでの見た目のまま動く）
//   ・重い端末では自分で画質と粒の数を落とす
//
// 依存なしの素の ES モジュールです。Vite からも、静的ページの
// <script type="module"> からも同じファイルを読みます。

/* ---------------- 小さな行列計算 ---------------- */

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far)
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0])
}
function mul(a, b) {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
    o[c * 4 + r] = s
  }
  return o
}
function rotX(t) { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]) }
function rotY(t) { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]) }
function rotZ(t) { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) }
function trs(x, y, z, sc) { return new Float32Array([sc, 0, 0, 0, 0, sc, 0, 0, 0, 0, sc, 0, x, y, z, 1]) }

/* ---------------- 形 ---------------- */

/* ロゴの星。縦横の4本が長く、斜めの4本が短い。先端の間のくぼみを
   結んだ16角の星形を、前後に尖らせた「双角錐」にします。
   面ごとに法線を持たせる（頂点を共有しない）ので、宝石のように
   面の境目で光が切り替わります。 */
function starGeometry() {
  const pts = []
  for (let i = 0; i < 16; i++) {
    const a = Math.PI / 2 - (i * Math.PI) / 8
    const tip = i % 2 === 0
    const r = tip ? ((i / 2) % 2 === 0 ? 1.0 : 0.72) : 0.27
    pts.push([Math.cos(a) * r, Math.sin(a) * r, 0])
  }
  const front = [0, 0, 0.34], back = [0, 0, -0.34]
  const tris = []
  for (let i = 0; i < 16; i++) {
    const p = pts[i], q = pts[(i + 1) % 16]
    tris.push([front, p, q], [back, q, p])
  }
  return build(tris, 0)
}

/* 八角形の枠。薄い帯を8本つないだ輪です。 */
function ringGeometry() {
  const R = 1.08, w = 0.045, d = 0.065   // ロゴの比率（星の先端27：枠29）
  const tris = []
  for (let i = 0; i < 8; i++) {
    const a0 = (i * Math.PI) / 4 + Math.PI / 8, a1 = a0 + Math.PI / 4
    const P = (a, rr, z) => [Math.cos(a) * rr, Math.sin(a) * rr, z]
    const o0f = P(a0, R + w, d), o1f = P(a1, R + w, d), i0f = P(a0, R - w, d), i1f = P(a1, R - w, d)
    const o0b = P(a0, R + w, -d), o1b = P(a1, R + w, -d), i0b = P(a0, R - w, -d), i1b = P(a1, R - w, -d)
    const quad = (a, b, c, e) => { tris.push([a, b, c], [a, c, e]) }
    quad(i0f, o0f, o1f, i1f)   // 表
    quad(o0b, i0b, i1b, o1b)   // 裏
    quad(o0f, o0b, o1b, o1f)   // 外周
    quad(i0b, i0f, i1f, i1b)   // 内周
  }
  return build(tris, 40)
}

/* 三角形の並びから、位置・法線・重心座標（辺を光らせるため）・面番号を作る。 */
function build(tris, faceBase) {
  const n = tris.length * 3
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), bar = new Float32Array(n * 3), face = new Float32Array(n)
  tris.forEach((t, k) => {
    const [a, b, c] = t
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0]
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    ;[a, b, c].forEach((p, j) => {
      const i = k * 3 + j
      pos.set(p, i * 3)
      nor.set([nx, ny, nz], i * 3)
      bar.set(j === 0 ? [1, 0, 0] : j === 1 ? [0, 1, 0] : [0, 0, 1], i * 3)
      face[i] = faceBase + k
    })
  })
  return { pos, nor, bar, face, count: n }
}

/* ---------------- シェーダ ---------------- */

const SOLID_VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aBar; attribute float aFace;
uniform mat4 uProj; uniform mat4 uModel; uniform mat4 uRot;
varying vec3 vN; varying vec3 vP; varying vec3 vBar; varying float vFace;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vP = w.xyz;
  vN = (uRot * vec4(aNor, 0.0)).xyz;
  vBar = aBar; vFace = aFace;
  gl_Position = uProj * w;
}`

const SOLID_FS = (derivs) => `
${derivs ? '#extension GL_OES_standard_derivatives : enable' : ''}
precision mediump float;
varying vec3 vN; varying vec3 vP; varying vec3 vBar; varying float vFace;
uniform float uTime; uniform float uAlpha; uniform float uGlow; uniform vec2 uFade;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vP);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.4);
  vec3 L1 = normalize(vec3(-0.55, 0.75, 0.65));
  vec3 L2 = normalize(vec3(0.8, -0.35, 0.45));
  float d1 = max(dot(N, L1), 0.0), d2 = max(dot(N, L2), 0.0);
  float s1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 70.0);
  float s2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 38.0);
  vec3 indigo = vec3(0.30, 0.27, 0.90), violet = vec3(0.49, 0.23, 0.93);
  vec3 cyan = vec3(0.13, 0.78, 0.93), pale = vec3(0.86, 0.89, 1.0);
  float f = fract(vFace * 0.618034 + 0.13);
  vec3 base = mix(indigo, violet, f * 0.8);
  base = mix(base, pale, d1 * 0.5);
  // 面を1枚ずつ、時間でわずかにきらめかせる
  float twinkle = 0.5 + 0.5 * sin(uTime * 1.3 + vFace * 2.1);
  vec3 col = base * (0.22 + 0.62 * d1 + 0.22 * d2)
           + cyan * fres * 0.95
           + vec3(1.0) * s1 * 0.95 + vec3(0.62, 0.9, 1.0) * s2 * 0.55
           + base * twinkle * 0.08 * uGlow;
  float e = min(min(vBar.x, vBar.y), vBar.z);
  ${derivs
    ? 'float w = fwidth(e); float edge = 1.0 - smoothstep(0.0, w * 1.6, e);'
    : 'float edge = 1.0 - smoothstep(0.0, 0.03, e);'}
  col += vec3(0.78, 0.88, 1.0) * edge * 0.6;
  // 下側を薄く。ロゴの下にはキャッチコピーが来るので、そこでは結晶が
  // 文字の邪魔をしないようにします（元のロゴ画像と同じ扱い）。
  float a = uAlpha * mix(0.22, 1.0, smoothstep(uFade.x, uFade.y, gl_FragCoord.y));
  gl_FragColor = vec4(col * a, a);
}`

/* 光の粒。位置は CPU で動かさず、種（角度・距離・高さ・速さ）から
   シェーダの中で計算します。何百個あっても、毎フレームの JS の仕事は
   時刻を1つ渡すだけです。 */
const DUST_VS = `
attribute vec4 aSeed; attribute float aSpeed;
uniform mat4 uProj; uniform mat4 uModel; uniform float uTime; uniform float uPx; uniform float uSpread;
varying float vT; varying float vA;
void main() {
  float t = fract(uTime * aSpeed + aSeed.w);
  float r = aSeed.y * uSpread * pow(1.0 - t, 0.85) + 0.14;
  float ang = aSeed.x + uTime * 0.12 + t * 3.2;
  float y = aSeed.z * uSpread * (1.0 - t) * 0.55;
  vec4 w = uModel * vec4(cos(ang) * r, y, sin(ang) * r, 1.0);
  gl_Position = uProj * w;
  vT = t;
  vA = smoothstep(0.0, 0.14, t) * (1.0 - smoothstep(0.9, 1.0, t));
  // 手前にあるほど、中心に近づくほど大きく。遠くの粒は小さく暗く。
  gl_PointSize = uPx * (1.0 + 2.6 * t * t) * (0.6 + 0.8 * fract(aSeed.w * 7.13)) / max(0.6, -w.z);
}`

const DUST_FS = `
precision mediump float;
varying float vT; varying float vA; uniform float uAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  vec3 far = vec3(0.39, 0.40, 0.95), mid = vec3(0.13, 0.78, 0.93), near = vec3(1.0);
  vec3 col = mix(mix(far, mid, smoothstep(0.2, 0.7, vT)), near, smoothstep(0.75, 1.0, vT));
  float al = a * vA * uAlpha * (0.55 + 0.45 * vT);
  gl_FragColor = vec4(col * al, al);
}`

/* 結晶の奥のにじみと、中心の光。板を1枚カメラに向けて置き、
   中心からの距離で明るさを落とします。 */
const GLOW_VS = `
attribute vec2 aQ;
uniform mat4 uProj; uniform vec3 uCenter; uniform float uSize;
varying vec2 vQ;
void main() { vQ = aQ; gl_Position = uProj * vec4(uCenter + vec3(aQ * uSize, 0.0), 1.0); }`

const GLOW_FS = `
precision mediump float;
varying vec2 vQ; uniform vec3 uColor; uniform float uAlpha; uniform float uPow;
void main() {
  float d = length(vQ);
  float a = pow(max(0.0, 1.0 - d), uPow) * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`

/* ---------------- 設定 ---------------- */

const MODES = {
  hero:    { dust: 520, spread: 3.4, dustAlpha: 0.95, alpha: 0.92,  glow: 1.0,  ring: true, dpr: 1.75, px: 1.0 },
  ambient: { dust: 360, spread: 4.2, dustAlpha: 0.8,  alpha: 0.8,  glow: 0.75, ring: true, dpr: 1.25, px: 0.9 },
  subtle:  { dust: 180, spread: 5.5, dustAlpha: 0.5,  alpha: 0.4,  glow: 0.4,  ring: true, dpr: 1.0,  px: 0.8 },
}

// 使えるかの判定は別ファイル（画面を作る時点ですぐ判定できるように）。
import { supports3D, reducedMotion } from './lumen3d-support.js'
export { supports3D, reducedMotion }

/**
 * 描き始める。使えないときは null。
 *   canvas … 描く先
 *   opts.mode  … 'hero' | 'ambient' | 'subtle'
 *   opts.focus … () => ({ x, y, r })  結晶を置く位置（canvas 内の CSS px）と半径
 *   opts.onFirstFrame … 最初の1枚を描いたとき（ロゴ画像を隠す合図などに）
 */
export function mountLumen3D(canvas, opts = {}) {
  if (!canvas || !supports3D()) return null
  const cfg = { ...MODES[opts.mode] || MODES.subtle }
  const small = Math.min(window.innerWidth, window.innerHeight) < 700
  if (small) cfg.dust = Math.round(cfg.dust * 0.55)

  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' })
  if (!gl) return null
  const derivs = !!gl.getExtension('OES_standard_derivatives')

  const compile = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
    return s
  }
  const program = (vs, fs) => {
    const p = gl.createProgram()
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link')
    const loc = (n) => gl.getUniformLocation(p, n)
    const att = (n) => gl.getAttribLocation(p, n)
    return { p, loc, att }
  }
  const buffer = (data) => {
    const b = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, b)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    return b
  }

  let solid, dust, glow
  try {
    solid = program(SOLID_VS, SOLID_FS(derivs))
    dust = program(DUST_VS, DUST_FS)
    glow = program(GLOW_VS, GLOW_FS)
  } catch (_) {
    return null
  }

  const star = starGeometry(), ring = ringGeometry()
  const mesh = (g) => ({ count: g.count, pos: buffer(g.pos), nor: buffer(g.nor), bar: buffer(g.bar), face: buffer(g.face) })
  const starM = mesh(star), ringM = mesh(ring)

  const N = cfg.dust
  const seeds = new Float32Array(N * 4), speeds = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    seeds[i * 4] = Math.random() * Math.PI * 2
    seeds[i * 4 + 1] = 0.35 + Math.pow(Math.random(), 0.7)
    seeds[i * 4 + 2] = (Math.random() - 0.5) * 2
    seeds[i * 4 + 3] = Math.random()
    speeds[i] = 0.02 + Math.random() * 0.05
  }
  const seedB = buffer(seeds), speedB = buffer(speeds)
  const quadB = buffer(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]))

  /* 「動きを減らす」設定の端末。以前はここで1枚だけ描いて止めていましたが、
     Mac の「視差効果を減らす」をオンにしている人には、3D がまったく動かない
     ように見えました。画面が大きく揺れる演出（指に合わせた傾き・スクロール
     での回転）は出さず、結晶をゆっくり回すだけにします。 */
  const gentle = reducedMotion()
  const SPEED = gentle ? 0.3 : 1
  let dpr = Math.min(window.devicePixelRatio || 1, cfg.dpr)
  let drawN = N
  let W = 0, H = 0
  /* 描く面積の上限。大きな画面（Retina の全画面など）で解像度をそのまま
     掛けると、1コマごとに数百万ピクセルを塗ることになり、端末によっては
     ページ全体の操作が重くなります。飾りのために操作を犠牲にはしません。 */
  const MAX_PIXELS = 2.4e6
  const resize = () => {
    const r = canvas.getBoundingClientRect()
    W = Math.max(1, r.width); H = Math.max(1, r.height)
    const d = Math.min(dpr, Math.sqrt(MAX_PIXELS / (W * H)))
    canvas.width = Math.round(W * d); canvas.height = Math.round(H * d)
  }
  resize()

  /* 指の位置で少し傾き、スクロールで回ります。急に動かず、追いかける
     ように寄っていきます。 */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  const onMove = (e) => {
    const p = e.touches ? e.touches[0] : e
    if (!p) return
    pointer.tx = (p.clientX / window.innerWidth) * 2 - 1
    pointer.ty = (p.clientY / window.innerHeight) * 2 - 1
  }
  if (!gentle) window.addEventListener('pointermove', onMove, { passive: true })
  let scroll = 0

  const FOV = 0.6, CAM = 6.0
  const draw = (time) => {
    const t = 7.5 + (time / 1000) * SPEED
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    const proj = perspective(FOV, W / H, 0.1, 60)

    // 結晶を置く場所。画面上の位置と半径を、奥行き CAM の平面の長さに直す。
    const f = opts.focus ? opts.focus() : null
    const upp = (2 * CAM * Math.tan(FOV / 2)) / H
    const cx = f ? (f.x - W / 2) * upp : 0
    const cy = f ? -(f.y - H / 2) * upp : 0
    const sc = f ? f.r * upp : Math.min(W, H) * 0.18 * upp

    pointer.x += (pointer.tx - pointer.x) * 0.04
    pointer.y += (pointer.ty - pointer.y) * 0.04
    const ry = t * 0.32 + pointer.x * 0.7 + scroll * 2.4
    const rx = Math.sin(t * 0.21) * 0.18 + pointer.y * 0.4 + scroll * 0.4
    const rot = mul(rotY(ry), rotX(rx))
    const model = mul(trs(cx, cy, -CAM, sc), rot)

    // にじみ（奥）
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.useProgram(glow.p)
    gl.uniformMatrix4fv(glow.loc('uProj'), false, proj)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadB)
    gl.enableVertexAttribArray(glow.att('aQ'))
    gl.vertexAttribPointer(glow.att('aQ'), 2, gl.FLOAT, false, 0, 0)
    gl.uniform3f(glow.loc('uCenter'), cx, cy, -CAM - 0.5)
    gl.uniform1f(glow.loc('uSize'), sc * 2.6)
    gl.uniform3f(glow.loc('uColor'), 0.34, 0.33, 0.95)
    gl.uniform1f(glow.loc('uAlpha'), 0.32 * cfg.glow)
    gl.uniform1f(glow.loc('uPow'), 2.2)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // 結晶と枠
    gl.enable(gl.DEPTH_TEST)
    gl.depthMask(true)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(solid.p)
    gl.uniformMatrix4fv(solid.loc('uProj'), false, proj)
    gl.uniform1f(solid.loc('uTime'), t)
    gl.uniform1f(solid.loc('uGlow'), cfg.glow)
    // 下側のぼかしの範囲（画面の下から数えた実ピクセル）。使わないときは
    // どの高さでも 1 になる値にしておきます。
    if (f && opts.fadeBelow) {
      const yc = (H - f.y) * dpr
      gl.uniform2f(solid.loc('uFade'), yc - f.r * 1.05 * dpr, yc - f.r * 0.05 * dpr)
    } else {
      gl.uniform2f(solid.loc('uFade'), -2, -1)
    }
    const drawMesh = (m, M, R, alpha) => {
      gl.uniformMatrix4fv(solid.loc('uModel'), false, M)
      gl.uniformMatrix4fv(solid.loc('uRot'), false, R)
      gl.uniform1f(solid.loc('uAlpha'), alpha)
      const bind = (name, b, size) => {
        const a = solid.att(name)
        gl.bindBuffer(gl.ARRAY_BUFFER, b)
        gl.enableVertexAttribArray(a)
        gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0)
      }
      bind('aPos', m.pos, 3); bind('aNor', m.nor, 3); bind('aBar', m.bar, 3); bind('aFace', m.face, 1)
      gl.drawArrays(gl.TRIANGLES, 0, m.count)
    }
    drawMesh(starM, model, rot, cfg.alpha)
    if (cfg.ring) {
      // 枠は星と別の軸でゆっくり回し、奥行きを見せます
      const rr = mul(rotY(-t * 0.12 + pointer.x * 0.3 + scroll * 1.2), rotX(0.35 + Math.sin(t * 0.17) * 0.12))
      drawMesh(ringM, mul(trs(cx, cy, -CAM, sc), rr), rr, cfg.alpha * 0.85)
    }
    gl.disableVertexAttribArray(solid.att('aFace'))
    gl.disableVertexAttribArray(solid.att('aBar'))
    gl.disableVertexAttribArray(solid.att('aNor'))

    // 光の粒（結晶の後ろに回ったものは隠れる）
    gl.depthMask(false)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.useProgram(dust.p)
    gl.uniformMatrix4fv(dust.loc('uProj'), false, proj)
    const dm = mul(trs(cx, cy, -CAM, sc), mul(rotX(0.35 + scroll * 0.3), rotZ(-0.2)))
    gl.uniformMatrix4fv(dust.loc('uModel'), false, dm)
    gl.uniform1f(dust.loc('uTime'), t)
    gl.uniform1f(dust.loc('uPx'), 17.0 * dpr * cfg.px)
    gl.uniform1f(dust.loc('uSpread'), cfg.spread)
    gl.uniform1f(dust.loc('uAlpha'), cfg.dustAlpha)
    gl.bindBuffer(gl.ARRAY_BUFFER, seedB)
    gl.enableVertexAttribArray(dust.att('aSeed'))
    gl.vertexAttribPointer(dust.att('aSeed'), 4, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, speedB)
    gl.enableVertexAttribArray(dust.att('aSpeed'))
    gl.vertexAttribPointer(dust.att('aSpeed'), 1, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.POINTS, 0, drawN)
    gl.disableVertexAttribArray(dust.att('aSeed'))
    gl.disableVertexAttribArray(dust.att('aSpeed'))

    // 中心の光（手前・深度なし）
    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(glow.p)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadB)
    gl.enableVertexAttribArray(glow.att('aQ'))
    gl.vertexAttribPointer(glow.att('aQ'), 2, gl.FLOAT, false, 0, 0)
    gl.uniform3f(glow.loc('uCenter'), cx, cy, -CAM + sc * 0.4)
    gl.uniform1f(glow.loc('uSize'), sc * 0.55)
    gl.uniform3f(glow.loc('uColor'), 0.85, 0.9, 1.0)
    gl.uniform1f(glow.loc('uAlpha'), (0.55 + 0.15 * Math.sin(t * 1.7)) * cfg.glow)
    gl.uniform1f(glow.loc('uPow'), 3.0)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.disableVertexAttribArray(glow.att('aQ'))
    gl.depthMask(true)
  }

  /* 動かすのは、見えていて、タブが表にあるときだけ。 */
  let raf = 0, visible = true, alive = true, first = true
  let slow = 0, last = 0, heavy = 0, stoppedForLoad = false, fps = 0
  const frame = (time) => {
    raf = 0
    if (!alive) return
    if (last) {
      const dt = time - last
      fps = fps ? fps * 0.9 + (1000 / Math.max(1, dt)) * 0.1 : 1000 / Math.max(1, dt)
      // 少し重い: 画質と粒の数を落とす
      slow = dt > 34 ? slow + 1 : Math.max(0, slow - 1)
      if (slow > 90) {
        slow = 0
        if (dpr > 1) { dpr = 1; resize() } else if (drawN > 120) drawN = Math.round(drawN * 0.6)
      }
      /* かなり重い（1コマに0.1秒以上かかるのが続く）: まず一気に落とし、
         それでも重ければ止めます。3Dのせいでボタンやスクロールが効かなく
         なるのが、いちばん避けたいことです。止めても最後の1枚は残ります。 */
      if (dt > 100) {
        heavy++
        if (heavy === 6) { dpr = 1; drawN = Math.max(60, Math.round(drawN * 0.4)); resize() }
        if (heavy >= 14) { stoppedForLoad = true; last = 0; return }
      } else if (heavy > 0 && dt < 40) {
        heavy = Math.max(0, heavy - 0.25)
      }
    }
    last = time
    draw(time)
    if (first) { first = false; opts.onFirstFrame && opts.onFirstFrame() }
    loop()
  }
  const loop = () => {
    if (raf || !alive || stoppedForLoad || !visible || document.visibilityState === 'hidden') return
    raf = requestAnimationFrame(frame)
  }
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0 }
  const onVis = () => (document.visibilityState === 'hidden' ? stop() : loop())
  document.addEventListener('visibilitychange', onVis)

  let io = null
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((es) => {
      visible = es.some((e) => e.isIntersecting)
      visible ? loop() : stop()
    })
    io.observe(canvas)
  }
  const onResize = () => { resize(); if (!raf && !first) draw(performance.now()) }
  window.addEventListener('resize', onResize)
  /* 置かれた場所の大きさが変わったときも測り直します。画面の幅が同じでも、
     隠れていた場所が表示された（管理画面のログイン直後など）ときや、
     まわりの中身が読み込まれて場所が広がったときに、大きさが変わります。
     測り直さないと、0×0 のまま何も見えなかったり、引き伸ばされてぼやけたり
     します。 */
  let ro = null
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect()
      if (Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 1) onResize()
    })
    ro.observe(canvas)
  }

  const onLost = (e) => { e.preventDefault(); alive = false; stop(); canvas.style.display = 'none' }
  canvas.addEventListener('webglcontextlost', onLost)

  loop()

  return {
    /** 0〜1。スクロールの進み具合を渡すと、結晶と粒の角度に反映します。 */
    setScroll(p) { if (!gentle) scroll = Math.max(0, Math.min(1, p || 0)) },
    resize: onResize,
    /** いまの状態。管理画面で「なぜ動かないか」を出すために使います。 */
    status() {
      return {
        state: !alive ? 'lost' : stoppedForLoad ? 'heavy' : gentle ? 'gentle' : 'running',
        fps: Math.round(fps),
        running: !!raf,
      }
    },
    destroy() {
      alive = false
      stop()
      if (io) io.disconnect()
      if (ro) ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('webglcontextlost', onLost)
    },
  }
}
