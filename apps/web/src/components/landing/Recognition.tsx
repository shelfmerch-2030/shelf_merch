import { ArrowIcon } from "./icons";

export function Recognition() {
  return (
    <section className="recognition-section">
      <div className="recognition-copy">
        <span className="kicker">RECOGNITION, BUILT IN</span>
        <h2>
          Celebrate the moments
          <br />
          <em>that move teams.</em>
        </h2>
        <p>
          Recognize a moment once or set up a program that runs itself. Shelf Merch connects
          appreciation to rewards people genuinely want.
        </p>
        <ul>
          <li>
            <span>
              <svg
                aria-hidden="true"
                width="24"
                height="24"
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
            </span>
            <div>
              <b>Spot &amp; recurring</b>
              <small>One-off kudos or automated milestones</small>
            </div>
          </li>
          <li>
            <span>
              <svg
                aria-hidden="true"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 20V10" />
                <path d="M10 20V4" />
                <path d="M16 20v-7" />
                <path d="M22 20H2" />
              </svg>
            </span>
            <div>
              <b>Reporting &amp; insights</b>
              <small>Spend, redemption and engagement visibility</small>
            </div>
          </li>
          <li>
            <span>
              <svg
                aria-hidden="true"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 3v6M16 3v6" />
                <path d="M6 9h12v2a6 6 0 01-12 0V9z" />
                <path d="M12 17v4" />
              </svg>
            </span>
            <div>
              <b>Fits how you work</b>
              <small>HRMS, Slack and Microsoft Teams integrations</small>
            </div>
          </li>
        </ul>
        <a href="#contact" className="text-link">
          Explore recognition
          <span>
            <ArrowIcon />
          </span>
        </a>
      </div>
      <div className="recognition-ui">
        <div className="kudos-card">
          <div className="kudos-top">
            <span className="person-dot">RS</span>
            <p>
              <b>Riya recognized Sameer</b>
              <small>Customer First · 2 min ago</small>
            </p>
            <span className="kudos-points">+250</span>
          </div>
          <p>&ldquo;For stepping in and making the launch feel effortless. Brilliant work!&rdquo;</p>
          <div className="reaction-row">
            <span>👏 18</span>
            <span>🔥 8</span>
            <span>💙 12</span>
          </div>
        </div>
        <div className="impact-card">
          <div>
            <span>Recognition pulse</span>
            <strong>92%</strong>
            <small>+14% this quarter</small>
          </div>
          <div className="bars">
            <i style={{ height: "42%" }} />
            <i style={{ height: "58%" }} />
            <i style={{ height: "52%" }} />
            <i style={{ height: "78%" }} />
            <i style={{ height: "68%" }} />
            <i style={{ height: "92%" }} />
          </div>
        </div>
        <div className="gift-toast">
          <span>
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9h18v12H3z" />
              <path d="M2 5h20v4H2z" />
              <path d="M12 5v16" />
              <path d="M12 5c-1-4-6-4-6-1s4 2 6 1zm0 0c1-4 6-4 6-1s-4 2-6 1z" />
            </svg>
          </span>
          <div>
            <b>Reward unlocked</b>
            <small>Choose something you love</small>
          </div>
          <strong>→</strong>
        </div>
      </div>
    </section>
  );
}
