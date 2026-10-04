// SNS（動画）の判定と計算のテスト。外には一切出ません。
//
//   node scripts/test-video.mjs
//
// 確かめること。
//   ・流用の判定（最長共通部分 10文字以上）、表記の統一（例外つき）、禁止ワード
//   ・ハッシュタグを守るために本文を削るのは 25% まで
//   ・反応率・伸びる速さ・総合点、上位の長さの帯
//   ・ブートストラップが種固定で毎回同じ結果になること、信頼度の区分、属性比較の条件
//   ・BS.1770 の音量: 1kHz の正弦波が理論どおりの LUFS になること
//   ・無音カット: 0.2秒の間は切らず、0.6秒の間だけ前後0.1秒残して切ること
//   ・zip の読み取り（ここで作った zip）と、snsauto の取り込みの対応づけ
//   ・画面用に書き出したファイルが元とずれていないこと

import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import * as V from '../api/_video-core.js'

let n = 0
const ok = (name) => { n++; console.log(`  ✓ ${name}`) }

/* ---- 流用 ---- */
{
  const m = V.longestCommon('低単価案件の見分け方、まだ知らないの？', '低単価案件の見分け方｜9ビート構成')
  assert.equal(m.length, 10)
  assert.equal(m.text, '低単価案件の見分け方')
  const r = V.originality(['低単価案件の見分け方、まだ知らないの？', '全然ちがう文章です'], ['これは低単価案件の見分け方の話'])
  assert.equal(r.clean, false)
  assert.equal(r.findings.length, 1)
  assert.equal(r.findings[0].shared_length, 10)
  const r2 = V.originality(['低単価案件の見分けかた'], ['低単価案件の見分け方'])
  assert.equal(r2.clean, true, '9文字の一致は流用にしない')
  ok('流用の判定（最長共通部分 10文字）')
}

/* ---- 表記・禁止ワード ---- */
{
  const map = { 'プレミア': 'Premiere', 'プレミアプロ': 'Premiere Pro', 'アストラ': 'Astra' }
  const r = V.normalizeNotation('プレミアプロとプレミアで編集。プレミアリーグも見る', map, ['プレミアリーグ'])
  assert.equal(r.text, 'Premiere ProとPremiereで編集。プレミアリーグも見る')
  assert.equal(r.changes.length, 2)
  const b = V.findBanned(['これで絶対に稼げる', 'ふつうの文'], ['絶対に稼げる', '誰でも簡単'])
  assert.deepEqual(b.map((x) => [x.word, x.index]), [['絶対に稼げる', 0]])
  const c = V.checkScript({ title: 't', hook: 'プレミアの使い方', lines: [{ start: 0, end: 1, narration: 'a', telop: 'とても長いテロップが一秒に入っている' }], hashtags: ['a'] },
    { notation: map, notation_exceptions: [], banned_words: ['使い方'] }, [])
  assert.equal(c.ok, false)
  assert.equal(c.script.hook, 'Premiereの使い方')
  assert.equal(c.speed.length, 1)
  ok('表記の統一（例外つき）・禁止ワード・テロップの速さ')
}

/* ---- ハッシュタグ ---- */
{
  const body = 'あ'.repeat(100)
  const tags = ['動画編集', '大学生']
  // 上限に余裕あり → そのまま
  assert.equal(V.fitCaption(body, tags, 200).trimmed, 0)
  // 本文を 10 字削れば入る → 削る（25字まで許される）
  const full = V.charLen(body + '\n\n#動画編集 #大学生')
  const r = V.fitCaption(body, tags, full - 10)
  assert.deepEqual(r.hashtags, tags)
  assert.ok(r.trimmed <= 25 && r.trimmed > 0)
  assert.ok(V.charLen(r.text) <= full - 10)
  // 30 字削らないと入らない → タグを後ろから外す
  const r2 = V.fitCaption(body, tags, full - 30)
  assert.ok(r2.dropped.length >= 1)
  assert.ok(V.charLen(r2.text) <= full - 30)
  ok('ハッシュタグを守る削り方（25%まで）')
}

/* ---- 数字 ---- */
{
  const now = Date.parse('2026-10-04T00:00:00Z')
  const m = V.postMetrics({ views: 1000, likes: 50, comments: 5, shares: 5, published_at: '2026-10-03T14:00:00Z' }, now)
  assert.equal(m.engagement_rate, 0.06)
  assert.equal(m.velocity, 100)
  assert.equal(V.postMetrics({ views: 0, likes: 1 }, now).engagement_rate, null)
  const posts = [
    { id: 'a', views: 10000, likes: 100, comments: 0, shares: 0, published_at: '2026-09-01T00:00:00Z', duration_sec: 40 },
    { id: 'b', views: 5000, likes: 500, comments: 0, shares: 0, published_at: '2026-10-03T00:00:00Z', duration_sec: 20 },
    { id: 'c', views: 100, likes: 1, comments: 0, shares: 0, published_at: '2026-09-20T00:00:00Z', duration_sec: 60 },
  ]
  const s = V.scorePosts(posts, now)
  assert.equal(s[0].id, 'b', '速く伸びて反応も高い投稿が上')
  assert.equal(s[2].id, 'c')
  assert.ok(s[0].score <= 1 && s[2].score >= 0)
  const band = V.durationBand(s)
  assert.equal(band.ok, true)
  assert.equal(band.median, 40)
  assert.equal(V.durationBand(s.slice(0, 2)).ok, false)
  const cs = V.captionStats('一行目です\n二行目\n#a #b', 10)
  assert.equal(cs.line_count, 2)
  assert.deepEqual(cs.hashtags, ['a', 'b'])
  ok('反応率・伸びる速さ・総合点・長さの帯')
}

/* ---- 統計 ---- */
{
  const a = V.bootstrapCI([1, 2, 3, 4, 5, 6])
  const b = V.bootstrapCI([1, 2, 3, 4, 5, 6])
  assert.deepEqual(a, b, '同じ種なら同じ結果')
  assert.ok(a.low < 3.5 && a.high > 3.5)
  assert.notEqual(V.rng(1)(), V.rng(2)(), '種が違えば乱数も違う')
  assert.equal(V.rng(20260101)(), V.rng(20260101)())
  assert.equal(V.reliability(2).label, 'まだ判断できません')
  assert.equal(V.reliability(3).label, '参考程度')
  assert.equal(V.reliability(6).label, '使える')
  assert.equal(V.reliability(12).label, '十分')
  const pubs = ['p1', 'p2', 'p3', 'p4'].map((id, i) => ({ id, snapshots: [{ captured_at: '2026-10-01', views: 100, retention_rate: 0.6 + i * 0.01 }] }))
  const v = V.pdcaVerdict({ target: { metric: 'retention_rate', baseline: 0.5 }, publication_ids: ['p1', 'p2', 'p3', 'p4'] }, pubs)
  assert.equal(v.verdict, 'improved')
  const v2 = V.pdcaVerdict({ target: { metric: 'retention_rate', baseline: 0.5 }, publication_ids: ['p1', 'p2'] }, pubs)
  assert.equal(v2.verdict, 'insufficient')
  // 属性比較: 5本では出さない／6本でも値ごと3本が2種類無ければ出さない
  const rows = (k) => k.map((h, i) => ({ hook_type: h, value: i }))
  assert.equal(V.attributeInsight(rows(['a', 'a', 'a', 'b', 'b']), 'hook_type').ok, false)
  const x = V.attributeInsight(rows(['a', 'a', 'a', 'a', 'b', 'b']), 'hook_type')
  assert.equal(x.ok, false)
  assert.match(x.message, /3本以上/)
  const y = V.attributeInsight(rows(['a', 'a', 'a', 'b', 'b', 'b']), 'hook_type')
  assert.equal(y.ok, true)
  assert.equal(y.values[0].value, 'b')
  ok('ブートストラップ（種固定）・信頼度・PDCAの判定・属性比較の条件')
}

/* ---- BS.1770 ---- */
{
  const k = V.kWeighting(48000)
  // 規格書（ITU-R BS.1770-4 表1・表2）の 48kHz の係数
  const near = (a, b) => Math.abs(a - b) < 1e-6
  assert.ok(near(k[0].b[0], 1.53512485958697) && near(k[0].b[1], -2.69169618940638) && near(k[0].b[2], 1.19839281085285))
  assert.ok(near(k[0].a[1], -1.69065929318241) && near(k[0].a[2], 0.73248077421585))
  assert.ok(near(k[1].a[1], -1.99004745483398) && near(k[1].a[2], 0.99007225036621))
  const fs = 48000
  const sine = (amp, sec) => { const x = new Float32Array(fs * sec); for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * 1000 * i / fs); return x }
  // 0 dBFS の 1kHz を片チャンネルだけ → −3.01 LUFS（規格の検証値）
  const one = V.integratedLoudness([sine(1, 5)], fs)
  assert.ok(Math.abs(one.lufs - -3.0) <= 0.1, `片チャンネル 0dBFS: ${one.lufs}`)
  // −20 dBFS を両チャンネル → −20.0 LUFS
  const s = sine(0.1, 5)
  const st = V.integratedLoudness([s, s], fs)
  assert.ok(Math.abs(st.lufs - -20.0) <= 0.1, `両チャンネル −20dBFS: ${st.lufs}`)
  // 44.1kHz でも同じ値（係数を周波数から計算しているため）
  const fs2 = 44100
  const x2 = new Float32Array(fs2 * 5)
  for (let i = 0; i < x2.length; i++) x2[i] = 0.1 * Math.sin(2 * Math.PI * 1000 * i / fs2)
  assert.ok(Math.abs(V.integratedLoudness([x2, x2], fs2).lufs - -20.0) <= 0.1)
  // 無音の区間はゲートで除かれる（音量が下がって見えない）
  const gap = new Float32Array(fs * 10)
  gap.set(s.subarray(0, fs * 5))
  assert.ok(Math.abs(V.integratedLoudness([gap, gap], fs).lufs - -20.0) <= 0.2)
  assert.equal(V.loudnessAdvice(-14.4).level, 'ok')
  assert.match(V.loudnessAdvice(-20).text, /6 dB 上げる/)
  ok('BS.1770 の音量（1kHz 正弦波で −3.01 / −20.0 LUFS、K特性の係数）')
}

/* ---- 無音カット ---- */
{
  const fs = 16000
  const seg = (sec, amp) => { const x = new Float32Array(Math.round(fs * sec)); if (amp) for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * 300 * i / fs); return x }
  const parts = [seg(1, 0.3), seg(0.2, 0), seg(1, 0.3), seg(0.6, 0), seg(1, 0.3)]
  const total = parts.reduce((a, p) => a + p.length, 0)
  const all = new Float32Array(total)
  let o = 0
  for (const p of parts) { all.set(p, o); o += p.length }
  const m = V.frameMeter(fs)
  // 画面と同じく、細切れで渡します。
  for (let i = 0; i < all.length; i += 4000) m.push(all.subarray(i, i + 4000))
  const r = V.silenceCuts(m.done(), total / fs)
  assert.equal(r.cuts.length, 1, '0.2秒の間は切らない')
  assert.ok(Math.abs(r.cuts[0].start - 2.3) <= 0.02, `切り始め ${r.cuts[0].start}`)
  assert.ok(Math.abs(r.cuts[0].end - 2.7) <= 0.02, `切り終わり ${r.cuts[0].end}`)
  assert.ok(Math.abs(r.saved - 0.4) <= 0.03)
  assert.equal(r.keeps.length, 2)
  // 無声子音（高域の雑音）が入った間は切らない
  const hiss = seg(0.6, 0)
  let seed = 7
  for (let i = 0; i < hiss.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; hiss[i] = ((seed / 0x7fffffff) - 0.5) * 0.01 }
  // 高域だけ残すため、差分（簡易ハイパス）にします。
  for (let i = hiss.length - 1; i > 0; i--) hiss[i] = hiss[i] - hiss[i - 1]
  const p2 = [seg(1, 0.3), hiss, seg(1, 0.3), seg(0.6, 0), seg(1, 0.3)]
  const t2 = p2.reduce((a, p) => a + p.length, 0)
  const a2 = new Float32Array(t2)
  o = 0
  for (const p of p2) { a2.set(p, o); o += p.length }
  const m2 = V.frameMeter(fs)
  m2.push(a2)
  const r2 = V.silenceCuts(m2.done(), t2 / fs)
  assert.equal(r2.cuts.length, 1, '子音の入った間は残し、無音の間だけ切る')
  assert.ok(r2.cuts[0].start > 2.5)
  const edl = V.toEdl(r.keeps, { fps: 30, clip: 'a.mp4' })
  assert.match(edl, /^TITLE: /)
  assert.match(edl, /001 {2}AX {7}B {5}C {8}00:00:00:00 00:00:02:09 00:00:00:00 00:00:02:09/)
  assert.match(V.toSrt([{ start: 0, end: 1.5, telop: 'こんにちは' }]), /00:00:00,000 --> 00:00:01,500/)
  ok('無音カット（0.2秒は残し 0.6秒だけ前後0.1秒残して切る・子音は残す）・EDL・SRT')
}

/* ---- zip と取り込み ---- */
{
  const enc = new TextEncoder()
  const files = {
    'manifest.json': enc.encode(JSON.stringify({ format: 'snsauto-migration', format_version: 1, tables: {} })),
    'data/projects.json': enc.encode(JSON.stringify([{ id: 7, name: '架空の店', description: 'テスト', brand_profile: { persona: '店長', tone: 'やさしく', banned_words: ['最安'], notation: { 'ネイル': 'nail' }, notation_exceptions: [] } }])),
    'data/research_runs.json': enc.encode(JSON.stringify([{ id: 3, project_id: 7, keyword: 'カフェ' }])),
    'data/competitor_posts.json': enc.encode(JSON.stringify([{ id: 11, run_id: 3, platform: 'instagram', title: 'A', caption: 'B', views: 100, likes: 5, comments: 1, shares: 0, duration_sec: 20, published_at: '2026-09-01T00:00:00+00:00' }])),
    'data/structure_analyses.json': enc.encode(JSON.stringify([{ id: 1, post_id: 11, hook_text: 'A', hook_type: 'question', beats: [{ label: 'hook', start: 0, end: 2, purpose: 'x' }], telop: { caption: { line_count: 1 } } }])),
    'data/scripts.json': enc.encode(JSON.stringify([{ id: 5, project_id: 7, title: 'S', lines: [{ start: 0, end: 3, narration: 'n', telop: 't', visual: 'v' }], hashtags: ['a'] }])),
    'data/storyboards.json': enc.encode(JSON.stringify([{ id: 9, script_id: 5, style: 'soft' }])),
    'data/shots.json': enc.encode(JSON.stringify([{ id: 1, storyboard_id: 9, index: 0, start: 0, end: 3, visual_prompt: 'v' }])),
    'data/publications.json': enc.encode(JSON.stringify([{ id: 2, project_id: 7, script_id: 5, platform: 'instagram', status: 'published' }])),
    'data/metric_snapshots.json': enc.encode(JSON.stringify([{ id: 1, publication_id: 2, captured_at: '2026-10-01', views: 10 }])),
    'data/pdca_cycles.json': enc.encode(JSON.stringify([{ id: 4, project_id: 7, title: 'P', stage: 'check', target: { metric: 'views', baseline: 5 }, publication_ids: [2] }])),
    'data/social_accounts.json': enc.encode(JSON.stringify([{ id: 1, project_id: 7, platform: 'instagram', username: 'x', access_token: 'never' }])),
  }
  // 小さな zip を作ります（1つは無圧縮、残りは deflate）。
  const parts = []
  const central = []
  let off = 0
  Object.entries(files).forEach(([name, data], i) => {
    const nm = enc.encode(name)
    const method = i === 0 ? 0 : 8
    const body = method ? deflateRawSync(data) : data
    const crc = V.crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8)
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10)
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42)
    parts.push(lh, nm, body)
    central.push(ch, nm)
    off += 30 + nm.length + body.length
  })
  const cd = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(files).length, 8); eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16)
  const zip = new Uint8Array(Buffer.concat([...parts, cd, eocd]))
  const got = await V.readZip(zip)
  assert.deepEqual(Object.keys(got).sort(), Object.keys(files).sort())
  const { tables } = V.snsautoTables(got)
  const counts = V.snsautoCounts(tables)
  assert.equal(counts.competitor_posts, 1)
  assert.equal(counts.shots, 1)
  const m = V.mapSnsauto(tables)
  assert.equal(m.projects.length, 1)
  const p = m.projects[0]
  assert.equal(p.project.id, 'sa-project-7')
  assert.deepEqual(p.project.brand.banned_words, ['最安'])
  assert.equal(p.posts[0].id, 'sa-post-11')
  assert.equal(p.posts[0].analysis.hook_type, 'question')
  assert.equal(p.scripts[0].shots.length, 1)
  assert.equal(p.pubs[0].script_id, 'sa-script-5')
  assert.equal(p.pubs[0].snapshots[0].views, 10)
  assert.deepEqual(p.pdca[0].publication_ids, ['sa-pub-2'])
  assert.equal(m.accounts[0].status_label, '再連携が必要')
  assert.ok(!JSON.stringify(m).includes('never'), 'トークンは持ち込まない')
  // 壊れた zip
  const bad = zip.slice()
  bad[50] ^= 0xff // 無圧縮で入れた manifest.json の中身
  await assert.rejects(() => V.readZip(bad))
  await assert.rejects(async () => V.snsautoTables({ 'manifest.json': enc.encode('{"format":"other"}') }), /snsauto/)
  ok('zip の読み取り（目次・deflate-raw・検査値）と snsauto の対応づけ')
}

/* ---- CSV・絵コンテ ---- */
{
  const rows = V.parseCsv('url,title,caption,views\nhttps://x,"題, です","改行\nあり",100\n')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].title, '題, です')
  assert.equal(rows[0].caption, '改行\nあり')
  const shots = V.shotsFromLines([{ start: 0, end: 3, visual: 'A cafe counter.' }, { start: 3, end: 6, visual: 'Latte art' }], 'soft light')
  assert.equal(shots[0].visual_prompt, 'A cafe counter, soft light. No text, no letters, no logos, no watermark.')
  assert.equal(shots[0].camera, 'close-up, static')
  const chk = V.shipChecks({ width: 1080, height: 1920, duration: 100 })
  assert.equal(chk.find((c) => c.key === 'aspect').ok, true)
  assert.equal(chk.find((c) => c.key === 'instagram').ok, false)
  assert.equal(chk.find((c) => c.key === 'youtube').ok, true)
  ok('CSV の読み書き・絵コンテ・長さと縦横比の判定')
}

/* ---- 長さの種類 ---- */
{
  assert.equal(V.lengthMode({}), 'short', '指定の無い台本はショート')
  assert.equal(V.lengthMode({ length_mode: 'long' }), 'long')
  assert.equal(V.modeRules({}).SHOT_MAX_SEC, 3.5)
  assert.equal(V.modeRules({ length_mode: 'long' }).SHOT_MAX_SEC, 10)
  const L = (end) => ({ lines: [{ start: 0, end }] })
  assert.equal(V.lengthModeCheck(L(60)).ok, true)
  assert.equal(V.lengthModeCheck(L(120)).ok, false, 'ショートで90秒超は注意')
  assert.equal(V.lengthModeCheck({ ...L(120), length_mode: 'long' }).ok, false, '長尺で3分未満は注意')
  assert.equal(V.lengthModeCheck({ ...L(240), length_mode: 'long' }).ok, true)
  ok('長さの種類（ショート／長尺）と既定値')
}

/* ---- パッケージと約束 ---- */
{
  assert.deepEqual(V.promiseKeywords('カンパーニュの大きな穴ができる理由が分かる'), ['カンパーニュ', '穴'])
  assert.deepEqual(V.promiseKeywords('朝4時の仕込みを30秒で全部見せます'), ['朝', '4時', '仕込', '30秒'])
  assert.deepEqual(V.promiseKeywords('ＳＮＳで集客する3つの方法'), ['sns', '集客', '3つ'], '全角は半角に、「方法」は除く')
  assert.deepEqual(V.promiseKeywords('なんでも', '穴、 石窯'), ['穴', '石窯'], '手で入れた言葉が優先')
  const lines = [
    { start: 0, end: 3, narration: 'この穴、どうやってできると思います？', telop: 'この穴、どうやってできる？' },
    { start: 3, end: 8, narration: 'カンパーニュは水が多い生地です。', telop: '' },
  ]
  const s = { promise: 'カンパーニュの大きな穴ができる理由が分かる', lines }
  const r = V.promiseCheck(s)
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, ['カンパーニュ'])
  assert.equal(r.fixLine, 0)
  assert.match(r.text, /最初の3秒に「カンパーニュ」/)
  // 長尺は10秒まで見るので、2行目（3〜8秒）のカンパーニュも数えます。
  assert.equal(V.promiseCheck({ ...s, length_mode: 'long' }).ok, true)
  // ナレーションは行の長さに比例して数える（0〜10秒の行の、最初の3秒ぶん＝30%）。
  const o = V.openingText([{ start: 0, end: 10, narration: 'あいうえおかきくけこ', telop: '' }], 3)
  assert.equal(o.narration, 'あいう')
  assert.equal(V.promiseCheck({ lines }).status, 'none', '約束が無ければ判定しない')
  // 禁止ワードはパッケージにも効く
  assert.equal(V.checkScript({ thumb_text: '日本一の穴', lines: [] }, { banned_words: ['日本一'] }).ok, false)
  ok('約束を守る（言葉の取り出し・冒頭3秒／10秒・直す行）')
}

/* ---- 画面用ファイル ---- */
{
  const { build } = await import('./build-video-core.mjs')
  const out = new URL('../public/video-core.js', import.meta.url)
  assert.ok(existsSync(out), 'public/video-core.js がありません（npm run build で作られます）')
  assert.equal(readFileSync(out, 'utf8'), build(), 'public/video-core.js が api/_video-core.js と食い違っています')
  ok('画面用の public/video-core.js が元と一致')
}

console.log(`\n動画まわり ${n} 件すべて通りました。`)
