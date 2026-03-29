import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent } from '../components/ui/card';
import { Target, Eye, Award, Users, Heart, Shield } from 'lucide-react';

const ACCENT = '#F97316';
const PAGE = 'max-w-7xl mx-auto px-6 lg:px-20';
const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl';

const AboutPage = () => {
  const { t, language } = useLanguage();

  const values = [
    {
      icon: Award,
      title: t.aboutPage.value1,
      desc: t.aboutPage.value1Desc,
    },
    {
      icon: Users,
      title: t.aboutPage.value2,
      desc: t.aboutPage.value2Desc,
    },
    {
      icon: Heart,
      title: t.aboutPage.value3,
      desc: t.aboutPage.value3Desc,
    },
    {
      icon: Shield,
      title: t.aboutPage.value4,
      desc: t.aboutPage.value4Desc,
    },
  ];

  const stats = [
    { number: '140+', label: language === 'de' ? 'Zufriedene Kunden' : 'Happy Clients' },
    { number: '15+', label: language === 'de' ? 'Apartments' : 'Apartments' },
    { number: '4', label: language === 'de' ? 'Städte' : 'Cities' },
    { number: '93%', label: language === 'de' ? 'Kundenzufriedenheit' : 'Client Satisfaction' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-slate-50 via-white to-slate-100/30 pt-28 pb-16 lg:pt-32 lg:pb-24">
        <div className="pointer-events-none absolute right-0 top-1/4 h-80 w-80 rounded-full bg-orange-500/[0.1] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">{t.aboutPage.title}</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-slate-500 md:text-xl">
              {t.aboutPage.subtitle}
            </p>
          </div>

          <div className="relative mb-16 overflow-hidden rounded-2xl border border-slate-200 shadow-lg">
            <img
              src="https://images.unsplash.com/photo-1620563092215-0fbc6b55cfc5"
              alt="Zurich cityscape"
              className="h-96 w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent" />
          </div>

          <div className="mb-20 grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="mb-2 text-4xl font-bold md:text-5xl" style={{ color: ACCENT }}>
                  {stat.number}
                </div>
                <div className="font-medium text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-white via-slate-50/40 to-white py-24 lg:py-32">
        <div className="pointer-events-none absolute -left-16 top-0 h-72 w-72 rounded-full bg-slate-400/[0.1] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="grid gap-8 md:grid-cols-2 md:gap-10">
            <Card className={`${cardClass} border-slate-200`}>
              <CardContent className="p-8">
                <div
                  className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-orange-100"
                  style={{ backgroundColor: `${ACCENT}14` }}
                >
                  <Target className="h-8 w-8" style={{ color: ACCENT }} />
                </div>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900">{t.aboutPage.missionTitle}</h2>
                <p className="text-lg leading-relaxed text-slate-500">{t.aboutPage.missionText}</p>
              </CardContent>
            </Card>

            <Card className={`${cardClass} border-slate-200`}>
              <CardContent className="p-8">
                <div
                  className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-orange-100"
                  style={{ backgroundColor: `${ACCENT}14` }}
                >
                  <Eye className="h-8 w-8" style={{ color: ACCENT }} />
                </div>
                <h2 className="mb-4 text-3xl font-bold tracking-tight text-slate-900">{t.aboutPage.visionTitle}</h2>
                <p className="text-lg leading-relaxed text-slate-500">{t.aboutPage.visionText}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-slate-50 to-slate-100/40 py-24 lg:py-32">
        <div className="pointer-events-none absolute right-1/4 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-orange-500/[0.08] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{t.aboutPage.valuesTitle}</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {values.map((value, index) => (
              <Card key={index} className={`${cardClass} border-slate-200`}>
                <CardContent className="p-6 text-center">
                  <div
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-orange-100"
                    style={{ backgroundColor: `${ACCENT}14` }}
                  >
                    <value.icon className="h-8 w-8" style={{ color: ACCENT }} />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-slate-900">{value.title}</h3>
                  <p className="leading-relaxed text-slate-500">{value.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-white via-slate-50/30 to-white py-24 lg:py-32">
        <div className="pointer-events-none absolute left-0 bottom-0 h-72 w-72 rounded-full bg-slate-400/[0.08] blur-3xl" aria-hidden />
        <div className="relative z-10 mx-auto max-w-5xl px-6 lg:px-20">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              {language === 'de' ? 'Unsere Geschichte' : 'Our Story'}
            </h2>
          </div>

          <div className="max-w-none text-slate-500">
            <p className="mb-6 text-lg leading-relaxed">
              {language === 'de'
                ? 'FeelAtHomeNow entstand aus der Idee, internationalen Professionals, Expats und Studierenden den Start in der Schweiz einfacher zu machen. Gerade in Städten wie Zürich ist es oft schwierig, kurzfristig passenden Wohnraum zu finden. Genau hier setzen wir an – mit möblierten Apartments und flexiblen Co-Living Lösungen.'
                : 'FeelAtHomeNow was created with the idea of making it easier for international professionals, expats and students to settle in Switzerland. Especially in cities like Zurich, finding suitable housing on short notice can be challenging. This is exactly where we come in – with furnished apartments and flexible co-living solutions.'}
            </p>
            <p className="mb-6 text-lg leading-relaxed">
              {language === 'de'
                ? 'Seit unserer Gründung haben wir über 140 Kunden dabei geholfen, sich in der Schweiz zuhause zu fühlen. Unsere Apartments befinden sich in den besten Lagen von Zürich, Genf, Basel und Zug – immer mit dem Fokus auf Qualität, Service und Flexibilität.'
                : 'Since our founding, we have helped over 140 clients feel at home in Switzerland. Our apartments are located in prime areas of Zurich, Geneva, Basel and Zug – always with a focus on quality, service and flexibility.'}
            </p>
            <p className="text-lg leading-relaxed">
              {language === 'de'
                ? 'Heute sind wir stolzer Partner von führenden internationalen Unternehmen und Immobilieneigentümern. Unser Ziel bleibt unverändert: Jedem das Gefühl zu geben, in der Schweiz wirklich zuhause zu sein.'
                : 'Today we are a proud partner of leading international companies and property owners. Our goal remains unchanged: to make everyone feel truly at home in Switzerland.'}
            </p>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-slate-50 to-slate-100/40 py-24 lg:py-32">
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-orange-500/[0.08] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              'https://images.unsplash.com/photo-1573137785546-9d19e4f33f87',
              'https://images.unsplash.com/photo-1643981670720-eef07ebdb179',
              'https://images.unsplash.com/photo-1649790247335-42156c080db6',
              'https://images.pexels.com/photos/15031992/pexels-photo-15031992.jpeg',
            ].map((image, index) => (
              <div
                key={index}
                className={`group relative h-64 overflow-hidden ${cardClass} border-slate-200 p-0`}
              >
                <img
                  src={image}
                  alt={`Swiss location ${index + 1}`}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
