import { Link } from "react-router";

const WORDMARK = "/images/logo/shelfmerch-wordmark-white.png";

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor">
      <path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H6v4h3v7h4v-7h3.2L17 11h-4V9c0-.6.4-1 1-1Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor">
      <path d="M6.5 9H3.7v11h2.8V9ZM5.1 4C4.1 4 3.3 4.8 3.3 5.8S4.1 7.6 5.1 7.6 6.9 6.8 6.9 5.8 6.1 4 5.1 4ZM20.3 13.4c0-3.1-1.6-4.6-3.9-4.6-1.8 0-2.6 1-3.1 1.7V9H10.5c0 1.3 0 11 0 11h2.8v-6.1c.2-.7.8-1.6 1.9-1.6 1.3 0 2.3.9 2.3 2.8V20h2.8v-6.6Z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor">
      <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 5 12 5 12 5s-6 0-7.7.3A2.7 2.7 0 0 0 2.4 7.2 28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9C6 19 12 19 12 19s6 0 7.7-.3a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8ZM10 15.4V8.6L15.5 12 10 15.4Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M7 3h3l1.5 4-2 1.2a12 12 0 0 0 6.3 6.3L17 12.5l4 1.5v3A16 16 0 0 1 7 3Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5L15 16" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-brand-col">
          <Link to="/" className="footer-logo" aria-label="Shelf Merch home">
            <img src={WORDMARK} alt="Shelf Merch" className="brand-wordmark footer-wordmark" />
          </Link>
          <p>
            Merch. Gifting. Recognition.
            <br />
            Made and delivered across India.
          </p>
          <div className="footer-socials" aria-label="Social media">
            <span className="footer-social" aria-hidden="true">
              <FacebookIcon />
            </span>
            <span className="footer-social" aria-hidden="true">
              <InstagramIcon />
            </span>
            <span className="footer-social" aria-hidden="true">
              <LinkedInIcon />
            </span>
            <span className="footer-social" aria-hidden="true">
              <YouTubeIcon />
            </span>
          </div>
        </div>

        <div className="footer-col">
          <h4>Platform</h4>
          <a href="/#platform">Features</a>
          <a href="/#platform">Integrations</a>
        </div>
        <div className="footer-col">
          <h4>Resources</h4>
          <Link to="/resources/hr">HR</Link>
          <Link to="/resources/sales">Sales &amp; Marketing</Link>
          <Link to="/resources/events">Events</Link>
        </div>
        <div className="footer-col">
          <h4>Catalog</h4>
          <Link to="/apps/catalog">All Products</Link>
          <Link to="/apps/catalog?category=Apparel">Apparel</Link>
          <Link to="/apps/catalog?category=Drinkware">Drinkware</Link>
          <Link to="/apps/catalog?category=Office%20Supplies">Office Supplies</Link>
          <Link to="/apps/catalog?category=Technology">Tech Accessories</Link>
          <Link to="/apps/catalog">Kits</Link>
        </div>
        <div className="footer-col">
          <h4>About Us</h4>
          <span>Book a Demo</span>
          <span>Help Center</span>
        </div>
        <div className="footer-col">
          <h4>Legal</h4>
          <span>Terms &amp; Conditions</span>
          <span>Privacy Policy</span>
          <span>Refund Policy</span>
          <span>Shipping Policy</span>
          <span>Cookie Policy</span>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="footer-contact">
          <span className="footer-contact-icon">
            <MailIcon />
          </span>
          <p>
            <small>Need help?</small>
            <a href="mailto:hello@shelfmerch.com">hello@shelfmerch.com</a>
          </p>
        </div>
        <div className="footer-contact">
          <span className="footer-contact-icon">
            <PhoneIcon />
          </span>
          <p>
            <small>Call us</small>
            <a href="tel:+911234567890">+91 12345 67890</a>
          </p>
        </div>
        <div className="footer-contact">
          <span className="footer-contact-icon">
            <ClockIcon />
          </span>
          <p>
            <small>Mon - Fri, 9:00 AM - 6:00 PM</small>
            <strong>We&apos;re here to help</strong>
          </p>
        </div>
        <span className="footer-copy">© 2026 ShelfMerch. All rights reserved.</span>
      </div>
    </footer>
  );
}
