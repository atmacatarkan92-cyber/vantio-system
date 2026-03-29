import React from 'react';
import { Link } from 'react-router-dom';
import vantioLogo from '../assets/vantio-logo.svg';
import { PUBLIC_APP_LOGIN_URL } from './Header';

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-800/80 bg-[#0f172a] text-slate-300">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:px-20 lg:py-32">
        <div className="grid grid-cols-1 gap-14 md:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          <div className="max-w-sm space-y-6">
            <img src={vantioLogo} alt="Vantio" className="h-9 w-auto brightness-0 invert opacity-95" />
            <p className="text-sm leading-relaxed text-slate-400">
              Operating system for modern rental businesses — co-living, serviced apartments and portfolio
              operations.
            </p>
            <p className="text-xs leading-relaxed text-slate-500">Vantio — built for operators who need clarity at scale.</p>
          </div>

          <div>
            <h3 className="mb-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Product</h3>
            <ul className="space-y-4">
              <li>
                <Link to="/#features" className="text-sm text-slate-400 transition-colors hover:text-white">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-sm text-slate-400 transition-colors hover:text-white">
                  Request demo
                </Link>
              </li>
              <li>
                <a
                  href={PUBLIC_APP_LOGIN_URL}
                  className="text-sm text-slate-400 transition-colors hover:text-white"
                  rel="noopener noreferrer"
                >
                  Login
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Legal</h3>
            <ul className="space-y-4">
              <li>
                <Link
                  to="/contact?topic=privacy"
                  className="text-sm text-slate-400 transition-colors hover:text-white"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  to="/contact?topic=legal"
                  className="text-sm text-slate-400 transition-colors hover:text-white"
                >
                  Legal notice
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Contact</h3>
            <ul className="space-y-4">
              <li>
                <Link to="/contact" className="text-sm text-slate-400 transition-colors hover:text-white">
                  Contact form
                </Link>
              </li>
              <li>
                <a
                  href="mailto:info@feelathomenow.ch"
                  className="text-sm text-slate-400 transition-colors hover:text-white"
                >
                  info@feelathomenow.ch
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-10 sm:flex-row">
          <p className="text-xs text-slate-500">© {year} Vantio. All rights reserved.</p>
          <p className="text-center text-xs text-slate-600 sm:text-right">Switzerland · B2B property operations software</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
