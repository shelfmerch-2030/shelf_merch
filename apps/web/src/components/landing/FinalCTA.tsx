import { ArrowIcon } from "./icons";
import { Link } from "react-router";

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
        <Link className="button button-light" to="/request-demo">
          Start with Shelf Merch <ArrowIcon />
        </Link>
      </div>
    </section>
  );
}
