const LOGOS = [
  { name: "Google", src: "/images/logos/google-wordmark.svg" },
  { name: "Slack", src: "/images/logos/slack-wordmark.svg" },
  { name: "HubSpot", src: "/images/logos/hubspot-wordmark.svg" },
  { name: "Amazon", src: "/images/logos/trust/amazon.svg" },
  { name: "Airbnb", src: "/images/logos/airbnb-wordmark.svg" },
  { name: "Toast", src: "/images/logos/toast-wordmark.svg" },
] as const;

export function PartnerLogos() {
  return (
    <section className="sm-cat-proof" aria-labelledby="sm-cat-proof-title">
      <div className="sm-cat-container sm-cat-proof-grid">
        <div className="sm-cat-proof-copy">
          <p className="sm-cat-kicker">For every possible occasion</p>
          <h2 className="sm-cat-title" id="sm-cat-proof-title">
            Loved by teams everywhere
          </h2>
        </div>
        <div className="sm-cat-logos">
          {LOGOS.map((logo) => (
            <div key={logo.name} className="sm-cat-logo">
              <img src={logo.src} alt={logo.name} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
