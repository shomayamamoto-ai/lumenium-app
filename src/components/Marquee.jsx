const skills = [
  '動画制作', 'AI研修', 'SNS運用', 'LINE Bot', 'Web制作', 'アプリ開発',
  'PR映像', 'ライター', '教材制作', 'イラスト', 'ロゴ制作', '作詞作曲',
  'モデル手配', 'イベント企画', 'ライブ配信', 'SEO対策', 'バナー制作', 'ポスター',
]

export default function Marquee() {
  return (
    <section className="marquee-section">
      <div className="marquee-track">
        <div className="marquee-content">
          {[...skills, ...skills].map((skill, i) => (
            <span key={i} className="marquee-item">
              {skill}
              <span className="marquee-dot" />
            </span>
          ))}
        </div>
      </div>
      <div className="marquee-track reverse">
        <div className="marquee-content">
          {[...skills.slice().reverse(), ...skills.slice().reverse()].map((skill, i) => (
            <span key={i} className="marquee-item">
              {skill}
              <span className="marquee-dot" />
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
