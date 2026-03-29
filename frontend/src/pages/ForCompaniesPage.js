import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { MapPin, Clock, Package, Headphones, CheckCircle, ArrowRight } from 'lucide-react';

const ACCENT = '#F97316';
const PAGE = 'max-w-7xl mx-auto px-6 lg:px-20';
const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl';

const ForCompaniesPage = () => {
  const { t, language } = useLanguage();

  const features = [
    {
      icon: MapPin,
      title: t.companiesPage.feature1Title,
      desc: t.companiesPage.feature1Desc,
    },
    {
      icon: Clock,
      title: t.companiesPage.feature2Title,
      desc: t.companiesPage.feature2Desc,
    },
    {
      icon: Package,
      title: t.companiesPage.feature3Title,
      desc: t.companiesPage.feature3Desc,
    },
    {
      icon: Headphones,
      title: t.companiesPage.feature4Title,
      desc: t.companiesPage.feature4Desc,
    },
  ];

  const benefits = [
    language === 'de' ? 'Sofortige Verfügbarkeit von möblierten Apartments' : 'Immediate availability of furnished apartments',
    language === 'de' ? 'Flexible Mietverträge ab 1 Monat' : 'Flexible rental contracts from 1 month',
    language === 'de' ? 'Alle Nebenkosten inklusive' : 'All utilities included',
    language === 'de' ? 'Professionelle Betreuung 24/7' : 'Professional support 24/7',
    language === 'de' ? 'Zentrale Lagen in allen grossen Städten' : 'Central locations in all major cities',
    language === 'de' ? 'Massgeschneiderte Lösungen für Ihr Unternehmen' : 'Tailored solutions for your company',
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-slate-50 via-white to-slate-100/30 pt-28 pb-16 lg:pt-32 lg:pb-24">
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-orange-500/[0.1] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">{t.companiesPage.title}</h1>
              <p className="mt-6 text-xl leading-relaxed text-slate-500">{t.companiesPage.subtitle}</p>
              <p className="mt-6 text-lg leading-relaxed text-slate-500">{t.companiesPage.heroText}</p>
              <Button
                size="lg"
                className="mt-8 rounded-full px-8 font-semibold text-white shadow-[0_8px_24px_-6px_rgba(249,115,22,0.4)]"
                style={{ backgroundColor: ACCENT }}
                onClick={() => (window.location.href = '/contact')}
              >
                {t.companiesPage.ctaButton}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
            <div className="relative">
              <img
                src="/bild-unternehmen-page.png"
                alt="Corporate Housing Switzerland"
                className="h-[500px] w-full rounded-2xl object-cover shadow-xl ring-1 ring-slate-200/80"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-100 bg-white py-24 lg:py-32">
        <div className={PAGE}>
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{t.companiesPage.whyTitle}</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <Card key={index} className={`${cardClass} border-slate-200`}>
                <CardContent className="p-6 text-center">
                  <div
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-orange-100"
                    style={{ backgroundColor: `${ACCENT}14` }}
                  >
                    <feature.icon className="h-8 w-8" style={{ color: ACCENT }} />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-slate-900">{feature.title}</h3>
                  <p className="leading-relaxed text-slate-500">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-slate-50 to-slate-100/40 py-24 lg:py-32">
        <div className="pointer-events-none absolute right-1/3 top-0 h-64 w-64 rounded-full bg-orange-500/[0.08] blur-3xl" aria-hidden />
        <div className="relative z-10 mx-auto max-w-5xl px-6 lg:px-20">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              {language === 'de' ? 'Ihre Vorteile' : 'Your Benefits'}
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className={`flex items-start space-x-3 ${cardClass} border-slate-200 p-6`}
              >
                <CheckCircle className="mt-1 h-6 w-6 shrink-0" style={{ color: ACCENT }} />
                <p className="text-lg text-slate-500">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-white via-slate-50/30 to-white py-24 lg:py-32">
        <div className="pointer-events-none absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-slate-400/[0.08] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg',
              'https://images.pexels.com/photos/6950015/pexels-photo-6950015.jpeg',
              'https://images.pexels.com/photos/7688457/pexels-photo-7688457.jpeg',
            ].map((src, i) => (
              <div
                key={i}
                className={`group relative h-64 overflow-hidden md:h-80 ${cardClass}`}
              >
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-slate-50 to-slate-100/40 py-24 lg:py-32">
        <div className="pointer-events-none absolute right-0 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-orange-500/[0.12] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div
            className="mx-auto max-w-4xl rounded-[2rem] border border-slate-200/90 p-10 text-center shadow-sm transition-all duration-300 hover:shadow-xl sm:p-14 lg:p-16"
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 50%, #fff7ed 100%)',
            }}
          >
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{t.companiesPage.ctaTitle}</h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-500">{t.companiesPage.ctaText}</p>
            <Button
              size="lg"
              className="mt-10 rounded-full px-10 py-6 text-lg font-semibold text-white shadow-[0_8px_24px_-6px_rgba(249,115,22,0.4)]"
              style={{ backgroundColor: ACCENT }}
              onClick={() => (window.location.href = '/contact')}
            >
              {t.companiesPage.ctaButton}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ForCompaniesPage;
