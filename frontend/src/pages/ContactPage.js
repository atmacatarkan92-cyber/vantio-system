import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useLocation } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent } from '../components/ui/card';
import { Mail, Phone, MapPin, Clock, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { API_BASE_URL } from '../config';

const ACCENT = '#F97316';
const PAGE = 'max-w-7xl mx-auto px-6 lg:px-20';
const cardClass =
  'rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl';

const ContactPage = () => {
  const { t, language } = useLanguage();
  const location = useLocation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    message: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const city = params.get('city');

    if (city) {
      setFormData((prev) => ({
        ...prev,
        message:
          language === 'de'
            ? `Ich interessiere mich für eine Wohnung in ${city}.`
            : `I am interested in an apartment in ${city}.`,
      }));
    }
  }, [location.search, language]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          language: language,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success(result.message || t.contact.successMessage);
        setFormData({
          name: '',
          email: '',
          phone: '',
          company: '',
          message: '',
        });
      } else {
        throw new Error(result.message || 'Failed to submit');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error(
        language === 'de'
          ? 'Fehler beim Senden. Bitte versuchen Sie es erneut.'
          : 'Error submitting. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactInfo = [
    {
      icon: Mail,
      title: 'Email',
      value: 'info@feelathomenow.ch',
      link: 'mailto:info@feelathomenow.ch',
    },
    {
      icon: Phone,
      title: language === 'de' ? 'Telefon' : 'Phone',
      value: '+41 58 510 22 89',
      link: 'tel:+41585102289',
    },
    {
      icon: MapPin,
      title: language === 'de' ? 'Hauptsitz' : 'Headquarters',
      value: 'Gerlafingen, Solothurn, Schweiz',
      link: 'https://maps.google.com/?q=Gerlafingen,Solothurn,Schweiz',
    },
    {
      icon: Clock,
      title: language === 'de' ? 'Öffnungszeiten' : 'Opening Hours',
      value: language === 'de' ? 'Mo-Fr: 9:00-18:00' : 'Mon-Fri: 9:00-17:00',
      link: null,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-slate-50 via-white to-slate-100/30 pt-28 pb-16 lg:pt-32 lg:pb-24">
        <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-orange-500/[0.1] blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-slate-400/[0.1] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="mb-4 text-center">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">{t.contact.title}</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-500 md:text-xl">{t.contact.subtitle}</p>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-white via-slate-50/40 to-white py-24 lg:py-32">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/[0.08] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <Card className="border-0 shadow-none">
              <CardContent className="p-0">
                <div className={`${cardClass} p-8`}>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-700">
                        {t.contact.namePlaceholder}
                      </label>
                      <Input
                        id="name"
                        name="name"
                        type="text"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        placeholder={t.contact.namePlaceholder}
                        className="w-full border-slate-200"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                        {t.contact.emailPlaceholder}
                      </label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        placeholder={t.contact.emailPlaceholder}
                        className="w-full border-slate-200"
                      />
                    </div>

                    <div>
                      <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-700">
                        {t.contact.phonePlaceholder}
                      </label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder={t.contact.phonePlaceholder}
                        className="w-full border-slate-200"
                      />
                    </div>

                    <div>
                      <label htmlFor="company" className="mb-2 block text-sm font-medium text-slate-700">
                        {t.contact.companyPlaceholder}
                      </label>
                      <Input
                        id="company"
                        name="company"
                        type="text"
                        value={formData.company}
                        onChange={handleChange}
                        placeholder={t.contact.companyPlaceholder}
                        className="w-full border-slate-200"
                      />
                    </div>

                    <div>
                      <label htmlFor="message" className="mb-2 block text-sm font-medium text-slate-700">
                        {t.contact.messagePlaceholder}
                      </label>
                      <Textarea
                        id="message"
                        name="message"
                        required
                        value={formData.message}
                        onChange={handleChange}
                        placeholder={t.contact.messagePlaceholder}
                        rows={5}
                        className="w-full border-slate-200"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full rounded-full py-6 text-lg font-semibold text-white shadow-[0_8px_24px_-6px_rgba(249,115,22,0.4)] disabled:opacity-70"
                      style={{ backgroundColor: ACCENT }}
                      data-testid="contact-submit-btn"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          <span>{language === 'de' ? 'Wird gesendet...' : 'Sending...'}</span>
                        </>
                      ) : (
                        <>
                          {t.contact.submit}
                          <Send className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-8">
              <div>
                <h2 className="mb-8 text-2xl font-bold tracking-tight text-slate-900">
                  {language === 'de' ? 'Kontaktinformationen' : 'Contact Information'}
                </h2>
                <div className="space-y-6">
                  {contactInfo.map((info, index) => (
                    <Card key={index} className={`${cardClass} border-slate-200`}>
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-orange-100"
                            style={{ backgroundColor: `${ACCENT}14` }}
                          >
                            <info.icon className="h-6 w-6" style={{ color: ACCENT }} />
                          </div>
                          <div>
                            <h3 className="mb-1 font-semibold text-slate-900">{info.title}</h3>
                            {info.link ? (
                              <a
                                href={info.link}
                                className="font-medium text-[#F97316] transition-colors hover:underline"
                              >
                                {info.value}
                              </a>
                            ) : (
                              <p className="text-slate-500">{info.value}</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <Card className={`${cardClass} overflow-hidden border-slate-200 p-0`}>
                <CardContent className="p-0">
                  <img
                    src="https://images.unsplash.com/photo-1620563092215-0fbc6b55cfc5?auto=format&fit=crop&w=1200&q=80"
                    alt="Zurich location"
                    loading="lazy"
                    decoding="async"
                    className="h-64 w-full object-cover"
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-slate-50 to-slate-100/40 py-24 lg:py-32">
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-slate-400/[0.1] blur-3xl" aria-hidden />
        <div className={`relative z-10 ${PAGE}`}>
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              {language === 'de' ? 'Wir sind in diesen Städten aktiv' : 'We Operate in These Cities'}
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                name: 'Zürich',
                image:
                  'https://images.unsplash.com/photo-1620563092215-0fbc6b55cfc5?auto=format&fit=crop&w=900&q=75',
              },
              {
                name: 'Genf',
                image:
                  'https://images.unsplash.com/photo-1573137785546-9d19e4f33f87?auto=format&fit=crop&w=900&q=75',
              },
              {
                name: 'Basel',
                image:
                  'https://images.unsplash.com/photo-1643981670720-eef07ebdb179?auto=format&fit=crop&w=900&q=75',
              },
              {
                name: 'Zug',
                image:
                  'https://images.unsplash.com/photo-1649790247335-42156c080db6?auto=format&fit=crop&w=900&q=75',
              },
            ].map((city, index) => (
              <Card key={index} className={`${cardClass} group overflow-hidden border-slate-200 p-0`}>
                <CardContent className="p-0">
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={city.image}
                      alt={city.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-transparent" />
                    <div className="absolute bottom-4 left-4">
                      <h3 className="text-2xl font-bold text-white">{city.name}</h3>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default ContactPage;
