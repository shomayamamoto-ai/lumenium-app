/* LUMEN DEFENSE（public/racing.html）の 3DCG 表示。
 *
 * 盤（20×15 マス、1マス 28px）の計算は今までのまま。ここでは盤を少し傾けた
 * 3D のジオラマとして描きます。マス目は立体の床、敵の通り道は一段低い光る溝、
 * タワーは種類ごとの立体の形、敵は弾むように進む立体の形。
 * 文字・計器・バナーは今までどおり 2D で上に重ね、タップした場所は toBoard で
 * 盤のマスに直します。 */
import {
  THREE, webglOk, createStage, glowTexture, hullMaterial, glowMaterial, createPoints, createRingPool, createBinder, shade,
} from './common.js'

const G = window
const W = 560, H = 420, S = 1 / 28
const X = (x) => (x - W / 2) * S
const Z = (y) => (y - H / 2) * S

function start() {
  const canvas2d = document.getElementById('c')
  const canvas3d = document.getElementById('c3d')
  if (!canvas2d || !canvas3d || !webglOk()) return
  let stage
  try {
    stage = createStage(canvas3d, canvas2d, { clear: 0x030617, bloom: { strength: 0.8, radius: 0.45, threshold: 0.7 }, fov: 40, shadows: true })
  } catch (_) { return }
  const { scene, camera, renderer } = stage

  /* ---- カメラ: 盤がちょうど収まるように ---- */
  const TILT = THREE.MathUtils.degToRad(64)
  const target = new THREE.Vector3(), base = new THREE.Vector3(), v = new THREE.Vector3()
  const corners = [[-10, -7.5], [10, -7.5], [-10, 7.5], [10, 7.5]].map(([x, z]) => new THREE.Vector3(x, 0, z))
  function place(dist, tz) {
    target.set(0, 0, tz)
    camera.position.set(0, Math.sin(TILT) * dist, tz + Math.cos(TILT) * dist)
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }
  function fit() {
    let best = null
    for (let dist = 10; dist < 70 && !best; dist += 0.25) {
      let pick = null
      for (let tz = -2; tz <= 2; tz += 0.1) {
        place(dist, tz)
        if (corners.some((c) => { v.copy(c).project(camera); return Math.abs(v.x) > 0.99 || Math.abs(v.y) > 0.98 })) continue
        const sk = Math.abs(v.copy(corners[0]).project(camera).y + v.copy(corners[2]).project(camera).y)
        if (!pick || sk < pick.sk) pick = { dist, tz, sk }
      }
      best = pick
    }
    best = best || { dist: 30, tz: 0 }
    place(best.dist, best.tz)
    base.copy(camera.position)
  }
  stage.onResize = fit
  fit()

  /* ---- 光 ---- */
  scene.add(new THREE.HemisphereLight(0xaab8ff, 0x141a40, 1.1))
  const sun = new THREE.DirectionalLight(0xffffff, 2.3)
  sun.position.set(-8, 16, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 50 })
  sun.shadow.bias = -0.0015
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0x22d3ee, 0.6)
  fill.position.set(10, 5, -8)
  scene.add(fill)

  /* ---- 盤 ---- */
  const tileGeo = new THREE.BoxGeometry(0.94, 0.34, 0.94)
  const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.15 }), 300)
  tiles.receiveShadow = true
  scene.add(tiles)
  const pathGeo = new THREE.BoxGeometry(1, 0.12, 1)
  const pathTiles = new THREE.InstancedMesh(pathGeo, new THREE.MeshStandardMaterial({ color: 0x15204a, roughness: 0.35, metalness: 0.5, emissive: 0x0b3f5c, emissiveIntensity: 0.6 }), 300)
  pathTiles.receiveShadow = true
  scene.add(pathTiles)
  const base3d = new THREE.Mesh(new THREE.BoxGeometry(20.6, 0.6, 15.6), new THREE.MeshStandardMaterial({ color: 0x0a0f26, roughness: 0.6, metalness: 0.4 }))
  base3d.position.y = -0.62
  scene.add(base3d)
  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(20.6, 0.6, 15.6)), new THREE.LineBasicMaterial({ color: new THREE.Color('#6366f1').multiplyScalar(1.5), toneMapped: false }))
  rim.position.y = -0.62
  scene.add(rim)
  // 通り道を流れる矢印
  const arrowGeo = new THREE.ConeGeometry(0.16, 0.36, 3); arrowGeo.rotateZ(-Math.PI / 2)
  const arrows = new THREE.InstancedMesh(arrowGeo, glowMaterial('#22d3ee', 0.55), 120)
  arrows.material.transparent = true
  scene.add(arrows)
  // 出発の門と、守る光の核
  const portal = new THREE.Group()
  const pRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 12, 48), glowMaterial('#34d399'))
  const pDisc = new THREE.Mesh(new THREE.CircleGeometry(0.52, 32), new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
  portal.add(pRing); portal.add(pDisc)
  scene.add(portal)
  const core = new THREE.Group()
  const coreGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xdc2626, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.1, flatShading: true }))
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 40), glowMaterial('#f87171'))
  coreRing.rotation.x = Math.PI / 2
  const coreLight = new THREE.PointLight(0xef4444, 5, 6, 1.5)
  core.add(coreGem); core.add(coreRing); core.add(coreLight)
  scene.add(core)
  let builtFor = null, lastLives = null, coreHit = 0
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), tc = new THREE.Color()

  function buildBoard() {
    const path = G.pathData || []
    const set = new Set(path.map((p) => p[0] + ',' + p[1]))
    let n = 0, m = 0
    for (let gy = 0; gy < 15; gy++) {
      for (let gx = 0; gx < 20; gx++) {
        const cx = (gx + 0.5) - 10, cz = (gy + 0.5) - 7.5
        if (set.has(gx + ',' + gy)) {
          tm.compose(tp.set(cx, -0.26, cz), tq.identity(), ts.set(1, 1, 1))
          pathTiles.setMatrixAt(m++, tm)
        } else {
          const h = 1 + ((gx * 7 + gy * 13) % 5) * 0.05
          tm.compose(tp.set(cx, -0.17 * h + 0.0, cz), tq.identity(), ts.set(1, h, 1))
          tiles.setMatrixAt(n, tm)
          tiles.setColorAt(n, tc.set((gx + gy) % 2 ? '#1c2452' : '#232c63'))
          n++
        }
      }
    }
    tiles.count = n; pathTiles.count = m
    tiles.instanceMatrix.needsUpdate = pathTiles.instanceMatrix.needsUpdate = true
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true
    const s = path[0], g = path[path.length - 1]
    if (s) { portal.position.set(s[0] + 0.5 - 10, 0.55, s[1] + 0.5 - 7.5) }
    if (g) { core.position.set(g[0] + 0.5 - 10, 0.75, g[1] + 0.5 - 7.5) }
    builtFor = G.pathData
  }

  /* ---- タワー ---- */
  const TYPES = G.towerTypes || []
  const towerBinder = createBinder(makeTower, scene)
  function makeTower(type) {
    const t = TYPES[type] || { col: '#6366f1', bullet: '#818cf8' }
    const o = new THREE.Group()
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.22, 8), hullMaterial('#141a38', { metal: 0.8, rough: 0.35, glow: 0 }))
    plinth.position.y = 0.11
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 32), glowMaterial(t.col))
    band.rotation.x = Math.PI / 2; band.position.y = 0.22
    o.add(plinth); o.add(band)
    const head = new THREE.Group()
    head.position.y = 0.22
    const mat = hullMaterial(t.col, { metal: 0.6, rough: 0.28, glow: 0.25 })
    const dark = hullMaterial(shade(t.col, 0.45), { metal: 0.85, rough: 0.25, glow: 0.05 })
    const turret = new THREE.Group()  // 敵の方を向く部分
    switch (type) {
      case 0: { // ノーマル: 砲塔
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.3, 10), mat); body.position.y = 0.15
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 10), dark); barrel.rotation.z = Math.PI / 2; barrel.position.set(0.3, 0.2, 0)
        turret.add(body); turret.add(barrel); break
      }
      case 1: { // フリーズ: 氷の結晶
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshPhysicalMaterial({ color: 0xa5f3fc, emissive: 0x0891b2, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0, clearcoat: 1, flatShading: true }))
        crystal.scale.set(0.8, 1.5, 0.8); crystal.position.y = 0.5
        const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 6, 32), glowMaterial('#67e8f9')); r1.position.y = 0.5
        head.add(crystal); head.add(r1); o.userData.spin = [crystal, r1]; break
      }
      case 2: { // ボム: 迫撃砲
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat)
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.38, 12), dark); barrel.rotation.z = -Math.PI / 3.2; barrel.position.set(0.12, 0.28, 0)
        turret.add(body); turret.add(barrel); break
      }
      case 3: { // レーザー: 塔と発光球
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.62, 6), mat); mast.position.y = 0.31
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), glowMaterial('#fde047')); orb.position.y = 0.72
        head.add(mast); head.add(orb); o.userData.orb = orb; break
      }
      case 4: { // 毒: タンク
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.32, 6, 12), new THREE.MeshPhysicalMaterial({ color: 0x34d399, emissive: 0x059669, emissiveIntensity: 0.7, transparent: true, opacity: 0.85, roughness: 0.1, clearcoat: 1 }))
        tank.position.y = 0.42
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.1, 10), dark); cap.position.y = 0.78
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 8), dark); nozzle.rotation.z = Math.PI / 2; nozzle.position.set(0.25, 0.3, 0)
        head.add(tank); head.add(cap); turret.add(nozzle); break
      }
      case 5: { // スナイパー: 長い銃身
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.24), mat); body.position.y = 0.18
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.85, 8), dark); barrel.rotation.z = Math.PI / 2; barrel.position.set(0.55, 0.2, 0)
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 10), dark); scope.rotation.z = Math.PI / 2; scope.position.set(0.05, 0.33, 0)
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), glowMaterial('#fb7185')); lens.rotation.y = Math.PI / 2; lens.position.set(0.165, 0.33, 0)
        turret.add(body); turret.add(barrel); turret.add(scope); turret.add(lens); break
      }
      default: { // チェーン: テスラ塔
        const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.55, 8), dark); coil.position.y = 0.28
        head.add(coil)
        for (let i = 0; i < 3; i++) {
          const r = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.04, 0.03, 6, 24), mat)
          r.rotation.x = Math.PI / 2; r.position.y = 0.18 + i * 0.17
          head.add(r)
        }
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), glowMaterial('#d8b4fe')); ball.position.y = 0.66
        head.add(ball); o.userData.orb = ball
      }
    }
    head.add(turret)
    o.add(head)
    // レベルの印（小さな光る玉）
    const pips = []
    for (let i = 0; i < 6; i++) {
      const pip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glowMaterial('#facc15'))
      const a = (i / 6) * Math.PI * 2
      pip.position.set(Math.cos(a) * 0.36, 0.25, Math.sin(a) * 0.36)
      pip.visible = false
      o.add(pip); pips.push(pip)
    }
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true } })
    Object.assign(o.userData, { head, turret, pips, mat })
    return o
  }
  const rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color('#a5b4fc').multiplyScalar(1.4), transparent: true, opacity: 0.8, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }))
  rangeRing.rotation.x = -Math.PI / 2
  const rangeFill = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }))
  rangeFill.rotation.x = -Math.PI / 2
  scene.add(rangeRing); scene.add(rangeFill)

  /* ---- 敵 ---- */
  const ECOL = G.enemyCols || {}
  const ER = G.enemyR || {}
  const enemyBinder = createBinder(makeEnemy, scene)
  const prevPos = new WeakMap(), hpSeen = new WeakMap()
  function makeEnemy(type) {
    const col = ECOL[type] || '#ef4444'
    const o = new THREE.Group()
    const mat = hullMaterial(col, { metal: 0.35, rough: 0.35, glow: 0.22, flat: type !== 'normal' && type !== 'shield' })
    let body
    switch (type) {
      case 'fast': body = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 4), mat); body.rotation.z = -Math.PI / 2; body.scale.set(1, 1, 0.7); break
      case 'swarm': body = new THREE.Mesh(new THREE.TetrahedronGeometry(1, 0), mat); break
      case 'tank': body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 1.5), mat); {
        const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 8), hullMaterial('#64748b', { metal: 0.8, rough: 0.3 })); turret.position.y = 0.75; o.add(turret)
      } break
      case 'healer': body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 14), mat); {
        const plus = new THREE.Group()
        plus.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.25), glowMaterial('#ffffff')))
        plus.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), glowMaterial('#ffffff')))
        plus.position.y = 1.25; o.add(plus); o.userData.plus = plus
      } break
      case 'shield': body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 14), mat); {
        const bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color('#818cf8').multiplyScalar(1.3), wireframe: true, transparent: true, opacity: 0.5, toneMapped: false }))
        o.add(bubble); o.userData.spin = bubble
      } break
      case 'boss': body = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mat); {
        for (let i = 0; i < 5; i++) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), hullMaterial('#fde68a', { metal: 0.9, rough: 0.2, glow: 0.3 }))
          const a = (i / 5) * Math.PI * 2
          spike.position.set(Math.cos(a) * 0.45, 1.0, Math.sin(a) * 0.45)
          o.add(spike)
        }
      } break
      default: body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 14), mat)
    }
    o.add(body)
    // 目（進む向きを見ます）
    if (type !== 'swarm') {
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }))
        eye.position.set(0.72, 0.28, s * 0.3)
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0x050505 }))
        pupil.position.set(0.15, 0, 0)
        eye.add(pupil); o.add(eye)
      }
    }
    const icy = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 6, 32), glowMaterial('#67e8f9'))
    icy.rotation.x = Math.PI / 2
    o.add(icy)
    o.traverse((m) => { if (m.isMesh) m.castShadow = true })
    Object.assign(o.userData, { body, mat, icy, col })
    return o
  }

  /* ---- 弾・光線・効果 ---- */
  const MAXB = 160
  const shots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.8), toneMapped: false }), MAXB)
  const shotHalo = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), MAXB)
  shots.frustumCulled = shotHalo.frustumCulled = false
  scene.add(shots); scene.add(shotHalo)
  const beams = []
  for (let i = 0; i < 48; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    b.visible = false
    scene.add(b); beams.push(b)
  }
  const sparks = createPoints(600)
  scene.add(sparks.object)
  const rings = createRingPool(scene, 30)
  const flashes = []
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
    s.visible = false
    scene.add(s); flashes.push(s)
  }
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3()
  const t0 = performance.now()

  function render() {
    const now = (performance.now() - t0) / 1000
    if (G.pathData !== builtFor) buildBoard()
    const frame = G.frame || 0

    camera.position.copy(base)
    if (G.shakeT > 0 && G.shakeMag > 0) {
      const m = G.shakeMag * S * 0.6
      camera.position.x += (Math.random() - 0.5) * m * 2
      camera.position.z += (Math.random() - 0.5) * m * 2
    }
    camera.lookAt(target)

    // 通り道の矢印（今までの 2D と同じ、4 マスおきに流れる）
    const path = G.pathData || []
    const phase = Math.floor(frame / 9) % 4
    let na = 0
    for (let k = phase; k < path.length - 1 && na < 120; k += 4) {
      const a = path[k], b = path[k + 1]
      const ix = b[0] - a[0], iy = b[1] - a[1]
      if (!ix && !iy) continue
      tq.setFromAxisAngle(up, -Math.atan2(iy, ix))
      tm.compose(tp.set(a[0] + 0.5 - 10 + ix * 0.3, -0.16, a[1] + 0.5 - 7.5 + iy * 0.3), tq, ts.set(1, 1, 1))
      arrows.setMatrixAt(na++, tm)
    }
    arrows.count = na
    arrows.instanceMatrix.needsUpdate = true

    portal.rotation.y = now * 0.8
    pRing.material.color.set('#34d399').multiplyScalar(1.4 + 0.4 * Math.sin(now * 3))
    coreGem.rotation.y = now * 1.2
    coreRing.rotation.z = now * 2
    if (lastLives !== null && G.lives < lastLives) coreHit = 1
    lastLives = G.lives
    coreHit *= 0.92
    coreGem.material.emissive.setRGB(0.86 + coreHit * 0.14, 0.15 + coreHit * 0.8, 0.15 + coreHit * 0.8)
    coreLight.intensity = 5 + 25 * coreHit
    core.position.y = 0.75 + Math.sin(now * 2) * 0.08

    /* タワー */
    towerBinder.begin()
    for (const tw of G.towers || []) {
      const o = towerBinder.get(tw, tw.type)
      const u = o.userData
      o.position.set(X(tw.x), 0, Z(tw.y))
      o.scale.setScalar(1.18)
      const lv = tw.level || 1
      u.head.scale.setScalar(1 + 0.1 * (lv - 1))
      if (tw.angle !== undefined) u.turret.rotation.y = -tw.angle
      for (let i = 0; i < u.pips.length; i++) u.pips[i].visible = i < lv - 1
      if (u.spin) { u.spin[0].rotation.y = now * 1.5; u.spin[1].rotation.x = Math.PI / 2 + Math.sin(now * 2) * 0.4 }
      if (u.orb) u.orb.scale.setScalar(1 + 0.25 * Math.sin(now * 6 + tw.x))
      u.mat.emissive.set(TYPES[tw.type] ? TYPES[tw.type].col : '#6366f1').multiplyScalar(tw.flash > 0 ? 1.1 : 0.25 + (G.towerBoost > 0 ? 0.35 : 0))
    }
    towerBinder.end()
    const sel = G.selectedTower
    rangeRing.visible = rangeFill.visible = !!(sel && (G.towers || []).includes(sel))
    if (rangeRing.visible) {
      const r = (TYPES[sel.type].range + 10 * sel.level) * S
      rangeRing.position.set(X(sel.x), 0.03, Z(sel.y)); rangeRing.scale.setScalar(r)
      rangeFill.position.set(X(sel.x), 0.02, Z(sel.y)); rangeFill.scale.setScalar(r)
    }

    /* 敵 */
    enemyBinder.begin()
    for (const e of G.enemies || []) {
      if (!e.alive) continue
      const o = enemyBinder.get(e, e.type)
      const u = o.userData
      const r = (ER[e.type] || 10) * S
      const bob = Math.abs(Math.sin(frame * 0.15 + (e.wob || 0))) * 0.18 * (e.type === 'tank' ? 0.3 : 1)
      o.position.set(X(e.x), r + bob, Z(e.y))
      o.scale.setScalar(r)
      const pp = prevPos.get(e)
      if (pp && (Math.abs(pp.x - e.x) + Math.abs(pp.y - e.y) > 0.01)) o.rotation.y = -Math.atan2(e.y - pp.y, e.x - pp.x)
      prevPos.set(e, { x: e.x, y: e.y })
      const last = hpSeen.get(e)
      const hit = last != null && e.hp < last
      hpSeen.set(e, e.hp)
      if (u.fresh) { u.mat.color.set(u.col); u.flash = 0 }
      if (hit) u.flash = 4
      if (u.flash > 0) { u.flash--; u.mat.emissive.setRGB(1, 1, 1) }
      else if (e.poison > 0) u.mat.emissive.set('#10b981').multiplyScalar(0.5 + 0.3 * Math.sin(now * 10))
      else u.mat.emissive.set(u.col).multiplyScalar(0.22)
      u.icy.visible = e.slow > 0
      if (u.spin) u.spin.rotation.set(now, now * 0.7, 0)
      if (u.plus) u.plus.rotation.y = now * 2
      if (e.type === 'swarm' || e.type === 'boss') u.body.rotation.y = now * (e.type === 'boss' ? 0.6 : 3)
    }
    enemyBinder.end()

    /* 弾・光線 */
    let nb = 0, nl = 0
    for (const b of G.bullets || []) {
      if (b.laser) {
        if (nl >= beams.length) continue
        const m = beams[nl++]
        const a = tp.set(X(b.x), 0.6, Z(b.y)), c = ts.set(X(b.tx), 0.45, Z(b.ty))
        dir.subVectors(c, a)
        const len = dir.length()
        m.visible = true
        m.position.copy(a).addScaledVector(dir, 0.5)
        m.quaternion.setFromUnitVectors(up, dir.normalize())
        const w = 0.035 * (b.life / 6 + 0.4)
        m.scale.set(w, len, w)
        m.material.color.set(b.col || '#fde047').multiplyScalar(2)
        m.material.opacity = Math.min(1, b.life / 6)
      } else if (nb < MAXB) {
        tm.compose(tp.set(X(b.x), 0.55, Z(b.y)), tq.identity(), ts.setScalar(0.09))
        shots.setMatrixAt(nb, tm)
        tm.compose(tp, tq, ts.setScalar(0.22))
        shotHalo.setMatrixAt(nb, tm)
        tc.set(b.col || '#818cf8')
        shots.setColorAt(nb, tc); shotHalo.setColorAt(nb, tc)
        nb++
      }
    }
    for (let i = nl; i < beams.length; i++) beams[i].visible = false
    shots.count = shotHalo.count = nb
    shots.instanceMatrix.needsUpdate = shotHalo.instanceMatrix.needsUpdate = true
    if (shots.instanceColor) shots.instanceColor.needsUpdate = true
    if (shotHalo.instanceColor) shotHalo.instanceColor.needsUpdate = true

    /* 粒・輪・閃光（弾の跡も粒で） */
    sparks.begin()
    let nr = 0, nf = 0
    for (const p of G.particles || []) {
      const a = Math.max(0, p.life / p.ml)
      if (p.ring) {
        if (nr >= rings.length) continue
        const m = rings[nr++]
        const rr = (p.mr * (1 - a) + 6) * S
        m.visible = true
        m.position.set(X(p.x), 0.08, Z(p.y))
        m.scale.set(rr, 1, rr)
        m.material.color.set(p.c || '#ffffff').multiplyScalar(1.6)
        m.material.opacity = a * 0.9
      } else if (p.core) {
        if (nf >= flashes.length) continue
        const s = flashes[nf++]
        s.visible = true
        s.position.set(X(p.x), 0.5, Z(p.y))
        s.scale.setScalar(p.sz * (1.7 - a) * S * 3)
        s.material.color.set(p.c || '#ffffff')
        s.material.opacity = a
      } else {
        if (p._h === undefined) { p._h = 0.3 + Math.random() * 0.3; p._vh = 0.02 + Math.random() * 0.05 }
        p._h += p._vh; p._vh -= 0.004
        sparks.add(X(p.x), Math.max(0.05, p._h), Z(p.y), p.c || '#ffffff', (p.sz || 2) * S * 3, a)
      }
    }
    for (const b of G.bullets || []) {
      if (b.laser || !b.trail) continue
      b.trail.forEach((q, i) => sparks.add(X(q.x), 0.55, Z(q.y), b.col || '#818cf8', 0.12 * (i + 1) / b.trail.length, 0.35))
    }
    sparks.end()
    for (let i = nr; i < rings.length; i++) rings[i].visible = false
    for (let i = nf; i < flashes.length; i++) flashes[i].visible = false

    stage.render()
  }

  /* ---- 2D の文字と 3D の位置合わせ・タップした場所のマス ---- */
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3(), ndc = new THREE.Vector2()
  function toScreen(x, y, h = 0) {
    v.set(X(x), h, Z(y)).project(camera)
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }
  }
  function toBoard(sx, sy) {
    ndc.set(sx / W * 2 - 1, 1 - sy / H * 2)
    camera.position.copy(base); camera.lookAt(target); camera.updateMatrixWorld()
    ray.setFromCamera(ndc, camera)
    if (!ray.ray.intersectPlane(plane, hitP)) return { x: sx, y: sy }
    return { x: hitP.x / S + W / 2, y: hitP.z / S + H / 2 }
  }

  G.DEFENSE3D = { ok: true, render, toScreen, toBoard }
  canvas3d.style.display = 'block'
  void renderer
}

try { start() } catch (e) { console.warn('3D 表示を始められませんでした（2D で続けます）', e) }
