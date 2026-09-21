import { Check } from "lucide-react";

const EXAMPLES = [
  { label: "Welcome Kit", hint: "6 products · onboarding" },
  { label: "New Hire Kit", hint: "8 products · first week" },
  { label: "Onboarding Box", hint: "5 products · starter pack" },
];

/** Kit wizard step 1 — centered, Deel-style production form. */
export function KitNameStep({
  name,
  desc,
  onName,
  onDesc,
}: {
  name: string;
  desc: string;
  onName: (name: string) => void;
  onDesc: (desc: string) => void;
}) {
  const trimmed = name.trim();
  const looksGood = trimmed.length >= 4;
  const showError = trimmed.length > 0 && !looksGood;

  return (
    <div className="sw-name-layout sw-name-solo">
      <div className="card sw-name-main-card">
        <header className="sw-name-header">
          <p className="sw-name-eyebrow">Step 1 of 4</p>
          <h1>Name your kit</h1>
          <p className="muted sw-name-lead">
            Kits are reusable product bundles you can send anytime. Choose a name your team will
            recognize.
          </p>
        </header>

        <div className="sw-name-body">
          <div className="field sw-name-field">
            <label className="lbl" htmlFor="kit-name">
              Kit name
            </label>
            <div className="sw-name-input-container">
              <input
                id="kit-name"
                className={`inp${showError ? " sw-name-inp-error" : ""}`}
                value={name}
                maxLength={32}
                autoFocus
                placeholder="e.g. Welcome Kit"
                onChange={(e) => onName(e.target.value)}
              />
            </div>
            <div className="row sw-name-field-meta">
              <span className={showError ? "sw-name-err" : "mut3"}>
                {showError ? "At least 4 characters required" : "\u00A0"}
              </span>
              <span className="mut3">{name.length}/32</span>
            </div>
          </div>

          <div className="field sw-name-field">
            <label className="lbl" htmlFor="kit-desc">
              Internal description
              <span className="sw-name-optional">Optional</span>
            </label>
            <textarea
              id="kit-desc"
              className="inp sw-name-textarea"
              rows={3}
              placeholder="Notes for your team — not shown to recipients"
              value={desc}
              onChange={(e) => onDesc(e.target.value)}
            />
          </div>

          <div className="sw-name-suggest-block">
            <div className="sw-name-suggest-head">
              <span className="sw-name-suggest-label">Suggestions</span>
            </div>
            <div className="sw-name-pick-grid" role="radiogroup" aria-label="Kit name suggestions">
              {EXAMPLES.map((ex) => {
                const selected = name === ex.label;
                return (
                  <button
                    key={ex.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`sw-name-pick-card${selected ? " on" : ""}`}
                    onClick={() => onName(ex.label)}
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
