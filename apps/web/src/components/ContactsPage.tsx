import { ArrowRight, Factory, MessageCircle, Truck } from "lucide-react";
import { Link } from "react-router";
import "./landing-page.css";
import "./contacts-page.css";
import { Footer } from "./landing/Footer";
import { MerchPlan } from "./landing/MerchPlan";
import { Offerings } from "./landing/Offerings";
import { Production } from "./landing/Production";
import { Testimonials } from "./landing/Testimonials";
import { buildRequestDemoWhatsAppHref } from "@/features/request-demo/model";

const HERO_IMAGE = "/images/landing/hero.png";
const LOGO_IMAGE = "/images/logo/shelfmerch-wordmark.png";

function ContactsHeader() {
  const whatsAppHref = buildRequestDemoWhatsAppHref();

  return (
    <header className="contacts-header">
      <Link to="/" className="contacts-header__brand" aria-label="Shelf Merch home">
        <img src={LOGO_IMAGE} alt="Shelf Merch" />
      </Link>

      <nav className="contacts-header__nav" aria-label="Contacts page navigation">
        <a href="#products">Products</a>
        <a href="#how-it-works">How it works</a>
        <a href="#reviews">Reviews</a>
      </nav>

      <a
        className="contacts-header__chat"
        href={whatsAppHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle size={22} aria-hidden="true" />
        Chat on WhatsApp
      </a>
    </header>
  );
}

function ContactsHero() {
  const whatsAppHref = buildRequestDemoWhatsAppHref();

  return (
    <section className="contacts-hero" id="top" aria-labelledby="contacts-title">
      <div className="contacts-hero__copy">
        <h1 id="contacts-title">
          Corporate gifting
          <em>without the vendor chaos.</em>
        </h1>

        <p>
          Design, print, pack and deliver premium company merch anywhere in India, with one team
          handling everything.
        </p>

        <div className="contacts-hero__actions">
          <a className="contacts-hero__primary" href="#contact">
            Get a free merch plan
            <ArrowRight size={21} aria-hidden="true" />
          </a>
          <a
            className="contacts-hero__secondary"
            href={whatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={22} aria-hidden="true" />
            Chat on WhatsApp
          </a>
        </div>

        <div className="contacts-hero__proof" aria-label="Service highlights">
          <span className="contacts-hero__proof-item">
            <span className="contacts-hero__proof-icon contacts-hero__proof-icon--lilac">
              <Factory size={23} aria-hidden="true" />
            </span>
            In-house production
          </span>
          <span className="contacts-hero__proof-item">
            <span className="contacts-hero__proof-icon contacts-hero__proof-icon--yellow">
              <Truck size={23} aria-hidden="true" />
            </span>
            Pan-India delivery
          </span>
        </div>
      </div>

      <div className="contacts-hero__visual" aria-label="Premium corporate onboarding kit">
        <div className="contacts-hero__disc contacts-hero__disc--lilac" />
        <div className="contacts-hero__disc contacts-hero__disc--coral" />
        <img
          src={HERO_IMAGE}
          alt="Premium corporate onboarding kit with apparel, drinkware, stationery and tech accessories"
        />
        <div className="contacts-hero__tag contacts-hero__tag--top">
          <span />
          In production
        </div>
        <div className="contacts-hero__tag contacts-hero__tag--bottom">
          <Truck size={20} aria-hidden="true" />
          Pan-India delivery
        </div>
      </div>

      <a
        className="contacts-whatsapp-float"
        href={whatsAppHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle size={29} aria-hidden="true" />
        WhatsApp
      </a>
    </section>
  );
}

export default function ContactsPage() {
  return (
    <div className="shelf-landing contacts-page">
      <ContactsHeader />
      <main>
        <ContactsHero />
        <div id="products">
          <Offerings />
        </div>
        <div id="how-it-works">
          <Production />
        </div>
        <MerchPlan />
        <div id="reviews">
          <Testimonials />
        </div>
      </main>
      <Footer />
    </div>
  );
}
