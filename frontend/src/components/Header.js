import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Globe } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import vantioLogo from '../assets/vantio-logo.svg';

/** Public marketing site → production app login (fixed URL, not SPA-relative). */
export const PUBLIC_APP_LOGIN_URL = 'https://vantio-system.vercel.app/admin/login';

const ACCENT = '#F97316';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { language, toggleLanguage } = useLanguage();
  const location = useLocation();

  const navigation = [
    { name: 'Home', href: '/' },
    { name: 'Features', href: '/#features' },
    { name: 'Contact', href: '/contact' },
    { name: 'Login', href: PUBLIC_APP_LOGIN_URL, external: true },
  ];

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/' && !location.hash;
    }
    if (path === '/#features') {
      return location.pathname === '/' && location.hash === '#features';
    }
    return location.pathname === path;
  };

  const linkClass = (active, external) =>
    `text-[14px] font-medium transition-colors ${
      !external && active ? '' : 'text-slate-500 hover:text-slate-900'
    }`;

  const linkStyle = (active, external) =>
    !external && active ? { color: ACCENT } : undefined;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-100/80 bg-white/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/75">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between lg:h-[4.25rem]">
          <Link to="/" className="flex shrink-0 items-center -ml-0.5">
            <img src={vantioLogo} alt="Vantio" className="h-8 w-auto sm:h-9" />
          </Link>

          <div className="hidden items-center gap-12 lg:flex">
            {navigation.map((item) => {
              const active = item.external ? false : isActive(item.href);
              return item.external ? (
                <a
                  key={item.name}
                  href={item.href}
                  className={linkClass(active, true)}
                  style={linkStyle(active, true)}
                  rel="noopener noreferrer"
                >
                  {item.name}
                </a>
              ) : (
                <Link
                  key={item.name}
                  to={item.href}
                  className={linkClass(active, false)}
                  style={linkStyle(active, false)}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/contact" className="hidden sm:block">
              <Button
                size="sm"
                className="rounded-full px-5 text-[13px] font-semibold text-white shadow-[0_6px_20px_-6px_rgba(249,115,22,0.45)]"
                style={{ backgroundColor: ACCENT }}
              >
                Request demo
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="hidden items-center gap-2 rounded-full text-slate-500 hover:bg-slate-50 hover:text-slate-900 sm:flex"
            >
              <Globe className="h-4 w-4" />
              <span className="text-[13px] font-medium">{language.toUpperCase()}</span>
            </Button>

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="rounded-full p-2.5 text-slate-700 transition-colors hover:bg-slate-50 lg:hidden"
              type="button"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div className="border-t border-slate-100 py-6 lg:hidden">
            <div className="flex flex-col gap-1">
              {navigation.map((item) => {
                const active = item.external ? false : isActive(item.href);
                const mobileClass = `rounded-xl px-4 py-3.5 text-[15px] font-medium transition-colors ${
                  active ? 'bg-slate-50' : 'text-slate-700 hover:bg-slate-50'
                }`;
                const mobileStyle = active && !item.external ? { color: ACCENT } : undefined;
                return item.external ? (
                  <a
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={mobileClass}
                    rel="noopener noreferrer"
                  >
                    {item.name}
                  </a>
                ) : (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={mobileClass}
                    style={mobileStyle}
                  >
                    {item.name}
                  </Link>
                );
              })}
              <Link
                to="/contact"
                onClick={() => setIsMenuOpen(false)}
                className="mx-2 mt-3 rounded-full py-3.5 text-center text-[15px] font-semibold text-white sm:hidden"
                style={{ backgroundColor: ACCENT }}
              >
                Request demo
              </Link>
              <button
                type="button"
                onClick={toggleLanguage}
                className="flex items-center gap-2 rounded-xl px-4 py-3.5 text-[15px] font-medium text-slate-500 transition-colors hover:bg-slate-50 sm:hidden"
              >
                <Globe className="h-4 w-4" />
                <span>{language === 'de' ? 'English' : 'Deutsch'}</span>
              </button>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};

export default Header;
