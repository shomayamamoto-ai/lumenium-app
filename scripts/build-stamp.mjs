// いま公開されているのが、どのコミットから作ったものかを残します。
//
// 「公開サイトの確認」（.github/workflows/deploy-check.yml）は、これを読んで
// push したコミットが本当に公開されたかを判定します。以前は CSS のファイル名
// で判定していましたが、CSS に触れない変更（スクリプトや管理画面だけの
// 変更）では名前が前と同じままで、公開が終わる前に「届いた」と答えて
// いました。コミットそのものを書いておけば、変更の種類に関係なく確かめられます。
//
// Vercel はビルド中に VERCEL_GIT_COMMIT_SHA を渡します。無ければ git に聞き、
// それも無ければ「不明」と書きます（ビルドは止めません）。
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

let commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || ''
if (!commit) {
  try { commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch (_) {}
}
writeFileSync('public/build.json', JSON.stringify({ commit: commit || 'unknown', builtAt: new Date().toISOString() }) + '\n')
console.log('build.json:', (commit || 'unknown').slice(0, 7))
