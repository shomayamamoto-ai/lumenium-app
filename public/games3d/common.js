/* ミニゲームの 3DCG 表示の共通部品（Three.js）。
 *
 * どのゲームも、遊びの決まり（当たり判定・得点・ランキング）は今までの 2D の
 * 計算のまま動かし、見た目だけをここで 3D に描き直します。WebGL が使えない
 * 端末では、これまでの 2D の絵がそのまま出ます（ゲームは動き続けます）。
 *
 * 読み込みは各ゲームの <script type="importmap"> で 'three' と 'three/addons/'
 * を /vendor/ に向けてから、<script type="module"> で各ゲームの 3D ファイルを
 * 読みます（外部の CDN は使いません。サイトの CSP が自分のドメインだけを許すため）。 */
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

export { THREE }

/** WebGL が使えるか（使えなければ 2D のまま）。 */
export function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch (_) { return false }
}

/** 動きを減らす設定・弱い端末では、光のにじみ（ブルーム）を軽くします。 */
export function lowPower() {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches
  const small = Math.min(screen.width, screen.height) < 500
  const cores = navigator.hardwareConcurrency || 4
  return reduce || (small && cores <= 4)
}

/**
 * 3D の舞台。canvas3d を、sizeEl（今までの 2D キャンバス）と同じ位置・大きさに重ねます。
 * opts: { bloom: {strength, radius, threshold}, clear, fog, exposure }
 */
export function createStage(canvas3d, sizeEl, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower() ? 1.25 : 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = opts.exposure || 1.1
  renderer.shadowMap.enabled = !!opts.shadows
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(opts.clear || 0x05070f)
  if (opts.fog) scene.fog = new THREE.FogExp2(opts.fog.color, opts.fog.density)
  const camera = new THREE.PerspectiveCamera(opts.fov || 45, 1, 0.1, 400)

  let composer = null, bloom = null
  const b = opts.bloom
  if (b !== false) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), (b && b.strength) || 0.9, (b && b.radius) || 0.45, (b && b.threshold) || 0.62)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
  }

  const stage = { THREE, renderer, scene, camera, composer, bloom, w: 1, h: 1, onResize: null }

  function fit() {
    const r = sizeEl.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height))
    canvas3d.style.width = w + 'px'
    canvas3d.style.height = h + 'px'
    if (w === stage.w && h === stage.h) return
    stage.w = w; stage.h = h
    renderer.setSize(w, h, false)
    if (composer) {
      composer.setSize(w, h)
      // にじみは半分の解像度で十分（軽くするため）。
      bloom.resolution.set(Math.max(64, w / 2), Math.max(64, h / 2))
    }
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    if (stage.onResize) stage.onResize(w, h)
  }
  stage.fit = fit
  if (window.ResizeObserver) new ResizeObserver(fit).observe(sizeEl)
  window.addEventListener('resize', fit)
  fit()

  stage.render = function () {
    fit()
    if (composer) composer.render()
    else renderer.render(scene, camera)
  }
  return stage
}

/* ---- テクスチャ ---- */

const texCache = new Map()
/** 中心が明るく、外へ向かって消える丸（光の粒・にじみ・影に使います）。 */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const k = inner + outer + size
  if (texCache.has(k)) return texCache.get(k)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gr.addColorStop(0, inner)
  gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)'))
  gr.addColorStop(1, outer)
  g.fillStyle = gr
  g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  texCache.set(k, t)
  return t
}

/** 文字を書いたテクスチャ（パワーアップの箱の面など）。 */
export function labelTexture(text, { bg = '#4f46e5', fg = '#ffffff', size = 128, font = '800 72px sans-serif', border = 'rgba(255,255,255,.55)' } = {}) {
  const k = 'L' + text + bg + fg + size + font
  if (texCache.has(k)) return texCache.get(k)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const gr = g.createLinearGradient(0, 0, size, size)
  gr.addColorStop(0, bg)
  gr.addColorStop(1, shade(bg, 0.55))
  g.fillStyle = gr
  g.fillRect(0, 0, size, size)
  g.strokeStyle = border
  g.lineWidth = size * 0.06
  g.strokeRect(size * 0.06, size * 0.06, size * 0.88, size * 0.88)
  g.fillStyle = fg
  g.font = font
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, size / 2, size / 2 + size * 0.03)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  texCache.set(k, t)
  return t
}

/** '#rrggbb' を f 倍の明るさに。 */
export function shade(hex, f) {
  const n = parseInt(String(hex).slice(1), 16)
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0')
  return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255)
}

/* ---- 材質 ---- */

/** 金属っぽい、角の立った CG の材質。glow を上げると自分でも光ります。 */
export function hullMaterial(color, { metal = 0.55, rough = 0.32, glow = 0.22, flat = true } = {}) {
  const c = new THREE.Color(color)
  return new THREE.MeshStandardMaterial({
    color: c, metalness: metal, roughness: rough, flatShading: flat,
    emissive: c.clone().multiplyScalar(glow),
  })
}

/** にじんで光る（光源のように見える）材質。トーンマップを外して色をそのまま出します。 */
export function glowMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: opacity < 1, opacity, toneMapped: false })
}

/* ---- 粒（パーティクル） ----
   粒ごとに 位置・色・大きさ・明るさ を持つ、丸くて柔らかい光の点。加算合成なので重なるほど明るくなります。 */
export function createPoints(max, { additive = true, sizeScale = 1 } = {}) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1))
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1))
  geo.setDrawRange(0, 0)
  const mat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 300 * sizeScale } },
    vertexShader: `
      attribute float size; attribute float alpha; attribute vec3 color;
      varying vec3 vColor; varying float vAlpha; uniform float scale;
      void main() {
        vColor = color; vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d) * 4.0;
        if (r > 1.0) discard;
        float a = (1.0 - r); a *= a;
        gl_FragColor = vec4(vColor * (1.0 + 1.6 * (1.0 - r)), a * vAlpha);
      }`,
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  const tmp = new THREE.Color()
  let n = 0
  return {
    object: points,
    begin() { n = 0 },
    add(x, y, z, color, s, a) {
      if (n >= max) return
      pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z
      // 'rgba(r,g,b,a)' は色と明るさに分けて受けます（Three.js の色は透明度を持たないため）
      const m = typeof color === 'string' && color.charCodeAt(0) === 114 ? /rgba?\(([^)]+)\)/.exec(color) : null
      if (m) {
        const c = m[1].split(',').map(Number)
        tmp.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace)
        if (c.length > 3 && isFinite(c[3])) a *= c[3]
      } else tmp.set(color)
      col[n * 3] = tmp.r; col[n * 3 + 1] = tmp.g; col[n * 3 + 2] = tmp.b
      size[n] = s; alpha[n] = a
      n++
    },
    end() {
      geo.setDrawRange(0, n)
      for (const k of ['position', 'color', 'size', 'alpha']) geo.attributes[k].needsUpdate = true
    },
  }
}

/** 奥から手前へ流れる星空（GPU で動かすので軽い）。dir: 流れる向き。 */
export function createStarfield(count = 1600, { box = [80, 50, 140], center = [0, -10, -40], speed = 6, color = 0xbfcaff, size = 1 } = {}) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3), rnd = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * box[0]
    pos[i * 3 + 1] = (Math.random() - 0.5) * box[1]
    pos[i * 3 + 2] = Math.random() * box[2]
    rnd[i] = Math.random()
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, speed: { value: speed }, depth: { value: box[2] }, color: { value: new THREE.Color(color) }, origin: { value: new THREE.Vector3(...center) }, psize: { value: size } },
    vertexShader: `
      attribute float rnd; uniform float time; uniform float speed; uniform float depth; uniform vec3 origin; uniform float psize;
      varying float vA;
      void main() {
        vec3 p = position;
        p.z = mod(p.z + time * speed * (0.4 + rnd), depth) - depth * 0.5;
        p += origin;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float near = clamp(1.0 - (-mv.z) / 90.0, 0.0, 1.0);
        vA = (0.25 + 0.75 * rnd) * (0.3 + 0.7 * near);
        gl_PointSize = psize * (1.0 + 2.2 * rnd * rnd) * (220.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color; varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = dot(d, d) * 4.0;
        if (r > 1.0) discard;
        gl_FragColor = vec4(color * 1.4, (1.0 - r) * vA);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return { object: pts, update(t) { mat.uniforms.time.value = t } }
}

/** 光の輪（地面に寝かせた、広がって消える輪）。 */
export function createRingPool(scene, max = 24) {
  const geo = new THREE.RingGeometry(0.82, 1, 48)
  geo.rotateX(-Math.PI / 2)
  const pool = []
  for (let i = 0; i < max; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }))
    m.visible = false
    scene.add(m)
    pool.push(m)
  }
  return pool
}

/** ゆがんだ光の雲（遠景の星雲）。 */
export function nebula(color, size, opacity = 0.35) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(color, 'rgba(0,0,0,0)', 128), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }))
  s.scale.set(size, size, 1)
  return s
}

/** 床に落ちる丸い影（光源の真下の、ぼやけた影）。 */
export function blobShadowMaterial(opacity = 0.55) {
  return new THREE.MeshBasicMaterial({ map: glowTexture('rgba(0,0,0,1)', 'rgba(0,0,0,0)', 64), transparent: true, opacity, depthWrite: false })
}

/** 物体の割り当て（ゲームの1体ごとに 3D の物体を1つ。消えたら使い回します）。 */
export function createBinder(make, scene) {
  const live = new Map(), free = new Map()
  let seen = new Set()
  return {
    begin() { seen = new Set() },
    get(entity, kind) {
      let o = live.get(entity)
      if (!o) {
        const bin = free.get(kind)
        o = bin && bin.length ? bin.pop() : make(kind)
        o.userData.kind = kind
        o.userData.fresh = true
        scene.add(o)
        live.set(entity, o)
      } else o.userData.fresh = false
      o.visible = true
      seen.add(entity)
      return o
    },
    end() {
      for (const [ent, o] of live) {
        if (seen.has(ent)) continue
        live.delete(ent)
        o.visible = false
        const k = o.userData.kind
        if (!free.has(k)) free.set(k, [])
        free.get(k).push(o)
      }
    },
    size() { return live.size },
  }
}
