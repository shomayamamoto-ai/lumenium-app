import { useEffect, lazy, Suspense } from 'react'
import Hero from './Hero'
import News from './News'
import Stats from './Stats'
import ServicesIntro from './ServicesIntro'
import Why from './Why'
import BrandStory from './BrandStory'
import Positioning from './Positioning'
import Services from './Services'
import Results from './Results'
import PricingSimulator from './PricingSimulator'
import Testimonials from './Testimonials'
import Flow from './Flow'
import FAQ from './FAQ'
import Profile from './Profile'
import ContactForm from './ContactForm'
import Company from './Company'
import Footer from './Footer'
import InlineCTA from './InlineCTA'
import SkeletonSection from './Skeleton'

const Blog = lazy(() => import('./Blog'))


// サービス案内 — split into its own chunk (App prefetches it on idle).
// With a `section`, ONLY that section renders as a standalone page —
// menu picks show just the chosen content, nothing above or below.
// Without one (#/info), the full overview page renders as before.
export default function InfoPage({ section = '', onPrivacy, onMounted }) {
  // Signal App that the lazy chunk has mounted so scroll observers rebind
  useEffect(() => {
    onMounted?.()
  }, [onMounted])

  const blog = (
    <Suspense fallback={<SkeletonSection title="Blog" cards={3} columns={3} />}>
      <Blog />
    </Suspense>
  )

  const SOLO = {
    news: <News />,
    pain: <Why />,
    story: <BrandStory />,
    positioning: <Positioning />,
    services: <><ServicesIntro /><Services /></>,
    results: <Results />,
    pricing: <PricingSimulator />,
    testimonials: <Testimonials />,
    flow: <Flow />,
    blog,
    faq: <FAQ />,
    about: <Profile />,
    company: <Company />,
    'contact-form': <ContactForm />,
  }

  if (section && SOLO[section]) {
    return (
      <>
        <div className="solo-page">{SOLO[section]}</div>
        <Footer onPrivacy={onPrivacy} />
      </>
    )
  }

  /* トップ（ランディング）の並び。初めての人が「自分に関係あるか →
     何をしてくれるか → 本当にできるのか → なぜここか → いくらか →
     どう進むか → 頼んだ人はどうだったか → 気になる点 → 相談」と
     迷わず進めるように、判断の順に並べています。
     お知らせ・ブランドストーリー・ミッション・代表紹介・会社概要・
     ブログは、ここからは外しました（メニューからそれぞれのページで
     読めます）。同じ数字の並びや、お問い合わせの案内が二重になって
     いたところも1つにしています。 */
  return (
    <>
      <Hero />
      <Stats />
      <Why />
      <Services />
      <Results />
      <InlineCTA />
      <Positioning />
      <PricingSimulator />
      <Flow />
      <Testimonials />
      <FAQ />
      <ContactForm />
      {/* フォームのすぐ下に、同じ相談の案内をもう一度出さない */}
      <Footer onPrivacy={onPrivacy} cta={false} />
    </>
  )
}
