/*
 * オープニングの前半「焦点を探す」場面。
 *
 * カメラのレンズの言葉で、社名とキャッチコピー（散文化した目的に、焦点を
 * 当てる）を見せます。
 *   1. ピントの合っていない光の粒（ボケ）が奥行きいっぱいに散らばっている。
 *      ボケの形は八角形 ―― ロゴの八角形の枠を、レンズの絞りに見立てています。
 *   2. レンズがピントを探す（手前から奥へ行き過ぎて、戻って合う）。
 *      ピントが通り過ぎる瞬間だけ、その距離の粒がくっきりした点になる。
 *   3. ピントが合うと、光は中心の一点へ流れ込む（速い粒は線に伸びる）。
 *   4. 八枚羽根の絞りが回りながら閉じ、ロゴの枠の大きさで止まる。
 *   5. その奥で結晶が光る（ここからは lumen3d.js の結晶が引き継ぎます）。
 *
 * ボケの大きさは、薄いレンズの式（錯乱円 ∝ |1/ピント距離 − 1/距離|）で
 * 1粒ずつ決めます。大きいボケほど薄く、小さい点ほど明るく（光の量を
 * 保つ）するので、本物のレンズのように見えます。
 *
 * ボケはぼやけているのが仕事なので、解像度は低めで描きます（重さ対策）。
 * 時刻は呼んだ側（Intro3D）が渡し、ここでは描くだけです。
 */

const clamp01 = (x) => Math.max(0, Math.min(1, x))
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeOut = (x) => 1 - Math.pow(1 - x, 3)
const lerp = (a, b, k) => a + (b - a) * k

/* 時間割（秒）。Intro3D と共有します。 */
export const SCENE = {
  hunt: [0.9, 1.0], // ピントを奥へ探しにいく
  lock: [1.85, 0.75], // 戻ってきて合う
  pour: [2.3, 0.45, 0.55], // 中心へ流れ込む（開始, ばらつき, かかる時間）
  iris: [2.8, 0.55], // 絞りが閉じる
  flash: 3.35, // 結晶が光る
  end: 3.9, // この場面の終わり
}
export const LOCK_D = 8 // ピントが合う距離（結晶のある距離）
const LENS = 0.2 // レンズの明るさ（大きいほどボケが大きい）

/** ピントの距離。手前 → 奥へ行き過ぎ → 戻って LOCK_D で合う。 */
export function focusAt(tl) {
  const h = ease(clamp01((tl - SCENE.hunt[0]) / SCENE.hunt[1]))
  const l = ease(clamp01((tl - SCENE.lock[0]) / SCENE.lock[1]))
  return lerp(lerp(2.2, 30, h), LOCK_D, l)
}
/** カメラが少しずつ前へ進む量 */
export const dollyAt = (tl) => 2.2 * easeOut(clamp01(tl / 3.4))

const VS = `
attribute vec2 aQ; attribute vec4 aP; attribute vec4 aS;
uniform vec2 uView; uniform vec2 uC; uniform float uFpx; uniform float uF; uniform float uK;
uniform float uT; uniform float uDolly; uniform float uPx; uniform float uMaxR;
uniform float uPour; uniform float uSpread; uniform float uDur; uniform float uCalm;
varying vec2 vQ; varying float vA; varying vec3 vCol; varying float vR;
vec3 pal(float i) {
  if (i < 1.0) return vec3(0.39, 0.40, 0.95);
  if (i < 2.0) return vec3(0.55, 0.36, 0.96);
  if (i < 3.0) return vec3(0.13, 0.78, 0.93);
  if (i < 4.0) return vec3(0.78, 0.82, 1.0);
  return vec3(1.0, 0.86, 0.62);
}
float eio(float x) { return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0; }
void main() {
  // ゆっくり漂う
  vec3 p = aP.xyz;
  // 「視差効果を減らす」では、粒は一切動かさない（明るさとピントだけで見せる）
  float dr = 1.0 - uCalm;
  p.x += sin(uT * 0.35 + aS.x * 6.28) * 0.12 * p.z * 0.1 * dr;
  p.y += cos(uT * 0.28 + aS.y * 6.28) * 0.10 * p.z * 0.1 * dr;
  float d = p.z - uDolly;
  // 中心へ流れ込む（1粒ずつ少しずつ遅れて）
  // （動きを控える設定では、その場で淡く消えて、光は中心の輝きに移る）
  float k = eio(clamp((uT - (uPour + aS.x * uSpread)) / uDur, 0.0, 1.0));
  float km = k * (1.0 - uCalm);
  float sw = km * 0.9 * (aS.y - 0.5);
  vec2 xy = mix(p.xy, vec2(0.0), km);
  float c = cos(sw), s = sin(sw);
  xy = vec2(c * xy.x - s * xy.y, s * xy.x + c * xy.y);
  d = mix(d, ${LOCK_D.toFixed(1)}, km);
  d = max(d, 0.35);
  vec2 scr = uC + xy * uFpx / d;
  // ボケの大きさ（半径 px）
  float coc = uK * abs(1.0 / uF - 1.0 / d) * uView.y;
  float base = uPx * (1.0 + aS.z * aS.z * 2.4);
  float r = clamp(max(base, coc * 0.5), base, uMaxR);
  // 流れ込む途中は、中心へ向かう向きに伸びる
  vec2 dir = scr - uC;
  float len = length(dir);
  dir = len > 0.001 ? dir / len : vec2(1.0, 0.0);
  float stretch = sin(3.14159 * k) * (22.0 + 60.0 * aS.w) * (uView.y / 900.0) * (1.0 - uCalm);
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 off = dir * aQ.x * (r + stretch) + perp * aQ.y * r;
  vec2 pos = scr + off;
  gl_Position = vec4(pos / uView * 2.0 - 1.0, 0.0, 1.0);
  vQ = aQ; vR = r;
  // 光の量を保つ: 大きいボケほど薄く
  float a = clamp(pow(base / r, 1.1) * 2.6, 0.05, 1.0);
  // 近すぎる粒・遠すぎる粒は消す。着いた粒は中心の光に溶ける
  a *= smoothstep(0.35, 1.2, p.z - uDolly + km * 10.0)
     * (1.0 - mix(smoothstep(0.82, 1.0, k), smoothstep(0.05, 1.0, k), uCalm));
  // 明るさにむらを付ける（明るい粒は少なく、淡い粒が多い）
  a *= 0.25 + 1.1 * pow(aS.w, 2.2);
  vA = a;
  vCol = pal(aP.w);
}`

const FS = `
precision mediump float;
varying vec2 vQ; varying float vA; varying vec3 vCol; varying float vR;
uniform float uRot; uniform float uFade;
void main() {
  vec2 q = vQ;
  float c = cos(uRot), s = sin(uRot);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  // 八角形（絞りの形）。小さい点は丸で十分
  float oct = max(max(abs(q.x), abs(q.y)), (abs(q.x) + abs(q.y)) * 0.70711);
  float o = mix(length(q), oct, smoothstep(3.0, 8.0, vR));
  float aa = clamp(1.5 / vR, 0.02, 0.5);
  float fill = 1.0 - smoothstep(1.0 - aa, 1.0, o);
  // 縁が少し明るい（本物のボケの「縁取り」）。縁にだけ色のずれ
  float rim = smoothstep(0.62, 0.96, o) * fill;
  float core = vR < 4.0 ? pow(max(0.0, 1.0 - o), 1.6) : 0.0;
  float v = (fill * 0.55 + rim * 0.75) * (vR < 4.0 ? 0.0 : 1.0) + core * 1.6;
  vec3 col = mix(vCol, vec3(0.55, 0.85, 1.0), rim * 0.35);
  col = mix(col, vec3(1.0), core * 0.6);
  float a = v * vA * uFade;
  gl_FragColor = vec4(col * a, a);
}`

/* 八枚羽根の絞り。画面いっぱいの板に、開いている八角形の外側を
   羽根として塗ります。羽根の継ぎ目は、閉じるにつれてねじれる線。 */
const IRIS_VS = `attribute vec2 aQ; void main() { gl_Position = vec4(aQ, 0.0, 1.0); }`
const IRIS_FS = `
precision mediump float;
uniform vec2 uC; uniform float uR; uniform float uRot; uniform float uA; uniform float uGlow;
void main() {
  vec2 p = gl_FragCoord.xy - uC;
  float c = cos(uRot), s = sin(uRot);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float o = max(max(abs(q.x), abs(q.y)), (abs(q.x) + abs(q.y)) * 0.70711);
  float out_ = smoothstep(uR - 0.75, uR + 0.75, o);
  float ang = atan(q.y, q.x);
  float tw = ang + (length(q) - uR) * 0.0035;
  float seg = fract(tw / 0.785398 + 0.5);
  float idx = floor(tw / 0.785398 + 0.5);
  float seam = 1.0 - smoothstep(0.0, 0.012, min(seg, 1.0 - seg));
  float sheen = 0.5 + 0.5 * cos(ang * 1.0 - 0.8);
  vec3 blade = vec3(0.028, 0.03, 0.055) + vec3(0.03, 0.035, 0.07) * sheen * (0.6 + 0.4 * fract(sin(idx * 12.9898) * 43758.5)) ;
  blade += vec3(0.25, 0.32, 0.55) * seam * 0.35;
  // 開口の縁から漏れる光
  float edge = exp(-abs(o - uR) * 0.18) * uGlow;
  vec3 col = blade * out_ + vec3(0.45, 0.75, 1.0) * edge * 0.9;
  float a = max(out_, edge * 0.9) * uA;
  gl_FragColor = vec4(col * uA, a);
}`

/**
 * 描き始める。使えないときは null。
 *   canvas … 描く先（画面いっぱい）
 *   calm   … 動きを控えめにする
 * 返り値の draw(tl, focus) を、呼んだ側が毎コマ呼びます。
 *   focus … { x, y, r }  結晶の位置と半径（CSS px）
 */
export function mountIntroScene(canvas, { calm = false } = {}) {
  // calm … 「視差効果を減らす」設定。画面の上で動くもの（カメラが前へ進む、
  //          粒が漂う・中心へ流れる、光の筋、絞りが閉じる・回る）をすべて
  //          なくし、明るさ・ピント・色の変化だけで同じ物語を見せます。
  const dolly = (tl) => (calm ? 0 : dollyAt(tl))
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' })
  if (!gl) return null
  const compile = (type, src) => {
    const sh = gl.createShader(type)
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader')
    return sh
  }
  const program = (vs, fs) => {
    const p = gl.createProgram()
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link')
    return { p, loc: (n) => gl.getUniformLocation(p, n), att: (n) => gl.getAttribLocation(p, n) }
  }
  let bokeh, iris
  try {
    bokeh = program(VS, FS)
    iris = program(IRIS_VS, IRIS_FS)
  } catch (_) {
    return null
  }

  const small = Math.min(window.innerWidth, window.innerHeight) < 700
  const N = small ? 160 : 280
  // 1粒 = 四角1枚（三角形2枚・6頂点）。点スプライトは端末によって
  // 大きさの上限が小さく、大きなボケが描けないため使いません。
  const Q = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]
  const aQ = new Float32Array(N * 12), aP = new Float32Array(N * 24), aS = new Float32Array(N * 24)
  const aspect = window.innerWidth / Math.max(1, window.innerHeight)
  const tanH = Math.tan(0.8 / 2)
  for (let i = 0; i < N; i++) {
    // 奥ほど多く。手前の数粒は大きなボケになって画面を横切る
    const z = 1.6 + Math.pow(Math.random(), 0.8) * 30
    const x = (Math.random() * 2 - 1) * z * tanH * Math.max(1, aspect) * 1.15
    const y = (Math.random() * 2 - 1) * z * tanH * 1.15
    const r = Math.random()
    const col = r < 0.34 ? 0 : r < 0.56 ? 1 : r < 0.8 ? 2 : r < 0.96 ? 3 : 4
    const seed = [Math.random(), Math.random(), Math.random(), Math.random()]
    for (let v = 0; v < 6; v++) {
      const j = i * 6 + v
      aQ[j * 2] = Q[v * 2]; aQ[j * 2 + 1] = Q[v * 2 + 1]
      aP.set([x, y, z, col], j * 4)
      aS.set(seed, j * 4)
    }
  }
  const buf = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b }
  const bQ = buf(aQ), bP = buf(aP), bS = buf(aS)
  const bFull = buf(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]))

  // ボケはぼやけているのが仕事なので、解像度は控えめに
  let scale = 1, W = 1, H = 1
  const resize = () => {
    const r = canvas.getBoundingClientRect()
    W = Math.max(1, r.width); H = Math.max(1, r.height)
    scale = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(1.6e6 / (W * H)))
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale)
  }
  resize()

  const bind = (prog, name, b, size) => {
    const a = prog.att(name)
    if (a < 0) return
    gl.bindBuffer(gl.ARRAY_BUFFER, b)
    gl.enableVertexAttribArray(a)
    gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0)
  }

  return {
    resize,
    /** 投影（Intro3D が言葉を同じカメラで置くため）。CSS px で返します。 */
    camera(tl, focus) {
      const fpx = (H / 2) / tanH
      const F = focusAt(tl)
      return {
        fpx, F, dolly: dolly(tl),
        coc: (d) => LENS * Math.abs(1 / F - 1 / d) * H,
        at: (x, y, d) => ({ x: focus.x + (x * fpx) / d, y: focus.y - (y * fpx) / d }),
      }
    },
    draw(tl, focus) {
      const s = scale
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.disable(gl.DEPTH_TEST)
      const cx = focus.x * s, cy = (H - focus.y) * s

      // ボケ（重なるほど明るく）
      gl.blendFunc(gl.ONE, gl.ONE)
      gl.useProgram(bokeh.p)
      gl.uniform2f(bokeh.loc('uView'), canvas.width, canvas.height)
      gl.uniform2f(bokeh.loc('uC'), cx, cy)
      gl.uniform1f(bokeh.loc('uFpx'), (canvas.height / 2) / tanH)
      gl.uniform1f(bokeh.loc('uF'), focusAt(tl))
      gl.uniform1f(bokeh.loc('uK'), LENS)
      gl.uniform1f(bokeh.loc('uT'), tl)
      gl.uniform1f(bokeh.loc('uDolly'), dolly(tl))
      gl.uniform1f(bokeh.loc('uCalm'), calm ? 1 : 0)
      gl.uniform1f(bokeh.loc('uPx'), 1.1 * s)
      gl.uniform1f(bokeh.loc('uMaxR'), canvas.height * 0.075)
      gl.uniform1f(bokeh.loc('uPour'), SCENE.pour[0])
      gl.uniform1f(bokeh.loc('uSpread'), SCENE.pour[1])
      gl.uniform1f(bokeh.loc('uDur'), SCENE.pour[2])
      gl.uniform1f(bokeh.loc('uRot'), 0.3927 + tl * 0.05)
      gl.uniform1f(bokeh.loc('uFade'), easeOut(clamp01(tl / 0.9)))
      bind(bokeh, 'aQ', bQ, 2); bind(bokeh, 'aP', bP, 4); bind(bokeh, 'aS', bS, 4)
      gl.drawArrays(gl.TRIANGLES, 0, N * 6)
      ;['aQ', 'aP', 'aS'].forEach((n) => { const a = bokeh.att(n); if (a >= 0) gl.disableVertexAttribArray(a) })

      // 絞り
      const k = clamp01((tl - SCENE.iris[0]) / SCENE.iris[1])
      if (k > 0) {
        const far = Math.hypot(canvas.width, canvas.height) * 0.75
        // ロゴの枠の内側の辺まで（枠の外接半径 1.035r × cos(π/8)）
        const end = focus.r * 1.035 * 0.9239 * s
        // 動きを控える設定では、絞りは閉じてこない。最初から枠の大きさで、
        // その外側が静かに暗くなり、縁が灯る（光だけの変化）。
        const R = calm ? end : lerp(far, end, easeOut(k))
        const a = (calm ? easeOut(k) : clamp01(k * 6)) * (1 - clamp01((tl - SCENE.flash) / (calm ? 0.8 : 0.45)))
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        gl.useProgram(iris.p)
        gl.uniform2f(iris.loc('uC'), cx, cy)
        gl.uniform1f(iris.loc('uR'), R)
        gl.uniform1f(iris.loc('uRot'), calm ? 0 : 0.9 * (1 - easeOut(k)))
        gl.uniform1f(iris.loc('uA'), a)
        gl.uniform1f(iris.loc('uGlow'), 0.35 + 0.65 * k)
        bind(iris, 'aQ', bFull, 2)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        gl.disableVertexAttribArray(iris.att('aQ'))
      }
    },
    destroy() {
      try { const x = gl.getExtension('WEBGL_lose_context'); x && x.loseContext() } catch (_) {}
    },
  }
}
