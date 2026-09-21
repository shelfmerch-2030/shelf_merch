import { Check } from "lucide-react";

const EXAMPLES = [
  { label: "Welcome kit", hint: "6 products · onboarding" },
  { label: "Summer swag", hint: "4 products · seasonal" },
  { label: "Team essentials", hint: "8 products · everyday" },
];

/** Swag wizard step 1 — centered, Deel-style production form. */
export function NameStep({
  name,
  onChange,
  shopName,
}: {
  name: string;
  onChange: (name: string) => void;
  shopName?: string;
}) {
  const trimmed = name.trim();
  const looksGood = trimmed.length > 0;

  return (
    <div className="sw-name-layout sw-name-solo">
      <div className="card sw-name-main-card">
        <header className="sw-name-header">
          <p className="sw-name-eyebrow">Step 1 of 3</p>
          <h1>Name your collection</h1>
          <p className="muted sw-name-lead">
            Create a collection for your brand store. Use a clear name so employees and customers
            can find it easily.
          </p>
          {shopName ? (
            <p className="muted sw-name-shop">
              Creating for <b>{shopName}</b>
            </p>
          ) : null}
        </header>

        <div className="sw-name-body">
          <div className="field sw-name-field">
            <label className="lbl" htmlFor="sw-name">
              Collection name
            </label>
            <div className="sw-name-input-container">
              <input
                id="sw-name"
                className="inp"
                value={name}
                maxLength={32}
                autoFocus
                placeholder="e.g. Welcome Kit"
                onChange={(e) => onChange(e.target.value)}
              />
            </div>
            <div className="row sw-name-field-meta">
              <span className="mut3">{looksGood ? "\u00A0" : "Required"}</span>
              <span className="mut3">{name.length}/32</span>
            </div>
          </div>

          <div className="sw-name-suggest-block">
            <div className="sw-name-suggest-head">
              <span className="sw-name-suggest-label">Suggestions</span>
            </div>
            <div
              className="sw-name-pick-grid"
              role="radiogroup"
              aria-label="Collection name suggestions"
            >
              {EXAMPLES.map((ex) => {
                const selected = name === ex.label;
                return (
                  <button
                    key={ex.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`sw-name-pick-card${selected ? " on" : ""}`}
                    onClick={() => onChange(ex.label)}
                  >
                    <span className="sw-name-pick-copy">
                      <span className="sw-name-pick-title">{ex.label}</span>
                      <span className="sw-name-pick-count">{ex.hint}</span>
                    </span>
                    <span className="sw-name-pick-radio" aria-hidden="true">
                      {selected ? <Check size={11} strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
