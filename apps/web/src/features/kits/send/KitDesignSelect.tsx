import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { resolveMediaUrl } from "@/lib/mediaUrl";

export function kitDesignLabel(index: number, total: number): string {
  if (total <= 1) return "Standard design";
  return `Design ${index + 1}`;
}

type KitDesignSelectProps = {
  designs: string[];
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  size?: "sm" | "md";
};

export function KitDesignSelect({
  designs,
  value,
  onChange,
  placeholder = "Choose kit design...",
  ariaLabel = "Kit design",
  size = "md",
}: KitDesignSelectProps) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedIndex = designs.findIndex((url) => url === value);
  const selectedLabel =
    selectedIndex >= 0 ? kitDesignLabel(selectedIndex, designs.length) : null;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    function updatePosition() {
      const rect = triggerRef.current!.getBoundingClientRect();
      const panelHeight = panelRef.current?.offsetHeight ?? 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < panelHeight + 12 && rect.top > panelHeight + 12;
      const width = Math.max(rect.width, 260);

      setPanelStyle({
        position: "fixed",
        top: openUp ? rect.top - panelHeight - 6 : rect.bottom + 6,
        left: Math.min(rect.left, window.innerWidth - width - 12),
        width,
        zIndex: 1400,
      });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, designs.length]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function pickDesign(url: string) {
    onChange(url);
    setOpen(false);
  }

  const panel = open ? (
    <div
      ref={panelRef}
      className="kit-design-select__panel"
      role="listbox"
      aria-labelledby={listId}
      style={panelStyle}
    >
      <p className="kit-design-select__hint" id={listId}>
        Each option is a different look for this curated kit.
      </p>
      <div className="kit-design-select__list">
        {designs.map((url, idx) => {
          const isSelected = url === value;
          const label = kitDesignLabel(idx, designs.length);
          return (
            <button
              key={`${url}-${idx}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`kit-design-select__option${isSelected ? " kit-design-select__option--selected" : ""}`}
              onClick={() => pickDesign(url)}
            >
              <span className="kit-design-select__option-main">
                <span className="kit-design-select__thumb kit-design-select__thumb--lg">
                  <img src={resolveMediaUrl(url)} alt="" />
                </span>
                <span className="kit-design-select__option-copy">
                  <span className="kit-design-select__option-label">{label}</span>
                </span>
              </span>
              {isSelected ? <Check size={15} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div
      className={`kit-design-select kit-design-select--${size}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`kit-design-select__trigger${open ? " kit-design-select__trigger--open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        {value ? (
          <span className="kit-design-select__value">
            <span className="kit-design-select__thumb">
              <img src={resolveMediaUrl(value)} alt="" />
            </span>
            <span className="kit-design-select__label">{selectedLabel}</span>
          </span>
        ) : (
          <span className="kit-design-select__placeholder">{placeholder}</span>
        )}
        <ChevronDown size={size === "sm" ? 14 : 16} aria-hidden="true" className="kit-design-select__chevron" />
      </button>

      {panel && typeof document !== "undefined"
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}