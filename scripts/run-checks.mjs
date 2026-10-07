// ビルドの途中で走らせるテストを、本番の設定から切り離して動かします。
//
// Vercel のビルドには、本番の環境変数（保存先・メール・AI・管理キーなど）が
// 入っています。テストは「設定が無い」前提で書いてあるものが多く、本番の
// 値が見えると別の道を通って落ち、サイトの更新（デプロイ）が止まりました
// （2026-10-05〜07、お知らせが反映されなかった件）。本物の保存先やメールに
// テストのデータが流れる危険もあります。
//
// そこで、テストごとに環境変数を空に近い状態（PATH などだけ）にして別の
// プロセスで走らせます。1つでも落ちたら、どれが落ちたかを書いて止めます。
//
//   node scripts/run-checks.mjs smoke-api test-booking …
import { spawnSync } from 'node:child_process'

const KEEP = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'NODE_OPTIONS', 'SYSTEMROOT', 'USERPROFILE']
const env = { TZ: 'UTC', NODE_ENV: 'test' }
for (const k of KEEP) if (process.env[k] != null) env[k] = process.env[k]

const names = process.argv.slice(2)
for (const name of names) {
  const r = spawnSync(process.execPath, [`scripts/${name}.mjs`], { env, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`\n✗ ${name} が通りませんでした（終了コード ${r.status}${r.signal ? '・' + r.signal : ''}）。サイトの更新を止めます。`)
    process.exit(r.status || 1)
  }
}
console.log(`✓ テスト ${names.length} 本、すべて通りました（本番の設定は読まずに実行）。`)
