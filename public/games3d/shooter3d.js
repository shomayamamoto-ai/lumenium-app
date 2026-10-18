/* PHOTON SHOOTER の 3DCG 表示。
 *
 * 遊びの計算（public/game.html の update()）は今までの 600×800 の盤面のまま。
 * ここではその盤面を、少し傾けた 3D の空間に置き直して描きます。
 *   盤面の x（0〜600）→ 3D の X（-7.5〜7.5）
 *   盤面の y（0〜800）→ 3D の Z（-10〜10。上が奥）
 * 文字（得点・コンボ・通知）は今までどおり 2D のキャンバスに重ねて描き、
 * その位置合わせのために toScreen / toGame を window.SHOOTER3D に出します。 */
import {
  THREE, webglOk, createStage, glowTexture, labelTexture, hullMaterial, glowMaterial,
  createPoints, createStarfield, createRingPool, nebula, blobShadowMaterial, createBinder, shade,
} from './common.js'

const G = window
const W = 600, H = 800, S = 1 / 40
const FLY = 0.35       // 機体が飛ぶ高さ
const FLOOR = -2.6     // 影が落ちる面（光の格子）の高さ
const wx = (x) => (x - W / 2) * S
const wz = (y) => (y - H / 2) * S

function start() {
  const canvas2d = document.getElementById('game')
  const canvas3d = document.getElementById('game3d')
  if (!canvas2d || !canvas3d || !webglOk()) return
  let stage
  try {
    stage = createStage(canvas3d, canvas2d, { clear: 0x04060e, bloom: { strength: 0.85, radius: 0.5, threshold: 0.72 }, fov: 50 })
  } catch (_) { return }
  const { scene, camera } = stage

  /* ---- カメラ: 盤面がちょうど画面に収まる距離を探します ---- */
  const TILT = THREE.MathUtils.degToRad(52)
  const corners = [[-7.5, -10], [7.5, -10], [-7.5, 10], [7.5, 10]].map(([x, z]) => new THREE.Vector3(x, FLY, z))
  const v = new THREE.Vector3()
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3()
  function placeCamera(dist, tz) {
    camTarget.set(0, 0, tz)
    camera.position.set(0, Math.sin(TILT) * dist, tz + Math.cos(TILT) * dist)
    camera.lookAt(camTarget)
    camera.updateMatrixWorld()
  }
  function fitCamera() {
    let best = null
    for (let dist = 10; dist <= 70 && !best; dist += 0.25) {
      let pick = null
      for (let tz = -3; tz <= 3; tz += 0.1) {
        placeCamera(dist, tz)
        let ok = true, top = 0, bottom = 0
        for (const c of corners) {
          v.copy(c).project(camera)
          if (Math.abs(v.x) > 0.985 || Math.abs(v.y) > 0.985) { ok = false; break }
        }
        if (!ok) continue
        top = v.copy(corners[0]).project(camera).y
        bottom = v.copy(corners[2]).project(camera).y
        const skew = Math.abs(top + bottom)
        if (!pick || skew < pick.skew) pick = { dist, tz, skew }
      }
      if (pick) best = pick
    }
    best = best || { dist: 30, tz: 0 }
    placeCamera(best.dist, best.tz)
    camBase.copy(camera.position)
  }
  stage.onResize = fitCamera
  fitCamera()

  /* ---- 光 ---- */
  scene.add(new THREE.HemisphereLight(0x8fa0ff, 0x090c1c, 0.75))
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(-6, 14, 7)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x22d3ee, 1.4)
  rim.position.set(7, 3, -12)
  scene.add(rim)
  const engineLight = new THREE.PointLight(0x22d3ee, 0, 7, 1.6)
  scene.add(engineLight)
  const flashes = [0, 1].map(() => { const l = new THREE.PointLight(0xffffff, 0, 14, 1.4); scene.add(l); return l })
  let flashI = 0

  /* ---- 背景: 星・星雲・惑星・下を流れる光の格子 ---- */
  const stars = createStarfield(1400, { box: [110, 30, 170], center: [0, -24, -50], speed: 6, size: 0.55 })
  scene.add(stars.object)
  const neb1 = nebula('rgba(79,70,229,0.9)', 70, 0.32); neb1.position.set(-14, -26, -70); scene.add(neb1)
  const neb2 = nebula('rgba(6,182,212,0.9)', 55, 0.22); neb2.position.set(16, -22, -45); scene.add(neb2)

  const planet = makePlanet()
  scene.add(planet)

  const grid = new THREE.Mesh(new THREE.PlaneGeometry(140, 240), new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float time; varying vec3 vW;
      float line(float v, float w){ float f = abs(fract(v) - 0.5); return smoothstep(0.5 - w, 0.5, f); }
      void main(){
        vec2 p = vec2(vW.x, vW.z + time * 2.2);
        float minor = max(line(p.x / 1.25, 0.018), line(p.y / 1.25, 0.018));
        float major = max(line(p.x / 6.25, 0.006), line(p.y / 6.25, 0.006));
        float fade = smoothstep(-90.0, -6.0, vW.z) * smoothstep(24.0, 4.0, vW.z) * smoothstep(34.0, 4.0, abs(vW.x));
        vec3 c = vec3(0.31, 0.27, 0.9) * minor * 0.16 + vec3(0.13, 0.7, 0.85) * major * 0.42;
        gl_FragColor = vec4(c * fade, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  grid.rotation.x = -Math.PI / 2
  grid.position.set(0, FLOOR, -60)
  scene.add(grid)

  /* ---- 自機 ---- */
  const ship = makeShip()
  ship.group.scale.setScalar(1.45)   // 当たり判定より少し大きく描いて、遠目でも形が分かるように
  scene.add(ship.group)

  /* ---- 敵・アイテム（1体ごとに物体を割り当て、消えたら使い回し） ---- */
  const enemyBinder = createBinder(makeEnemy, scene)
  const powerBinder = createBinder(makePowerup, scene)
  const hpSeen = new WeakMap()

  /* ---- 弾（同じ形をまとめて描く） ---- */
  const MAXB = 260, MAXE = 220
  const pbGeo = new THREE.CapsuleGeometry(0.055, 0.32, 4, 8); pbGeo.rotateX(Math.PI / 2)
  const pBullets = new THREE.InstancedMesh(pbGeo, glowMaterial('#c7d2fe'), MAXB)
  const pHalo = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), MAXB)
  const eBullets = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.8), toneMapped: false }), MAXE)
  const eHalo = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), MAXE)
  for (const m of [pBullets, pHalo, eBullets, eHalo]) { m.frustumCulled = false; m.count = 0; scene.add(m) }
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color()

  /* ---- 影 ---- */
  const MAXSH = 120
  const shGeo = new THREE.PlaneGeometry(1, 1); shGeo.rotateX(-Math.PI / 2)
  const shadows = new THREE.InstancedMesh(shGeo, blobShadowMaterial(0.6), MAXSH)
  shadows.frustumCulled = false; shadows.count = 0
  scene.add(shadows)

  /* ---- 爆発: 粒・光の輪・閃光 ---- */
  const sparks = createPoints(520)
  scene.add(sparks.object)
  const rings = createRingPool(scene, 24)
  const ringFlashed = new WeakSet()
  const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(190,240,255,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  muzzle.scale.set(1.1, 1.1, 1)
  scene.add(muzzle)

  let lastX = null, bank = 0, shakeT = 0
  const t0 = performance.now()

  function render() {
    const t = (performance.now() - t0) / 1000
    const fc = G.frameCount || 0
    const st = G.state
    stars.update(t)
    grid.material.uniforms.time.value = t
    planet.position.z = -95 + ((t * 0.25) % 70)
    planet.rotation.y = t * 0.03

    /* 揺れ（画面全体ではなく、カメラを揺らします） */
    camera.position.copy(camBase)
    if (G.shakeFrames > 0 && G.shakeMag > 0) {
      const m = G.shakeMag * S * 0.7
      camera.position.x += (Math.random() - 0.5) * m * 2
      camera.position.y += (Math.random() - 0.5) * m
      shakeT = t
    }
    camera.lookAt(camTarget)

    shadows.count = 0
    const shadow = (x, y, r) => {
      if (shadows.count >= MAXSH) return
      tmpP.set(wx(x) + 0.35, FLOOR + 0.01, wz(y) + 0.25)
      tmpS.set(r * 2.2, 1, r * 1.5)
      tmpM.compose(tmpP, tmpQ.identity(), tmpS)
      shadows.setMatrixAt(shadows.count++, tmpM)
    }

    /* ---- 自機 ---- */
    const p = G.player
    const inPlay = st === 'playing' || st === 'paused'
    const showShip = p && (inPlay || st === 'start')
    if (showShip) {
      const px = st === 'start' ? W / 2 : p.x, py = st === 'start' ? H - 150 : p.y
      if (lastX === null) lastX = px
      bank += ((px - lastX) - bank) * 0.2
      lastX = px
      const blink = inPlay && p.invincible > 0 && Math.floor(p.invincible / 4) % 2 === 0
      ship.group.visible = !blink
      ship.group.position.set(wx(px), FLY + (st === 'start' ? Math.sin(t * 1.6) * 0.15 : 0), wz(py))
      ship.group.rotation.set(st === 'start' ? -0.12 : -0.05, st === 'start' ? Math.sin(t * 0.7) * 0.25 : 0, THREE.MathUtils.clamp(-bank * 0.09, -0.6, 0.6))
      ship.hull.material.color.set(p.powerLevel >= 2 ? '#818cf8' : '#4f46e5')
      ship.hull.material.emissive.set(p.powerLevel >= 2 ? '#3730a3' : '#1e1b6b')
      const flick = 0.85 + Math.random() * 0.3
      ship.flame.scale.set(1, 1, flick * (G.keys && (G.keys.ArrowUp || G.keys.w) ? 1.5 : 1))
      ship.shield.visible = p.shield > 0 && inPlay
      ship.shield.rotation.y = t * 0.8
      ship.shield.rotation.x = t * 0.5
      ship.shield.scale.setScalar(1 + 0.04 * Math.sin(fc * 0.15))
      ship.rapid.visible = p.rapidTimer > 0 && inPlay
      engineLight.position.set(wx(px), FLY + 0.2, wz(py) + 0.7)
      engineLight.intensity = 4 * flick
      muzzle.visible = inPlay && p.muzzle > 0
      muzzle.position.set(wx(px), FLY + 0.1, wz(py) - 0.65)
      shadow(px, py, 0.55)
    } else {
      ship.group.visible = false
      engineLight.intensity = 0
      muzzle.visible = false
      lastX = null
    }

    /* ---- 敵 ---- */
    enemyBinder.begin()
    for (const e of G.enemies || []) {
      if (!e.active) continue
      const o = enemyBinder.get(e, e.type === 'basic-child' ? 'basic' : e.type)
      const r = e.w * S
      o.position.set(wx(e.x), FLY, wz(e.y))
      // 奥の敵は小さく見えるので、形は当たり判定より少し大きめに描きます。
      o.scale.setScalar(r * (e.type === 'boss' ? 1.15 : 1.4))
      const u = o.userData
      if (u.fresh) { u.spin = Math.random() * 6; u.flash = 0; u.body.material.color.set(e.color); u.body.material.emissive.set(shade(e.color, 0.3)) }
      const last = hpSeen.get(e)
      if (last != null && e.hp < last) u.flash = 6
      hpSeen.set(e, e.hp)
      if (u.flash > 0) { u.flash--; u.body.material.emissive.setRGB(1, 1, 1) }
      else u.body.material.emissive.set(shade(e.color, e.type === 'mine' ? 0.25 + 0.25 * Math.sin(4 * (e.pulse || 0)) : 0.3))
      animateEnemy(o, e, fc, t)
      shadow(e.x, e.y, r * 0.6)
    }
    enemyBinder.end()

    /* ---- アイテム ---- */
    powerBinder.begin()
    for (const pu of G.powerups || []) {
      const o = powerBinder.get(pu, pu.type)
      o.position.set(wx(pu.x), FLY + 0.25 + Math.sin(t * 3 + pu.x) * 0.12, wz(pu.y))
      o.rotation.set(t * 1.3, t * 1.7, 0)
      o.visible = !(pu.life < 90 && Math.floor(pu.life / 6) % 2 === 0)
      shadow(pu.x, pu.y, 0.35)
    }
    powerBinder.end()
    shadows.instanceMatrix.needsUpdate = true

    /* ---- 弾 ---- */
    let n = 0
    for (const b of G.bullets || []) {
      if (n >= MAXB) break
      tmpP.set(wx(b.x), FLY, wz(b.y))
      tmpQ.setFromEuler(new THREE.Euler(0, -Math.atan2(b.vx || 0, -(b.vy || -8)), 0))
      tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1))
      pBullets.setMatrixAt(n, tmpM)
      tmpM.compose(tmpP, tmpQ, tmpS.set(0.16, 0.16, 0.42))
      pHalo.setMatrixAt(n, tmpM)
      n++
    }
    pBullets.count = pHalo.count = n
    pBullets.instanceMatrix.needsUpdate = pHalo.instanceMatrix.needsUpdate = true
    n = 0
    for (const b of G.enemyBullets || []) {
      if (n >= MAXE) break
      const r = (b.size || 5) * S * 1.05
      tmpP.set(wx(b.x), FLY, wz(b.y))
      tmpM.compose(tmpP, tmpQ.identity(), tmpS.set(r, r, r))
      eBullets.setMatrixAt(n, tmpM)
      tmpM.compose(tmpP, tmpQ, tmpS.set(r * 2.3, r * 2.3, r * 2.3))
      eHalo.setMatrixAt(n, tmpM)
      tmpC.set(b.color || '#ef4444')
      eBullets.setColorAt(n, tmpC)
      eHalo.setColorAt(n, tmpC)
      n++
    }
    eBullets.count = eHalo.count = n
    eBullets.instanceMatrix.needsUpdate = eHalo.instanceMatrix.needsUpdate = true
    if (eBullets.instanceColor) eBullets.instanceColor.needsUpdate = true
    if (eHalo.instanceColor) eHalo.instanceColor.needsUpdate = true

    /* ---- 粒（上下にも散らして立体に） ---- */
    sparks.begin()
    for (const q of G.particles || []) {
      if (q._h === undefined) { q._h = (Math.random() - 0.3) * 0.25; q._vh = (Math.random() - 0.25) * 0.09 }
      q._h += q._vh; q._vh *= 0.96
      const k = q.life / q.maxLife
      sparks.add(wx(q.x), FLY + q._h, wz(q.y), q.color, (q.size || 3) * S * 2.6, Math.max(0, k))
    }
    // エンジンの噴射の粒
    if (showShip && ship.group.visible && Math.random() < 0.9) {
      const px = st === 'start' ? W / 2 : p.x, py = st === 'start' ? H - 150 : p.y
      for (let i = 0; i < 3; i++) sparks.add(wx(px) + (Math.random() - 0.5) * 0.12, FLY + 0.02, wz(py) + 0.55 + Math.random() * 0.5, i ? '#22d3ee' : '#ffffff', 0.12 + Math.random() * 0.08, 0.6)
    }
    sparks.end()

    /* ---- 光の輪と閃光 ---- */
    const rs = G.rings || []
    for (let i = 0; i < rings.length; i++) {
      const m = rings[i], g = rs[i]
      if (!g) { m.visible = false; continue }
      const k = g.life / g.maxLife
      const r = (g.maxR * (1 - (1 - k) * (1 - k)) + 3) * S
      m.visible = true
      m.position.set(wx(g.x), FLY, wz(g.y))
      m.scale.set(r, 1, r)
      m.material.color.set(g.color).multiplyScalar(1.6)
      m.material.opacity = (1 - k) * 0.95
      if (!ringFlashed.has(g) && g.maxR >= 60) {
        ringFlashed.add(g)
        const l = flashes[flashI++ % flashes.length]
        l.position.set(wx(g.x), FLY + 1.2, wz(g.y))
        l.color.set(g.color)
        l.intensity = g.maxR >= 140 ? 60 : 26
      }
    }
    for (const l of flashes) l.intensity *= 0.86

    stage.render()
  }

  /* ---- 2D の文字と 3D の位置合わせ ---- */
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLY), hit = new THREE.Vector3(), ndc = new THREE.Vector2()
  function toScreen(x, y, h = 0) {
    v.set(wx(x), FLY + h, wz(y)).project(camera)
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }
  }
  function toGame(sx, sy) {
    ndc.set(sx / W * 2 - 1, 1 - sy / H * 2)
    ray.setFromCamera(ndc, camera)
    if (!ray.ray.intersectPlane(plane, hit)) return { x: sx, y: sy }
    return { x: hit.x / S + W / 2, y: hit.z / S + H / 2 }
  }

  G.SHOOTER3D = { ok: true, render, toScreen, toGame }
  canvas3d.style.display = 'block'
}

/* ================= 形づくり ================= */

function makeShip() {
  const group = new THREE.Group()
  const shape = new THREE.Shape()
  const pts = [[0, -20], [-18, 18], [-6, 10], [0, 14], [6, 10], [18, 18]]
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x * S, y * S) : shape.moveTo(x * S, y * S)))
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 2 })
  geo.translate(0, 0, -0.06)
  geo.rotateX(Math.PI / 2)
  const hull = new THREE.Mesh(geo, hullMaterial('#4f46e5', { metal: 0.6, rough: 0.28, glow: 0.35 }))
  group.add(hull)
  // 背骨（機体の中心の盛り上がり）
  const spine = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.85, 4), hullMaterial('#6366f1', { metal: 0.8, rough: 0.2 }))
  spine.rotation.x = -Math.PI / 2
  spine.position.set(0, 0.1, -0.05)
  group.add(spine)
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0xbfefff, metalness: 0, roughness: 0.05, emissive: 0x2a8fb0, emissiveIntensity: 0.6, clearcoat: 1 }))
  cockpit.scale.set(0.8, 0.6, 1.6)
  cockpit.position.set(0, 0.16, -0.12)
  group.add(cockpit)
  // 翼の先の光
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glowMaterial(sx < 0 ? '#f87171' : '#4ade80'))
    tip.position.set(sx * 0.44, 0.02, 0.43)
    group.add(tip)
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#22d3ee').multiplyScalar(2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  flame.geometry.translate(0, -0.3, 0)
  flame.rotation.x = -Math.PI / 2
  flame.position.set(0, 0.02, 0.36)
  const flameWrap = new THREE.Group(); flameWrap.add(flame); flameWrap.position.z = 0
  group.add(flameWrap)
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.32, 8, 1, true), glowMaterial('#ffffff'))
  core.geometry.translate(0, -0.16, 0)
  core.rotation.x = -Math.PI / 2
  core.position.set(0, 0.02, 0.36)
  flameWrap.add(core)
  // 盾（光の殻）
  const shield = new THREE.Group()
  shield.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color('#22d3ee').multiplyScalar(1.2), wireframe: true, transparent: true, opacity: 0.28, toneMapped: false })))
  shield.add(new THREE.Mesh(new THREE.SphereGeometry(0.74, 24, 16), new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending })))
  shield.visible = false
  group.add(shield)
  const rapid = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(244,114,182,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  rapid.scale.set(0.7, 0.7, 1)
  rapid.position.set(0, 0, 0.6)
  rapid.visible = false
  group.add(rapid)
  return { group, hull, flame: flameWrap, shield, rapid }
}

function makeEnemy(kind) {
  const o = new THREE.Group()
  const mat = hullMaterial('#ef4444', { metal: 0.5, rough: 0.35, glow: 0.3 })
  let body
  switch (kind) {
    case 'basic': { // 三角錐。とがった先が自機の方を向きます
      const g = new THREE.ConeGeometry(0.55, 1.05, 3); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI)
      body = new THREE.Mesh(g, mat); body.scale.y = 0.55; break
    }
    case 'fast': {
      body = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), mat); body.scale.set(0.9, 0.45, 1.25); break
    }
    case 'tank': {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.45, 6), mat)
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hullMaterial('#fde68a', { metal: 0.3, rough: 0.2, glow: 0.2, flat: false }))
      dome.position.y = 0.22; o.add(dome)
      break
    }
    case 'shooter': {
      body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5), mat)
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 10), hullMaterial('#2e1065', { metal: 0.9, rough: 0.2, glow: 0 }))
      barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.42
      const aim = new THREE.Group(); aim.add(barrel); o.add(aim); o.userData.aim = aim
      break
    }
    case 'mine': {
      body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat)
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 6), hullMaterial('#e5e7eb', { metal: 0.9, rough: 0.2, glow: 0.1 }))
        const a = (Math.PI * 2 / 8) * i
        sp.position.set(Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48)
        sp.rotation.set(0, 0, 0); sp.lookAt(Math.cos(a) * 2, 0, Math.sin(a) * 2); sp.rotateX(Math.PI / 2)
        o.add(sp)
      }
      const blink = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), glowMaterial('#ffffff'))
      blink.position.y = 0.36; o.add(blink); o.userData.blink = blink
      break
    }
    case 'splitter': {
      body = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), mat); body.scale.y = 0.55
      const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), glowMaterial('#67e8f9'))
      o.add(inner); o.userData.inner = inner
      break
    }
    default: { // boss
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.36, 8), mat)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 10, 48), hullMaterial('#fca5a5', { metal: 0.9, rough: 0.15, glow: 0.4 }))
      ring.rotation.x = Math.PI / 2
      o.add(ring); o.userData.ring = ring
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.02, 8, 64), glowMaterial('#f87171'))
      ring2.rotation.x = Math.PI / 2.4
      o.add(ring2); o.userData.ring2 = ring2
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.1, clearcoat: 1 }))
      eye.position.set(0, 0.22, 0.02)
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.3 }))
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glowMaterial('#ef4444'))
      pupil.add(iris); iris.position.y = 0.06
      eye.add(pupil); pupil.position.y = 0.13
      o.add(eye); o.userData.pupil = pupil
      for (let i = 0; i < 4; i++) {
        const pod = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.3), hullMaterial('#7f1d1d', { metal: 0.7, rough: 0.3 }))
        const a = Math.PI / 4 + (Math.PI / 2) * i
        pod.position.set(Math.cos(a) * 0.5, -0.05, Math.sin(a) * 0.5)
        o.add(pod)
      }
    }
  }
  o.add(body)
  o.userData.body = body
  return o
}

function animateEnemy(o, e, fc, t) {
  const u = o.userData
  switch (e.type) {
    case 'basic': case 'basic-child':
      o.rotation.set(0, 0, Math.sin(t * 2 + u.spin) * 0.25); break
    case 'fast':
      o.rotation.set(0, Math.sin(fc * 0.05 + e.x) * 0.5, t * 6 + u.spin); break
    case 'tank':
      o.rotation.set(0, t * 0.6 + u.spin, 0); break
    case 'shooter': {
      o.rotation.set(0, 0, 0)
      u.body.rotation.set(t * 0.7, t * 0.9, 0)
      const p = G.player
      if (u.aim && p) u.aim.rotation.y = Math.atan2(wx(p.x) - wx(e.x), wz(p.y) - wz(e.y))
      break
    }
    case 'mine': {
      const pulse = 1 + 0.15 * Math.sin(3 * (e.pulse || 0))
      o.scale.multiplyScalar(pulse)
      o.rotation.set(0, t * 1.2 + u.spin, 0)
      if (u.blink) u.blink.visible = Math.sin(4 * (e.pulse || 0)) > 0
      break
    }
    case 'splitter':
      o.rotation.set(0, fc * 0.04 + u.spin, 0)
      if (u.inner) u.inner.rotation.set(t * 2, -t * 3, 0)
      break
    default: { // boss
      if (u.ring) u.ring.rotation.z = t * 1.4
      if (u.ring2) u.ring2.rotation.z = -t * 2.2
      o.rotation.set(0, Math.sin(t * 0.6) * 0.2, 0)
      const p = G.player
      if (u.pupil && p) {
        const dx = p.x - e.x, dy = p.y - e.y, L = Math.hypot(dx, dy) || 1
        u.pupil.position.set(dx / L * 0.07, 0.13, dy / L * 0.07)
      }
      const enraged = e.hp < e.maxHp * 0.4
      if (enraged && u.flash <= 0) u.body.material.emissive.setRGB(0.6 + 0.4 * Math.sin(t * 12), 0.05, 0.05)
    }
  }
}

const POW_COLOR = { spread: '#818cf8', rapid: '#f472b6', shield: '#06b6d4', bomb: '#f87171', life: '#10b981' }
const POW_LETTER = { spread: 'S', rapid: 'R', shield: 'G', bomb: 'B', life: 'L' }
function makePowerup(kind) {
  const col = POW_COLOR[kind] || '#818cf8'
  const mat = new THREE.MeshStandardMaterial({ map: labelTexture(POW_LETTER[kind] || '?', { bg: col }), metalness: 0.3, roughness: 0.25, emissive: new THREE.Color(col), emissiveIntensity: 0.45 })
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mat)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(hexToRgba(col)), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }))
  halo.scale.set(1.5, 1.5, 1)
  const o = new THREE.Group(); o.add(halo); o.add(box)
  return o
}
function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16)
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',1)'
}

function makePlanet() {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const g = c.getContext('2d')
  const gr = g.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, '#1d2a66'); gr.addColorStop(0.5, '#3b4a8f'); gr.addColorStop(1, '#121a42')
  g.fillStyle = gr; g.fillRect(0, 0, 512, 256)
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(${150 + Math.random() * 80},${160 + Math.random() * 70},255,${0.04 + Math.random() * 0.08})`
    const y = Math.random() * 256
    g.fillRect(0, y, 512, 3 + Math.random() * 14)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const planet = new THREE.Mesh(new THREE.SphereGeometry(9, 48, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 }))
  const atmo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(110,130,255,0.9)', 'rgba(0,0,0,0)', 128), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
  atmo.scale.set(26, 26, 1)
  const grp = new THREE.Group()
  grp.add(atmo); grp.add(planet)
  grp.position.set(24, -34, -80)
  grp.rotation.z = 0.35
  return grp
}

try { start() } catch (e) { console.warn('3D 表示を始められませんでした（2D で続けます）', e) }
