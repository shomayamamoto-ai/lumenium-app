/**
 * 社名のロゴタイプ「Lumenium」。
 *
 * 書体は Instrument Serif（細い線と太い線の差がある、端正なセリフ体）。
 * 塗りは、上が白く下へ向かって淡い青紫になる「金属に光が当たった」色。
 * i の点は、ロゴの星（縦横の4本が長く、斜めの4本が短い）に置き換えて
 * います。社名が光（lumen）で、ロゴが星なので、文字の中にもその光を
 * 1つだけ灯しています。
 *
 * 点の置き換えは、i の上の部分を切り落として（clip-path）、そこに星を
 * 重ねています。星は CSS の ::after で描くので文章には含まれず、文字は
 * 普通の「i」のまま。検索エンジンや読み上げには「Lumenium」と1語で
 * 伝わります（星を要素で置くと、表示上の文字列が「Lumeni / um」に
 * 割れていました）。数値はこの書体で実測した値
 * （点の中心は字の枠の高さ25%・幅47%、縦線の始まりは34%）。
 *
 * split … 1字ずつ別の要素にする（オープニングで1字ずつ焦点を結ばせるため）。
 *         chClass はその1字ずつに付けるクラス。
 */
export default function Wordmark({ as: Tag = 'span', className = '', split = false, chClass = '', ...rest }) {
  const I = (extra = '') => (
    <span className={`wm-iw ${extra}`}>
      <span className="wm-t wm-i">i</span>
    </span>
  )
  if (split) {
    return (
      <Tag className={`wm ${className}`} {...rest}>
        {[...'Lumen'].map((c, i) => <span key={i} className={`wm-t ${chClass}`}>{c}</span>)}
        {I(chClass)}
        {[...'um'].map((c, i) => <span key={`u${i}`} className={`wm-t ${chClass}`}>{c}</span>)}
      </Tag>
    )
  }
  return (
    <Tag className={`wm ${className}`} {...rest}>
      <span className="wm-t">Lumen</span>
      {I()}
      <span className="wm-t">um</span>
    </Tag>
  )
}
