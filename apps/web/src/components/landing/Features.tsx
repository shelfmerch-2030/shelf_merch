export function Features() {
  return (
    <section className="section operations">
      <div className="split-heading">
        <div>
          <span className="kicker">GIFTING OPERATIONS</span>
          <h2>
            Moments happen fast.
            <br />
            <em>Your gifting should too.</em>
          </h2>
        </div>
        <p>One place for thoughtful one-offs, repeatable programs and every celebration in between.</p>
      </div>
      <div className="feature-grid">
        <article className="feature-card coral">
          <div className="feature-top">
            <img
              className="feature-icon"
              src="/images/landing/operations/icons/kits.png"
              alt=""
            />
            <span className="feature-number">01</span>
          </div>
          <h3>Kits</h3>
          <p>Bundle apparel, drinkware and stationery into ready-to-ship kits.</p>
          <div className="feature-point">
            <span>✓</span>
            Curated combos. Zero hassle.
          </div>
        </article>

        <article className="feature-card blue">
          <div className="feature-top">
            <img
              className="feature-icon"
              src="/images/landing/operations/icons/wallet.png"
              alt=""
            />
            <span className="feature-number">02</span>
          </div>
          <h3>Wallet</h3>
          <p>Let teams spend an approved budget, fully tracked and controlled.</p>
          <div className="feature-point">
            <span>✓</span>
            Real-time balance. Total visibility.
          </div>
        </article>

        <article className="feature-card yellow">
          <div className="feature-top">
            <img
              className="feature-icon"
              src="/images/landing/operations/icons/spot-gifting.png"
              alt=""
            />
            <span className="feature-number">03</span>
          </div>
          <h3>Spot gifting</h3>
          <p>Send a gift the moment it matters. No operational back-and-forth.</p>
          <div className="feature-point">
            <span>✓</span>
            Quick, thoughtful & on-brand.
          </div>
        </article>

        <article className="feature-card lilac">
          <div className="feature-top">
            <img
              className="feature-icon"
              src="/images/landing/operations/icons/automated-gifting.png"
              alt=""
            />
            <span className="feature-number">04</span>
          </div>
          <h3>Automated gifting</h3>
          <p>Set the rule once. Birthdays and milestones run automatically.</p>
          <div className="feature-point">
            <span>✓</span>
            Always on. Always personal.
          </div>
        </article>
      </div>
      <div className="tag-line">
        <span>Client &amp; prospect gifting</span>
        <span>Festivals &amp; celebrations</span>
        <span>Employee appreciation</span>
        <span>Birthdays &amp; anniversaries</span>
      </div>
    </section>
  );
}
