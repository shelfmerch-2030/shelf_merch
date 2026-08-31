import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { COUNTRY_OPTIONS } from "@/data/countries";

type CountrySelectProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hideLabel?: boolean;
  variant?: "default" | "checkout";
  invalid?: boolean;
  errorId?: string;
  onBlur?: () => void;
};

export function CountrySelect({
  value,
  onChange,
  required = false,
  hideLabel = false,
  variant = "default",
  invalid = false,
  errorId,
  onBlur,
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selectedCode = value || "IN";
  const selected =
    COUNTRY_OPTIONS.find((country) => country.value === selectedCode) ??
    COUNTRY_OPTIONS.find((country) => country.value === "IN");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(
      (country) =>
        country.label.toLowerCase().includes(q) || country.value.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    searchRef.current?.focus();

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function pickCountry(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  return (
    <div
      className={`field country-select country-select--${variant}${invalid ? " country-select--invalid" : ""}`}
      style={{ flex: 1 }}
      ref={rootRef}
    >
      {hideLabel ? null : (
        <label className="lbl" id={`${listId}-label`}>
          Country
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
      )}

      <button
        type="button"
        className={`country-select__trigger inp${open ? " country-select__trigger--open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={hideLabel ? undefined : `${listId}-label`}
        aria-label={hideLabel ? "Country" : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={errorId}
        onClick={() => setOpen((current) => !current)}
        onBlur={onBlur}
      >
        <span className="country-select__value">{selected?.label ?? "Select country"}</span>
        <ChevronDown size={16} aria-hidden="true" className="country-select__chevron" />
      </button>

      {open ? (
        <div className="country-select__panel" role="listbox" aria-labelledby={`${listId}-label`}>
          <div className="country-select__search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Search countries..."
              aria-label="Search countries"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="country-select__list">
            {filtered.length === 0 ? (
              <p className="country-select__empty">No countries match your search.</p>
            ) : (
              filtered.map((country) => {
                const isSelected = country.value === selectedCode;
                return (
                  <button
                    key={country.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`country-select__option${isSelected ? " country-select__option--selected" : ""}`}
                    onClick={() => pickCountry(country.value)}
                  >
                    <span>{country.label}</span>
                    {isSelected ? <Check size={15} aria-hidden="true" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}