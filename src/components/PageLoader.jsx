export default function PageLoader({ fadeOut = false }) {
  return (
    <div className={`page-loader ${fadeOut ? 'page-loader--fade' : ''}`} aria-label="読み込み中" role="status">
      <div className="page-loader-stage">
        <div className="page-loader-ring" aria-hidden="true" />
        <div className="page-loader-ring page-loader-ring--outer" aria-hidden="true" />
        <div className="page-loader-glow" aria-hidden="true" />
        <img
          src="/lumenium-logo.svg?v=5"
          alt=""
          className="page-loader-logo"
          width="96"
          height="96"
          decoding="async"
          aria-hidden="true"
        />
      </div>
      <p className="page-loader-label">Lumenium</p>
    </div>
  )
}
