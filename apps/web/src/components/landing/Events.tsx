import { ArrowIcon } from "./icons";

const EVENTS = [
  {
    image: "/images/landing/events/event-merch-bar.png?v=2",
    alt: "Event merch bars",
  },
  {
    image: "/images/landing/events/bulk-kitting.png?v=2",
    alt: "Bulk kitting",
  },
  {
    image: "/images/landing/events/accessories.png?v=2",
    alt: "Accessories",
  },
  {
    image: "/images/landing/events/goodie-bags.png?v=2",
    alt: "Goodie bags",
  },
] as const;

export function Events() {
  return (
    <section className="events-section">
      <div className="events-copy">
        <span className="kicker">IN-PERSON, ELEVATED</span>
        <h2>
          Make every moment <em>worth showing up for.</em>
        </h2>
        <p>
          From conference floors to leadership offsites, we bring your brand into the room, and
          make the logistics disappear.
        </p>
        <a className="button button-dark" href="#contact">
          Plan an event <ArrowIcon />
        </a>
      </div>
      <div className="event-grid">
        {EVENTS.map((event, idx) => (
          <article key={idx} className="event-image-card">
            <img src={event.image} alt={event.alt} loading="lazy" />
          </article>
        ))}
      </div>
    </section>
  );
}
