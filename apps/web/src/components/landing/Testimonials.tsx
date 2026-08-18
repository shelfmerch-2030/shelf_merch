const TESTIMONIALS = [
  {
    quote:
      "Shelf Merch replaced three vendors for our onboarding kits alone. Dispatch is faster, and the quality is better than what we had before.",
    role: "HR Lead · Company",
  },
  {
    quote:
      "We needed festival gifting across five cities. One order, five delivery locations, zero follow-up calls.",
    role: "Admin Manager · Company",
  },
  {
    quote:
      "I showed our CEO the shop link. His exact words were: this is what I've been asking for.",
    role: "Marketing Director · Company",
  },
] as const;

export function Testimonials() {
  return (
    <section className="testimonial-section" id="testimonials">
      <div className="testimonial-heading">
        <span className="kicker light">WHAT TEAMS SAY</span>
        <h2>
          Less chasing.
          <br />
          <em>More delight.</em>
        </h2>
      </div>
      <div className="testimonial-grid">
        {TESTIMONIALS.map((testimonial) => (
          <article key={testimonial.role}>
            <div className="stars">★★★★★</div>
            <p>&ldquo;{testimonial.quote}&rdquo;</p>
            <footer>
              <span>NM</span>
              <div>
                <b>Customer name</b>
                <small>{testimonial.role}</small>
              </div>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
