// Shared skeleton primitives for lazy-loaded section fallbacks.
// Usage:
//   <Suspense fallback={<SkeletonSection title="Blog" cards={3} />}>

export function SkeletonLine({ width = '100%', height = 14 }) {
  return <span className="sk-line" style={{ width, height }} aria-hidden="true" />
}

export function SkeletonCard() {
  return (
    <div className="sk-card" aria-hidden="true">
      <SkeletonLine width="36%" height={12} />
      <SkeletonLine width="88%" height={20} />
      <SkeletonLine width="100%" height={12} />
      <SkeletonLine width="72%" height={12} />
      <div className="sk-card-footer">
        <SkeletonLine width="30%" height={12} />
      </div>
    </div>
  )
}

export default function SkeletonSection({ title = '', cards = 3, columns = 3 }) {
  return (
    <section className="section sk-section" aria-busy="true" aria-label={`${title} 読み込み中`}>
      <div className="container">
        <div className="sk-header">
          <SkeletonLine width="80px" height={10} />
          <SkeletonLine width="220px" height={28} />
          <SkeletonLine width="360px" height={14} />
        </div>
        <div className="sk-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: cards }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
