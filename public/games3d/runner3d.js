/* LIGHT RUNNER の 3DCG 表示。
 *
 * 遊びの計算（public/runner.html）は今までの画面の座標（横 x・縦 y、地面は画面の高さの 78%）
 * のまま。ここではそれを、奥行きのある光のトンネルに置き直して描きます。
 *   x → 3D の X（右へ進む）／ 地面からの高さ → Y ／ 奥行き Z は 0 の一本道
 * 障害物は厚みのある 3D の形に、自分は光る結晶に、背景はトンネルのアーチと遠くの街に。 */
import {
  THREE, webglOk, createStage, glowTexture, hullMaterial, glowMaterial, createPoints, createStarfield, createBinder,
} from './common.js'

const S = 1 / 48
const DEPTH = 1.5          // 障害物の奥行き
const R = () => window.RUNNER

function start() {
  const canvas2d = document.getElementById('canvas')
  if (!canvas2d || !R() || !webglOk()) return
  const canvas3d = document.createElement('canvas')
  canvas3d.id = 'canvas3d'
  canvas3d.setAttribute('aria-hidden', 'true')
  canvas3d.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:1'
  canvas2d.after(canvas3d)
  let stage
  try {
    stage = createStage(canvas3d, canvas2d, { clear: 0x020212, fog: { color: 0x020212, density: 0.028 }, bloom: { strength: 0.9, radius: 0.55, threshold: 0.6 }, fov: 50 })
  } catch (_) { canvas3d.remove(); return }
  const { scene, camera } = stage

  /* ---- 座標 ---- */
  const dims = () => R().dims()
  const X = (x) => (x - dims().o * 0.45) * S
  const Y = (y) => (dims().n * dims().T - y) * S

  /* ---- カメラ: 走る道が横いっぱいに入り、地面が画面の下 2 割あたりに来るように ---- */
  const YAW = THREE.MathUtils.degToRad(-10), PITCH = THREE.MathUtils.degToRad(-5)
  const camBase = new THREE.Vector3(), camLook = new THREE.Vector3(), v = new THREE.Vector3()
  function aim(dist, ty) {
    const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), -Math.cos(YAW) * Math.cos(PITCH))
    camLook.set(0, ty, 0)
    camera.position.copy(camLook).addScaledVector(dir, -dist)
    camera.lookAt(camLook)
    camera.updateMatrixWorld()
  }
  function fitCamera() {
    const { o, n, T } = dims()
    const left = (-0.02 * o - o * 0.45) * S, right = (1.0 * o - o * 0.45) * S
    const top = Math.min(n * T, 300) * S
    let pick = null
    for (let dist = 4; dist < 60 && !pick; dist += 0.2) {
      for (let ty = 0; ty <= top; ty += 0.05) {
        aim(dist, ty)
        v.set((left + right) / 2, 0, 0).project(camera)
        if (v.y > -0.5) continue           // 地面を画面の下 ~25% に
        let ok = true
        for (const p of [[left, 0, DEPTH], [right, 0, DEPTH], [left, top, -DEPTH], [right, top, -DEPTH], [left, 0, -DEPTH], [right, 0, -DEPTH]]) {
          v.set(p[0], p[1], p[2]).project(camera)
          if (Math.abs(v.x) > 1.0 || v.y > 0.92 || v.y < -1.0) { ok = false; break }
        }
        if (ok) { pick = { dist, ty }; break }
      }
    }
    pick = pick || { dist: 14, ty: 2 }
    aim(pick.dist, pick.ty)
    camBase.copy(camera.position)
  }
  stage.onResize = fitCamera
  fitCamera()

  /* ---- 光 ---- */
  scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x100618, 0.7))
  const key = new THREE.DirectionalLight(0xffffff, 2.0)
  key.position.set(-4, 10, 8)
  scene.add(key)
  const heroLight = new THREE.PointLight(0xfbbf24, 6, 9, 1.5)
  scene.add(heroLight)
  const zoneLight = new THREE.PointLight(0x06b6d4, 3, 30, 1.2)
  zoneLight.position.set(6, 6, 4)
  scene.add(zoneLight)

  /* ---- 環境: 床・トンネルのアーチ・道の縁・遠くの街・星 ---- */
  const zoneColor = new THREE.Color('#06b6d4'), zoneTarget = new THREE.Color('#06b6d4')
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 26), new THREE.ShaderMaterial({
    uniforms: { scroll: { value: 0 }, color: { value: zoneColor } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float scroll; uniform vec3 color; varying vec3 vW;
      float line(float v, float w){ float f = abs(fract(v) - 0.5); return smoothstep(0.5 - w, 0.5, f); }
      void main(){
        float gx = line((vW.x + scroll) / 1.5, 0.03);
        float gz = line(vW.z / 1.5, 0.03);
        float lane = smoothstep(1.7, 1.45, abs(vW.z));
        float fade = smoothstep(16.0, 2.0, abs(vW.z)) * smoothstep(60.0, 10.0, abs(vW.x - 4.0));
        vec3 base = vec3(0.012, 0.012, 0.04) + color * 0.05 * lane;
        vec3 c = base + color * (max(gx, gz) * 0.55 * fade + lane * 0.04);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(4, 0, 0)
  scene.add(floor)

  // 道の縁の光る線
  const railMat = new THREE.MeshBasicMaterial({ color: zoneColor.clone().multiplyScalar(2), toneMapped: false })
  for (const z of [-1.6, 1.6]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(220, 0.04, 0.04), railMat)
    rail.position.set(4, 0.02, z)
    scene.add(rail)
  }

  // アーチ（トンネルの輪）。走る速さで手前を流れていきます。
  const ARCH_GAP = 7, ARCHES = 12
  const archMat = new THREE.MeshBasicMaterial({ color: zoneColor.clone().multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.85 })
  const archFrame = hullMaterial('#1e1b4b', { metal: 0.8, rough: 0.3, glow: 0.05 })
  const arches = []
  for (let i = 0; i < ARCHES; i++) {
    const g = new THREE.Group()
    // 手前の壁は切り取った形（舞台のように、道の奥から立ち上がって頭の上へかかる）
    const neon = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.05, 8, 48, Math.PI / 2), archMat)
    const frame = new THREE.Mesh(new THREE.TorusGeometry(4.85, 0.2, 8, 40, Math.PI / 2), archFrame)
    for (const m of [neon, frame]) m.rotation.y = Math.PI / 2   // 根元は道の奥（z=-R）、てっぺんは道の真上
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.35), archFrame)
    post.position.set(0, 0.06, -4.7)
    g.add(frame); g.add(neon); g.add(post)
    g.position.z = 0
    scene.add(g)
    arches.push(g)
  }

  // 遠くの街（奥の箱の並び。ゆっくり流れて、奥行きを出します）
  const CITY = 70
  const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x0b0b26, roughness: 0.8, metalness: 0.2, emissive: 0x0a0a30 }), CITY)
  const cityTop = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 1), new THREE.MeshBasicMaterial({ color: zoneColor.clone().multiplyScalar(1.4), toneMapped: false }), CITY)
  const cityData = []
  for (let i = 0; i < CITY; i++) cityData.push({ x: Math.random() * 140 - 50, w: 2 + Math.random() * 4, h: 4 + Math.random() * 12, z: -24 - Math.random() * 26 })
  city.frustumCulled = cityTop.frustumCulled = false
  scene.add(city); scene.add(cityTop)

  const stars = createStarfield(900, { box: [200, 60, 60], center: [0, 26, -60], speed: 0, size: 0.8 })
  scene.add(stars.object)

  /* ---- 自分（光る結晶） ---- */
  const hero = new THREE.Group()
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0xfff3c4, metalness: 0.3, roughness: 0.15, emissive: 0xf5b72e, emissiveIntensity: 0.9, flatShading: true }))
  crystal.scale.set(0.85, 1.2, 0.85)
  const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMaterial('#fffbeb'))
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 48), glowMaterial('#fbbf24'))
  halo.rotation.x = Math.PI / 2.3
  const heroGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(251,191,36,1)'), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
  heroGlow.scale.set(2.6, 2.6, 1)
  const shieldBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color('#22d3ee').multiplyScalar(1.3), wireframe: true, transparent: true, opacity: 0.45, toneMapped: false }))
  hero.add(heroGlow); hero.add(crystal); crystal.add(heart); hero.add(halo); hero.add(shieldBall)
  scene.add(hero)
  const heroShadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ map: glowTexture('rgba(0,0,0,1)'), transparent: true, opacity: 0.6, depthWrite: false }))
  heroShadow.rotation.x = -Math.PI / 2
  scene.add(heroShadow)
  // ダッシュの残像
  const ghosts = []
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Mesh(crystal.geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color('#fbbf24').multiplyScalar(1.4), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
    g.visible = false
    scene.add(g)
    ghosts.push(g)
  }

  /* ---- 障害物・床板・光の玉・アイテム ---- */
  const unitBox = new THREE.BoxGeometry(1, 1, 1)
  const unitEdges = new THREE.EdgesGeometry(unitBox)
  const obstacleBinder = createBinder(makeObstacle, scene)
  const platformBinder = createBinder(makePlatform, scene)
  const orbBinder = createBinder(makeOrb, scene)
  const puBinder = createBinder(makePowerup, scene)

  function makeObstacle(kind) {
    const o = new THREE.Group()
    if (kind === 'low' || kind === 'high') {
      const body = new THREE.Mesh(unitBox, hullMaterial(kind === 'low' ? '#5b1730' : '#4a1228', { metal: 0.65, rough: 0.3, glow: 0.18 }))
      const edges = new THREE.LineSegments(unitEdges, new THREE.LineBasicMaterial({ color: new THREE.Color('#ff5a7a').multiplyScalar(1.8), toneMapped: false }))
      const core = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.08, 1.02), glowMaterial('#ef4444'))
      core.position.y = kind === 'low' ? 0.5 : -0.5
      o.add(body); o.add(edges); o.add(core)
      o.userData.body = body
    } else if (kind === 'spikes') {
      const cone = new THREE.ConeGeometry(0.5, 1, 4)
      const mat = hullMaterial('#7a1f3d', { metal: 0.75, rough: 0.25, glow: 0.2 })
      o.userData.cones = []
      for (let i = 0; i < 24; i++) {
        const c = new THREE.Mesh(cone, mat)
        c.visible = false
        o.add(c)
        o.userData.cones.push(c)
      }
      const base = new THREE.Mesh(unitBox, hullMaterial('#2a0814', { metal: 0.5, rough: 0.5 }))
      o.add(base)
      o.userData.base = base
    } else if (kind === 'laser') {
      const emitter = hullMaterial('#7c1a1a', { metal: 0.85, rough: 0.25, glow: 0.3 })
      const topE = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.2, 16), emitter)
      const botE = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.2, 16), emitter)
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 12, 1, true), glowMaterial('#ff3b3b'))
      const beamHalo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }))
      o.add(topE); o.add(botE); o.add(beam); o.add(beamHalo)
      Object.assign(o.userData, { topE, botE, beam, beamHalo })
    } else { // drone
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), hullMaterial('#3a0d1c', { metal: 0.8, rough: 0.25, glow: 0.15 }))
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), glowMaterial('#ff2d55'))
      eye.position.z = 0.36
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 40), glowMaterial('#ef4444'))
      ring.rotation.x = Math.PI / 2
      o.add(body); o.add(eye); o.add(ring)
      Object.assign(o.userData, { body, ring })
    }
    return o
  }
  function makePlatform() {
    const o = new THREE.Group()
    const slab = new THREE.Mesh(unitBox, new THREE.MeshPhysicalMaterial({ color: 0x8b93ff, metalness: 0.1, roughness: 0.15, transmission: 0.0, transparent: true, opacity: 0.85, emissive: 0x3730a3, emissiveIntensity: 0.6, clearcoat: 1 }))
    const edges = new THREE.LineSegments(unitEdges, new THREE.LineBasicMaterial({ color: new THREE.Color('#c7d2fe').multiplyScalar(1.8), toneMapped: false }))
    o.add(slab); o.add(edges)
    return o
  }
  function makeOrb() {
    const o = new THREE.Group()
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xf5a524, emissiveIntensity: 1.1, metalness: 0.2, roughness: 0.25 }))
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(251,191,36,1)'), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
    glow.scale.set(3.2, 3.2, 1)
    o.add(glow); o.add(ball)
    return o
  }
  const PU_COLOR = { shield: '#06b6d4', magnet: '#8b5cf6', slow: '#22c55e', double: '#ec4899' }
  function makePowerup(kind) {
    const col = PU_COLOR[kind] || '#ffffff'
    const o = new THREE.Group()
    const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: col, metalness: 0.4, roughness: 0.15, emissive: col, emissiveIntensity: 0.7, flatShading: true }))
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 8, 48), glowMaterial(col))
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)'), color: new THREE.Color(col), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }))
    glow.scale.set(2.4, 2.4, 1)
    o.add(glow); o.add(gem); o.add(ring)
    Object.assign(o.userData, { gem, ring })
    return o
  }

  /* ---- 粒と光の跡 ---- */
  const sparks = createPoints(700)
  scene.add(sparks.object)

  /* ---- 画面全体の閃光（2D の白・水色の光の代わり） ---- */
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(1, 1, 1) }, alpha: { value: 0 } },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float alpha; void main(){ gl_FragColor = vec4(color, alpha); }',
    transparent: true, depthTest: false, depthWrite: false,
  }))
  flash.frustumCulled = false
  flash.renderOrder = 999
  scene.add(flash)

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3()
  const t0 = performance.now()
  let lastScroll = 0

  function render() {
    const now = (performance.now() - t0) / 1000
    const G = R(), B = G.B, { o: W } = dims()
    const zone = G.zone()
    zoneTarget.set(zone.groundColor || '#06b6d4')
    zoneColor.lerp(zoneTarget, 0.04)
    railMat.color.copy(zoneColor).multiplyScalar(2)
    archMat.color.copy(zoneColor).multiplyScalar(1.6)
    cityTop.material.color.copy(zoneColor).multiplyScalar(1.4)
    zoneLight.color.copy(zoneColor)
    const tint = zone.bgTint || [6, 24, 48]
    scene.background.setRGB(tint[0] / 900, tint[1] / 900, tint[2] / 700)
    scene.fog.color.copy(scene.background)

    // 走った分だけ床とアーチを流します（止まっている間はゆっくり流す）
    const scroll = B.running || B.dead ? B.distance * 30 * S : lastScroll + 0.02
    lastScroll = scroll
    floor.material.uniforms.scroll.value = scroll
    const span = ARCH_GAP * ARCHES
    for (let i = 0; i < ARCHES; i++) {
      const x = ((i * ARCH_GAP - scroll) % span + span) % span - 20
      arches[i].position.set(x, 0, 0)
    }
    for (let i = 0; i < CITY; i++) {
      const c = cityData[i]
      const x = ((c.x - scroll * 0.25) % 140 + 140) % 140 - 50
      tmpM.compose(tmpP.set(x, c.h / 2, c.z), tmpQ.identity(), tmpS.set(c.w, c.h, c.w))
      city.setMatrixAt(i, tmpM)
      tmpM.compose(tmpP.set(x, c.h + 0.03, c.z), tmpQ, tmpS.set(c.w * 1.02, 1, c.w * 1.02))
      cityTop.setMatrixAt(i, tmpM)
    }
    city.instanceMatrix.needsUpdate = cityTop.instanceMatrix.needsUpdate = true

    // 揺れ
    camera.position.copy(camBase)
    if (B.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * B.shake * S * 0.9
      camera.position.y += (Math.random() - 0.5) * B.shake * S * 0.9
    }

    /* 自分 */
    const p = B.player
    if (p) {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2
      hero.visible = !(p.inv > 0 && !B.activePU.shield && Math.floor(20 * B.time) % 2)
      hero.position.set(X(cx), Math.max(0.35, Y(cy)), 0)
      hero.scale.set((p.sx || 1) * (p.w * S) * 1.25, (p.sy || 1) * (p.h * S) * (p.sliding ? 0.6 : 0.9), (p.sx || 1) * (p.w * S) * 1.25)
      crystal.rotation.y = now * 2.4
      halo.rotation.z = now * 3
      const col = B.bursting > 0 ? '#ffffff' : B.activePU.shield ? '#06b6d4' : B.activePU.magnet ? '#8b5cf6' : B.activePU.double ? '#ec4899' : B.activePU.slow ? '#22c55e' : '#fbbf24'
      heroGlow.material.color.set(col)
      halo.material.color.set(col).multiplyScalar(1.6)
      heroLight.color.set(col)
      heroLight.position.set(hero.position.x, hero.position.y + 0.4, 1.2)
      heroLight.intensity = 5 + Math.sin(now * 8)
      shieldBall.visible = !!B.activePU.shield
      shieldBall.rotation.set(now, now * 0.7, 0)
      heroShadow.position.set(hero.position.x, 0.01, 0)
      const hgt = Math.max(0, Y(p.y + p.h))
      heroShadow.scale.setScalar(Math.max(0.3, 1.1 - hgt * 0.25))
      heroShadow.material.opacity = Math.max(0.1, 0.6 - hgt * 0.15)
      for (let i = 0; i < ghosts.length; i++) {
        const g = ghosts[i]
        g.visible = B.dashT > 0
        if (!g.visible) continue
        g.position.set(hero.position.x - (i + 1) * 0.45, hero.position.y - i * 0.03, 0)
        g.scale.copy(hero.scale).multiplyScalar(0.85).multiply(crystal.scale)
        g.rotation.copy(crystal.rotation)
        g.material.opacity = 0.32 * (1 - i / ghosts.length)
      }
    } else {
      // 始まる前: 道の上でゆっくり回っている結晶
      hero.visible = true
      hero.position.set(X(W * 0.18 + 19), 0.9 + Math.sin(now * 2) * 0.12, 0)
      hero.scale.set(0.95, 1.05, 0.95)
      crystal.rotation.y = now * 1.4
      halo.rotation.z = now * 2
      shieldBall.visible = false
      heroLight.position.set(hero.position.x, 1.4, 1.2)
      heroShadow.position.set(hero.position.x, 0.01, 0)
      heroShadow.scale.setScalar(0.8)
      ghosts.forEach((g) => { g.visible = false })
    }

    /* 障害物 */
    obstacleBinder.begin()
    for (const e of B.obstacles) {
      const o = obstacleBinder.get(e, e.type)
      const u = o.userData
      if (e.type === 'low' || e.type === 'high') {
        o.position.set(X(e.x + e.w / 2), Y(e.y + e.h / 2), 0)
        o.scale.set(e.w * S, e.h * S, DEPTH)
      } else if (e.type === 'spikes') {
        const count = Math.max(1, Math.floor(e.w / 14)), sn = e.w / count
        o.position.set(X(e.x), 0, 0)
        o.scale.set(1, 1, 1)
        u.base.scale.set(e.w * S, 0.06, DEPTH)
        u.base.position.set(e.w * S / 2, 0.03, 0)
        let k = 0
        for (let row = 0; row < 2; row++) {
          for (let i = 0; i < count && k < u.cones.length; i++, k++) {
            const c = u.cones[k]
            c.visible = true
            c.scale.set(sn * S, e.h * S * (row ? 0.85 : 1), sn * S)
            c.position.set((i + 0.5 + row * 0.5) * sn * S, e.h * S * (row ? 0.85 : 1) / 2, row ? -0.45 : 0.35)
            c.rotation.y = Math.PI / 4
          }
        }
        for (; k < u.cones.length; k++) u.cones[k].visible = false
      } else if (e.type === 'laser') {
        const top = Y(e.y), bot = Y(e.y + e.h), mid = (top + bot) / 2, len = Math.max(0.1, top - bot)
        o.position.set(X(e.x + e.w / 2), 0, 0)
        o.scale.set(1, 1, 1)
        u.topE.position.y = top + 0.1
        u.botE.position.y = bot - 0.1
        u.beam.position.y = u.beamHalo.position.y = mid
        u.beam.scale.set(e.active ? 1 : 0.25, len, e.active ? 1 : 0.25)
        u.beamHalo.scale.set(1, len, 1)
        u.beamHalo.visible = !!e.active
        u.beam.material.opacity = e.active ? 1 : 0.35
        u.beam.material.transparent = !e.active
      } else { // drone
        o.position.set(X(e.x + e.w / 2), Y(e.y + e.h / 2), 0)
        o.scale.setScalar(e.w * S * 1.3)
        u.body.rotation.y = now * 3
        u.ring.rotation.z = now * 5
      }
    }
    obstacleBinder.end()

    platformBinder.begin()
    for (const e of B.platforms) {
      const o = platformBinder.get(e, 'p')
      o.position.set(X(e.x + e.w / 2), Y(e.y + e.h / 2), 0)
      o.scale.set(e.w * S, Math.max(0.14, e.h * S), DEPTH * 1.1)
    }
    platformBinder.end()

    orbBinder.begin()
    for (const e of B.orbs) {
      if (e.taken) continue
      const o = orbBinder.get(e, 'o')
      const pr = 1 + 0.1 * Math.sin(e.pulse || 0)
      o.position.set(X(e.x), Y(e.y), 0)
      o.scale.setScalar(e.r * S * 0.75 * pr)
    }
    orbBinder.end()

    puBinder.begin()
    for (const e of B.powerups) {
      if (e.taken) continue
      const o = puBinder.get(e, e.type)
      o.position.set(X(e.x), Y(e.y), 0)
      o.scale.setScalar(e.r * S * 2.2 * (1 + 0.12 * Math.sin(e.pulse || 0)))
      o.userData.gem.rotation.set(now * 1.5, now * 2, 0)
      o.userData.ring.rotation.set(Math.PI / 2 + Math.sin(now) * 0.4, now * 2, 0)
    }
    puBinder.end()

    /* 粒と光の跡 */
    sparks.begin()
    const trailCol = B.activePU.magnet ? '#c4b5fd' : B.activePU.double ? '#f9a8d4' : '#a5b4fc'
    for (const e of B.trails) sparks.add(X(e.x), Y(e.y), 0, trailCol, (14 * (e.life / e.max) + 4) * S * 2.4, 0.35 * (e.life / e.max))
    for (const e of B.particles) {
      if (e._z === undefined) e._z = (Math.random() - 0.5) * 1.6
      sparks.add(X(e.x), Y(e.y), e._z, e.color, e.size * S * 3, Math.max(0, e.life / e.max))
    }
    sparks.end()

    /* 閃光 */
    let a = 0
    if (B.flashWhite > 0) { flash.material.uniforms.color.value.setRGB(1, 1, 1); a = B.flashWhite }
    else if (B.flashCyan > 0) { flash.material.uniforms.color.value.setRGB(0.13, 0.83, 0.93); a = 0.5 * B.flashCyan }
    else if (B.activePU.slow) { flash.material.uniforms.color.value.setRGB(0.13, 0.77, 0.37); a = 0.06 }
    flash.material.uniforms.alpha.value = a
    flash.visible = a > 0.001

    stage.render()
  }

  function toScreen(x, y) {
    const { o, n } = dims()
    v.set(X(x), Y(y), 0).project(camera)
    return { x: (v.x + 1) / 2 * o, y: (1 - v.y) / 2 * n }
  }

  window.RUNNER3D = { ok: true, toScreen }
  ;(function loop() {
    if (window.RUNNER3D.ok) {
      try { render() } catch (e) { window.RUNNER3D.ok = false; canvas3d.remove(); console.warn('3D 表示を止めました（2D で続けます）', e); return }
    }
    requestAnimationFrame(loop)
  })()
}

try { start() } catch (e) { console.warn('3D 表示を始められませんでした（2D で続けます）', e) }
