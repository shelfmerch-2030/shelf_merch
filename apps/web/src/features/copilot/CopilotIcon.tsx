import { useEffect, useRef } from "react";
import copilotIcon from "./assets/shelfmerch-copilot-orb.png";
import { animateCopilotOrb } from "./copilotOrbAnimation";

/** Shared ShelfMerch Copilot mark; its containing button supplies the accessible name. */
export function CopilotIcon({ size = 32, animated = false }: { size?: number | string; animated?: boolean }) {
  const image = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!animated || !image.current || !canvas.current) return;
    return animateCopilotOrb(image.current, canvas.current);
  }, [animated]);

  return (
    <span
      className="sm-copilot-icon"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <img ref={image} src={copilotIcon} alt="" draggable={false} />
      {animated && <canvas ref={canvas} width={96} height={96} hidden />}
    </span>
  );
}
