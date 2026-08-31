import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import type { UiContact } from "@/services/mappers";
import type { SendMode, SingleLocation } from "./types";
import {
  locFieldKindForKey,
  sanitizeLocField,
  validateLocField,
  type LocFieldKind,
} from "./singleLocationValidation";
import { CountrySelect } from "./CountrySelect";

const MODE_CARDS: Array<[SendMode, string, string]> = [
  [
    "redeem",
    "Recipients redeem",
    "Recipients choose size, colour & shipping address from a private link.",
  ],
  [
    "surprise",
    "Surprise recipients",
    "Enter recipient details up front so gifts ship without input.",
  ],
  ["single", "Single location", "Ship all units to one office, event venue or address."],
];

/** Shared recipient picker (Send Items + Send Points). */
export function RecipientPicker({
  title,
  subtitle,
  contacts,
  selected,
  onToggle,
  onDeselectAll,
  onSelectAll,
  onAddEmails,
  onCsvImport,
  maxRecipients,
  showModes = false,
  mode = "redeem",
  onMode,
  singleLocation,
  onSingleLocationChange,
  showErrors = false,
}: {
  title: string;
  subtitle: string;
  contacts: UiContact[];
  selected: string[];
  onToggle: (id: string) => void;
  onDeselectAll: () => void;
  onSelectAll?: () => void;
  onAddEmails?: (raw: string) => void;
  onCsvImport?: (file: File) => void;
  maxRecipients?: number;
  showModes?: boolean;
  mode?: SendMode;
  onMode?: (mode: SendMode) => void;
  singleLocation?: SingleLocation;
  onSingleLocationChange?: (key: keyof SingleLocation, value: string) => void;
  showErrors?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const rows = q
    ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : contacts;
  const atLimit = Boolean(maxRecipients && selected.length >= maxRecipients);

  const loc = singleLocation;

  function handleAddEmails() {
    if (!onAddEmails) return;
    const raw = emailDraft.trim();
    if (!raw) {
      toast.error("Enter at least one email address");
      return;
    }
    onAddEmails(raw);
    setEmailDraft("");
    setShowEmailInput(false);
  }

  function handleCsvChange(file: File | undefined) {
    if (!file || !onCsvImport) return;
    onCsvImport(file);
    if (csvInputRef.current) csvInputRef.current.value = "";
  }

  return (
    <>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{title}</h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        {subtitle}
      </p>

      {showModes && onMode && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
          {MODE_CARDS.map(([key, t, d]) => (
            <button
              key={key}
              type="button"
              className={`optcard ${mode === key ? "on" : ""}`}
              onClick={() => onMode(key)}
            >
              <div className="rd" />
              <div>
                <h4>{t}</h4>
                <p>{d}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showModes && mode === "single" && loc && onSingleLocationChange && (
        <div className="card" style={{ padding: 20, marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, marginBottom: 5 }}>Single delivery location</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            All selected recipients' gifts will ship together to this address. A notification will
            be sent to the email below.
          </p>
          <div className="row">
            <LocField label="Contact name" k="name" kind="personName" required showErrors={showErrors} loc={loc} onChange={onSingleLocationChange} />
            <LocField
              label="Notification email"
              k="email"
              kind="email"
              type="email"
              required
              showErrors={showErrors}
              loc={loc}
              onChange={onSingleLocationChange}
            />
            <LocField
              label="Phone"
              k="phone"
              kind="phone"
              required
              showErrors={showErrors}
              loc={loc}
              onChange={onSingleLocationChange}
            />
          </div>
          <LocField label="Address" k="line1" kind="address" required showErrors={showErrors} loc={loc} onChange={onSingleLocationChange} block />
          <LocField
            label="Address line 2 (optional)"
            k="line2"
            kind="address"
            showErrors={showErrors}
            loc={loc}
            onChange={onSingleLocationChange}
            block
          />
          <div className="row">
            <LocField label="City" k="city" kind="city" required showErrors={showErrors} loc={loc} onChange={onSingleLocationChange} />
            <LocField label="State" k="state" kind="state" required showErrors={showErrors} loc={loc} onChange={onSingleLocationChange} />
            <LocField
              label="PIN / Postal code"
              k="pincode"
              kind="postal"
              required
              showErrors={showErrors}
              loc={loc}
              onChange={onSingleLocationChange}
            />
            <CountrySelect
              value={loc.country || "IN"}
              onChange={(value) => onSingleLocationChange("country", value)}
              required
            />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <div className="row" style={{ gap: 8, marginBottom: 12, alignItems: "center" }}>
          <span
            className="tag tag-soft"
            style={{ background: "var(--brand-50)", color: "var(--brand-d)" }}
          >
            {selected.length}
            {maxRecipients ? ` / ${maxRecipients}` : ""} selected
          </span>
          {onSelectAll ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={atLimit}
              onClick={onSelectAll}
            >
              Select all
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDeselectAll}>
            Deselect all
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={atLimit || !onAddEmails}
            onClick={() => setShowEmailInput((open) => !open)}
          >
            Input emails
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={atLimit || !onCsvImport}
            onClick={() => csvInputRef.current?.click()}
          >
            Add by CSV
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => handleCsvChange(e.target.files?.[0])}
          />
          <div className="search" style={{ flex: 1 }}>
            <Search size={16} aria-hidden="true" />
            <input
              style={{ height: 36 }}
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search recipients"
            />
          </div>
        </div>

        {showEmailInput && onAddEmails ? (
          <div className="card" style={{ padding: 14, marginBottom: 12, background: "var(--surface-2)" }}>
            <label className="lbl">Paste email addresses</label>
            <textarea
              className="inp"
              rows={3}
              placeholder="Separate emails with commas, spaces, or new lines"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
            />
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-brand btn-sm" onClick={handleAddEmails}>
                Add recipients
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowEmailInput(false);
                  setEmailDraft("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {atLimit && maxRecipients ? (
          <p className="mut3" style={{ fontSize: 12, marginBottom: 10 }}>
            Recipient limit reached ({maxRecipients}). Deselect someone to add more.
          </p>
        ) : null}

        <table className="tbl">
          <thead>
            <tr>
              <th />
              <th>Email</th>
              <th>Name</th>
              <th>Home address</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const on = selected.includes(c.id);
              const disabled = atLimit && !on;
              return (
                <tr key={c.id}>
                  <td>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`${on ? "Deselect" : "Select"} ${c.name}`}
                      disabled={disabled}
                      onClick={() => onToggle(c.id)}
                      style={{
                        width: 18,
                        height: 18,
                        border: `2px solid ${on ? "var(--brand)" : "var(--line-strong)"}`,
                        borderRadius: 4,
                        display: "grid",
                        placeItems: "center",
                        background: on ? "var(--brand)" : "#fff",
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.45 : 1,
                        padding: 0,
                      }}
                    >
                      {on && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                    </button>
                  </td>
                  <td className="muted">{c.email}</td>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="muted">{c.loc || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export { CountrySelect } from "./CountrySelect";

export function LocField({
  label,
  k,
  loc,
  onChange,
  type = "text",
  block = false,
  kind,
  required = false,
  showErrors = false,
}: {
  label: string;
  k: keyof SingleLocation;
  loc: SingleLocation;
  onChange: (key: keyof SingleLocation, value: string) => void;
  type?: string;
  block?: boolean;
  kind?: LocFieldKind;
  required?: boolean;
  showErrors?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const resolvedKind = kind ?? locFieldKindForKey(k);
  const inputMode =
    resolvedKind === "phone" || resolvedKind === "postal"
      ? "numeric"
      : resolvedKind === "email"
        ? "email"
        : undefined;

  function handleChange(raw: string) {
    const next = resolvedKind ? sanitizeLocField(resolvedKind, raw) : raw;
    onChange(k, next);
  }

  const inputType = resolvedKind === "phone" ? "tel" : type;
  const value = loc[k] || "";
  const error = validateLocField(k, loc);
  const hasValue = value.trim().length > 0;
  const showFieldError = Boolean(error && (showErrors || touched || hasValue));
  const errorId = `${k}-error`;

  return (
    <div className="field" style={block ? undefined : { flex: 1 }}>
      <label className="lbl">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        className={`inp${showFieldError ? " inp--invalid" : ""}`}
        type={inputType}
        inputMode={inputMode}
        maxLength={resolvedKind === "phone" ? 10 : resolvedKind === "postal" ? 10 : undefined}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => setTouched(true)}
        aria-invalid={showFieldError}
        aria-describedby={showFieldError ? errorId : undefined}
      />
      {showFieldError ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
