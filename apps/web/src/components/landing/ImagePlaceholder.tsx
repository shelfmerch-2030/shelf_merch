import type { CSSProperties } from "react";

type ImagePlaceholderProps = {
  name: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
};

export function ImagePlaceholder({ name, alt, className, style }: ImagePlaceholderProps) {
  return (
    <div
      role="img"
      aria-label={alt}
      data-placeholder={name}
      className={className}
      style={{
        background: "#e0ddd6",
        ...style,
      }}
    />
  );
}
