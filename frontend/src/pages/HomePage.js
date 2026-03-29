import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Layers,
  BarChart3,
  Wallet,
  Users,
  Share2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

/** Public landing copy (EN). Ready for i18n swap later. */
const LANDING = {
  hero: {
    headline: 'Run your entire rental business in one system.',
    subheadline:
      'From operations to analytics — Vantio gives you full control over your rental portfolio.',
    tagline: 'Built for operators. Not spreadsheets.',
    primaryCta: 'Request demo',
    secondaryCta: 'Login',
  },
  socialProof: {
    line: 'Built for modern rental operators',
    logos: [
      'Operator One',
      'Urban Living Group',
      'Smart Rentals',
      'CoLiving Co',
      'Asset Management Ltd',
    ],
  },
  featuresIntro: {
    title: 'Everything in one platform',
    subtitle: 'Purpose-built for teams who run rental portfolios at scale.',
  },
  features: [
    {
      title: 'Portfolio Management',
      description:
        'Manage all units, properties and contracts in one structured system.',
      Icon: Layers,
    },
    {
      title: 'Flexible Rental Models',
      description:
        'Operate co-living, serviced apartments and hybrid models with ease.',
      Icon: Building2,
    },
    {
      title: 'Real-Time Analytics',
      description: 'Track occupancy, revenue and performance instantly.',
      Icon: BarChart3,
    },
    {
      title: 'Financial Overview',
      description:
        'Monitor cash flow, invoices and profitability across your portfolio.',
      Icon: Wallet,
    },
    {
      title: 'Tenant Management',
      description:
        'Handle tenant lifecycle, communication and contracts in one place.',
      Icon: Users,
    },
    {
      title: 'Listings & Distribution',
      description: 'Publish and manage listings across channels with full control.',
      Icon: Share2,
    },
  ],
  visual: {
    headline: 'Operate your portfolio with clarity',
    body: 'Stop juggling spreadsheets and disconnected tools. Vantio brings everything into one system.',
    previewLabel: 'Dashboard Preview',
  },
  problemSolution: {
    problem: 'Spreadsheets, manual work, no real overview',
    solution: 'One platform. Real control. Scalable operations.',
  },
  audience: {
    title: 'Who is Vantio for?',
    items: [
      { label: 'Property managers', Icon: Building2 },
      { label: 'Co-living operators', Icon: Users },
      { label: 'Serviced apartment providers', Icon: Layers },
      { label: 'Real estate investors', Icon: BarChart3 },
    ],
  },
  finalCta: {
    headline: 'Ready to scale your rental operations?',
    subtext: 'See how Vantio can transform your workflow.',
    primary: 'Request demo',
    secondary: 'Get access',
  },
};

const HomePage = () => {
  return (
    <div className="min-h-screen bg-white antialiased">
      {/* 1. Hero */}
      <section className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(255,122,61,0.12),transparent)] pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50/80 via-white to-white pointer-events-none" />
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-[3.25rem] font-semibold text-slate-900 mb-8 leading-[1.1] tracking-tight">
            {LANDING.hero.headline}
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 mb-14 max-w-2xl mx-auto leading-relaxed font-normal">
            {LANDING.hero.subheadline}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Link to="/contact">
              <Button
                size="lg"
                className="bg-[#FF7A3D] hover:bg-[#FF6A2D] text-white px-10 py-7 text-base font-semibold rounded-xl shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/25 transition-all duration-300 hover:-translate-y-0.5"
              >
                {LANDING.hero.primaryCta}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/admin/login">
              <Button
                size="lg"
                variant="outline"
                className="border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 px-10 py-7 text-base font-semibold rounded-xl shadow-sm transition-all duration-300 hover:-translate-y-0.5"
              >
                {LANDING.hero.secondaryCta}
              </Button>
            </Link>
          </div>
          <p className="text-sm font-medium text-slate-500 tracking-[0.2em] uppercase">
            {LANDING.hero.tagline}
          </p>
        </div>
      </section>

      {/* 2. Social proof */}
      <section className="py-16 lg:py-20 border-y border-slate-100 bg-slate-50/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-slate-500 uppercase tracking-widest mb-12">
            {LANDING.socialProof.line}
          </p>
          <div className="flex flex-wrap justify-center items-center gap-6 md:gap-10">
            {LANDING.socialProof.logos.map((name) => (
              <div
                key={name}
                className="h-12 md:h-14 min-w-[140px] px-5 rounded-lg bg-slate-200/80 border border-slate-200/90 flex items-center justify-center text-slate-500 text-xs font-medium tracking-tight hover:bg-slate-200 transition-colors duration-300"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Features */}
      <section id="features" className="py-24 lg:py-32 bg-white scroll-mt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16 lg:mb-20">
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4 tracking-tight">
              {LANDING.featuresIntro.title}
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              {LANDING.featuresIntro.subtitle}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {LANDING.features.map(({ title, description, Icon }) => (
              <Card
                key={title}
                className="group border-slate-100/80 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-slate-200/80 transition-all duration-300 rounded-2xl"
              >
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF7A3D]/15 to-orange-50 flex items-center justify-center mb-5 group-hover:from-[#FF7A3D]/25 transition-colors duration-300">
                    <Icon className="h-6 w-6 text-[#FF7A3D]" strokeWidth={1.75} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-3 tracking-tight">{title}</h3>
                  <p className="text-slate-600 text-[15px] leading-relaxed">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Visual split */}
      <section className="py-24 lg:py-32 bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight leading-tight">
                {LANDING.visual.headline}
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed max-w-lg">
                {LANDING.visual.body}
              </p>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-tr from-[#FF7A3D]/20 via-slate-200/40 to-slate-100 rounded-3xl blur-2xl opacity-70" aria-hidden />
              <div className="relative rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 shadow-2xl shadow-slate-900/10 overflow-hidden aspect-[4/3] flex flex-col">
                <div className="h-10 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2 px-4">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                </div>
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center space-y-3">
                    <div className="inline-flex h-14 w-14 rounded-2xl bg-slate-100 border border-slate-200 items-center justify-center mx-auto">
                      <BarChart3 className="h-7 w-7 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">{LANDING.visual.previewLabel}</p>
                    <p className="text-xs text-slate-400 max-w-[200px] mx-auto">
                      Placeholder for product UI — metrics, units, and pipeline in one view.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Problem → Solution */}
      <section className="py-24 lg:py-32 bg-[#0f172a] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-stretch">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-10 lg:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-4">
                The problem
              </p>
              <p className="text-2xl md:text-[1.65rem] font-medium leading-snug text-white/95">
                {LANDING.problemSolution.problem}
              </p>
            </div>
            <div className="rounded-3xl border border-[#FF7A3D]/30 bg-gradient-to-br from-[#FF7A3D]/15 to-orange-950/20 p-10 lg:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/90 mb-4">
                The solution
              </p>
              <p className="text-2xl md:text-[1.65rem] font-medium leading-snug text-white">
                {LANDING.problemSolution.solution}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Target group */}
      <section className="py-24 lg:py-32 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 text-center mb-14 tracking-tight">
            {LANDING.audience.title}
          </h2>
          <ul className="space-y-0 divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/30">
            {LANDING.audience.items.map(({ label, Icon }) => (
              <li
                key={label}
                className="flex items-center gap-4 px-6 py-5 text-slate-800 text-[17px] hover:bg-white transition-colors duration-200"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-100 shadow-sm">
                  <Icon className="h-5 w-5 text-[#FF7A3D]" strokeWidth={1.75} />
                </span>
                <span className="font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 7. Final CTA */}
      <section className="py-24 lg:py-32 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-white mb-5 tracking-tight leading-tight">
            {LANDING.finalCta.headline}
          </h2>
          <p className="text-lg text-slate-400 mb-12 leading-relaxed">{LANDING.finalCta.subtext}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/contact">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-[#FF7A3D] hover:bg-[#FF6A2D] text-white px-10 py-7 text-base font-semibold rounded-xl shadow-lg shadow-orange-500/20 hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5"
              >
                {LANDING.finalCta.primary}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/admin/login">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-white/20 bg-white/5 text-white hover:bg-white/10 px-10 py-7 text-base font-semibold rounded-xl transition-all duration-300 hover:-translate-y-0.5"
              >
                {LANDING.finalCta.secondary}
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
