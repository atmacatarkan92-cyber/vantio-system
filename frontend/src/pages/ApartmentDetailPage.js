import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '../components/ui/carousel';
import {
  Bed,
  Bath,
  Square,
  MapPin,
  ArrowLeft,
  Check,
  Loader2,
  Mail,
  Phone,
  Building2,
  ChevronLeft,
  ChevronRight,
  Navigation,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

import { API_BASE_URL } from '../config';

const ACCENT = '#F97316';
const PAGE = 'max-w-7xl mx-auto px-6 lg:px-20';
const cardSurface =
  'rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl';

const ApartmentDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [apartment, setApartment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [carouselApi, setCarouselApi] = useState(null);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    const fetchApartment = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/apartments/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Apartment not found');
          }
          throw new Error('Failed to fetch apartment');
        }
        const data = await response.json();
        setApartment(data);
      } catch (err) {
        console.error('Error fetching apartment:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchApartment();
  }, [id]);

  useEffect(() => {
    if (!carouselApi) return;

    const onSelect = () => {
      setSelectedImageIndex(carouselApi.selectedScrollSnap());
    };

    carouselApi.on('select', onSelect);
    return () => carouselApi.off('select', onSelect);
  }, [carouselApi]);

  const scrollToImage = useCallback(
    (index) => {
      if (carouselApi) {
        carouselApi.scrollTo(index);
      }
    },
    [carouselApi]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 pt-24">
        <Loader2 className="h-12 w-12 animate-spin" style={{ color: ACCENT }} />
      </div>
    );
  }

  if (error || !apartment) {
    return (
      <div className="min-h-screen bg-slate-50 pt-24">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-20">
          <h1 className="mb-4 text-3xl font-bold text-slate-900">
            {language === 'de' ? 'Wohnung nicht gefunden' : 'Apartment Not Found'}
          </h1>
          <p className="mb-8 text-slate-500">
            {language === 'de'
              ? 'Die gesuchte Wohnung existiert nicht oder wurde entfernt.'
              : 'The apartment you are looking for does not exist or has been removed.'}
          </p>
          <Button
            onClick={() => navigate('/apartments')}
            className="rounded-full text-white"
            style={{ backgroundColor: ACCENT }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {language === 'de' ? 'Zurück zu Wohnungen' : 'Back to Apartments'}
          </Button>
        </div>
      </div>
    );
  }

  const texts = {
    de: {
      backToApartments: 'Zurück zu Wohnungen',
      perMonth: 'pro Monat',
      bedrooms: 'Schlafzimmer',
      bathrooms: 'Badezimmer',
      size: 'Grösse',
      description: 'Beschreibung',
      amenities: 'Ausstattung',
      location: 'Standort',
      approximateLocation: 'Ungefährer Standort in',
      contactUs: 'Kontaktieren Sie uns',
      contactText:
        'Interessiert an dieser Wohnung? Kontaktieren Sie uns für eine Besichtigung oder weitere Informationen.',
      sendInquiry: 'Anfrage senden',
      callUs: 'Anrufen',
      photos: 'Fotos',
    },
    en: {
      backToApartments: 'Back to Apartments',
      perMonth: 'per month',
      bedrooms: 'Bedrooms',
      bathrooms: 'Bathrooms',
      size: 'Size',
      description: 'Description',
      amenities: 'Amenities',
      location: 'Location',
      approximateLocation: 'Approximate location in',
      contactUs: 'Contact Us',
      contactText: 'Interested in this apartment? Contact us for a viewing or more information.',
      sendInquiry: 'Send Inquiry',
      callUs: 'Call Us',
      photos: 'Photos',
    },
  };

  const t = texts[language] || texts.de;

  const images = apartment.images && apartment.images.length > 0 ? apartment.images : [apartment.image];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-50 pt-24">
      <div className="pointer-events-none absolute right-0 top-40 h-72 w-72 rounded-full bg-orange-500/[0.08] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute bottom-20 left-0 h-80 w-80 rounded-full bg-slate-400/[0.08] blur-3xl" aria-hidden />
      <div className={`relative z-10 ${PAGE} py-6`}>
        <Button
          variant="ghost"
          onClick={() => navigate('/apartments')}
          className="-ml-2 text-slate-500 hover:bg-orange-50 hover:text-slate-900"
          data-testid="back-to-apartments-btn"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t.backToApartments}
        </Button>
      </div>

      <div className={`relative z-10 ${PAGE} pb-24`}>
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-lg">
                <Carousel className="w-full" setApi={setCarouselApi} opts={{ loop: true }}>
                  <CarouselContent>
                    {images.map((img, index) => (
                      <CarouselItem key={index}>
                        <div className="relative">
                          <img
                            src={img}
                            alt={`${apartment.title[language]} - ${index + 1}`}
                            className="h-[400px] w-full object-cover md:h-[500px]"
                            data-testid={`apartment-image-${index}`}
                          />
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>

                  {images.length > 1 && (
                    <>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute left-4 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-white/90 shadow-lg hover:bg-white"
                        onClick={() => carouselApi?.scrollPrev()}
                        data-testid="gallery-prev-btn"
                      >
                        <ChevronLeft className="h-6 w-6 text-slate-800" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute right-4 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-white/90 shadow-lg hover:bg-white"
                        onClick={() => carouselApi?.scrollNext()}
                        data-testid="gallery-next-btn"
                      >
                        <ChevronRight className="h-6 w-6 text-slate-800" />
                      </Button>
                    </>
                  )}
                </Carousel>

                <div className="absolute left-4 top-4 z-10">
                  <div className="flex items-center rounded-full bg-white/95 px-3 py-1.5 shadow-lg backdrop-blur-sm">
                    <MapPin className="mr-1.5 h-4 w-4" style={{ color: ACCENT }} />
                    <span className="text-sm font-medium text-slate-900">{apartment.city[language]}</span>
                  </div>
                </div>

                {images.length > 1 && (
                  <div className="absolute bottom-4 right-4 z-10">
                    <div className="rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
                      <span className="text-sm font-medium text-white" data-testid="image-counter">
                        {selectedImageIndex + 1} / {images.length}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto px-1 pb-2" data-testid="thumbnail-strip">
                  {images.map((img, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => scrollToImage(index)}
                      className={`flex-shrink-0 overflow-hidden rounded-lg transition-all duration-200 ${
                        selectedImageIndex === index
                          ? 'ring-2 ring-[#F97316] ring-offset-2'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                      data-testid={`thumbnail-${index}`}
                    >
                      <img
                        src={img}
                        alt={`Thumbnail ${index + 1}`}
                        loading="lazy"
                        decoding="async"
                        className="h-14 w-20 object-cover md:h-16 md:w-24"
                        data-testid={`apartment-image-${index}`}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:hidden">
              <h1 className="mb-4 text-2xl font-bold text-slate-900 md:text-3xl" data-testid="apartment-title">
                {apartment.title[language]}
              </h1>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ color: ACCENT }}>
                  CHF {apartment.price.toLocaleString()}
                </span>
                <span className="text-slate-500">{t.perMonth}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Card className={cardSurface}>
                <CardContent className="p-6 text-center">
                  <Bed className="mx-auto mb-3 h-8 w-8" style={{ color: ACCENT }} />
                  <p className="text-2xl font-bold text-slate-900">{apartment.bedrooms}</p>
                  <p className="text-sm text-slate-500">{t.bedrooms}</p>
                </CardContent>
              </Card>
              <Card className={cardSurface}>
                <CardContent className="p-6 text-center">
                  <Bath className="mx-auto mb-3 h-8 w-8" style={{ color: ACCENT }} />
                  <p className="text-2xl font-bold text-slate-900">{apartment.bathrooms}</p>
                  <p className="text-sm text-slate-500">{t.bathrooms}</p>
                </CardContent>
              </Card>
              <Card className={cardSurface}>
                <CardContent className="p-6 text-center">
                  <Square className="mx-auto mb-3 h-8 w-8" style={{ color: ACCENT }} />
                  <p className="text-2xl font-bold text-slate-900">{apartment.sqm}</p>
                  <p className="text-sm text-slate-500">m²</p>
                </CardContent>
              </Card>
            </div>

            <Card className={cardSurface}>
              <CardContent className="p-6 md:p-8">
                <h2 className="mb-4 text-xl font-semibold text-slate-900">{t.description}</h2>
                <p className="text-lg leading-relaxed text-slate-500" data-testid="apartment-description">
                  {apartment.description[language]}
                </p>
              </CardContent>
            </Card>

            <Card className={cardSurface}>
              <CardContent className="p-6 md:p-8">
                <h2 className="mb-6 text-xl font-semibold text-slate-900">{t.amenities}</h2>
                <div className="grid gap-4 sm:grid-cols-2" data-testid="apartment-amenities">
                  {apartment.amenities[language].map((amenity, index) => (
                    <div key={index} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-orange-100"
                        style={{ backgroundColor: `${ACCENT}14` }}
                      >
                        <Check className="h-4 w-4" style={{ color: ACCENT }} />
                      </div>
                      <span className="text-slate-600">{amenity}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {apartment.coordinates && (
              <Card className={cardSurface}>
                <CardContent className="p-6 md:p-8">
                  <div className="mb-4 flex items-center gap-2">
                    <Navigation className="h-5 w-5" style={{ color: ACCENT }} />
                    <h2 className="text-xl font-semibold text-slate-900">{t.location}</h2>
                  </div>
                  <p className="mb-4 text-sm text-slate-500">
                    {t.approximateLocation} {apartment.city[language]}
                  </p>
                  <div className="overflow-hidden rounded-xl border border-slate-200 shadow-inner" data-testid="apartment-map">
                    {!showMap ? (
                      <div className="flex h-[280px] items-center justify-center bg-slate-100">
                        <Button
                          onClick={() => setShowMap(true)}
                          className="rounded-full text-white"
                          style={{ backgroundColor: ACCENT }}
                        >
                          {language === 'de' ? 'Karte laden' : 'Load map'}
                        </Button>
                      </div>
                    ) : (
                      <MapContainer
                        center={[apartment.coordinates.lat, apartment.coordinates.lng]}
                        zoom={14}
                        style={{ height: '280px', width: '100%' }}
                        scrollWheelZoom={false}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={[apartment.coordinates.lat, apartment.coordinates.lng]}>
                          <Popup>
                            <div className="text-center">
                              <p className="font-semibold">{apartment.title[language]}</p>
                              <p className="text-sm text-slate-500">{apartment.city[language]}</p>
                            </div>
                          </Popup>
                        </Marker>
                      </MapContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-28 space-y-6">
              <Card className={`${cardSurface} hidden shadow-md lg:block`}>
                <CardContent className="p-6">
                  <h1 className="mb-4 text-2xl font-bold text-slate-900" data-testid="apartment-title-desktop">
                    {apartment.title[language]}
                  </h1>
                  <div className="mb-6 flex items-baseline gap-2 border-b border-slate-100 pb-6">
                    <span className="text-4xl font-bold" style={{ color: ACCENT }} data-testid="apartment-price">
                      CHF {apartment.price.toLocaleString()}
                    </span>
                    <span className="text-slate-500">{t.perMonth}</span>
                  </div>

                  <div className="mb-6 space-y-3">
                    <div className="flex items-center justify-between text-slate-500">
                      <div className="flex items-center gap-2">
                        <Bed className="h-4 w-4" style={{ color: ACCENT }} />
                        <span>{t.bedrooms}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{apartment.bedrooms}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <div className="flex items-center gap-2">
                        <Bath className="h-4 w-4" style={{ color: ACCENT }} />
                        <span>{t.bathrooms}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{apartment.bathrooms}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <div className="flex items-center gap-2">
                        <Square className="h-4 w-4" style={{ color: ACCENT }} />
                        <span>{t.size}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{apartment.sqm} m²</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" style={{ color: ACCENT }} />
                        <span>Location</span>
                      </div>
                      <span className="font-semibold text-slate-900">{apartment.city[language]}</span>
                    </div>
                  </div>

                  {images.length > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-slate-500">
                      <span>{t.photos}</span>
                      <span className="font-semibold text-slate-900">{images.length}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={`${cardSurface} shadow-md`}>
                <CardContent className="p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-orange-100"
                      style={{ backgroundColor: `${ACCENT}14` }}
                    >
                      <Building2 className="h-6 w-6" style={{ color: ACCENT }} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{t.contactUs}</h3>
                      <p className="text-sm text-slate-500">FeelAtHomeNow</p>
                    </div>
                  </div>

                  <p className="mb-6 text-sm leading-relaxed text-slate-500">{t.contactText}</p>

                  <div className="space-y-3">
                    <Link to="/contact" className="block">
                      <Button
                        className="w-full rounded-full font-semibold text-white shadow-sm"
                        style={{ backgroundColor: ACCENT }}
                        data-testid="apartment-inquiry-btn"
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        {t.sendInquiry}
                      </Button>
                    </Link>
                    <a href="tel:+41442221100" className="block">
                      <Button
                        variant="outline"
                        className="w-full rounded-full border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                        data-testid="apartment-call-btn"
                      >
                        <Phone className="mr-2 h-4 w-4" />
                        {t.callUs}
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApartmentDetailPage;
