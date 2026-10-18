/* LUMEN CODE（public/hitblow.html）の 3DCG 背景: 光のコードを守る金庫の扉。
 *
 * 遊び方や画面の部品（入力欄・ボタン・メモ）はそのまま。背景の星空の代わりに、
 * 奥に大きな金庫の扉を置き、ゲームの出来事に合わせて動かします。
 *   数字を入れる   → ダイヤルの輪が一つずつ回る
 *   CHECK          → 中央のハンドルが回り、HIT は緑・BLOW は黄色のランプが灯る
 *   解読成功       → かんぬきが抜け、扉が開いて中から光があふれる
 *   失敗           → 赤い警告灯が部屋を照らす
 * できごとは hitblow.html が window に送る hb:start / hb:digit / hb:result / hb:end で受けます。 */
import { THREE, webglOk, createStage, glowTexture, createPoints } from './common.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

function start() {
  const canvas3d = document.getElementById('vault3d')
  const stars2d = document.getElementById('stars')
  if (!canvas3d || !webglOk()) return
  canvas3d.style.display = 'block'
  let stage
  try {
    stage = createStage(canvas3d, canvas3d, { clear: 0x03040c, fog: { color: 0x03040c, density: 0.035 }, bloom: { strength: 0.8, radius: 0.6, threshold: 0.7 }, fov: 38 })
  } catch (_) { canvas3d.style.display = 'none'; return }
  if (stars2d) stars2d.style.display = 'none'
  const { scene, camera, renderer } = stage

  // 金属が映り込む部屋の光（反射で金属らしく見せるため）
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.3

  /* ---- カメラ: 扉の大きさを画面に合わせる（縦長の画面では横幅に） ---- */
  const look = new THREE.Vector3(0, 0, 0)
  let baseZ = 16
  stage.onResize = (w, h) => {
    const vFov = THREE.MathUtils.degToRad(camera.fov)
    const fitH = (5.6 * 2 / 0.82) / (2 * Math.tan(vFov / 2))          // 高さ合わせ（画面の 8 割ほど）
    const fitW = (5.6 * 2 / 1.25) / (2 * Math.tan(vFov / 2) * (w / h)) // 幅合わせ（少しはみ出す）
    baseZ = w / h < 0.9 ? fitW : fitH
  }
  stage.onResize(stage.w, stage.h)

  /* ---- 光 ---- */
  scene.add(new THREE.HemisphereLight(0x8090ff, 0x05060f, 0.35))
  const key = new THREE.SpotLight(0xcfd8ff, 150, 60, 0.6, 0.7, 1.6)
  key.position.set(-9, 12, 14)
  scene.add(key)
  const rimL = new THREE.PointLight(0x22d3ee, 30, 30, 1.6); rimL.position.set(9, -4, 6); scene.add(rimL)
  const alarm = new THREE.PointLight(0xff2020, 0, 40, 1.4); alarm.position.set(0, 8, 8); scene.add(alarm)

  /* ---- 壁 ---- */
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), new THREE.ShaderMaterial({
    uniforms: { glow: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float glow; varying vec3 vW;
      float line(float v, float w){ float f = abs(fract(v) - 0.5); return smoothstep(0.5 - w, 0.5, f); }
      void main(){
        float r = length(vW.xy);
        float panel = max(line(vW.x / 2.4, 0.012), line(vW.y / 2.4, 0.012));
        float halo = exp(-max(r - 5.6, 0.0) * 0.35);
        vec3 c = vec3(0.015, 0.018, 0.045) + vec3(0.2, 0.25, 0.6) * panel * 0.12 * smoothstep(26.0, 6.0, r);
        c += vec3(0.08, 0.35, 0.45) * halo * 0.18 + vec3(1.0, 0.9, 0.6) * glow * halo;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }))
  wall.position.z = -1.2
  scene.add(wall)

  /* ---- 扉 ---- */
  const steel = new THREE.MeshStandardMaterial({ color: 0x3c4458, metalness: 0.9, roughness: 0.36 })
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2a3042, metalness: 0.9, roughness: 0.4 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.25 })
  // 枠（壁に埋まった輪とボルト）
  const frame = new THREE.Mesh(new THREE.TorusGeometry(5.55, 0.42, 24, 96), darkSteel)
  frame.position.z = -0.6
  scene.add(frame)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 12), brass)
    bolt.rotation.x = Math.PI / 2
    bolt.position.set(Math.cos(a) * 5.55, Math.sin(a) * 5.55, -0.18)
    scene.add(bolt)
  }
  // 扉は左の蝶番を軸に開きます
  const hinge = new THREE.Group()
  hinge.position.set(-5.1, 0, -0.5)
  scene.add(hinge)
  const door = new THREE.Group()
  door.position.set(5.1, 0, 0)
  hinge.add(door)
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(5.1, 5.1, 0.7, 96), steel)
  slab.rotation.x = Math.PI / 2
  door.add(slab)
  const bevel = new THREE.Mesh(new THREE.TorusGeometry(5.05, 0.16, 16, 96), steel)
  bevel.position.z = 0.36
  door.add(bevel)
  // 蝶番
  for (const y of [-2.6, 2.6]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.2, 20), darkSteel)
    h.position.set(-5.15, y, 0.1)
    door.add(h)
  }
  // かんぬき（扉の縁から枠へ伸びる棒。解読で引っ込みます）
  const bars = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.34), brass)
    bar.position.set(Math.cos(a) * 5.15, Math.sin(a) * 5.15, 0)
    bar.rotation.z = a
    bar.userData.a = a
    door.add(bar)
    bars.push(bar)
  }
  // ダイヤルの輪（入力のたびに回る）
  const rings = []
  const ringR = [3.9, 3.1, 2.35, 1.65]
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group()
    const band = new THREE.Mesh(new THREE.TorusGeometry(ringR[i], 0.13, 12, 96), i % 2 ? darkSteel : steel)
    g.add(band)
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.04, k % 5 ? 0.14 : 0.26, 0.05), k % 5 ? darkSteel : brass)
      tick.position.set(Math.cos(a) * (ringR[i] + 0.26), Math.sin(a) * (ringR[i] + 0.26), 0.05)
      tick.rotation.z = a + Math.PI / 2
      g.add(tick)
    }
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#67e8f9').multiplyScalar(1.4), toneMapped: false }))
    marker.position.set(0, ringR[i], 0.14)
    g.add(marker)
    g.position.z = 0.42
    g.userData = { target: Math.random() * Math.PI * 2, marker }
    g.rotation.z = g.userData.target
    door.add(g)
    rings.push(g)
  }
  // 中央のハンドル（4 本の取っ手）
  const wheel = new THREE.Group()
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.5, 32), brass)
  hub.rotation.x = Math.PI / 2
  wheel.add(hub)
  const hubGlow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#22d3ee').multiplyScalar(1.3), toneMapped: false }))
  hubGlow.position.z = 0.26
  wheel.add(hubGlow)
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.9, 12), steel)
    spoke.rotation.z = (i / 4) * Math.PI * 2
    spoke.position.set(Math.cos((i / 4) * Math.PI * 2 + Math.PI / 2) * 0.95, Math.sin((i / 4) * Math.PI * 2 + Math.PI / 2) * 0.95, 0.35)
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), brass)
    knob.position.set(Math.cos((i / 4) * Math.PI * 2 + Math.PI / 2) * 1.9, Math.sin((i / 4) * Math.PI * 2 + Math.PI / 2) * 1.9, 0.35)
    wheel.add(spoke); wheel.add(knob)
  }
  wheel.position.z = 0.45
  door.add(wheel)
  // ランプ: 上の弧に HIT（緑）、下の弧に BLOW（黄）
  const lampGeo = new THREE.SphereGeometry(0.2, 20, 14)
  function makeLamps(color, y0) {
    const out = []
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x1b2030, emissive: new THREE.Color(color), emissiveIntensity: 0, metalness: 0.2, roughness: 0.3 })
      const l = new THREE.Mesh(lampGeo, m)
      const socket = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.05, 8, 24), brass)
      l.add(socket)
      l.position.z = 0.5
      door.add(l)
      out.push({ mesh: l, mat: m, on: 0, target: 0, color, y0 })
    }
    return out
  }
  const hitLamps = makeLamps('#22c55e', 4.55)
  const blowLamps = makeLamps('#fbbf24', -4.55)
  function placeLamps(n) {
    for (const set of [hitLamps, blowLamps]) {
      set.forEach((L, i) => {
        L.mesh.visible = i < n
        const span = 0.5, a = (n === 1 ? 0 : (i / (n - 1) - 0.5) * span)
        const r = 4.5, up = L.y0 > 0
        L.mesh.position.x = Math.sin(a) * r
        L.mesh.position.y = (up ? 1 : -1) * Math.cos(a) * r
      })
    }
  }
  placeLamps(4)

  // 扉の向こうの光（開いたときに見える）
  const inner = new THREE.Mesh(new THREE.CircleGeometry(5.3, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4d6').multiplyScalar(1.3), toneMapped: false }))
  inner.position.z = -0.95
  inner.visible = false
  scene.add(inner)
  const innerLight = new THREE.PointLight(0xffe7a8, 0, 40, 1.2)
  innerLight.position.set(0, 0, 1)
  scene.add(innerLight)

  /* ---- 浮かぶ光の粒 ---- */
  const dust = createPoints(220)
  scene.add(dust.object)
  const motes = Array.from({ length: 160 }, () => ({ x: (Math.random() - 0.5) * 22, y: (Math.random() - 0.5) * 14, z: Math.random() * 6, s: Math.random() }))
  const burst = []

  /* ---- できごと ---- */
  let len = 4, wheelSpin = 0, wheelTarget = 0, open = 0, openTarget = 0, barsOut = 1, alarmT = 0, won = false, flashT = 0
  function reset(n) {
    len = n || len
    placeLamps(len)
    for (const L of hitLamps.concat(blowLamps)) L.target = 0
    openTarget = 0; won = false; barsOut = 1; alarmT = 0
  }
  window.addEventListener('hb:start', (e) => reset(e.detail && e.detail.len))
  window.addEventListener('hb:digit', (e) => {
    const d = e.detail || {}
    const i = Math.max(0, Math.min(3, (d.n || 1) - 1))
    if (d.d != null && rings[i]) rings[i].userData.target += (Math.PI * 2 / 10) * (d.d + 3) * (i % 2 ? -1 : 1)
    for (const L of hitLamps.concat(blowLamps)) L.target = 0
  })
  window.addEventListener('hb:result', (e) => {
    const r = e.detail || {}
    wheelTarget += Math.PI * 2
    for (let i = 0; i < 4; i++) {
      hitLamps[i].target = i < r.hit ? 1 : 0
      blowLamps[i].target = i < r.blow ? 1 : 0
    }
    flashT = 1
  })
  window.addEventListener('hb:end', (e) => {
    if (e.detail && e.detail.won) {
      won = true
      for (const L of hitLamps) L.target = 1
      setTimeout(() => { openTarget = 1 }, 700)
      for (let i = 0; i < 120; i++) burst.push({ x: 0, y: 0, z: 0, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, vz: Math.random() * 0.4, life: 1 })
    } else {
      alarmT = 2.5
    }
  })

  /* ---- 視点: マウスや傾きで少しだけ動く ---- */
  let px = 0, py = 0, tx = 0, ty = 0
  window.addEventListener('pointermove', (e) => { tx = (e.clientX / innerWidth - 0.5); ty = (e.clientY / innerHeight - 0.5) })

  const clock = new THREE.Clock()
  function render() {
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime
    px += (tx - px) * 0.04; py += (ty - py) * 0.04
    camera.position.set(px * 2.2 + Math.sin(t * 0.2) * 0.4, -py * 1.4 + 0.3, baseZ)
    camera.lookAt(look)

    for (const r of rings) {
      r.rotation.z += (r.userData.target - r.rotation.z) * (1 - Math.exp(-dt * 7))
      if (won) r.userData.target += dt * 1.5
    }
    wheelSpin += (wheelTarget - wheelSpin) * (1 - Math.exp(-dt * 3.5))
    wheel.rotation.z = wheelSpin
    hubGlow.material.color.set(won ? '#fde68a' : '#22d3ee').multiplyScalar(1.2 + 0.4 * Math.sin(t * 3) + flashT)
    flashT *= Math.exp(-dt * 6)
    for (const L of hitLamps.concat(blowLamps)) {
      L.on += (L.target - L.on) * (1 - Math.exp(-dt * 9))
      L.mat.emissiveIntensity = L.on * (2.2 + 0.4 * Math.sin(t * 6))
    }
    // かんぬきと扉
    if (openTarget > 0) barsOut = Math.max(0, barsOut - dt * 1.6)
    else barsOut = Math.min(1, barsOut + dt * 2)
    for (const b of bars) {
      const r = 4.6 + 0.55 * barsOut   // 枠へ伸びている分（0 で抜けた状態）
      b.position.set(Math.cos(b.userData.a) * r, Math.sin(b.userData.a) * r, 0)
    }
    const want = openTarget > 0 && barsOut <= 0 ? 1 : 0
    open += (want - open) * (1 - Math.exp(-dt * (want ? 1.4 : 5)))
    hinge.rotation.y = -open * 1.9
    inner.visible = open > 0.02
    innerLight.intensity = open * 45
    wall.material.uniforms.glow.value = open * 0.45
    // 警告灯
    if (alarmT > 0) { alarmT -= dt; alarm.intensity = 140 * (0.5 + 0.5 * Math.sin(t * 14)); alarm.position.x = Math.sin(t * 3) * 8 } else alarm.intensity *= Math.exp(-dt * 6)

    dust.begin()
    for (const m of motes) {
      m.y += dt * (0.08 + m.s * 0.12); if (m.y > 7) m.y = -7
      dust.add(m.x + Math.sin(t * 0.3 + m.s * 9) * 0.3, m.y, m.z, open > 0.2 ? '#fde68a' : '#93c5fd', 0.05 + m.s * 0.06, 0.35 + 0.4 * m.s)
    }
    for (let i = burst.length - 1; i >= 0; i--) {
      const b = burst[i]
      if (open < 0.1) continue
      b.x += b.vx; b.y += b.vy; b.z += b.vz; b.life -= dt * 0.5
      if (b.life <= 0) { burst.splice(i, 1); continue }
      dust.add(b.x, b.y, b.z, '#fff7d6', 0.14, b.life)
    }
    dust.end()

    stage.render()
  }
  ;(function loop() {
    try { render() } catch (e) { canvas3d.style.display = 'none'; if (stars2d) stars2d.style.display = ''; console.warn(e); return }
    requestAnimationFrame(loop)
  })()
  window.HITBLOW3D = { ok: true }
  void glowTexture
}

try { start() } catch (e) { console.warn('3D 表示を始められませんでした（星空のまま続けます）', e) }
