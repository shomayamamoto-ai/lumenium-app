// 口コミを書きやすくするページの決まり（api/_review-assist.js）。
//   node scripts/test-review-assist.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  normalizeAssist, defaultAssist, normalizeAnswers, enough, composeDraft, checkDraft, cleanDraft, systemText, promptText,
  coreOf, weekOf, putWeek, weeklyRows, LEVELS, OVERALL, DEFAULT_ASPECTS, LIMITS, retryText, sampleAnswers, naturalOf, tallyFields, tallyRows, richness, insightOf, mentioner, mentionsService, hasName, judgeSystem, judgePrompt, readJudge,
} from '../api/_review-assist.js'
import { normalizePrefs, defaultPrefs, assistLink } from '../api/_reviews.js'
import { requestMail } from '../api/_reviews-core.js'
import { CASES as GOLDEN } from './review-assist-cases.mjs'
import { makeDraft } from '../api/review-assist.js'

let n = 0
const t = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name) }
const CFG = normalizeAssist({ on: true, services: 'ホームページ制作\nAI研修\n動画制作', aspects: '対応の早さ\n説明の分かりやすさ\n仕上がり\n料金' })
const BRAND = { names: ['Lumenium', 'ルメニウム'] }
const ans = (x) => normalizeAnswers(x, CFG)

await t('設定: 既定は「使わない」。選択肢は数と長さを絞り、項目が空なら既定に戻す', () => {
  assert.equal(defaultAssist().on, false)
  assert.deepEqual(defaultAssist().aspects, DEFAULT_ASPECTS)
  const a = normalizeAssist({ on: 1, services: Array.from({ length: 30 }, (_, i) => 'サービス' + i), aspects: '', intro: 'あ'.repeat(500) })
  assert.equal(a.on, true)
  assert.equal(a.services.length, LIMITS.services)
  assert.deepEqual(a.aspects, DEFAULT_ASPECTS)
  assert.equal(a.intro.length, LIMITS.intro)
  assert.deepEqual(normalizeAssist({ services: 'A、B,A\n\nC' }).services, ['A', 'B', 'C'])
})

await t('設定: 口コミ管理の設定（prefs）に入り、ほかの項目を保存しても消えない', () => {
  assert.equal(defaultPrefs().assist.on, false)
  const p = normalizePrefs({ assist: { on: true, services: 'カット' } })
  assert.equal(p.assist.on, true)
  assert.deepEqual(p.assist.services, ['カット'])
  const q = normalizePrefs({ tone: 'warm' }, p)
  assert.equal(q.assist.on, true)
  assert.deepEqual(normalizePrefs({ assist: { intro: 'ようこそ' } }, p).assist.services, ['カット'])
})

await t('答え: 設定にある選択肢だけを通す（画面を書きかえて送っても、材料は増えない）', () => {
  const a = ans({ services: ['AI研修', '月額100万円のプラン'], aspects: { 料金: 'good', 仕上がり: 'bad', 立地: 'good', 対応の早さ: 'great' }, overall: 9, style: 'x', memo: '  助かった\n\u0000  ' })
  assert.deepEqual(a.services, ['AI研修'])
  assert.deepEqual(a.aspects, { 仕上がり: 'bad', 料金: 'good' })
  assert.equal(a.overall, 0)
  assert.equal(a.style, 'polite')
  assert.equal(a.memo, '助かった')
  assert.equal(enough(a), true)
  assert.equal(enough(ans({ services: ['AI研修'] })), false)
})

await t('良くなかった点も選べる: どの項目も「よかった・ふつう・いまひとつ」の3つ。全体も5段階', () => {
  assert.deepEqual(LEVELS.map((l) => l[0]), ['good', 'ok', 'bad'])
  assert.deepEqual(OVERALL.map((o) => o[0]), [5, 4, 3, 2, 1])
})

/* 作り話の点検。答えの組み合わせ16通りで、答えから作った下書きに作り話が1つも無いこと。 */
const CASES = [
  { overall: 5 },
  { overall: 1 },
  { memo: '急ぎの相談だったのに、その日のうちに返事が来た' },
  { services: ['AI研修'], overall: 4 },
  { services: ['ホームページ制作', '動画制作'], aspects: { 仕上がり: 'good' } },
  { aspects: { 対応の早さ: 'good', 料金: 'bad' }, overall: 3 },
  { aspects: { 対応の早さ: 'bad', 説明の分かりやすさ: 'bad', 仕上がり: 'bad', 料金: 'bad' }, overall: 1, style: 'casual' },
  { aspects: { 対応の早さ: 'ok', 料金: 'ok' }, overall: 3 },
  { aspects: { 仕上がり: 'good', 説明の分かりやすさ: 'good' }, overall: 5, style: 'casual' },
  { services: ['AI研修'], aspects: { 説明の分かりやすさ: 'good', 料金: 'ok', 対応の早さ: 'bad' }, overall: 4, memo: '社員が翌日から使い始めた' },
  { services: ['動画制作'], aspects: { 仕上がり: 'bad' }, overall: 2, memo: '修正に3回かかった' },
  { memo: '料金が30万円と聞いて迷ったが、頼んでよかった', overall: 4 },
  { aspects: { 料金: 'bad' }, style: 'casual' },
  { services: ['ホームページ制作'], overall: 2, style: 'casual' },
  { aspects: { 対応の早さ: 'good' }, memo: 'Lumeniumの山本さんに相談した', overall: 5 },
  { services: ['ホームページ制作', 'AI研修', '動画制作'], aspects: { 対応の早さ: 'good', 説明の分かりやすさ: 'ok', 仕上がり: 'good', 料金: 'bad' }, overall: 4, memo: 'また頼みたい' },
]

await t(`作り話をさせない: 答えから作った下書き ${CASES.length}本 × 言い回し8通りで、作り話0件`, () => {
  assert.equal(CASES.length, 16)
  let made = 0
  for (const c of CASES) {
    const a = ans(c)
    for (let seed = 0; seed < 8; seed++) {
      const text = composeDraft(a, seed * 7 + 3)
      const r = checkDraft(text, a, CFG, BRAND)
      assert.equal(r.ok, true, `${JSON.stringify(c)} → 「${text}」: ${r.reasons.join(' / ')}`)
      made++
    }
  }
  assert.equal(made, 128)
})

await t('下書き: 同じ答えでも、言い回しが変わる（全員が同じ文にならない）', () => {
  const a = ans({ services: ['AI研修'], aspects: { 説明の分かりやすさ: 'good', 料金: 'bad' }, overall: 4, memo: '質問しやすかった' })
  const set = new Set(Array.from({ length: 24 }, (_, i) => composeDraft(a, i)))
  assert.ok(set.size >= 6, `言い回しが ${set.size} 通りしかありません`)
  for (const s of set) { assert.ok(s.includes('質問しやすかった')); assert.ok(s.includes('料金')) }
})

await t('下書き: 答えていないことは、1つも文に出ない', () => {
  const text = composeDraft(ans({ aspects: { 料金: 'good' } }), 1)
  for (const w of ['対応', '説明', '仕上がり', 'ホームページ', 'AI研修', '動画', '満足']) assert.ok(!text.includes(w), w)
})

const base = ans({ services: ['AI研修'], aspects: { 説明の分かりやすさ: 'good', 料金: 'bad' }, overall: 4 })
const bad = (text, a = base) => checkDraft(text, a, CFG, BRAND)

await t('点検: 答えにない数字・金額・日数を見つける', () => {
  assert.equal(bad('AI研修をお願いしました。説明が分かりやすく、料金は少し気になりましたが満足です。').ok, true)
  assert.equal(bad('AI研修をお願いしました。3日で終わり、説明が分かりやすかったです。料金は気になりました。').ok, false)
  assert.equal(bad('AI研修は十万円でした。説明が分かりやすかったです。料金は気になりました。').ok, false)
  // ひとことに本人が書いた数字は、そのまま使ってよい
  const a = ans({ aspects: { 料金: 'bad' }, memo: '見積りが30万円だった' })
  assert.equal(checkDraft('見積りが30万円だった。料金は少し気になりました。', a, CFG, BRAND).ok, true)
})

await t('点検: 答えていない項目・選んでいない利用内容に触れたら外す', () => {
  assert.equal(bad('AI研修をお願いしました。説明が分かりやすく、対応も早かったです。料金は気になりました。').ok, false)
  assert.equal(bad('AI研修と動画制作をお願いしました。説明が分かりやすかったです。料金は気になりました。').ok, false)
  assert.match(bad('AI研修で利用。説明がよかった。仕上がりもよい。料金は気になった。').reasons.join(), /仕上がり/)
})

await t('点検: 「いまひとつ」を消したり、弱めて書かなかったりしたら外す', () => {
  assert.equal(bad('AI研修をお願いしました。説明が分かりやすく、満足しています。').ok, false)
  const low = ans({ overall: 1 })
  assert.equal(checkDraft('全体として、とても満足しています。', low, CFG, BRAND).ok, false)
  assert.equal(checkDraft('全体としては、不満でした。', low, CFG, BRAND).ok, true)
})

await t('点検: 「よかった」が無いのに、ほめたら外す', () => {
  const a = ans({ aspects: { 料金: 'ok' }, overall: 3 })
  assert.equal(checkDraft('料金はふつうでした。全体としても、ふつうです。', a, CFG, BRAND).ok, true)
  assert.equal(checkDraft('料金はふつうでしたが、安心してお願いできました。', a, CFG, BRAND).ok, false)
})

await t('点検: 店名・あおる言葉・「おすすめ」・絵文字・ハッシュタグを外す', () => {
  for (const s of [
    'Lumeniumさんで、AI研修をお願いしました。説明が分かりやすかったです。料金は気になりました。',
    'AI研修をお願いしました。説明が非常に分かりやすかったです。料金は気になりました。',
    'AI研修をお願いしました。説明が分かりやすかったです。料金は気になりましたが、おすすめです。',
    'AI研修をお願いしました。スタッフの皆様の説明が分かりやすかったです。料金は気になりました。',
    'AI研修をお願いしました😊説明が分かりやすかったです。料金は気になりました。',
    'AI研修をお願いしました。説明が分かりやすかったです。料金は気になりました。#AI研修',
    'AI研修をお願いしました！説明が分かりやすかったです！料金は気になりました。',
    '「AI研修をお願いしました。説明が分かりやすかったです。料金は気になりました。」',
  ]) assert.equal(bad(s).ok, false, s)
  // 本人がひとことに書いた言葉は通す
  const a = ans({ aspects: { 説明の分かりやすさ: 'good' }, memo: '知り合いにもおすすめしたい' })
  assert.equal(checkDraft('説明が分かりやすかったです。知り合いにもおすすめしたい。', a, CFG, BRAND).ok, true)
})

await t('AIへの頼み方: 材料は答えだけ。良くない答えは弱めない。店名・スタッフ名・検索向けの言葉を入れない', () => {
  const s = systemText()
  for (const w of ['答えにない事実は1つも足さない', '弱めず、消さず', '店名、スタッフの名前、地名', '一字も変えずにそのまま入れる', '1つも落とさず全部に触れる', '時期や回数', '60〜140字', '強める言葉']) assert.ok(s.includes(w), w)
  const p = promptText(ans({ services: ['AI研修'], aspects: { 料金: 'bad' }, overall: 2, memo: '高かった' }))
  assert.match(p, /利用したもの: AI研修/)
  assert.match(p, /・料金: いまひとつ/)
  assert.match(p, /全体として: やや不満/)
  assert.match(p, /ひとこと（本人の言葉）: 高かった/)
  assert.match(promptText(ans({ overall: 5 })), /利用したもの: （答えなし。触れない）/)
  assert.ok(!s.includes('Lumenium') && !p.includes('Lumenium'))
})

await t('書き直しの頼み方: 外した理由と、前の下書きを渡す', () => {
  const r = retryText('AI研修は十万円でした。', ['答えにない数字が入っています', '店名が入っています'])
  assert.match(r, /・答えにない数字が入っています\n・店名が入っています/)
  assert.match(r, /前の下書き:\nAI研修は十万円でした。/)
  assert.match(r, /同じ答えだけを材料に/)
})

await t('見本の答え: 良い点・気になった点・ふつうを入れる。見本の下書きも、点検を通る', () => {
  const a = sampleAnswers(CFG, 'casual')
  assert.deepEqual(a.services, ['ホームページ制作'])
  assert.deepEqual(Object.values(a.aspects), ['good', 'bad', 'ok', 'good'])
  assert.equal(a.overall, 4)
  assert.equal(a.style, 'casual')
  for (let i = 0; i < 40; i++) { const text = composeDraft(a, i); const r = checkDraft(text, a, CFG, BRAND); assert.equal(r.ok, true, text + ' / ' + r.reasons.join()) }
  // 選択肢が少ないお店でも作れる
  const small = normalizeAssist({ aspects: '接客' })
  assert.equal(checkDraft(composeDraft(sampleAnswers(small), 3), sampleAnswers(small), small, BRAND).ok, true)
})

await t('下書き: 良い点と気になった点を、1つの文につなぐ言い回しがある（文末が同じ形で並ばない）', () => {
  const a = ans({ aspects: { 仕上がり: 'good', 料金: 'bad' }, overall: 4 })
  const all = Array.from({ length: 48 }, (_, i) => composeDraft(a, i))
  assert.ok(all.some((s) => /よかったのですが|よかった一方で/.test(s)))
  assert.ok(all.some((s) => /気になる点はありましたが|気になった所もありますが/.test(s)))
  for (const s of all) assert.equal(checkDraft(s, a, CFG, BRAND).ok, true, s)
})

await t('ふつうの言い方: 名前を言いかえるだけで、意味は足さない', () => {
  assert.equal(naturalOf('対応の早さ').good, '対応が早かったです。')
  assert.equal(naturalOf('対応の早さ').bad, '対応は、もう少し早くしてほしかったです。')
  assert.equal(naturalOf('説明の分かりやすさ', true).bad, '説明は少し分かりにくかった。')
  assert.equal(naturalOf('相談のしやすさ').good, '相談しやすかったです。')
  assert.equal(naturalOf('接客の丁寧さ', true).good, '接客が丁寧だった。')
  assert.equal(naturalOf('接客の丁寧さ').bad, null)
  // 言いかえると意味が足されるものは、そのまま（「料金がよかった」を「安かった」とは書かない）
  for (const k of ['料金', '仕上がり', '味', '店内の居心地', 'Aの早さ']) assert.equal(naturalOf(k), null, k)
})

await t('ふつうの言い方を使った下書きも、点検を通る（言いかえられる名前を混ぜた項目で 96本）', () => {
  const cfg = normalizeAssist({ on: true, services: 'AI研修', aspects: '対応の早さ\n説明の分かりやすさ\n相談のしやすさ\n接客の丁寧さ\n料金\n仕上がり' })
  const sets = [
    { aspects: { 対応の早さ: 'good', 説明の分かりやすさ: 'good', 相談のしやすさ: 'good', 接客の丁寧さ: 'good' }, overall: 5 },
    { aspects: { 対応の早さ: 'bad', 説明の分かりやすさ: 'bad', 相談のしやすさ: 'bad', 接客の丁寧さ: 'bad' }, overall: 1 },
    { aspects: { 対応の早さ: 'good', 料金: 'bad', 仕上がり: 'good', 説明の分かりやすさ: 'ok' }, overall: 4 },
    { aspects: { 相談のしやすさ: 'bad' } },
    { services: ['AI研修'], aspects: { 説明の分かりやすさ: 'bad', 接客の丁寧さ: 'good' }, overall: 2, memo: '資料が多すぎた' },
    { aspects: { 対応の早さ: 'ok', 相談のしやすさ: 'ok' }, overall: 3 },
  ]
  let made = 0
  for (const x of sets) for (const style of ['polite', 'casual']) {
    const a = normalizeAnswers({ ...x, style }, cfg)
    for (let seed = 0; seed < 8; seed++) {
      const text = composeDraft(a, seed * 5 + 1)
      const r = checkDraft(text, a, cfg, BRAND)
      assert.equal(r.ok, true, `「${text}」: ${r.reasons.join(' / ')}`)
      made++
    }
  }
  assert.equal(made, 96)
  const one = composeDraft(normalizeAnswers(sets[0], cfg), 1)
  assert.match(one, /対応が早く、説明が分かりやすく、相談しやすく、接客が丁寧でした。/)
})

await t('選ばれた答えの数: 文もひとことも入れず、項目と全体だけを数える', () => {
  const a = ans({ services: ['AI研修'], aspects: { 料金: 'bad', 仕上がり: 'good' }, overall: 4, memo: '山田さんに助けてもらった' })
  assert.deepEqual(tallyFields(a), ['n', 'a|仕上がり|good', 'a|料金|bad', 'o|4'])
  assert.ok(!tallyFields(a).join().includes('山田'))
  const rows = tallyRows({
    '2026-11-16': { n: '3', 'a|料金|bad': '2', 'a|料金|good': '1', 'a|仕上がり|good': '3', 'o|4': '2', 'o|2': '1', open: '9', draft: '4' },
    '2026-11-09': { n: '1', 'a|料金|ok': '1', 'a|むかしの項目|good': '1', 'o|5': '1' },
  }, ['仕上がり', '料金'])
  assert.equal(rows.n, 4)
  assert.deepEqual(rows.aspects, [{ label: '仕上がり', good: 3, ok: 0, bad: 0 }, { label: '料金', good: 1, ok: 1, bad: 2 }, { label: 'むかしの項目', good: 1, ok: 0, bad: 0 }])
  assert.deepEqual(rows.overall, { 5: 1, 4: 2, 3: 0, 2: 1, 1: 0 })
  assert.deepEqual(tallyRows(null, []).aspects, [])
})

/* ---- 精度を上げる仕組み（本人の言葉・落とさない・逆に書かない） ---- */

await t('どのあたりが？: 答えた項目にだけ付けられ、長さを切る', () => {
  const a = ans({ aspects: { 料金: 'bad', 仕上がり: 'good' }, details: { 料金: '見積りより高くなった', 仕上がり: 'あ'.repeat(99), 対応の早さ: '答えていない項目' } })
  assert.equal(a.details.料金, '見積りより高くなった')
  assert.equal(a.details.仕上がり.length, LIMITS.detail)
  assert.equal(a.details.対応の早さ, undefined)
  assert.deepEqual(ans({ overall: 5 }).details, {})
})

await t('下書き: 本人の言葉は、その項目の文のすぐ後ろに、一字も変えずに入る', () => {
  const a = ans({ services: ['AI研修'], aspects: { 対応の早さ: 'good', 料金: 'bad', 仕上がり: 'ok' }, details: { 対応の早さ: 'その日のうちに返事が来た', 料金: '見積りより高くなった' }, overall: 4 })
  for (let seed = 0; seed < 24; seed++) {
    const text = composeDraft(a, seed)
    assert.match(text, /対応が早かったです。その日のうちに返事が来た。/, text)
    assert.match(text, /料金[^。]*。見積りより高くなった。/, text)
    const r = checkDraft(text, a, CFG, BRAND)
    assert.equal(r.ok, true, text + ' / ' + r.reasons.join())
  }
})

await t('点検: 本人の言葉を言いかえたり、落としたりしたら外す', () => {
  const a = ans({ aspects: { 料金: 'bad' }, details: { 料金: '見積りより高くなった' }, memo: '担当の方が変わって戸惑った' })
  assert.equal(checkDraft('料金は、いまひとつでした。見積りより高くなった。担当の方が変わって戸惑った。', a, CFG, BRAND).ok, true)
  assert.match(checkDraft('料金は、見積りを上回ったのが気になりました。担当の方が変わって戸惑った。', a, CFG, BRAND).reasons.join(), /本人の言葉（見積りより高くなった）/)
  assert.match(checkDraft('料金は、いまひとつでした。見積りより高くなった。', a, CFG, BRAND).reasons.join(), /本人の言葉（担当の方が変わって戸惑った）/)
})

await t('点検: 答えた項目・選んだ利用内容・全体の答えを、1つでも落としたら外す', () => {
  const a = ans({ services: ['AI研修'], aspects: { 説明の分かりやすさ: 'good', 仕上がり: 'ok', 料金: 'bad' }, overall: 4 })
  assert.equal(checkDraft('AI研修をお願いしました。説明が分かりやすかったです。仕上がりは、ふつうでした。料金は少し気になりました。全体として、満足しています。', a, CFG, BRAND).ok, true)
  assert.match(checkDraft('AI研修をお願いしました。説明が分かりやすかったです。料金は少し気になりました。全体として、満足しています。', a, CFG, BRAND).reasons.join(), /「ふつう」と答えた項目（仕上がり）が抜けています/)
  assert.match(checkDraft('説明が分かりやすかったです。仕上がりは、ふつうでした。料金は少し気になりました。全体として、満足しています。', a, CFG, BRAND).reasons.join(), /選んだ利用内容（AI研修）が抜けています/)
  assert.match(checkDraft('AI研修をお願いしました。説明が分かりやすかったです。仕上がりは、ふつうでした。料金は少し気になりました。', a, CFG, BRAND).reasons.join(), /全体の答え（満足）が、文に出ていません/)
  assert.match(checkDraft('料金はふつうでした。', ans({ aspects: { 料金: 'ok' }, overall: 3 }), CFG, BRAND).ok ? 'ok' : 'ng', /ok/)
  assert.match(checkDraft('料金について書きます。', ans({ aspects: { 料金: 'ok' }, overall: 3 }), CFG, BRAND).reasons.join(), /全体の答え（ふつう）/)
})

await t('点検: 項目ごとの良し悪しを、逆に書いたら外す', () => {
  const a = ans({ aspects: { 説明の分かりやすさ: 'good', 料金: 'bad' }, overall: 3 })
  assert.equal(checkDraft('説明が分かりやすかったです。料金は、少し気になりました。全体としては、ふつうでした。', a, CFG, BRAND).ok, true)
  // 「いまひとつ」の料金を、ほめている
  assert.match(checkDraft('説明は少し分かりにくかったです。料金には満足しています。全体としては、ふつうでした。', a, CFG, BRAND).reasons.join(), /（料金）が、そう書かれていません/)
  // 「よかった」の説明を、悪く書いている
  assert.match(checkDraft('説明は少し分かりにくかったです。料金は、少し気になりました。全体としては、ふつうでした。', a, CFG, BRAND).reasons.join(), /（説明の分かりやすさ）が、悪く書かれています/)
  // 1つの文につないだ形は通す
  assert.equal(checkDraft('説明の分かりやすさはよかったのですが、料金は少し気になりました。全体としては、ふつうでした。', a, CFG, BRAND).ok, true)
})

await t('点検: 答えにない時期・回数・比べ・予定・人の名前を見つける', () => {
  const a = ans({ aspects: { 仕上がり: 'good' }, overall: 5 })
  const ok = '仕上がりがよかったです。全体として、とても満足しています。'
  assert.equal(checkDraft(ok, a, CFG, BRAND).ok, true)
  for (const [add, why] of [
    ['初めてお願いしました。', /時期や回数/], ['いつもお世話になっています。', /時期や回数/], ['先月お願いしました。', /時期や回数/],
    ['他社より早かったです。', /比べ/], ['ほかの会社と比べても安心でした。', /比べ/],
    ['またお願いしたいです。', /予定/], ['次回も頼みます。', /予定/],
    ['担当の佐藤さんが親切でした。', /人の名前/],
  ]) assert.match(checkDraft(add + ok, a, CFG, BRAND).reasons.join(), why, add)
  // 本人が書いたものは通す
  const b = ans({ aspects: { 仕上がり: 'good' }, overall: 5, memo: '初めてだったが、佐藤さんに助けられた。またお願いしたい' })
  assert.equal(checkDraft('初めてだったが、佐藤さんに助けられた。またお願いしたい。' + ok, b, CFG, BRAND).ok, true)
  // 選んだ名前に入っている言葉は、足したものではない
  const cfg2 = normalizeAssist({ on: true, services: '初めての方向け相談', aspects: '仕上がり' })
  const c = normalizeAnswers({ services: ['初めての方向け相談'], aspects: { 仕上がり: 'good' } }, cfg2)
  assert.equal(checkDraft('初めての方向け相談を頼みました。仕上がりがよかったです。', c, cfg2, BRAND).ok, true)
})

await t('答えの充実度: 材料が多いほど点が上がり、足りないものが分かる', () => {
  const r0 = richness(ans({ overall: 5 }), CFG)
  assert.equal(r0.score, 1)
  assert.ok(r0.missing.includes('あなたの言葉（ひとこと・どのあたりが）'))
  const r1 = richness(ans({ services: ['AI研修'], aspects: { 料金: 'bad', 仕上がり: 'good' }, overall: 4, details: { 料金: '高かった' } }), CFG)
  assert.equal(r1.score, 5)
  assert.deepEqual(r1.missing, [])
  // 利用内容の選択肢が無いお店では、その分は数えない
  assert.equal(richness(normalizeAnswers({ overall: 3 }, normalizeAssist({ aspects: '接客' })), normalizeAssist({ aspects: '接客' })).score, 2)
})

await t('お願いメール: 設定したときだけ、下書きのページを並べる。Google の画面へのリンクは、いつも残す', () => {
  assert.equal(defaultAssist().mail, false)
  assert.equal(assistLink(normalizePrefs({ assist: { on: true, mail: false } })), '')
  assert.equal(assistLink(normalizePrefs({ assist: { on: false, mail: true } })), '')
  assert.match(assistLink(normalizePrefs({ assist: { on: true, mail: true } })), /^https:\/\/[^/]+\/review\.html$/)
  const plain = requestMail({ shop: '店', name: '山田', link: 'https://g.example/write', optout: 'https://x/opt' }).text
  assert.match(plain, /▼ Google に口コミを書く\nhttps:\/\/g\.example\/write/)
  assert.doesNotMatch(plain, /下書きを作る/)
  const both = requestMail({ shop: '店', name: '山田', link: 'https://g.example/write', assist: 'https://s.example/review.html', optout: 'https://x/opt' }).text
  assert.match(both, /▼ いくつか選ぶだけで、下書きを作る（投稿はご自身で）\nhttps:\/\/s\.example\/review\.html\n\n▼ 自分の言葉で書く（Google の画面が開きます）\nhttps:\/\/g\.example\/write/)
  // 文面は、どちらも「良かった点も、気になった点も」のまま。見返りの言葉は無い
  for (const m of [plain, both]) { assert.match(m, /良かった点も、気になった点も/); assert.doesNotMatch(m, /割引|プレゼント|特典|クーポン/) }
})

await t('気づき: いちばん喜ばれている項目と、気になられている項目。5人に満たないうちは出さない', () => {
  const rows = [{ label: '仕上がり', good: 16, ok: 3, bad: 1 }, { label: '待ち時間', good: 5, ok: 8, bad: 6 }, { label: '料金', good: 8, ok: 9, bad: 2 }]
  assert.deepEqual(insightOf(rows, 20), { top: { label: '仕上がり', count: 16 }, worst: { label: '待ち時間', count: 6 } })
  assert.equal(insightOf(rows, 4), null)
  assert.deepEqual(insightOf([{ label: '接客', good: 6, ok: 0, bad: 0 }], 6), { top: { label: '接客', count: 6 }, worst: null })
  assert.deepEqual(tallyRows({ w: { n: '5', 'a|料金|bad': '3', 'a|料金|good': '2' } }, ['料金']).insight, { top: { label: '料金', count: 2 }, worst: { label: '料金', count: 3 } })
})

/* ---- 点検の精度（正しい下書きを外さない・作り話を見逃さない） ---- */

await t(`点検の精度: 正しい下書き ${GOLDEN.filter((c) => c[4]).length}本を1本も外さず、作り話 ${GOLDEN.filter((c) => !c[4]).length}本を1本も見逃さない`, () => {
  assert.ok(GOLDEN.filter((c) => c[4]).length >= 50 && GOLDEN.filter((c) => !c[4]).length >= 40)
  for (const [name, cfg, x, text, want] of GOLDEN) {
    const r = checkDraft(text, normalizeAnswers(x, cfg), cfg, BRAND)
    assert.equal(r.ok, want, `${want ? '誤って外した' : '見逃した'}: ${name}「${text}」 ${r.reasons.join(' / ')}`)
  }
})

await t('項目に触れているか: 前半が同じ項目・どこにでも出る言葉の項目を、取りちがえない', () => {
  const all = ['対応の早さ', '対応の丁寧さ', '全体の満足度', 'お店の雰囲気', '撮影の進め方', '料金']
  const m = Object.fromEntries(all.map((k) => [k, mentioner(k, all)]))
  assert.equal(m['対応の早さ']('対応が早かった'), true)
  assert.equal(m['対応の丁寧さ']('対応が早かった'), false)
  assert.equal(m['対応の早さ']('返事が遅かった'), true)             // 言いかえと、反対の言い方
  assert.equal(m['全体の満足度']('全体として満足しています', 'strict'), false)
  assert.equal(m['お店の雰囲気']('お店の方の接客がよい', 'strict'), false)
  assert.equal(m['お店の雰囲気']('雰囲気がよい', 'strict'), true)
  assert.equal(m['撮影の進め方']('成人式の撮影で利用しました', 'strict'), false)
  assert.equal(m['撮影の進め方']('撮影の進め方がよかった', 'strict'), true)
  assert.equal(m['料金']('値段は少し高め'), true)
  assert.equal(mentionsService('ホームページの制作を頼みました', 'ホームページ制作'), true)
  assert.equal(mentionsService('LINEの構築をお願いしました', 'SNS・LINE構築'), true)
  assert.equal(mentionsService('動画をお願いしました', 'ホームページ制作'), false)
})

await t('人の名前: 名前だけを見つける（お客様・皆さん・たくさん・様子・担当者さんは名前ではない）', () => {
  for (const s of ['担当の山本さんに相談した', '田中先生の説明', 'タナカさんが親切', '佐藤様にお世話になった', '高橋院長の説明']) assert.equal(hasName(s), true, s)
  for (const s of ['お客様への接客', '皆さん親切でした', 'たくさん質問した', 'こちらの様子を見て', '担当者さんが来た', '店長さんの対応', '先生の対応がよい', '院長先生の説明', '同様に満足', 'スタッフさんの対応']) assert.equal(hasName(s), false, s)
})

await t('AIによる2回目の確認: はっきり「足されている」と返ったときだけ外す', () => {
  assert.deepEqual(readJudge('{"ok": true}'), { ok: true, added: [] })
  assert.deepEqual(readJudge('判定します。\n{"ok": false, "added": ["麻酔も痛くなかった"]}'), { ok: false, added: ['麻酔も痛くなかった'] })
  // 読めない返事・理由のない「だめ」は、外す理由にしない（正しい下書きを巻きぞえにしないため）
  for (const s of ['', 'わかりません', '{"ok": false}', '{"ok": false, "added": []}', '{こわれた']) assert.equal(readJudge(s).ok, true, s)
  assert.match(judgeSystem(), /答えにないことが足されていないかだけ/)
  const p = judgePrompt(ans({ aspects: { 料金: 'bad' }, overall: 3 }), '料金は少し気になりました。')
  assert.match(p, /・料金: いまひとつ/)
  assert.match(p, /下書き:\n料金は少し気になりました。/)
  assert.doesNotMatch(p, /下書きを1つ書いてください/)
})

/* 下書きを作る流れ（にせの AI で確かめます）。返事は順に: 下書き → 2回目の確認 → … */
const fakeAI = (replies) => {
  const calls = []
  const create = async (params) => { calls.push(params); const r = replies.shift(); if (r instanceof Error) throw r; return { content: [{ type: 'text', text: r }], stop_reason: 'end_turn' } }
  return { calls, beta: { messages: { create } }, messages: { create } }
}
const flowAns = ans({ aspects: { 料金: 'bad' }, overall: 3 })
const GOOD = '料金は少し気になりました。全体としてはふつうでした。'

await t('流れ: 決まりと2回目の確認を通った下書きを使う', async () => {
  const ai = fakeAI([GOOD, '{"ok": true}'])
  const d = await makeDraft(null, flowAns, CFG, 1, { client: ai })
  assert.deepEqual([d.by, d.text, d.tried, d.judged, d.reasons.length], ['ai', GOOD, 1, true, 0])
  assert.equal(ai.calls.length, 2)
})

await t('流れ: 決まりで外れたら、理由を添えて書き直してもらう', async () => {
  const ai = fakeAI(['料金は3万円で、少し気になりました。全体としてはふつうでした。', GOOD, '{"ok": true}'])
  const d = await makeDraft(null, flowAns, CFG, 1, { client: ai })
  assert.deepEqual([d.by, d.text, d.tried], ['ai', GOOD, 2])
  assert.match(ai.calls[1].messages[2].content, /答えにない数字が入っています/)
})

await t('流れ: 2回目の確認で「足されている」と出たら、書き直してもらう', async () => {
  // 言葉の決まりは通るが、答えにない理由（追加の作業）が足されている下書き
  const sly = '料金は追加の作業の分が少し気になりました。全体としてはふつうでした。'
  assert.equal(checkDraft(sly, flowAns, CFG, BRAND).ok, true)
  const ai = fakeAI([sly, '{"ok": false, "added": ["追加の作業の分"]}', GOOD, '{"ok": true}'])
  const d = await makeDraft(null, flowAns, CFG, 1, { client: ai })
  assert.deepEqual([d.by, d.text, d.tried], ['ai', GOOD, 2])
  assert.match(ai.calls[2].messages[2].content, /答えにない話（追加の作業の分）/)
})

await t('流れ: 2回とも外れたら、答えをそのまま文にした下書きを返す（理由つき）', async () => {
  const ai = fakeAI(['料金は3万円でした。全体としてはふつうでした。', '担当の山本さんの料金説明が気になりました。全体としてはふつうでした。'])
  const d = await makeDraft(null, flowAns, CFG, 1, { client: ai })
  assert.equal(d.by, 'rule')
  assert.equal(d.text, composeDraft(flowAns, 1))
  assert.ok(d.reasons.length > 0)
})

await t('流れ: AI が返らなくても、2回目の確認ができなくても、下書きは出る', async () => {
  const down = await makeDraft(null, flowAns, CFG, 1, { client: fakeAI([new Error('timeout')]) })
  assert.deepEqual([down.by, down.text], ['rule', composeDraft(flowAns, 1)])
  const noJudge = await makeDraft(null, flowAns, CFG, 1, { client: fakeAI([GOOD, new Error('timeout')]) })
  assert.deepEqual([noJudge.by, noJudge.text, noJudge.judged], ['ai', GOOD, false])
})

await t('下書きの後始末: かぎかっこ・前置き・改行を外す', () => {
  assert.equal(cleanDraft('「説明がよかったです。」'), '説明がよかったです。')
  assert.equal(cleanDraft('下書き：説明がよかったです。\n\n料金は気になりました。'), '説明がよかったです。料金は気になりました。')
  assert.equal(coreOf('説明の分かりやすさ'), '説明')
  assert.equal(coreOf('料金'), '料金')
})

await t('毎週の記録: 月曜はじまり（日本時間）。同じ週は上書き、前の週は残る', () => {
  assert.equal(weekOf(Date.UTC(2026, 10, 19, 3)), '2026-11-16')      // 木曜の昼
  assert.equal(weekOf(Date.UTC(2026, 10, 15, 14, 59)), '2026-11-09') // 日曜 23:59（日本時間）
  assert.equal(weekOf(Date.UTC(2026, 10, 15, 15, 0)), '2026-11-16')  // 月曜 0:00（日本時間）
  let list = putWeek([], { total: 20, avg: 4.04 }, Date.UTC(2026, 10, 10))
  list = putWeek(list, { total: 21, avg: 4.1 }, Date.UTC(2026, 10, 12))
  list = putWeek(list, { total: 24, avg: 4.2 }, Date.UTC(2026, 10, 18))
  assert.deepEqual(list.map((r) => [r.w, r.total, r.avg]), [['2026-11-09', 21, 4.1], ['2026-11-16', 24, 4.2]])
  const many = Array.from({ length: 200 }, (_, i) => i).reduce((l, i) => putWeek(l, { total: i, avg: 4 }, Date.UTC(2023, 0, 2) + i * 7 * 86400000), [])
  assert.equal(many.length, 104)
})

await t('毎週の記録: 画面には新しい週から。前の週からの増え方と、ページの数を付ける', () => {
  const list = [{ w: '2026-11-02', total: 18, avg: 4 }, { w: '2026-11-09', total: 21, avg: 4.1 }, { w: '2026-11-16', total: 24, avg: 4.2 }]
  const rows = weeklyRows(list, { '2026-11-16': { open: '9', draft: '6', google: '4', posted: '3' } })
  assert.equal(rows[0].posted, 3)
  assert.equal(rows[1].posted, 0)
  assert.deepEqual(rows.map((r) => [r.w, r.total, r.diff]), [['2026-11-16', 24, 3], ['2026-11-09', 21, 3], ['2026-11-02', 18, null]])
  assert.deepEqual([rows[0].open, rows[0].draft, rows[0].google], [9, 6, 4])
  assert.deepEqual([rows[1].open, rows[1].draft, rows[1].google], [0, 0, 0])
  assert.deepEqual(weeklyRows(null, null), [])
})

await t('お客様のページ: 見返りなし・全員が同じ画面へ・検索に載せない', () => {
  const h = fs.readFileSync(new URL('../public/review.html', import.meta.url), 'utf8')
  assert.match(h, /<meta name="robots" content="noindex">/)
  assert.match(h, /見返りは、ありません/)
  assert.match(h, /良くなかった点も、そのまま選んでください/)
  assert.match(h, /投稿するのは、あなたです/)
  assert.match(h, /お店に届くのは、選ばれた答えの数だけです/)
  assert.match(h, /どのあたりが？（任意・40字まで）/)
  assert.match(h, /答えの充実度/)
  assert.match(h, /Google に投稿できましたか？/)
  assert.match(h, /自分で書く（Google の投稿画面を開く）/)
  assert.match(h, /1\. 選んで答える[\s\S]*2\. 下書きを読む[\s\S]*3\. Googleで投稿/)
  // 満足度で行き先を変えていない（overall を見てリンクを変える処理が無い）
  assert.doesNotMatch(h, /overall\s*[<>]=?\s*\d[\s\S]{0,80}(href|link)/)
})

console.log(`\n${n} 件すべて通りました。`)
