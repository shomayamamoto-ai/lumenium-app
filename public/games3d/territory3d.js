/* 陣取り（会員限定・private/territory.html）の 3DCG 表示。
 *
 * 72×72 マスの盤の計算は今までのまま。ここでは盤を 3D の地形として描きます。
 *   取った土地   → その人の色の、一段高いタイル
 *   引いている線 → 光る帯
 *   コマ         → 立体のコマ（あなたのコマは白い輪つき）
 * カメラは自分のコマを、斜め上から追いかけます。名前・得点の数字・危険の赤い縁・
 * 画面外の敵の矢印は 2D で上に重ね、その位置合わせに toScreen を出します。 */
import { THREE, webglOk, createStage, glowTexture, createPoints } from './common.js'

const T = () => window.TERRITORY && window.TERRITORY.get()

function start() {
  const cv = document.getElementById('cv')
  const g0 = T()
  if (!cv || !g0 || !webglOk()) return
  const canvas3d = document.createElement('canvas')
  canvas3d.setAttribute('aria-hidden', 'true')
  canvas3d.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:0;pointer-events:none;display:block'
  cv.before(canvas3d)
  let stage
  try {
    stage = createStage(canvas3d, cv, { clear: 0x070a16, fog: { color: 0x070a16, density: 0.018 }, bloom: { strength: 0.7, radius: 0.45, threshold: 0.75 }, fov: 45 })
  } catch (_) { canvas3d.remove(); return }
  const { scene, camera } = stage
  const W = g0.W, H = g0.H, N = W * H
  const cx = (x) => x + 0.5 - W / 2
  const cz = (y) => y + 0.5 - H / 2

  /* ---- 光 ---- */
  scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x161c3a, 1.15))
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  key.position.set(-20, 40, 25)
  scene.add(key)
  const meLight = new THREE.PointLight(0xffffff, 8, 10, 1.6)
  scene.add(meLight)

  /* ---- 盤の外: 暗い格子の地面 ---- */
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW;
      float line(float v, float w){ float f = abs(fract(v) - 0.5); return smoothstep(0.5 - w, 0.5, f); }
      void main(){ float g = max(line(vW.x / 4.0, 0.015), line(vW.z / 4.0, 0.015)); vec3 c = vec3(0.012, 0.015, 0.035) + vec3(0.2, 0.2, 0.55) * g * 0.06; gl_FragColor = vec4(c, 1.0); }`,
  }))
  outside.rotation.x = -Math.PI / 2
  outside.position.y = -0.6
  scene.add(outside)
  // 盤の下地（マスのすき間から外の格子が見えないように）
  const under = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: 0x0b0f26, roughness: 0.9 }))
  under.rotation.x = -Math.PI / 2
  under.position.y = 0.001
  scene.add(under)
  // 盤の縁: 光る壁
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#6366f1').multiplyScalar(1.6), toneMapped: false })
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1b2148, metalness: 0.7, roughness: 0.35 })
  for (const [x, z, w, d] of [[0, -H / 2 - 0.3, W + 1.2, 0.6], [0, H / 2 + 0.3, W + 1.2, 0.6], [-W / 2 - 0.3, 0, 0.6, H], [W / 2 + 0.3, 0, 0.6, H]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), wallMat)
    wall.position.set(x, 0, z)
    const glow = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d * 0.4), edgeMat)
    glow.position.set(x, 0.58, z)
    scene.add(wall); scene.add(glow)
  }

  /* ---- マス（5184 個を 1 回で描きます） ---- */
  const cellGeo = new THREE.BoxGeometry(0.96, 1, 0.96)
  cellGeo.translate(0, 0.5, 0)        // 底が 0、高さは scale.y
  const cells = new THREE.InstancedMesh(cellGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.25, roughness: 0.55 }), N)
  cells.frustumCulled = false
  scene.add(cells)
  const trailMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.18, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false }), N)
  trailMesh.frustumCulled = false
  trailMesh.count = 0
  scene.add(trailMesh)
  const flashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.1, 0.98), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 2000)
  flashMesh.frustumCulled = false
  flashMesh.count = 0
  scene.add(flashMesh)

  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), tc = new THREE.Color()
  const seenOwner = new Uint8Array(N).fill(255)
  const ownerCol = [null, ...[1, 2, 3, 4].map((i) => new THREE.Color((g0.COLORS[i] || {}).base || '#ffffff'))]
  const OWN_H = 0.42, FREE_H = 0.12
  function paintCell(i, o) {
    const x = i % W, y = (i / W) | 0
    tp.set(cx(x), 0, cz(y))
    ts.set(1, o ? OWN_H : FREE_H, 1)
    tm.compose(tp, tq.identity(), ts)
    cells.setMatrixAt(i, tm)
    if (o) cells.setColorAt(i, tc.copy(ownerCol[o] || ownerCol[1]).multiplyScalar(0.8))
    else cells.setColorAt(i, tc.set((x + y) % 2 ? '#222a58' : '#283163'))
  }

  /* ---- コマ ---- */
  const pieces = new Map()
  function piece(p) {
    let o = pieces.get(p.id)
    if (o) return o
    const col = (g0.COLORS[p.id] || {}).base || '#ffffff'
    o = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.5, 24), new THREE.MeshStandardMaterial({ color: col, metalness: 0.5, roughness: 0.25, emissive: col, emissiveIntensity: 0.25 }))
    body.position.y = 0.25
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.1, emissive: col, emissiveIntensity: 0.5 }))
    dome.position.y = 0.5
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: col, emissiveIntensity: 0.6 }))
    nose.rotation.z = -Math.PI / 2
    nose.position.set(0.55, 0.3, 0)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: glowTexture('rgba(0,0,0,1)'), transparent: true, opacity: 0.55, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.01
    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color('#a5b4fc').multiplyScalar(1.4), wireframe: true, transparent: true, opacity: 0.6, toneMapped: false }))
    shield.position.y = 0.4
    o.add(shadow); o.add(body); o.add(dome); o.add(nose); o.add(shield)
    if (p.human) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.04, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: false }))
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.05
      o.add(ring)
      o.userData.ring = ring
    }
    Object.assign(o.userData, { shield, body })
    scene.add(o)
    pieces.set(p.id, o)
    return o
  }

  /* ---- アイテム ---- */
  const itemPool = new Map()
  function itemMesh(it) {
    let o = itemPool.get(it)
    if (o) return o
    const def = (g0.ITEMS || {})[it.kind || it.type] || { color: '#ffffff' }
    o = new THREE.Group()
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.15, flatShading: true }))
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)'), color: new THREE.Color(def.color), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }))
    halo.scale.set(2, 2, 1)
    o.add(halo); o.add(gem)
    o.userData.gem = gem
    scene.add(o)
    itemPool.set(it, o)
    return o
  }

  const sparks = createPoints(300)
  scene.add(sparks.object)

  /* ---- カメラ: 自分のコマを斜め上から追う（短い辺に 30 マスほど） ---- */
  const TILT = THREE.MathUtils.degToRad(56)
  const look = new THREE.Vector3(), camPos = new THREE.Vector3(), want = new THREE.Vector3(), v = new THREE.Vector3()
  let camReady = false, lastT = performance.now()
  function camDist() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const aspect = stage.w / stage.h
    return aspect < 1 ? 15 / (tanH * aspect) : 15 / tanH
  }

  function render() {
    const g = T()
    if (!g) return
    const now = performance.now()
    const dt = Math.min(0.05, (now - lastT) / 1000)
    lastT = now
    // 盤（変わったマスだけ書き直す）
    const owner = g.owner, trail = g.trail
    let dirty = false
    for (let i = 0; i < N; i++) {
      const o = owner[i]
      if (seenOwner[i] !== o) { seenOwner[i] = o; paintCell(i, o); dirty = true }
    }
    if (dirty) { cells.instanceMatrix.needsUpdate = true; if (cells.instanceColor) cells.instanceColor.needsUpdate = true }
    let nt = 0
    for (const p of g.players) {
      for (const c of p.trailCells || []) {
        const i = typeof c === 'number' ? c : (c.y * W + c.x)
        if (!trail[i]) continue
        const x = i % W, y = (i / W) | 0
        tm.compose(tp.set(cx(x), 0.2 + (owner[i] ? OWN_H - FREE_H : 0), cz(y)), tq.identity(), ts.set(1, 1, 1))
        trailMesh.setMatrixAt(nt, tm)
        trailMesh.setColorAt(nt, tc.copy(ownerCol[p.id] || ownerCol[1]).multiplyScalar(1.4))
        nt++
      }
    }
    trailMesh.count = nt
    trailMesh.instanceMatrix.needsUpdate = true
    if (trailMesh.instanceColor) trailMesh.instanceColor.needsUpdate = true
    // 取ったばかりのマスを光らせる
    let nf = 0
    if (g.flash && now < g.flash.until) {
      const k = (g.flash.until - now) / 420
      flashMesh.material.opacity = 0.7 * k
      for (const fc of g.flash.cells) {
        if (nf >= 2000) break
        const i = typeof fc === 'number' ? fc : (fc.y * W + fc.x)
        const x = i % W, y = (i / W) | 0
        tm.compose(tp.set(cx(x), OWN_H + 0.05 + (1 - k) * 0.6, cz(y)), tq.identity(), ts.set(1, 1, 1))
        flashMesh.setMatrixAt(nf++, tm)
      }
    }
    flashMesh.count = nf
    flashMesh.instanceMatrix.needsUpdate = true

    // コマ
    let meHead = null
    for (const p of g.players) {
      const o = piece(p)
      o.visible = !!p.alive
      if (!p.alive) continue
      const h = g.headPos(p)
      const y = owner[(Math.round(h.y) * W + Math.round(h.x)) | 0] ? OWN_H : FREE_H
      o.position.set(cx(h.x), y, cz(h.y))
      const d = g.DIRS[p.dir] || [1, 0]
      const targetRot = Math.atan2(-d[1], d[0])
      let dr = targetRot - o.rotation.y
      while (dr > Math.PI) dr -= Math.PI * 2
      while (dr < -Math.PI) dr += Math.PI * 2
      o.rotation.y += dr * (1 - Math.exp(-dt * 14))
      o.userData.shield.visible = now < p.shieldUntil
      o.userData.shield.rotation.y = now / 400
      if (o.userData.ring) o.userData.ring.scale.setScalar(1 + 0.08 * Math.sin(now / 200))
      if (now < p.boostUntil && Math.random() < 0.7) sparkTrail.push({ x: o.position.x - d[0] * 0.5, y: 0.35, z: o.position.z - d[1] * 0.5, life: 1, col: '#67e8f9' })
      if (p === g.me) meHead = o.position
    }
    // アイテム
    const keep = new Set()
    for (const it of g.items) {
      const o = itemMesh(it)
      keep.add(it)
      o.position.set(cx(it.x), 0.9 + Math.sin(now / 300 + it.x) * 0.15, cz(it.y))
      o.userData.gem.rotation.y = now / 500
    }
    for (const [it, o] of itemPool) if (!keep.has(it)) { scene.remove(o); itemPool.delete(it) }

    sparks.begin()
    for (let i = sparkTrail.length - 1; i >= 0; i--) {
      const s = sparkTrail[i]
      s.life -= dt * 2.5
      if (s.life <= 0) { sparkTrail.splice(i, 1); continue }
      s.y += dt * 0.6
      sparks.add(s.x, s.y, s.z, s.col, 0.18, s.life)
    }
    sparks.end()

    // カメラ
    const focus = meHead || (g.players[0] && pieces.get(g.players[0].id) && pieces.get(g.players[0].id).position) || new THREE.Vector3()
    const dist = camDist()
    // 霧はカメラの距離に合わせる（縦長の画面ではカメラが遠いので、固定の濃さだと暗くなりすぎる）
    scene.fog.density = 0.45 / dist
    want.set(focus.x, 0, focus.z)
    if (!camReady || look.distanceTo(want) > 8) { look.copy(want); camReady = true }
    else look.lerp(want, 1 - Math.pow(0.0025, dt))
    camPos.set(look.x, Math.sin(TILT) * dist, look.z + Math.cos(TILT) * dist)
    camera.position.copy(camPos)
    if (now < g.shakeUntil) {
      const k = (g.shakeUntil - now) / 380
      camera.position.x += (Math.random() - 0.5) * 0.5 * k
      camera.position.z += (Math.random() - 0.5) * 0.5 * k
    }
    camera.lookAt(look)
    if (meHead) { meLight.position.set(meHead.x, 2, meHead.z); meLight.intensity = 8 } else meLight.intensity = 0

    stage.render()
  }
  const sparkTrail = []

  /* 2D の文字の位置合わせ（画面の CSS ピクセル） */
  function toScreen(x, y, h = 1.1) {
    v.set(cx(x), h, cz(y)).project(camera)
    return { x: (v.x + 1) / 2 * stage.w, y: (1 - v.y) / 2 * stage.h, behind: v.z > 1 }
  }

  window.TERRITORY3D = { ok: true, toScreen }
  ;(function loop() {
    if (window.TERRITORY3D.ok) {
      try { render() } catch (e) { window.TERRITORY3D.ok = false; canvas3d.remove(); console.warn('3D 表示を止めました（2D で続けます）', e); return }
    }
    requestAnimationFrame(loop)
  })()
}

try { start() } catch (e) { console.warn('3D 表示を始められませんでした（2D で続けます）', e) }
