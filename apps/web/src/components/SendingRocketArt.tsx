export function SendingRocketArt({ done = false }: { done?: boolean }) {
  return (
    <img
      className={`spa-art spa-art--image${done ? " spa-art--done" : ""}`}
      src="/images/send-points-cutout-3d.png"
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
