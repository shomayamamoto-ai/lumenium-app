export default function IntroVideo() {
  return (
    <section className="intro-video-section">
      <div className="intro-video-wrapper">
        <video
          className="intro-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src="/intro.mp4" type="video/mp4" />
        </video>
      </div>
    </section>
  )
}
