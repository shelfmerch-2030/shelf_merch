import { useState } from "react";
import { ImageOff } from "lucide-react";

/** Shared product/kit image with broken-image fallback (clean placeholder). */
export function CardImage({ src, alt, emptyLabel }: { src: string; alt: string; emptyLabel: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <ImageOff size={22} aria-label={emptyLabel} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
