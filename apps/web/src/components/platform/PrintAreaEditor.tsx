import { useRef, useState } from "react";
import type { PrintArea } from "@/services/platform-api";
import { TintedGarment } from "../store/TintedGarment";

export const CUSTOMIZATION_METHODS = [
  "screen_print",
  "dtf",
  "embroidery",
  "engraving",
  "sublimation",
  "uv_print",
] as const;

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

type DragState = {
  index: number;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  box: PrintArea["box"];
  rect: DOMRect;
};

const DEFAULT_BOX = { xPct: 30, yPct: 30, widthPct: 40, heightPct: 30 };

/**
 * POD-style design-placeholder editor: draw/move/resize rectangles over a
 * product mockup image. Coordinates are percentages so they're resolution
 * independent (matches the backend printAreas.box schema).
 */
export function PrintAreaEditor({
  images,
  mask,
  colors = [],
  value,
  onChange,
}: {
  images: string[];
  mask?: string;
  colors?: { name: string; hex: string }[];
  value: PrintArea[];
  onChange: (areas: PrintArea[]) => void;
}) {
  const [mockup, setMockup] = useState(images[0] ?? "");
  const [tintHex, setTintHex] = useState("");
  const [selected, setSelected] = useState(0);
  const drag = useRef<DragState | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const update = (index: number, patch: Partial<PrintArea>) =>
    onChange(value.map((a, i) => (i === index ? { ...a, ...patch } : a)));

  function addArea() {
    const n = value.length + 1;
    onChange([
      ...value,
      {
        key: `area_${n}`,
        label: `Area ${n}`,
        mockupImageUrl: mockup,
        box: { ...DEFAULT_BOX },
        maxWidthCm: 28,
        maxHeightCm: 35,
        dpi: 300,
        methods: ["dtf"],
      },
    ]);
    setSelected(value.length);
  }

  function onPointerDown(e: React.PointerEvent, index: number, mode: "move" | "resize") {
    e.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSelected(index);
    drag.current = {
      index,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      box: { ...value[index].box },
      rect,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dxPct = ((e.clientX - d.startX) / d.rect.width) * 100;
    const dyPct = ((e.clientY - d.startY) / d.rect.height) * 100;
    if (d.mode === "move") {
      update(d.index, {
        box: {
          ...d.box,
          xPct: clamp(d.box.xPct + dxPct, 0, 100 - d.box.widthPct),
          yPct: clamp(d.box.yPct + dyPct, 0, 100 - d.box.heightPct),
        },
      });
    } else {
      update(d.index, {
        box: {
          ...d.box,
          widthPct: clamp(d.box.widthPct + dxPct, 5, 100 - d.box.xPct),
          heightPct: clamp(d.box.heightPct + dyPct, 5, 100 - d.box.yPct),
        },
      });
    }
  }

  const endDrag = () => {
    drag.current = null;
  };

  const area = value[selected];

  return (
    <div className="row" style={{ gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 360px", minWidth: 320 }}>
        {images.length > 1 && (
          <div className="field">
            <label className="lbl">Mockup image</label>
            <select className="inp" value={mockup} onChange={(e) => setMockup(e.target.value)}>
              {images.map((url) => (
                <option key={url} value={url}>
                  {url.split("/").pop()}
                </option>
              ))}
            </select>
          </div>
        )}
        {colors.length > 0 && (
          <div className="field">
            <label className="lbl">Preview colour</label>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <button type="button" className={tintHex === "" ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"} onClick={() => setTintHex("")}>None</button>
              {colors.map((c) => (
                <button
                  key={c.hex + c.name}
                  type="button"
                  title={c.name}
                  onClick={() => setTintHex(c.hex)}
                  style={{ width: 26, height: 26, borderRadius: 6, background: c.hex, cursor: "pointer", border: tintHex === c.hex ? "2px solid var(--brand)" : "1px solid var(--line)" }}
                />
              ))}
            </div>
          </div>
        )}
        <div
          ref={stageRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1 / 1",
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            overflow: "hidden",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          {mockup ? (
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <TintedGarment base={mockup} src={mask} hex={tintHex} alt="mockup" />
            </div>
          ) : (
            <div className="muted" style={{ display: "grid", placeItems: "center", height: "100%" }}>
              Upload an image first
            </div>
          )}
          {value.map((a, i) =>
            a.mockupImageUrl && a.mockupImageUrl !== mockup ? null : (
              <div
                key={i}
                onPointerDown={(e) => onPointerDown(e, i, "move")}
                style={{
                  position: "absolute",
                  left: `${a.box.xPct}%`,
                  top: `${a.box.yPct}%`,
                  width: `${a.box.widthPct}%`,
                  height: `${a.box.heightPct}%`,
                  border: `2px solid ${i === selected ? "var(--brand)" : "rgba(0,0,0,.4)"}`,
                  background: i === selected ? "rgba(46,160,103,.12)" : "rgba(0,0,0,.04)",
                  cursor: "move",
                  boxSizing: "border-box",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: -20,
                    left: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--ink)",
                    background: "#fff",
                    padding: "1px 5px",
                    borderRadius: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.label}
                </span>
                <span
                  onPointerDown={(e) => onPointerDown(e, i, "resize")}
                  style={{
                    position: "absolute",
                    right: -6,
                    bottom: -6,
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: "var(--brand)",
                    cursor: "nwse-resize",
                  }}
                />
              </div>
            ),
          )}
        </div>
        <button type="button" className="btn btn-soft btn-sm" style={{ marginTop: 12 }} onClick={addArea}>
          + Add print area
        </button>
      </div>

      <div style={{ flex: "1 1 300px", minWidth: 280 }}>
        {!value.length && <p className="muted">No print areas yet. Add one to define where artwork can be placed.</p>}
        {area && (
          <div className="card" style={{ padding: 16 }}>
            <div className="field">
              <label className="lbl">Label</label>
              <input
                className="inp"
                value={area.label}
                onChange={(e) => update(selected, { label: e.target.value, key: slug(e.target.value) })}
              />
            </div>
            <div className="row" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Max width (cm)</label>
                <input
                  className="inp"
                  type="number"
                  value={area.maxWidthCm ?? 0}
                  onChange={(e) => update(selected, { maxWidthCm: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">Max height (cm)</label>
                <input
                  className="inp"
                  type="number"
                  value={area.maxHeightCm ?? 0}
                  onChange={(e) => update(selected, { maxHeightCm: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label className="lbl">DPI</label>
                <input
                  className="inp"
                  type="number"
                  value={area.dpi ?? 300}
                  onChange={(e) => update(selected, { dpi: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="field">
              <label className="lbl">Allowed methods</label>
              <div className="row" style={{ flexWrap: "wrap", gap: 0 }}>
                {CUSTOMIZATION_METHODS.map((m) => {
                  const on = (area.methods ?? []).includes(m);
                  return (
                    <button
                      type="button"
                      key={m}
                      className="chip"
                      style={on ? { borderColor: "var(--brand)", color: "var(--brand-d)" } : undefined}
                      onClick={() =>
                        update(selected, {
                          methods: on
                            ? (area.methods ?? []).filter((x) => x !== m)
                            : [...(area.methods ?? []), m],
                        })
                      }
                    >
                      {m.replace(/_/g, " ")}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                onChange(value.filter((_, i) => i !== selected));
                setSelected(0);
              }}
            >
              Remove this area
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
