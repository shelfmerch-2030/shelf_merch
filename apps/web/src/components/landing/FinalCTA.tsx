import { ArrowIcon } from "./icons";

export function FinalCTA() {
  return (
    <section className="final-cta" id="contact">
      <div className="cta-shape cta-shape-one" />
      <div className="cta-shape cta-shape-two" />
      <span className="kicker light">READY WHEN YOU ARE</span>
      <h2>
        Put your brand
        <br />
        <em>on the shelf.</em>
      </h2>
      <p>One partner for every shop, kit, gift and moment of recognition.</p>
      <div>
        <a className="button button-light" href="mailto:hello@shelfmerch.io">
          Start with Shelf Merch <ArrowIcon />
        </a>
        <a className="cta-secondary" href="mailto:hello@shelfmerch.io">
          hello@shelfmerch.io
        </a>
      </div>
    </section>
  );
}
