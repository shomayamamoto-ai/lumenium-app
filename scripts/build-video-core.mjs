// SNS（動画）の画面用ファイルを2つ作ります。
//
// 1. public/video-core.js … api/_video-core.js（判定と計算）を、管理画面が
//    そのまま読める形にしたもの。禁止ワードや流用の判定、音量の式が画面と
//    サーバーで食い違わないよう、元は1ファイルだけにしてここで写します
//    （scripts/build-social-text.mjs と同じやり方）。
// 2. public/blob-upload.js … @vercel/blob の「ブラウザから直接アップロード」
//    （upload）を、管理画面が <script> で読める1ファイルにしたもの。
//    Vercel の関数は 4.5MB までしか受け取れないので、動画はブラウザから
//    Blob に直接送ります。手順（トークンの受け取り方・分割送信）を自分で
//    書き直すと、ライブラリの更新に置いていかれるので、入っている版を
//    そのまま束ねます。必要になったときだけ読み込みます（約100KB）。

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = new URL('../api/_video-core.js', import.meta.url)
const OUT = new URL('../public/video-core.js', import.meta.url)
const BLOB_OUT = new URL('../public/blob-upload.js', import.meta.url)

export function build() {
  const src = readFileSync(SRC, 'utf8')
  if (/^\s*import\s/m.test(src)) throw new Error('_video-core.js は import を持てません（画面でも読むため）')
  const names = []
  const body = src.replace(/^export\s+(async\s+function|const|var|let|function)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => {
    names.push(name)
    return `${kind} ${name}`
  })
  return '/* 自動生成: scripts/build-video-core.mjs が api/_video-core.js から作ります。直接は直さないでください。 */\n' +
    '(function () {\n' + body + '\nwindow.lumVideoCore = { ' + names.join(', ') + ' };\n})();\n'
}

async function buildBlob() {
  let esbuild
  try { esbuild = await import('esbuild') } catch (_) {
    // esbuild は vite と一緒に入ります。無い環境では、前に作ったファイルを使います。
    if (existsSync(BLOB_OUT)) { console.log('  esbuild が無いため public/blob-upload.js は前のものを使います'); return }
    throw new Error('esbuild が見つからず、public/blob-upload.js もありません。npm ci を実行してください。')
  }
  const out = await esbuild.build({
    stdin: {
      contents: "import { upload } from '@vercel/blob/client'\nwindow.lumBlobUpload = upload\n",
      resolveDir: fileURLToPath(new URL('..', import.meta.url)),
      loader: 'js',
    },
    bundle: true, platform: 'browser', format: 'iife', minify: true, target: 'es2019', write: false, legalComments: 'none',
  })
  const text = '/* 自動生成: scripts/build-video-core.mjs が @vercel/blob/client の upload を束ねたものです。直接は直さないでください。 */\n' + out.outputFiles[0].text
  // 中身が同じなら書きません（毎回のビルドで差分が出ないように）。
  if (!existsSync(BLOB_OUT) || readFileSync(BLOB_OUT, 'utf8') !== text) writeFileSync(BLOB_OUT, text)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(OUT, build())
  await buildBlob()
  console.log('  public/video-core.js と public/blob-upload.js を作りました')
}
