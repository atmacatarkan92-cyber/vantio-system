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
  Check,
  Sparkles,
  LayoutGrid,
  PieChart,
  ListTodo,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { PUBLIC_APP_LOGIN_URL } from '../components/Header';

const ACCENT = '#F97316';

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
    label: 'Trusted by teams who operate at scale',
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
    benefits: [
      'Single source of truth for units, tenants and contracts',
      'Fewer errors and less manual reconciliation',
      'Faster decisions with live portfolio metrics',
    ],
    cta: 'Explore the platform',
    previewLabel: 'Portfolio overview',
  },
  problemSolution: {
    problemLabel: 'Without a unified system',
    problem: 'Spreadsheets, manual work, no real overview',
    solutionLabel: 'With Vantio',
    solution: 'One platform. Real control. Scalable operations.',
  },
  audience: {
    title: 'Who is Vantio for?',
    cards: [
      {
        title: 'Property managers',
        description: 'Centralize operations across buildings and stakeholders.',
        Icon: Building2,
      },
      {
        title: 'Co-living operators',
        description: 'Run flexible models with clear occupancy and billing.',
        Icon: Users,
      },
      {
        title: 'Serviced apartment providers',
        description: 'Deliver consistent guest and unit operations at scale.',
        Icon: Layers,
      },
      {
        title: 'Real estate investors',
        description: 'See performance and risk across assets in one place.',
        Icon: BarChart3,
      },
    ],
  },
  trust: {
    headline: 'Built from real operations',
    body: 'Vantio is shaped by the day-to-day work of running rental portfolios — not slide decks. We focus on clarity, control and workflows your team will actually use.',
  },
  finalCta: {
    headline: 'Ready to scale your rental operations?',
    subtext: 'See how Vantio can transform your workflow.',
    primary: 'Request demo',
    secondary: 'Get access',
  },
};

const sectionWrap = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';
const sectionY = 'py-24 lg:py-32';

/** Premium app-frame preview — distinct layout from prior iterations. */
function HeroProductPreview() {
  const barHeights = [32, 48, 38, 62, 44, 71, 55, 68, 52, 78, 61, 84];
  return (
    <div className="relative w-full mt-20 sm:mt-24 lg:mt-32">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[min(520px,90vw)] w-[min(900px,120%)] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-gradient-to-tr from-orange-100/[0.35] via-white/0 to-slate-200/[0.25] blur-[100px]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl">
        <div
          className="rounded-[1.75rem] bg-white shadow-[0_40px_100px_-32px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/90 overflow-hidden"
          style={{ boxShadow: `0 40px 100px -32px rgba(15,23,42,0.22), 0 0 0 1px rgba(15,23,42,0.04)` }}
        >
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/95 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            </div>
            <div className="hidden sm:flex flex-1 justify-center">
              <span className="rounded-lg bg-white px-4 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-slate-200/80">
                app.vantio.io / portfolio
              </span>
            </div>
            <div className="w-16 sm:w-24" aria-hidden />
          </div>

          <div className="flex min-h-[280px] sm:min-h-[320px] lg:min-h-[360px]">
            <aside className="hidden sm:flex w-16 lg:w-[4.5rem] flex-col items-center gap-5 border-r border-slate-100 bg-slate-50/50 py-8">
              <LayoutGrid className="h-5 w-5 text-slate-400" strokeWidth={1.5} />
              <PieChart className="h-5 w-5 text-slate-300" strokeWidth={1.5} />
              <ListTodo className="h-5 w-5 text-slate-300" strokeWidth={1.5} />
              <div
                className="mt-auto mb-2 h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${ACCENT}18` }}
              >
                <BarChart3 className="h-4 w-4" style={{ color: ACCENT }} strokeWidth={2} />
              </div>
            </aside>

            <div className="flex-1 p-6 sm:p-8 lg:p-10 bg-gradient-to-b from-white via-white to-slate-50/40">
              <div className="grid gap-6 lg:grid-cols-12 lg:gap-8 lg:items-start">
                <div className="lg:col-span-5 space-y-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Live snapshot
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { k: 'Occupancy', v: '94%' },
                      { k: 'MRR', v: 'CHF 428k' },
                      { k: 'Tasks', v: '12' },
                    ].map((row) => (
                      <div
                        key={row.k}
                        className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-[0_1px_0_0_rgba(15,23,42,0.04)]"
                      >
                        <p className="text-[10px] text-slate-400">{row.k}</p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{row.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/50 px-4 py-3 text-[11px] text-slate-500 leading-relaxed">
                    Unified ledger · tenants · units — one operational view.
                  </div>
                </div>

                <div className="lg:col-span-7 rounded-2xl border border-slate-100 bg-white p-5 shadow-inner">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">Performance</span>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      Last 12 periods
                    </span>
                  </div>
                  <div className="flex h-40 items-end justify-between gap-1.5 px-1">
                    {barHeights.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 min-h-[12%] rounded-t-md"
                        style={{
                          height: `${h}%`,
                          background: `linear-gradient(to top, ${ACCENT}f0, ${ACCENT}66)`,
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-4 text-center text-[11px] text-slate-400">
                    Illustrative trend — revenue & occupancy
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SplitProductPreview() {
  return (
    <div className="relative h-full min-h-[340px] lg:min-h-[420px]">
      <div
        className="pointer-events-none absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-orange-50/80 via-white to-slate-100/60 blur-2xl opacity-90"
        aria-hidden
      />
      <div className="relative flex h-full flex-col overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-slate-200/90 shadow-[0_24px_70px_-20px_rgba(15,23,42,0.18)]">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/90 px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="h-2 w-2 rounded-full bg-slate-200" />
          <span className="h-2 w-2 rounded-full bg-slate-200" />
          <span className="ml-3 text-[10px] font-medium text-slate-400">{LANDING.visual.previewLabel}</span>
        </div>
        <div className="flex flex-1 flex-col justify-between p-8 lg:p-10">
          <div className="space-y-3">
            {[72, 100, 88, 96].map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-100" />
                <div className="h-2.5 rounded-full bg-slate-100" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-10 grid grid-cols-3 gap-3 border-t border-slate-100 pt-8">
            {['Units', 'Contracts', 'Alerts'].map((lab, i) => (
              <div key={lab} className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">{lab}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">
                  {i === 0 ? '248' : i === 1 ? '192' : '3'}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-slate-400 leading-relaxed">
            Illustrative UI — portfolio, units and tenants in one place.
          </p>
        </div>
      </div>
    </div>
  );
}

const btnPrimary =
  'rounded-full font-semibold text-white shadow-[0_8px_24px_-6px_rgba(249,115,22,0.45)] hover:opacity-[0.96] transition-opacity px-8 py-6 text-[15px]';
const btnSecondary =
  'rounded-full font-semibold border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-50 px-8 py-6 text-[15px]';

const HomePage = () => {
  return (
    <div className="min-h-screen bg-white antialiased">
      {/* 1. Hero — full-height, dominant type, new preview */}
      <section className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-white pb-24 pt-28 sm:pb-28 sm:pt-32 lg:pb-32 lg:pt-36">
        <div
          className="pointer-events-none absolute -left-40 top-20 h-[500px] w-[500px] rounded-full bg-orange-50/[0.45] blur-[120px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-32 bottom-0 h-[420px] w-[420px] rounded-full bg-slate-100/80 blur-[100px]"
          aria-hidden
        />

        <div className={`relative z-10 ${sectionWrap} flex flex-col`}>
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-[2.75rem] font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
              {LANDING.hero.headline}
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-500 sm:text-xl lg:text-2xl lg:leading-relaxed">
              {LANDING.hero.subheadline}
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
              <Link to="/contact">
                <Button size="lg" className={btnPrimary} style={{ backgroundColor: ACCENT }}>
                  {LANDING.hero.primaryCta}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href={PUBLIC_APP_LOGIN_URL} rel="noopener noreferrer">
                <Button size="lg" variant="outline" className={btnSecondary}>
                  {LANDING.hero.secondaryCta}
                </Button>
              </a>
            </div>
            <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              {LANDING.hero.tagline}
            </p>
          </div>

          <HeroProductPreview />
        </div>
      </section>

      {/* 2. Social proof */}
      <section className={`border-t border-slate-100 bg-slate-50 ${sectionY}`}>
        <div className={sectionWrap}>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              {LANDING.socialProof.label}
            </p>
            <p className="mt-3 text-base text-slate-500">{LANDING.socialProof.line}</p>
          </div>
          <div className="mx-auto mt-14 flex max-w-5xl flex-wrap justify-center gap-4 md:gap-5">
            {LANDING.socialProof.logos.map((name) => (
              <div
                key={name}
                className="flex min-h-[3.25rem] min-w-[148px] items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-7 py-3 text-xs font-medium text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Features — product-style blocks */}
      <section id="features" className={`scroll-mt-28 border-t border-slate-100 bg-white ${sectionY}`}>
        <div className={sectionWrap}>
          <div className="mx-auto mb-16 max-w-3xl text-center lg:mb-24">
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
              {LANDING.featuresIntro.title}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-500 md:text-xl">
              {LANDING.featuresIntro.subtitle}
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-10">
            {LANDING.features.map(({ title, description, Icon }) => (
              <div
                key={title}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_40px_-28px_rgba(15,23,42,0.2)] transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_56px_-24px_rgba(15,23,42,0.22)]"
              >
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-5 py-3">
                  <span className="font-mono text-[10px] text-slate-400">module.{title.split(' ')[0].toLowerCase()}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90" aria-hidden />
                </div>
                <div className="flex flex-1 flex-col p-9 lg:p-10">
                  <div
                    className="mb-7 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-100"
                    style={{ backgroundColor: `${ACCENT}14` }}
                  >
                    <Icon className="h-7 w-7" style={{ color: ACCENT }} strokeWidth={1.6} />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h3>
                  <p className="mt-4 flex-1 text-base leading-relaxed text-slate-500">{description}</p>
                  <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                  <p className="mt-4 text-xs font-medium text-slate-400">Included in platform</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Visual split */}
      <section className={`border-t border-slate-100 bg-slate-50 ${sectionY}`}>
        <div className={sectionWrap}>
          <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-20 xl:gap-24">
            <div className="order-2 lg:order-1">
              <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl md:leading-[1.1]">
                {LANDING.visual.headline}
              </h2>
              <p className="mt-8 text-lg leading-relaxed text-slate-500 md:text-xl">{LANDING.visual.body}</p>
              <ul className="mt-10 space-y-5">
                {LANDING.visual.benefits.map((line) => (
                  <li key={line} className="flex gap-4 text-base text-slate-600">
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${ACCENT}18`, color: ACCENT }}
                    >
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-12">
                <Link to="/contact">
                  <Button size="lg" className={btnPrimary} style={{ backgroundColor: ACCENT }}>
                    {LANDING.visual.cta}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <SplitProductPreview />
            </div>
          </div>
        </div>
      </section>

      {/* 5. Problem / solution */}
      <section className={`border-t border-slate-100 bg-white ${sectionY}`}>
        <div className={sectionWrap}>
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            <div className="flex flex-col justify-center rounded-3xl border border-slate-200 bg-slate-50 p-10 lg:p-12">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                {LANDING.problemSolution.problemLabel}
              </p>
              <p className="mt-6 text-2xl font-medium leading-snug text-slate-600 md:text-3xl">
                {LANDING.problemSolution.problem}
              </p>
            </div>
            <div
              className="relative flex flex-col justify-center overflow-hidden rounded-3xl border p-10 shadow-[0_20px_50px_-28px_rgba(249,115,22,0.35)] lg:p-12"
              style={{
                borderColor: `${ACCENT}55`,
                background: `linear-gradient(135deg, ${ACCENT}12 0%, #fff 48%, #fff 100%)`,
              }}
            >
              <div
                className="absolute left-0 top-0 h-full w-1.5 rounded-l-3xl"
                style={{ backgroundColor: ACCENT }}
                aria-hidden
              />
              <p className="pl-2 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
                {LANDING.problemSolution.solutionLabel}
              </p>
              <p className="mt-6 pl-2 text-2xl font-semibold leading-snug text-slate-900 md:text-3xl">
                {LANDING.problemSolution.solution}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Target group */}
      <section className={`border-t border-slate-100 bg-slate-50 ${sectionY}`}>
        <div className={sectionWrap}>
          <h2 className="mx-auto max-w-3xl text-center text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
            {LANDING.audience.title}
          </h2>
          <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-8 sm:grid-cols-2 lg:mt-20 lg:gap-10">
            {LANDING.audience.cards.map(({ title, description, Icon }) => (
              <div
                key={title}
                className="flex flex-col rounded-3xl border border-slate-200/90 bg-white p-10 shadow-[0_16px_48px_-32px_rgba(15,23,42,0.15)] transition-shadow duration-300 hover:shadow-[0_24px_56px_-28px_rgba(15,23,42,0.18)] lg:p-12"
              >
                <div
                  className="mb-8 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-100"
                  style={{ backgroundColor: `${ACCENT}14` }}
                >
                  <Icon className="h-8 w-8" style={{ color: ACCENT }} strokeWidth={1.5} />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h3>
                <p className="mt-4 text-lg leading-relaxed text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Trust */}
      <section className={`border-t border-slate-100 bg-white ${sectionY}`}>
        <div className={sectionWrap}>
          <div className="mx-auto max-w-3xl text-center lg:max-w-4xl">
            <div
              className="mx-auto mb-10 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-100"
              style={{ backgroundColor: `${ACCENT}14` }}
            >
              <Sparkles className="h-7 w-7" style={{ color: ACCENT }} strokeWidth={1.4} />
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
              {LANDING.trust.headline}
            </h2>
            <p className="mx-auto mt-10 text-lg leading-[1.75] text-slate-500 md:text-xl">
              {LANDING.trust.body}
            </p>
          </div>
        </div>
      </section>

      {/* 8. CTA */}
      <section className={`border-t border-slate-100 bg-slate-50 ${sectionY}`}>
        <div className={sectionWrap}>
          <div
            className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200/90 p-12 text-center shadow-[0_32px_80px_-40px_rgba(15,23,42,0.25)] sm:p-16 lg:rounded-[2.5rem] lg:p-20"
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 45%, #fff7ed 100%)',
            }}
          >
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
              {LANDING.finalCta.headline}
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-slate-500">{LANDING.finalCta.subtext}</p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
              <Link to="/contact">
                <Button size="lg" className={btnPrimary} style={{ backgroundColor: ACCENT }}>
                  {LANDING.finalCta.primary}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href={PUBLIC_APP_LOGIN_URL} rel="noopener noreferrer">
                <Button size="lg" variant="outline" className={btnSecondary}>
                  {LANDING.finalCta.secondary}
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
