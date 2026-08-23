import { useEffect, lazy, Suspense } from 'react'
import Hero from './Hero'
import News from './News'
import TrustStrip from './TrustStrip'
import Stats from './Stats'
import ServicesIntro from './ServicesIntro'
import Why from './Why'
import Banner from './Banner'
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
import SocialShare from './SocialShare'
import Company from './Company'
import CTA from './CTA'
import Footer from './Footer'
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

  return (
    <>
      <Hero />
      <News />
      <TrustStrip />
      <Stats />
      <Why />
      <BrandStory />
      <Positioning />
      <Banner />
      <ServicesIntro />
      <Services />
      <Results />
      <PricingSimulator />
      <Testimonials />
      <Flow />
      <Suspense fallback={<SkeletonSection title="Blog" cards={3} columns={3} />}>
        <Blog />
      </Suspense>
      <FAQ />
      <Profile />
      <Company />
      <ContactForm />
      <CTA />
      <div className="container"><SocialShare /></div>
      <Footer onPrivacy={onPrivacy} />
    </>
  )
}
