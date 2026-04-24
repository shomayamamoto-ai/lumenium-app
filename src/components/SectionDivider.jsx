export default function SectionDivider({ label }) {
  return (
    <div className="section-divider" aria-hidden="true">
      <span className="section-divider__mark">{label}</span>
    </div>
  )
}
