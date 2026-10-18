/* LUMEN 2048（会員限定・private/puzzle.html）の 3DCG 表示。
 *
 * ゲームは今までどおり HTML のタイル（#board の中の .tile）を動かします。ここでは
 * 毎フレームそのタイルの「いまの位置（動いている途中も）」と数字を読み、同じ場所に
 * 厚みのある 3D のブロックを置いて描きます。大きい数ほど背が高く、強く光ります。
 * 元のタイルは見えなくするだけで残すので、操作や判定は何も変わりません。 */
import { THREE, webglOk, createStage, glowTexture, createPoints } from './common.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const SIZE = 4
const FACE = {
  2: ['#3d3a8f', '#4f46e5'], 4: ['#4f46e5', '#6366f1'], 8: ['#4f46e5', '#3b82f6'], 16: ['#3b82f6', '#2563eb'],
  32: ['#3b82f6', '#0ea5e9'], 64: ['#0ea5e9', '#06b6d4'], 128: ['#06b6d4', '#22d3ee'], 256: ['#06b6d4', '#8b5cf6'],
  512: ['#8b5cf6', '#7c3aed'], 1024: ['#8b5cf6', '#a78bfa'], 2048: ['#a78bfa', '#22d3ee'], super: ['#22d3ee', '#4f46e5'],
}

function start() {
  const boardEl = document.getElementById('board')
  const wrap = boardEl && boardEl.parentElement
  if (!boardEl || !wrap || !webglOk()) return
  const canvas3d = document.createElement('canvas')
  canvas3d.setAttribute('aria-hidden', 'true')
  canvas3d.style.cssText = 'position:absolute;left:0;top:0;z-index:3;pointer-events:none;display:block;' +
    // 四隅を背景になじませる（3D の背景色がページの背景と完全には同じでないため）
    '-webkit-mask-image:radial-gradient(ellipse 72% 72% at 50% 50%,#000 60%,transparent 100%);mask-image:radial-gradient(ellipse 72% 72% at 50% 50%,#000 60%,transparent 100%)'
  wrap.appendChild(canvas3d)
  let stage
  try {
    stage = createStage(canvas3d, boardEl, { clear: 0x0a0e1a, bloom: { strength: 0.55, radius: 0.4, threshold: 0.92 }, fov: 36 })
  } catch (_) { canvas3d.remove(); return }
  // 3D の背景は透かして、ページの背景になじませます
  stage.renderer.setClearColor(0x000000, 0)
  stage.scene.background = null
  boardEl.classList.add('is3d')
  const { scene, camera, renderer } = stage
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.4

  /* ---- カメラ: 盤（4.4 四方）がちょうど収まるように、手前から見下ろす ---- */
  const TILT = THREE.MathUtils.degToRad(58)
  const target = new THREE.Vector3(), base = new THREE.Vector3(), v = new THREE.Vector3()
  const corners = [[-2.25, -2.25], [2.25, -2.25], [-2.25, 2.25], [2.25, 2.25]].flatMap(([x, z]) => [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.9, z)])
  function place(dist, tz) {
    target.set(0, 0, tz)
    camera.position.set(0, Math.sin(TILT) * dist, tz + Math.cos(TILT) * dist)
    camera.lookAt(target); camera.updateMatrixWorld()
  }
  function fit() {
    let best = null
    for (let dist = 3; dist < 40 && !best; dist += 0.1) {
      let pick = null
      for (let tz = -1; tz <= 1; tz += 0.05) {
        place(dist, tz)
        let top = -9, bot = 9
        if (corners.some((c) => { v.copy(c).project(camera); top = Math.max(top, v.y); bot = Math.min(bot, v.y); return Math.abs(v.x) > 0.98 || Math.abs(v.y) > 0.98 })) continue
        const sk = Math.abs(top + bot)
        if (!pick || sk < pick.sk) pick = { dist, tz, sk }
      }
      best = pick
    }
    best = best || { dist: 10, tz: 0 }
    place(best.dist, best.tz)
    base.copy(camera.position)
  }
  stage.onResize = fit
  fit()

  /* ---- 光 ---- */
  scene.add(new THREE.HemisphereLight(0xb4c0ff, 0x10142a, 0.7))
  const key = new THREE.DirectionalLight(0xffffff, 1.8)
  key.position.set(-3, 8, 4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 })
  key.shadow.bias = -0.002
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  scene.add(key)
  const glowLight = new THREE.PointLight(0x8b5cf6, 0, 8, 1.4)
  glowLight.position.set(0, 2.5, 0)
  scene.add(glowLight)

  /* ---- 盤: くぼんだ 16 マスのトレイ ---- */
  const trayShape = roundRect(4.6, 4.6, 0.28)
  const tray = new THREE.Mesh(new THREE.ExtrudeGeometry(trayShape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3 }), new THREE.MeshStandardMaterial({ color: 0x1a2046, metalness: 0.6, roughness: 0.35 }))
  tray.geometry.rotateX(-Math.PI / 2)
  tray.position.y = -0.36
  tray.receiveShadow = true
  scene.add(tray)
  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.66, 0.02, 4.66)), new THREE.LineBasicMaterial({ color: new THREE.Color('#818cf8').multiplyScalar(1.4), toneMapped: false, transparent: true, opacity: 0.6 }))
  void rim
  const socketGeo = new THREE.ExtrudeGeometry(roundRect(0.98, 0.98, 0.14), { depth: 0.04, bevelEnabled: false })
  socketGeo.rotateX(-Math.PI / 2)
  const socketMat = new THREE.MeshStandardMaterial({ color: 0x232a52, metalness: 0.3, roughness: 0.6 })
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const s = new THREE.Mesh(socketGeo, socketMat)
    s.position.set(-1.65 + c * 1.1, -0.05, -1.65 + r * 1.1)
    s.receiveShadow = true
    scene.add(s)
  }

  /* ---- タイル ---- */
  const tileGeo = new THREE.ExtrudeGeometry(roundRect(0.94, 0.94, 0.16), { depth: 1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 })
  tileGeo.rotateX(-Math.PI / 2)      // 押し出しが上向き（高さ）に
  tileGeo.translate(0, 0, 0)
  const faceTex = new Map()
  function faceTexture(n) {
    if (faceTex.has(n)) return faceTex.get(n)
    const cols = FACE[n] || FACE.super
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')
    const gr = g.createLinearGradient(0, 256, 256, 0)
    gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1])
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
    const hl = g.createLinearGradient(0, 0, 0, 256)
    hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)')
    g.fillStyle = hl; g.fillRect(0, 0, 256, 256)
    const txt = String(n)
    g.fillStyle = '#ffffff'
    g.font = '800 ' + (txt.length >= 4 ? 84 : txt.length === 3 ? 104 : 128) + 'px system-ui, sans-serif'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 8
    g.fillText(txt, 128, 136)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    // 押し出しの面の UV は形の座標（-0.47〜0.47）なので、0〜1 に合わせます
    t.repeat.set(1 / 0.94, 1 / 0.94); t.offset.set(0.5, 0.5)
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    faceTex.set(n, t)
    return t
  }
  const pool = [], live = new Map()
  function getTile(el) {
    let o = live.get(el)
    if (!o) {
      o = pool.pop() || makeTile()
      o.userData.born = performance.now()
      o.userData.val = 0
      o.userData.popAt = 0
      scene.add(o)
      live.set(el, o)
    }
    return o
  }
  function makeTile() {
    const top = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.3 })
    const side = new THREE.MeshStandardMaterial({ metalness: 0.5, roughness: 0.35 })
    const m = new THREE.Mesh(tileGeo, [top, side])
    m.castShadow = true
    m.receiveShadow = true
    const o = new THREE.Group()
    o.add(m)
    o.userData = { mesh: m, top, side }
    return o
  }
  function setValue(o, n) {
    if (o.userData.val === n) return
    o.userData.val = n
    const cols = FACE[n] || FACE.super
    o.userData.top.map = faceTexture(n)
    o.userData.top.emissiveMap = faceTexture(n)
    const lvl = Math.log2(n)
    o.userData.top.emissive = new THREE.Color(0xffffff)
    o.userData.top.emissiveIntensity = lvl >= 7 ? 0.15 + (lvl - 7) * 0.08 : 0
    o.userData.top.needsUpdate = true
    o.userData.side.color.set(cols[0]).multiplyScalar(0.6)
    o.userData.side.emissive.set(cols[1])
    o.userData.side.emissiveIntensity = lvl >= 7 ? 0.35 : 0.08
    if (o.userData.val && o.userData.val !== n) o.userData.popAt = performance.now()
  }

  /* ---- 合体の光の粒 ---- */
  const sparks = createPoints(260)
  scene.add(sparks.object)
  const bursts = []
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(167,139,250,1)'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.scale.set(9, 9, 1)
  scene.add(halo)

  const t0 = performance.now()
  let shakeT = 0, glowT = 0
  // 「揺れ」「光」は、印が付いた瞬間に1回だけ起こします。
  // 印が付いたままでも毎フレーム揺らし直さないように（以前はこれで画面がガタガタし続けました）。
  let hadShake = false, hadGlow = false
  new MutationObserver(() => {
    const sh = boardEl.classList.contains('shake'), gl = boardEl.classList.contains('glow')
    if (sh && !hadShake) shakeT = 1
    if (gl && !hadGlow) glowT = 1
    hadShake = sh; hadGlow = gl
  }).observe(boardEl, { attributes: true, attributeFilter: ['class'] })
  function render() {
    const now = performance.now()
    const t = (now - t0) / 1000
    // 時間で減らす（端末のコマ数に関係なく、揺れは約0.3秒・光は約0.8秒で消える）
    const dtS = Math.min(0.1, (now - (render.last || now)) / 1000); render.last = now
    shakeT *= Math.exp(-dtS * 12); glowT *= Math.exp(-dtS * 4)
    if (shakeT < 0.02) shakeT = 0
    camera.position.copy(base)
    if (shakeT > 0) camera.position.x += Math.sin(now / 18) * 0.12 * shakeT
    camera.lookAt(target)

    const bw = boardEl.clientWidth || 1
    const els = boardEl.querySelectorAll('.tile')
    const seen = new Set()
    els.forEach((el) => {
      const n = parseInt(el.textContent, 10)
      if (!n) return
      seen.add(el)
      const o = getTile(el)
      const prev = o.userData.val
      setValue(o, n)
      if (prev && prev !== n) {
        o.userData.popAt = now
        const cols = FACE[n] || FACE.super
        for (let i = 0; i < 8; i++) bursts.push({ x: 0, y: 0, z: 0, o, vx: (Math.random() - 0.5) * 0.08, vy: 0.04 + Math.random() * 0.08, vz: (Math.random() - 0.5) * 0.08, life: 1, col: cols[i % 2] })
      }
      // 動いている途中の位置（CSS の transition を含む）を読みます
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
      const cell = parseFloat(el.style.width) || bw / 4.6
      const cx = (m.m41 + cell / 2) / bw, cy = (m.m42 + cell / 2) / bw   // 0〜1
      const x = (cx - 0.5) * 4.6, z = (cy - 0.5) * 4.6
      const lvl = Math.log2(n)
      const h = 0.22 + lvl * 0.05
      // 出てきたときは上から落ちてきて、合体したときは跳ねます
      const age = (now - o.userData.born) / 1000
      const drop = el.classList.contains('new') || age < 0.25 ? Math.max(0, 1 - age / 0.25) : 0
      const pop = o.userData.popAt ? Math.max(0, 1 - (now - o.userData.popAt) / 260) : 0
      o.position.set(x, -0.05 + drop * 1.6 + Math.sin(pop * Math.PI) * 0.35, z)
      const sc = (cell / bw) * 4.6 / 0.94 * (1 + Math.sin(pop * Math.PI) * 0.12)
      o.scale.set(sc, h, sc)
      if (n >= 2048) o.rotation.y = Math.sin(t * 2) * 0.05
      else o.rotation.y = 0
    })
    for (const [el, o] of live) {
      if (seen.has(el)) continue
      live.delete(el); scene.remove(o); pool.push(o)
    }

    sparks.begin()
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]
      b.x += b.vx; b.y += b.vy; b.z += b.vz; b.vy -= 0.006; b.life -= 0.05
      if (b.life <= 0) { bursts.splice(i, 1); continue }
      sparks.add(b.o.position.x + b.x, 0.6 + b.y, b.o.position.z + b.z, b.col, 0.06, b.life * 0.8)
    }
    sparks.end()
    halo.material.opacity = glowT * 0.6
    glowLight.intensity = glowT * 20

    stage.render()
  }
  ;(function loop() {
    try { render() } catch (e) { boardEl.classList.remove('is3d'); canvas3d.remove(); console.warn('3D 表示を止めました（2D で続けます）', e); return }
    requestAnimationFrame(loop)
  })()
  window.PUZZLE3D = { ok: true, camera: () => camera.position.toArray() }
}

function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  return s
}

try { start() } catch (e) { console.warn('3D 表示を始められませんでした（2D で続けます）', e) }
