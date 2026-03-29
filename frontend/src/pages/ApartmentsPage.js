import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Bed, Bath, Square, MapPin, ArrowRight, Loader2 } from 'lucide-react';

import { API_BASE_URL } from '../config';

const ACCENT = '#F97316';
const PAGE = 'max-w-7xl mx-auto px-6 lg:px-20';
const cardClass =
  'group h-full cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl';

const cityMap = {
  zuerich: 'Zurich',
  basel: 'Basel',
  bern: 'Bern',
  genf: 'Geneva',
};

const ApartmentsPage = () => {
  const { t, language } = useLanguage();
  const { city } = useParams();
  const [selectedCity, setSelectedCity] = useState(null);
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortOrder, setSortOrder] = useState('default');

  const cities = [
    { value: 'all', label: t.apartmentsPage.filterAll },
    { value: 'Zurich', label: t.apartmentsPage.filterZurich },
    { value: 'Basel', label: t.apartmentsPage.filterBasel },
    { value: 'Bern', label: 'Bern' },
    { value: 'Geneva', label: t.apartmentsPage.filterGeneva },
  ];

  useEffect(() => {
    if (!city) {
      setSelectedCity('all');
      document.title = 'Furnished Apartments Switzerland | FeelAtHomeNow';
      return;
    }

    const mappedCity = cityMap[city.toLowerCase()] || 'all';
    setSelectedCity(mappedCity);
    document.title = `Furnished Apartments ${mappedCity} | FeelAtHomeNow`;
  }, [city]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedCity]);

  useEffect(() => {
    if (selectedCity === null) return;
    const fetchApartments = async () => {
      setLoading(true);
      setError(null);
      try {
        const url =
          selectedCity === 'all'
            ? `${API_BASE_URL}/api/apartments`
            : `${API_BASE_URL}/api/apartments?city=${selectedCity}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch apartments');

        const data = await response.json();
        setApartments(data);
      } catch (err) {
        console.error('Error fetching apartments:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchApartments();
  }, [selectedCity]);

  const filteredApartments = [...apartments].sort((a, b) => {
    const priceA = Number(String(a.price).replace(/[^0-9.-]+/g, '')) || 0;
    const priceB = Number(String(b.price).replace(/[^0-9.-]+/g, '')) || 0;

    if (sortOrder === 'price-asc') return priceA - priceB;
    if (sortOrder === 'price-desc') return priceB - priceA;

    return 0;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-slate-50 via-white to-slate-100/30 pt-28 pb-12 lg:pt-32 lg:pb-16">
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-orange-500/[0.1] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="mb-12 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">{t.apartmentsPage.title}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-500 md:text-xl">{t.apartmentsPage.subtitle}</p>
          </div>

          <div className="mb-12 flex flex-wrap items-center justify-center gap-3">
            {cities.map((c) => (
              <Button
                key={c.value}
                variant={selectedCity === c.value ? 'default' : 'outline'}
                onClick={() => {
                  setSelectedCity(c.value);
                  setSortOrder('default');
                }}
                className={
                  selectedCity === c.value
                    ? 'rounded-full border-0 text-white shadow-sm'
                    : 'rounded-full border-slate-200 text-slate-600 hover:border-slate-300'
                }
                style={
                  selectedCity === c.value
                    ? { backgroundColor: ACCENT }
                    : undefined
                }
              >
                {c.label}
              </Button>
            ))}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="h-10 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-600 shadow-sm"
            >
              <option value="default">Sortierung</option>
              <option value="price-asc">Preis aufsteigend</option>
              <option value="price-desc">Preis absteigend</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-12 w-12 animate-spin" style={{ color: ACCENT }} />
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <p className="text-xl text-red-600">
                {language === 'de' ? 'Fehler beim Laden der Wohnungen.' : 'Error loading apartments.'}
              </p>
              <Button
                onClick={() => window.location.reload()}
                className="mt-4 rounded-full text-white"
                style={{ backgroundColor: ACCENT }}
              >
                {language === 'de' ? 'Erneut versuchen' : 'Try again'}
              </Button>
            </div>
          ) : (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {filteredApartments.map((apartment) => (
                <Link
                  key={apartment.id}
                  to={`/apartments/${apartment.id}`}
                  className="block"
                  data-testid={`apartment-card-${apartment.id}`}
                >
                  <Card className={cardClass}>
                    <div className="relative h-64 overflow-hidden">
                      <img
                        src={apartment.image}
                        alt={apartment.title[language]}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute right-4 top-4 rounded-lg bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm">
                        <p className="text-sm font-semibold text-slate-900">CHF {apartment.price.toLocaleString()}</p>
                        <p className="text-xs text-slate-500">{t.apartmentsPage.perMonth}</p>
                      </div>
                    </div>

                    <CardContent className="p-6">
                      <div className="mb-2 flex items-center text-sm text-slate-500">
                        <MapPin className="mr-1 h-4 w-4" style={{ color: ACCENT }} />
                        {apartment.city[language]}
                      </div>

                      <h3 className="mb-2 text-xl font-semibold text-slate-900">{apartment.title[language]}</h3>

                      <p className="mb-4 leading-relaxed text-slate-500">{apartment.description[language]}</p>

                      <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4 text-sm text-slate-500">
                        <div className="flex items-center">
                          <Bed className="mr-1 h-4 w-4" style={{ color: ACCENT }} />
                          <span>
                            {apartment.bedrooms} {t.apartmentsPage.bedrooms}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Bath className="mr-1 h-4 w-4" style={{ color: ACCENT }} />
                          <span>
                            {apartment.bathrooms} {t.apartmentsPage.bathrooms}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Square className="mr-1 h-4 w-4" style={{ color: ACCENT }} />
                          <span>
                            {apartment.sqm} {t.apartmentsPage.sqm}
                          </span>
                        </div>
                      </div>

                      <Button
                        className="group/btn w-full rounded-full font-semibold text-white"
                        style={{ backgroundColor: ACCENT }}
                        data-testid={`view-apartment-${apartment.id}`}
                      >
                        {t.apartmentsPage.viewDetails}
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                      </Button>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {!loading && !error && filteredApartments.length === 0 && (
            <div className="py-16 text-center">
              <h2 className="mb-4 text-2xl font-semibold text-slate-900">
                {language === 'de'
                  ? 'Momentan keine Wohnungen in dieser Stadt verfügbar'
                  : 'Currently no apartments available in this city'}
              </h2>

              <p className="mx-auto mb-6 max-w-xl text-slate-500">
                {language === 'de'
                  ? 'Wir erhalten laufend neue möblierte Wohnungen. Senden Sie uns eine kurze Anfrage und wir informieren Sie sofort, sobald eine passende Wohnung verfügbar ist.'
                  : 'We continuously receive new furnished apartments. Send us a request and we will inform you as soon as a suitable apartment becomes available.'}
              </p>

              <Link
                to={selectedCity !== 'all' ? `/contact?city=${selectedCity}` : '/contact'}
                className="inline-block rounded-full px-6 py-3 font-semibold text-white shadow-md transition hover:opacity-95"
                style={{ backgroundColor: ACCENT }}
              >
                {language === 'de' ? 'Wohnungsanfrage senden →' : 'Send apartment request →'}
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-slate-50 to-slate-100/40 py-24 lg:py-32">
        <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-slate-400/[0.1] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div
            className="mx-auto max-w-4xl rounded-[2rem] border border-slate-200/90 p-10 text-center shadow-sm transition-all duration-300 hover:shadow-xl sm:p-14"
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 50%, #fff7ed 100%)',
            }}
          >
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              {language === 'de' ? 'Nicht das Richtige gefunden?' : "Didn't Find What You're Looking For?"}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-500">
              {language === 'de'
                ? 'Kontaktieren Sie uns für individuelle Anfragen und massgeschneiderte Lösungen.'
                : 'Contact us for custom requests and tailored solutions.'}
            </p>
            <Button
              size="lg"
              className="mt-8 rounded-full px-8 py-6 text-lg font-semibold text-white shadow-[0_8px_24px_-6px_rgba(249,115,22,0.4)]"
              style={{ backgroundColor: ACCENT }}
              onClick={() => (window.location.href = '/contact')}
            >
              {t.nav.contact}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ApartmentsPage;
