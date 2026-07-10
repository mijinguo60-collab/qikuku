import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Hero from '@/components/landing/Hero';
import Capabilities from '@/components/landing/Capabilities';
import DemoSection from '@/components/landing/DemoSection';
import ImageDemo from '@/components/landing/ImageDemo';
import Security from '@/components/landing/Security';
import Industries from '@/components/landing/Industries';
import CTA from '@/components/landing/CTA';
import Footer from '@/components/Footer';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <Capabilities />
      <DemoSection />
      <ImageDemo />
      <Security />
      <Industries />
      <CTA />
      <Footer />
    </main>
  );
}
