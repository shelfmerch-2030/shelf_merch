import { useEffect } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Header } from "../../components/landing/Header";
import { Footer } from "../../components/landing/Footer";
import "../../components/landing-page.css";
import "./in-office-swag-store.css";

const images = "/images/in-office-swag/";
const steps = [
  {
    title: "We set up your swag corner",
    body: "Pick a spot in your lobby, cafeteria or breakout area. We create a branded display with products your team can see and touch, from hoodies and tees to drinkware, bags and desk accessories.",
  },
  {
    title: "Employees explore, scan and order",
    body: "Like the hoodie on the wall? Scan the QR code, choose your size and place an order through your company’s online swag store.",
  },
  {
    title: "Shelf Merch takes care of the rest",
    body: "We manage orders and fulfilment, so your office can display samples while we handle delivery. We can also refresh the collection for new campaigns, events or milestones.",
  },
];
const benefits = [
  {
    title: "Make the brand part of the everyday.",
    body: "A hoodie designed around an inside joke or a tote inspired by your team’s work gives employees a piece of company culture they can make their own.",
  },
  {
    title: "Create moments people look forward to.",
    body: "Reveal an anniversary collection, put a new team hoodie on display or let new joiners choose something they’re excited to use from day one.",
  },
  {
    title: "Give people a say in what they get.",
    body: "Let employees see the colours, feel the fabrics and choose what suits them. The store makes it easy to pick something they’ll reach for again.",
  },
];
const occasions = [
  ["New joiners", "Welcome kits, company tees and everyday essentials"],
  ["Team events", "Offsite hoodies, event tees and team merchandise"],
  ["Company milestones", "Anniversary collections and limited-edition drops"],
  ["Employee recognition", "Milestone gifts and a curated selection employees can choose from"],
];

function DemoLink({ children }: { children: string }) {
  return <Link className="office-swag-button" to="/request-demo">{children}<ArrowRight size={19} aria-hidden="true" /></Link>;
}

export default function InOfficeSwagStorePage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="shelf-landing office-swag-page">
      <Header />
      <main className="office-swag" id="main-content">
        <section className="office-swag-hero" aria-labelledby="office-swag-title">
          <div className="office-swag-wrap office-swag-hero-grid">
            <div className="office-swag-hero-copy">
              <p className="office-swag-eyebrow">SHELF MERCH IN-OFFICE SWAG STORES</p>
              <h1 id="office-swag-title">Give your brand<em>a corner of its own.</em></h1>
              <p>Turn a wall, a shelf or an office corner into a dedicated swag store. Employees can see the products in person, feel the quality and scan a QR code to order what they like from your company’s online store.</p>
              <p>Shelf Merch sets up the display, curates the collection and handles orders and fulfilment.</p>
              <DemoLink>Set Up My Office Swag Store</DemoLink>
            </div>
            <figure className="office-swag-hero-photo">
              <img src={`${images}swag-corner.jpeg`} alt="An office swag corner with branded apparel, bags, drinkware and a scan-to-order display" width={1448} height={1086} fetchPriority="high" />
            </figure>
          </div>
        </section>

        <section className="office-swag-steps office-swag-section" aria-labelledby="office-swag-how">
          <div className="office-swag-wrap office-swag-process-layout">
            <div className="office-swag-section-heading">
              <span className="office-swag-eyebrow">FROM OFFICE CORNER TO COMPANY STORE</span>
              <h2 id="office-swag-how">See it at work.<br /><em>Order it on your phone.</em></h2>
            </div>
            <ol className="office-swag-step-grid">
              {steps.map((step, index) => <li key={step.title}>
                <span className="office-swag-step-number" aria-hidden="true">0{index + 1}</span>
                <article><h3>{step.title}</h3><p>{step.body}</p></article>
              </li>)}
            </ol>
          </div>
        </section>

        <section className="office-swag-culture office-swag-section" aria-labelledby="office-swag-culture">
          <div className="office-swag-wrap office-swag-culture-grid">
            <figure className="office-swag-culture-photo">
              <img src={`${images}swag-wall.jpeg`} alt="A swag display wall beside an office café, with clothing, bottles, caps, a tote and QR ordering" width={1448} height={1086} loading="lazy" />
            </figure>
            <div>
              <h2 id="office-swag-culture">Give employees something they’ll <em>want to wear.</em></h2>
              <div className="office-swag-benefits">
                {benefits.map(benefit => <article key={benefit.title}><h3>{benefit.title}</h3><p>{benefit.body}</p></article>)}
              </div>
            </div>
          </div>
        </section>

        <section className="office-swag-occasions office-swag-section" aria-labelledby="office-swag-occasions">
          <div className="office-swag-wrap office-swag-occasion-grid">
            <div>
              <span className="office-swag-eyebrow">MADE FOR YOUR TEAM’S MOMENTS</span>
              <h2 id="office-swag-occasions">One display.<br /><em>Plenty of reasons<br />to come back.</em></h2>
            </div>
            <table className="office-swag-table">
              <caption className="sr-only">Occasions and merchandise to showcase in your office swag store</caption>
              <thead><tr><th scope="col">The occasion</th><th scope="col">What you can showcase</th></tr></thead>
              <tbody>{occasions.map(([occasion, products]) => <tr key={occasion}><th scope="row">{occasion}</th><td>{products}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="office-swag-contact office-swag-section" aria-labelledby="office-swag-contact">
          <div className="office-swag-wrap office-swag-contact-grid">
            <div>
              <span className="office-swag-eyebrow">YOUR SPACE. YOUR BRAND.</span>
              <h2 id="office-swag-contact">Have a corner<br /><em>in mind?</em></h2>
              <p>Show us the space. We’ll help you decide what to display and how to make it easy for your team to order.</p>
              <DemoLink>Plan My Swag Corner</DemoLink>
            </div>
            <figure className="office-swag-shelf-photo"><img src={`${images}swag-shelf.jpeg`} alt="A compact wooden swag shelf with a hoodie, T-shirt, tote, bottle and scan-to-order sign in an office lobby" width={1448} height={1086} loading="lazy" /></figure>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
