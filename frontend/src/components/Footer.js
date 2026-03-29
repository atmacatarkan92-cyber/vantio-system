import React from 'react';
import { Link } from 'react-router-dom';
import vantioLogo from '../assets/vantio-logo.svg';

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          <div className="flex items-center gap-3">
            <img src={vantioLogo} alt="Vantio" className="h-9 w-auto" />
            <p className="text-sm text-slate-600 max-w-xs leading-relaxed">
              Property management software for operators of co-living, serviced apartments and rental
              portfolios.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-6 text-sm">
            <Link to="/contact" className="text-slate-600 hover:text-[#FF7A3D] transition-colors font-medium">
              Contact
            </Link>
            <Link
              to="/contact?topic=privacy"
              className="text-slate-600 hover:text-[#FF7A3D] transition-colors font-medium"
            >
              Privacy
            </Link>
            <Link
              to="/contact?topic=legal"
              className="text-slate-600 hover:text-[#FF7A3D] transition-colors font-medium"
            >
              Legal
            </Link>
          </nav>
        </div>
        <div className="mt-10 pt-8 border-t border-gray-100 space-y-3">
          <p className="text-sm text-slate-500 text-center font-medium">
            Vantio — Operating system for modern rental businesses
          </p>
          <p className="text-sm text-slate-400 text-center">
            © {year} Vantio. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
