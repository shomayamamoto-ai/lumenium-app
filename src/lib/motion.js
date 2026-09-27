// 「視差効果を減らす」設定の端末では、ページを滑らせずに一気に移動します。
// 画面全体が流れていくスクロールは、酔いの原因になりやすい動きです。
export const scrollBehavior = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  } catch (_) {
    return 'smooth'
  }
}
