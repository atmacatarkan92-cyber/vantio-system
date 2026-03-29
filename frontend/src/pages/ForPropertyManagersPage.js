import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Shield, TrendingUp, Home, CheckCircle2, ArrowRight } from 'lucide-react';

const ACCENT = '#F97316';
const PAGE = 'max-w-7xl mx-auto px-6 lg:px-20';
const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl';

const ForPropertyManagersPage = () => {
  const { t, language } = useLanguage();

  const benefits = [
    {
      icon: Shield,
      title: t.propertyManagersPage.benefit1Title,
      desc: t.propertyManagersPage.benefit1Desc,
    },
    {
      icon: TrendingUp,
      title: t.propertyManagersPage.benefit2Title,
      desc: t.propertyManagersPage.benefit2Desc,
    },
    {
      icon: Home,
      title: t.propertyManagersPage.benefit3Title,
      desc: t.propertyManagersPage.benefit3Desc,
    },
    {
      icon: CheckCircle2,
      title: t.propertyManagersPage.benefit4Title,
      desc: t.propertyManagersPage.benefit4Desc,
    },
  ];

  const partnershipFeatures = [
    language === 'de' ? 'Langfristige Mietverträge (1-5 Jahre)' : 'Long-term rental contracts (1-5 years)',
    language === 'de' ? 'Garantierte monatliche Mietzahlungen' : 'Guaranteed monthly rent payments',
    language === 'de' ? 'Professionelle Immobilienverwaltung' : 'Professional property management',
    language === 'de' ? 'Regelmässige Wartung und Pflege' : 'Regular maintenance and care',
    language === 'de' ? 'Geprüfte und zuverlässige Mieter' : 'Vetted and reliable tenants',
    language === 'de' ? 'Transparente Kommunikation' : 'Transparent communication',
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-slate-50 via-white to-slate-100/30 pt-28 pb-16 lg:pt-32 lg:pb-24">
        <div className="pointer-events-none absolute left-0 top-1/4 h-72 w-72 rounded-full bg-orange-500/[0.1] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="relative order-2 lg:order-1">
              <img
                src="https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg"
                alt="Property partnership"
                className="h-[500px] w-full rounded-2xl object-cover shadow-xl ring-1 ring-slate-200/80"
              />
            </div>
            <div className="order-1 lg:order-2">
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">{t.propertyManagersPage.title}</h1>
              <p className="mt-6 text-xl leading-relaxed text-slate-500">{t.propertyManagersPage.subtitle}</p>
              <p className="mt-6 text-lg leading-relaxed text-slate-500">{t.propertyManagersPage.heroText}</p>
              <Button
                size="lg"
                className="mt-8 rounded-full px-8 font-semibold text-white shadow-[0_8px_24px_-6px_rgba(249,115,22,0.4)]"
                style={{ backgroundColor: ACCENT }}
                onClick={() => (window.location.href = '/contact')}
              >
                {t.propertyManagersPage.ctaButton}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-white py-24 lg:py-32">
        <div className={PAGE}>
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{t.propertyManagersPage.benefitsTitle}</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {benefits.map((benefit, index) => (
              <Card key={index} className={`${cardClass} border-slate-200`}>
                <CardContent className="p-6 text-center">
                  <div
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-orange-100"
                    style={{ backgroundColor: `${ACCENT}14` }}
                  >
                    <benefit.icon className="h-8 w-8" style={{ color: ACCENT }} />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-slate-900">{benefit.title}</h3>
                  <p className="leading-relaxed text-slate-500">{benefit.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-slate-50 to-slate-100/40 py-24 lg:py-32">
        <div className="pointer-events-none absolute left-1/3 top-0 h-64 w-64 rounded-full bg-orange-500/[0.08] blur-3xl" aria-hidden />
        <div className="relative z-10 mx-auto max-w-5xl px-6 lg:px-20">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              {language === 'de' ? 'Was wir bieten' : 'What We Offer'}
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {partnershipFeatures.map((feature, index) => (
              <div key={index} className={`flex items-start space-x-3 ${cardClass} border-slate-200 p-6`}>
                <CheckCircle2 className="mt-1 h-6 w-6 shrink-0" style={{ color: ACCENT }} />
                <p className="text-lg text-slate-500">{feature}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-white via-slate-50/30 to-white py-24 lg:py-32">
        <div className="pointer-events-none absolute right-1/4 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-slate-400/[0.08] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              {language === 'de' ? 'So funktioniert die Partnerschaft' : 'How the Partnership Works'}
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: '01',
                title: language === 'de' ? 'Erstkontakt' : 'Initial Contact',
                desc:
                  language === 'de'
                    ? 'Kontaktieren Sie uns und teilen Sie uns Details zu Ihrer Immobilie mit.'
                    : 'Contact us and share details about your property.',
              },
              {
                step: '02',
                title: language === 'de' ? 'Bewertung' : 'Assessment',
                desc:
                  language === 'de'
                    ? 'Wir bewerten Ihre Immobilie und erstellen ein massgeschneidertes Angebot.'
                    : 'We assess your property and create a tailored offer.',
              },
              {
                step: '03',
                title: language === 'de' ? 'Partnerschaft' : 'Partnership',
                desc:
                  language === 'de'
                    ? 'Nach Vertragsabschluss übernehmen wir die Verwaltung und Vermietung.'
                    : 'After signing the contract, we handle management and rental.',
              },
            ].map((item, index) => (
              <div key={index} className="relative text-center">
                <div className="mb-4 text-6xl font-bold opacity-30" style={{ color: ACCENT }}>
                  {item.step}
                </div>
                <h3 className="mb-3 text-2xl font-semibold text-slate-900">{item.title}</h3>
                <p className="leading-relaxed text-slate-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-slate-50 to-slate-100/40 py-24 lg:py-32">
        <div className="pointer-events-none absolute left-0 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-orange-500/[0.1] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div
            className="mx-auto max-w-4xl rounded-[2rem] border border-slate-200/90 p-10 text-center shadow-sm transition-all duration-300 hover:shadow-xl sm:p-14 lg:p-16"
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 50%, #fff7ed 100%)',
            }}
          >
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{t.propertyManagersPage.ctaTitle}</h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-500">{t.propertyManagersPage.ctaText}</p>
            <Button
              size="lg"
              className="mt-10 rounded-full px-10 py-6 text-lg font-semibold text-white shadow-[0_8px_24px_-6px_rgba(249,115,22,0.4)]"
              style={{ backgroundColor: ACCENT }}
              onClick={() => (window.location.href = '/contact')}
            >
              {t.propertyManagersPage.ctaButton}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ForPropertyManagersPage;
