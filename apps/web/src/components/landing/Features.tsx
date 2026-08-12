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
          <span className="feature-number">01</span>
          <svg
            aria-hidden="true"
            width="31"
            height="31"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 7l8-4 8 4-8 4-8-4z" />
            <path d="M4 7v10l8 4 8-4V7" />
            <path d="M12 11v10" />
          </svg>
          <h3>Kits</h3>
          <p>Bundle apparel, drinkware and stationery into ready-to-ship kits.</p>
          <div className="mini-visual kit-visual">
            <span />
            <span />
            <span />
          </div>
        </article>
        <article className="feature-card blue">
          <span className="feature-number">02</span>
          <svg
            aria-hidden="true"
            width="31"
            height="31"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6h14a2 2 0 012 2v10H4a2 2 0 01-2-2V6z" />
            <path d="M17 11h5v4h-5a2 2 0 010-4z" />
          </svg>
          <h3>Wallet</h3>
          <p>Let teams spend an approved budget, fully tracked and controlled.</p>
          <div className="mini-visual wallet-visual">
            <span>₹25,000</span>
            <small>TEAM BALANCE</small>
            <i>•••• 4291</i>
          </div>
        </article>
        <article className="feature-card yellow">
          <span className="feature-number">03</span>
          <svg
            aria-hidden="true"
            width="31"
            height="31"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
          </svg>
          <h3>Spot gifting</h3>
          <p>Send a gift the moment it matters. No operational back-and-forth.</p>
          <div className="mini-visual notification-visual">
            <b>✦</b>
            <span>Gift sent!</span>
            <small>For a brilliant launch</small>
          </div>
        </article>
        <article className="feature-card lilac">
          <span className="feature-number">04</span>
          <svg
            aria-hidden="true"
            width="31"
            height="31"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 2l4 4-4 4" />
            <path d="M3 11V9a3 3 0 013-3h15" />
            <path d="M7 22l-4-4 4-4" />
            <path d="M21 13v2a3 3 0 01-3 3H3" />
          </svg>
          <h3>Automated gifting</h3>
          <p>Set the rule once. Birthdays and milestones run automatically.</p>
          <div className="mini-visual calendar-visual">
            <span>M</span>
            <span>T</span>
            <span className="selected">W</span>
            <span>T</span>
            <span>F</span>
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
