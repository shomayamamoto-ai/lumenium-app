/* LUMEN BREAKER（会員限定・private/arena.html）の 3DCG 表示。
 *
 * 盤（480×640）の計算は今までのまま。ここでは盤を少し傾けた 3D の台にして、
 * ブロックは厚みのある立体、パドルは金属のカプセル、ボールは光源を持つ玉
 * （近くのブロックを照らします）として描きます。床は映り込みのある黒い鏡面。
 * 文字・計器は今までどおり 2D で上に重ね、指の位置は toGameX で盤の x に直します。 */
import { THREE, webglOk, createStage, glowTexture, labelTexture, hullMaterial, glowMaterial, createPoints, createBinder } from './common.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const W = 480, H = 640, S = 1 / 40
const X = (x) => (x - W / 2) * S
const Z = (y) => (y - H / 2) * S
const B = () => window.BREAKER && window.BREAKER.get()

function start() {
  const wrap = document.getElementById('wrap')
  const cv = document.getElementById('cv')
  const canvas3d = document.getElementById('cv3d')
  if (!wrap || !cv || !canvas3d || !B() || !webglOk()) return
  let stage
  try {
    stage = createStage(canvas3d, wrap, { clear: 0x070a16, bloom: { strength: 0.7, radius: 0.5, threshold: 0.82 }, fov: 42 })
  } catch (_) { return }
  canvas3d.style.display = 'block'
  const { scene, camera, renderer } = stage
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.3

  /* ---- カメラ: 盤全体が、画面（縦横比はまちまち）に収まるように ---- */
  const TILT = THREE.MathUtils.degToRad(60)
  const target = new THREE.Vector3(), base = new THREE.Vector3(), v = new THREE.Vector3()
  const corners = [[-6, -8], [6, -8], [-6, 8.4], [6, 8.4]].map(([x, z]) => new THREE.Vector3(x, 0.3, z))
  function place(dist, tz) {
    target.set(0, 0, tz)
    camera.position.set(0, Math.sin(TILT) * dist, tz + Math.cos(TILT) * dist)
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }
  function fit() {
    let best = null
    for (let dist = 8; dist < 70 && !best; dist += 0.25) {
      let pick = null
      for (let tz = -3; tz <= 3; tz += 0.1) {
        place(dist, tz)
        if (corners.some((c) => { v.copy(c).project(camera); return Math.abs(v.x) > 0.97 || Math.abs(v.y) > 0.95 })) continue
        const sk = Math.abs(v.copy(corners[0]).project(camera).y + v.copy(corners[2]).project(camera).y)
        if (!pick || sk < pick.sk) pick = { dist, tz, sk }
      }
      best = pick
    }
    best = best || { dist: 28, tz: 0 }
    place(best.dist, best.tz)
    base.copy(camera.position)
  }
  stage.onResize = fit
  fit()

  /* ---- 光 ---- */
  scene.add(new THREE.HemisphereLight(0x99a6ff, 0x0a0d1f, 0.4))
  const key = new THREE.DirectionalLight(0xffffff, 1.3)
  key.position.set(-6, 14, 9)
  scene.add(key)
  const ballLight = new THREE.PointLight(0xc7f0ff, 0, 7, 1.6)
  scene.add(ballLight)
  const blastLight = new THREE.PointLight(0xfb923c, 0, 9, 1.4)
  scene.add(blastLight)

  /* ---- 台: 黒い鏡面の床・光る壁 ---- */
  const floor = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.3, 16.8), new THREE.MeshStandardMaterial({ color: 0x0b0f22, metalness: 0.85, roughness: 0.22 }))
  floor.position.y = -0.15
  scene.add(floor)
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(12, 16.4), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv;
      float line(float v, float w){ float f = abs(fract(v) - 0.5); return smoothstep(0.5 - w, 0.5, f); }
      void main(){ float g = max(line(vUv.x * 12.0, 0.02), line(vUv.y * 16.0, 0.02)); gl_FragColor = vec4(vec3(0.3, 0.32, 0.9) * g * 0.22, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  grid.rotation.x = -Math.PI / 2
  grid.position.y = 0.005
  scene.add(grid)
  const wallMat = hullMaterial('#1c2248', { metal: 0.85, rough: 0.3, glow: 0.05 })
  const wallGlow = glowMaterial('#6366f1')
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 16.8), wallMat)
    wall.position.set(sx * 6.15, 0.2, 0)
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 16.8), wallGlow)
    strip.position.set(sx * 6.0, 0.5, 0)
    scene.add(wall); scene.add(strip)
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.7, 0.3), wallMat)
  top.position.set(0, 0.2, -8.4)
  scene.add(top)
  const topStrip = new THREE.Mesh(new THREE.BoxGeometry(12.3, 0.06, 0.06), wallGlow)
  topStrip.position.set(0, 0.5, -8.25)
  scene.add(topStrip)
  // 落ちたら失う側の赤い線
  const deathLine = new THREE.Mesh(new THREE.BoxGeometry(12, 0.03, 0.05), glowMaterial('#f43f5e', 0.6))
  deathLine.material.transparent = true
  deathLine.position.set(0, 0.02, Z(H - 6))
  scene.add(deathLine)

  /* ---- ブロック ---- */
  const brickGeo = new THREE.BoxGeometry(1, 1, 1)
  const brickEdges = new THREE.EdgesGeometry(brickGeo)
  const brickBinder = createBinder(makeBrick, scene)
  function makeBrick(kind) {
    const o = new THREE.Group()
    let mat
    if (kind === 'a') mat = new THREE.MeshStandardMaterial({ color: 0xd5dbe8, metalness: 1, roughness: 0.18 })
    else if (kind === 'x') mat = new THREE.MeshStandardMaterial({ color: 0xfb923c, metalness: 0.2, roughness: 0.35, emissive: 0xf97316, emissiveIntensity: 0.6 })
    else if (kind === 'b') mat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, metalness: 0.5, roughness: 0.3, emissive: 0x9d174d, emissiveIntensity: 0.5 })
    else mat = new THREE.MeshStandardMaterial({ color: 0x818cf8, metalness: 0.35, roughness: 0.32, emissive: 0x818cf8, emissiveIntensity: 0.08 })
    const body = new THREE.Mesh(brickGeo, mat)
    const edges = new THREE.LineSegments(brickEdges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: kind === 'a' ? 0.25 : 0.4 }))
    o.add(body); o.add(edges)
    if (kind === 'x') {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), glowMaterial('#fff1c7'))
      core.position.y = 0.55
      o.add(core)
      o.userData.core = core
    }
    if (kind === 'b') {
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
      label.rotation.x = -Math.PI / 2
      label.position.y = 0.51
      o.add(label)
      o.userData.label = label
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.02, 8, 48), glowMaterial('#fb7185'))
      ring.rotation.x = Math.PI / 2
      o.add(ring)
      o.userData.ring = ring
    }
    Object.assign(o.userData, { body, mat, edges })
    return o
  }

  /* ---- パドル ---- */
  const paddle = new THREE.Group()
  const pBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 8, 24), new THREE.MeshStandardMaterial({ color: 0x5266e0, metalness: 0.85, roughness: 0.2, emissive: 0x1e2a8a, emissiveIntensity: 0.4 }))
  pBody.rotation.z = Math.PI / 2
  const pStripe = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.06), glowMaterial('#a5b4fc'))
  pStripe.position.set(0, 0.32, -0.3)
  const cannons = []
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.45, 10), glowMaterial('#c084fc'))
    c.rotation.x = Math.PI / 2
    c.position.set(sx * 0.42, 0.3, -0.25)
    paddle.add(c); cannons.push(c)
  }
  paddle.add(pBody); paddle.add(pStripe)
  scene.add(paddle)

  /* ---- ボール・カプセル・レーザー ---- */
  const ballBinder = createBinder(() => {
    const o = new THREE.Group()
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.1, emissive: 0xbfeaff, emissiveIntensity: 1.2 }))
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(165,243,252,1)'), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }))
    halo.scale.set(4, 4, 1)
    o.add(halo); o.add(ball)
    return o
  }, scene)
  const CAP_COL = { W: '#3b82f6', M: '#a855f7', S: '#06b6d4', L: '#ef4444', Z: '#8b5cf6', C: '#14b8a6' }
  const capBinder = createBinder((k) => {
    const col = CAP_COL[k] || '#818cf8'
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.3, 6, 16), new THREE.MeshStandardMaterial({ map: labelTexture(k, { bg: col, font: '800 64px sans-serif' }), metalness: 0.3, roughness: 0.2, emissive: new THREE.Color(col), emissiveIntensity: 0.35 }))
    m.rotation.z = Math.PI / 2
    const o = new THREE.Group(); o.add(m)
    o.userData.pill = m
    return o
  }, scene)
  const boltBinder = createBinder(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), glowMaterial('#d8b4fe'))
    m.rotation.x = Math.PI / 2
    const o = new THREE.Group(); o.add(m)
    return o
  }, scene)
  const sparks = createPoints(500)
  scene.add(sparks.object)
  const labelCache = new Map()

  function render() {
    const g = B()
    if (!g) return
    const now = performance.now() / 1000
    camera.position.copy(base)
    if (g.shake > 0.3) { camera.position.x += (Math.random() - 0.5) * g.shake * S; camera.position.z += (Math.random() - 0.5) * g.shake * S }
    camera.lookAt(target)

    brickBinder.begin()
    let blast = 0
    for (const br of g.bricks) {
      if (br.dead) continue
      const kind = br.boss ? 'b' : br.type
      const o = brickBinder.get(br, kind)
      const u = o.userData
      const hpk = Math.max(0, br.hp) / (br.max || 1)
      const hgt = br.boss ? 0.9 : 0.45 + 0.25 * hpk
      o.position.set(X(br.x + br.w / 2), hgt / 2, Z(br.y + br.h / 2))
      o.scale.set(br.w * S, hgt, br.h * S)
      if (kind === 'n') { u.mat.color.set(br.col).multiplyScalar(0.75); u.mat.emissive.set(br.col); u.mat.emissiveIntensity = 0.04 + 0.12 * hpk }
      if (kind === 'x') { u.mat.emissiveIntensity = 0.5 + 0.4 * Math.sin(g.tick * 0.16 + br.x * 0.05); u.core.scale.setScalar(1 / Math.max(0.3, br.w * S) * 0.6); u.core.scale.y = 1 / hgt * 0.6; blast = Math.max(blast, 0) }
      if (kind === 'b') {
        u.ring.rotation.z = now
        u.ring.scale.set(1, 1, 1)
        u.mat.emissiveIntensity = 0.45 + 0.25 * Math.sin(g.tick * 0.1)
        if (!labelCache.has(br.name)) labelCache.set(br.name, labelTexture(br.name, { bg: '#be123c', size: 256, font: '800 46px sans-serif', border: 'rgba(255,255,255,.3)' }))
        u.label.material.map = labelCache.get(br.name)
        u.label.material.needsUpdate = u.fresh
        u.label.scale.set(0.98, 0.98, 1)
      }
    }
    brickBinder.end()

    const p = g.paddle
    paddle.position.set(X(p.x), 0.32, Z(p.y + p.h / 2))
    paddle.scale.set(Math.max(0.5, (p.w * S) / 2), 0.55, 0.55)
    pBody.material.emissive.set(g.stickyT > 0 ? '#14b8a6' : '#1e2a8a')
    cannons.forEach((c) => { c.visible = g.laserT > 0 })
    paddle.visible = g.state !== 'start'

    ballBinder.begin()
    let first = null
    for (const b of g.balls) {
      const o = ballBinder.get(b, 'b')
      o.position.set(X(b.x), 0.32, Z(b.y))
      o.scale.setScalar(b.r * S)
      if (!first) first = o
    }
    ballBinder.end()
    if (first) { ballLight.position.set(first.position.x, 0.9, first.position.z); ballLight.intensity = 5 } else ballLight.intensity = 0

    capBinder.begin()
    for (const c of g.caps) {
      const o = capBinder.get(c, c.k)
      o.position.set(X(c.x), 0.35, Z(c.y))
      o.userData.pill.rotation.x = now * 3
    }
    capBinder.end()

    boltBinder.begin()
    for (const bo of g.bolts) {
      const o = boltBinder.get(bo, 'z')
      o.position.set(X(bo.x), 0.35, Z(bo.y))
    }
    boltBinder.end()

    sparks.begin()
    for (const q of g.parts) {
      if (q._h === undefined) { q._h = 0.3 + Math.random() * 0.2; q._vh = 0.02 + Math.random() * 0.06 }
      q._h += q._vh; q._vh -= 0.003
      sparks.add(X(q.x), Math.max(0.03, q._h), Z(q.y), q.col || '#ffffff', 0.12, Math.max(0, q.life))
      if (q.col === '#fb923c' && q.life > 0.85) blast = 1
    }
    for (const b of g.balls) {
      (b.trail || []).forEach((t, i, arr) => sparks.add(X(t.x), 0.32, Z(t.y), '#a5f3fc', b.r * S * 1.2 * (i + 1) / arr.length, 0.25 * (i + 1) / arr.length))
    }
    sparks.end()
    if (blast) { blastLight.intensity = 30 }
    blastLight.intensity *= 0.85
    deathLine.material.opacity = 0.35 + 0.25 * Math.sin(now * 3) + (g.flash > 0 ? 0.4 : 0)

    stage.render()
  }

  /* ---- 2D の文字と 3D の位置合わせ（文字は 2D の盤の座標系で描かれるので、その座標に直します） ---- */
  function toScreen(x, y, h = 0.4) {
    v.set(X(x), h, Z(y)).project(camera)
    const r = wrap.getBoundingClientRect()
    const sc = Math.min(r.width / W, r.height / H)
    const sx = (v.x + 1) / 2 * r.width, sy = (1 - v.y) / 2 * r.height
    return { x: (sx - (r.width - W * sc) / 2) / sc, y: (sy - (r.height - H * sc) / 2) / sc }
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3()
  function toGameX(clientX) {
    const r = wrap.getBoundingClientRect()
    const g = B()
    const py = g ? g.paddle.y : H - 48
    // パドルの高さの行で、指の横位置を盤の x に直します
    const ps = toScreenPx(W / 2, py)
    ndc.set((clientX - r.left) / r.width * 2 - 1, 1 - ps.y / r.height * 2)
    camera.position.copy(base); camera.lookAt(target); camera.updateMatrixWorld()
    ray.setFromCamera(ndc, camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.32)
    if (!ray.ray.intersectPlane(plane, hit)) return null
    return hit.x / S + W / 2
  }
  function toScreenPx(x, y) {
    v.set(X(x), 0.32, Z(y)).project(camera)
    const r = wrap.getBoundingClientRect()
    return { x: (v.x + 1) / 2 * r.width, y: (1 - v.y) / 2 * r.height }
  }

  window.BREAKER3D = { ok: true, toScreen, toGameX }
  ;(function loop() {
    if (window.BREAKER3D.ok) {
      try { render() } catch (e) { window.BREAKER3D.ok = false; canvas3d.style.display = 'none'; console.warn('3D 表示を止めました（2D で続けます）', e); return }
    }
    requestAnimationFrame(loop)
  })()
}

try { start() } catch (e) { console.warn('3D 表示を始められませんでした（2D で続けます）', e) }
