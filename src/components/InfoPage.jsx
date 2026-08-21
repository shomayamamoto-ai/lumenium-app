import { useEffect, lazy, Suspense } from 'react'
import Hero from './Hero'
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

// サービス案内 — everything that used to live on the top page.
// Split into its own chunk so the search home ships a much smaller bundle;
// App prefetches this chunk on idle, keeping the transition instant.
export default function InfoPage({ onPrivacy, onMounted }) {
  // Signal App that the lazy chunk has mounted so scroll observers rebind
  useEffect(() => {
    onMounted?.()
  }, [onMounted])

  return (
    <>
      <Hero />
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
