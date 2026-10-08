// 3Dが使えるかどうかの判定だけを、描画本体（lumen3d.js）から分けたもの。
//
// トップの画面は、作る時点で「平面のロゴを出すか、3Dの結晶を待つか」を
// 決める必要があります。判定のために描画本体まで読み込むと、その待ち時間の
// あいだ平面のロゴが出て、あとから3Dに入れ替わる——オープニングの動画の
// 直後に、止まった平面のロゴが一瞬見える——ことになります。判定だけなら
// 小さいので、画面と一緒に読み込みます。

/** 3Dが使えるか。遅い代替描画（ソフトウェア描画）しか無い端末では
 *  「使えない」と答えます。動かないよりも、動いて重いほうが困るからです。 */
export function supports3D() {
  try {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) return false
    const c = document.createElement('canvas')
    // 検証用のブラウザはソフトウェア描画しか持たないので、テストのときだけ
    // この判定を外せるようにしてあります（本番では誰も立てません）。
    const gl = c.getContext('webgl', { failIfMajorPerformanceCaveat: !window.__LUMEN3D_TEST })
    // 判定のために作った描画の場所は、すぐ返します（ブラウザが同時に持てる
    // 数には上限があります）。
    const lose = gl && gl.getExtension('WEBGL_lose_context')
    if (lose) lose.loseContext()
    return !!gl
  } catch (_) {
    return false
  }
}

export function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch (_) { return false }
}
