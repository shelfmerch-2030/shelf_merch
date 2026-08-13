import { ArrowIcon } from "./icons";

const EVENTS = [
  {
    number: "01",
    icon: (
      <>
        <path d="M4 10v10h16V10" />
        <path d="M3 10l2-6h14l2 6" />
        <path d="M8 20v-6h8v6" />
        <path d="M3 10c0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0" />
      </>
    ),
    title: "Event merch bars",
    description: "Curated, pick-your-own swag stations.",
  },
  {
    number: "02",
    icon: (
      <>
        <path d="M4 7l8-4 8 4-8 4-8-4z" />
        <path d="M4 7v10l8 4 8-4V7" />
        <path d="M12 11v10" />
      </>
    ),
    title: "Bulk kitting",
    description: "Thousands packed, labelled and delivered.",
  },
  {
    number: "03",
    icon: (
      <>
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
        <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
      </>
    ),
    title: "Leadership gifts",
    description: "Premium, low-volume and memorable.",
  },
  {
    number: "04",
    icon: (
      <>
        <path d="M3 9h18v12H3z" />
        <path d="M2 5h20v4H2z" />
        <path d="M12 5v16" />
        <path d="M12 5c-1-4-6-4-6-1s4 2 6 1zm0 0c1-4 6-4 6-1s-4 2-6 1z" />
      </>
    ),
    title: "Goodie bags",
    description: "Event and festive hampers, pan-India.",
  },
] as const;

export function Events() {
  return (
    <section className="events-section">
      <div className="events-copy">
        <span className="kicker light">IN-PERSON, ELEVATED</span>
        <h2>
          Make every moment
          <br />
          <em>worth showing up for.</em>
        </h2>
        <p>
          From conference floors to leadership offsites, we bring your brand into the room, and
          make the logistics disappear.
        </p>
        <a className="button button-light" href="#contact">
          Plan an event <ArrowIcon />
        </a>
      </div>
      <div className="event-grid">
        {EVENTS.map((event) => (
          <article key={event.number}>
            <span>{event.number}</span>
            <svg
              aria-hidden="true"
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {event.icon}
            </svg>
            <h3>{event.title}</h3>
            <p>{event.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
