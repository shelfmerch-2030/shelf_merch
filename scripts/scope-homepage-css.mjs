import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../apps/web/src/components/landing");

/** Scale factor for default desktop view — keeps proportions, reduces overall size. */
const LANDING_SCALE = 0.85;

let css = fs.readFileSync(path.join(outDir, "_extracted/style.css"), "utf8");

function scaleUnit(value, unit) {
  const scaled = parseFloat(value) * LANDING_SCALE;
  if (unit === "px") {
    if (scaled > 0 && scaled < 1) return `${scaled}px`;
    const rounded = Math.round(scaled * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded}px`;
  }
  return `${Math.round(scaled * 1000) / 1000}${unit}`;
}

function scaleDeclarations(declarations) {
  return declarations
    .replace(/(\d+\.?\d*)px/g, (_, n) => scaleUnit(n, "px"))
    .replace(/(\d+\.?\d*)vw/g, (_, n) => scaleUnit(n, "vw"));
}

function findBlockEnd(cssText, openBraceIndex) {
  let depth = 1;
  let cursor = openBraceIndex + 1;
  while (cursor < cssText.length && depth > 0) {
    if (cssText[cursor] === "{") depth += 1;
    if (cssText[cursor] === "}") depth -= 1;
    cursor += 1;
  }
  return cursor;
}

function scaleRuleDeclarations(cssText) {
  return cssText.replace(/([^{}]+)\{([^{}]+)\}/g, (_, selectors, declarations) => {
    return `${selectors}{${scaleDeclarations(declarations)}}`;
  });
}

function scaleLandingCss(cssText) {
  let result = "";
  let index = 0;

  while (index < cssText.length) {
    const mediaStart = cssText.indexOf("@media", index);
    const keyframesStart = cssText.indexOf("@keyframes", index);
    let nextSpecial = -1;
    let specialKind = null;

    if (mediaStart !== -1 && (keyframesStart === -1 || mediaStart <= keyframesStart)) {
      nextSpecial = mediaStart;
      specialKind = "media";
    } else if (keyframesStart !== -1) {
      nextSpecial = keyframesStart;
      specialKind = "keyframes";
    }

    if (nextSpecial === -1) {
      result += scaleRuleDeclarations(cssText.slice(index));
      break;
    }

    result += scaleRuleDeclarations(cssText.slice(index, nextSpecial));
    const openBrace = cssText.indexOf("{", nextSpecial);
    const blockEnd = findBlockEnd(cssText, openBrace);
    const header = cssText.slice(nextSpecial, openBrace + 1);
    const inner = cssText.slice(openBrace + 1, blockEnd - 1);

    if (specialKind === "media") {
      result += `${header}${scaleLandingCss(inner)}}`;
    } else {
      result += cssText.slice(nextSpecial, blockEnd);
    }

    index = blockEnd;
  }

  return result;
}

function scopeSelectors(selectorBlock) {
  return selectorBlock
    .split(",")
    .map((selector) => {
      const trimmed = selector.trim();
      if (!trimmed) return trimmed;
      if (trimmed.startsWith("@")) return trimmed;
      if (trimmed === ".__SHELF_VARS__") return ".shelf-landing";
      return `.shelf-landing ${trimmed}`;
    })
    .join(",");
}

function scopeCssBlock(block) {
  if (block.startsWith("@media")) {
    const openBrace = block.indexOf("{");
    const closeBrace = block.lastIndexOf("}");
    const mediaQuery = block.slice(0, openBrace + 1);
    const inner = block.slice(openBrace + 1, closeBrace);
    return `${mediaQuery}${scopeRules(inner)}}`;
  }
  if (block.startsWith("@keyframes")) {
    return block;
  }

  const openBrace = block.indexOf("{");
  if (openBrace === -1) return block;
  const selectors = block.slice(0, openBrace);
  const body = block.slice(openBrace);
  return `${scopeSelectors(selectors)}${body}`;
}

function scopeRules(cssText) {
  const blocks = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < cssText.length; i += 1) {
    if (cssText[i] === "{") depth += 1;
    if (cssText[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        blocks.push(cssText.slice(start, i + 1));
        start = i + 1;
      }
    }
  }

  return blocks.map(scopeCssBlock).join("");
}

css = css
  .replace(/:root\{--font-geist-sans/g, ".__SHELF_VARS__{--font-geist-sans")
  .replace(/:root\{--ink/g, ".__SHELF_VARS__{--ink")
  .replace(/\* \{box-sizing:border-box\}/g, "")
  .replace(/\*\{box-sizing:border-box\}/g, "")
  .replace(/html\{scroll-behavior:smooth\}/g, "")
  .replace(/body\{margin:0;background:var\(--cream\);color:var\(--ink\);font-family:var\(--font-geist-sans\),Arial,sans-serif\}/g, "");

const scopedRules = scopeMediaQueries(scopeRules(css));

function scopeMediaQueries(cssText) {
  let result = "";
  let index = 0;

  while (index < cssText.length) {
    const mediaStart = cssText.indexOf("@media", index);
    if (mediaStart === -1) {
      result += cssText.slice(index);
      break;
    }

    result += cssText.slice(index, mediaStart);
    const openBrace = cssText.indexOf("{", mediaStart);
    let depth = 1;
    let cursor = openBrace + 1;

    while (cursor < cssText.length && depth > 0) {
      if (cssText[cursor] === "{") depth += 1;
      if (cssText[cursor] === "}") depth -= 1;
      cursor += 1;
    }

    const header = cssText.slice(mediaStart, openBrace + 1);
    const inner = cssText.slice(openBrace + 1, cursor - 1);
    const scopedInner = scopeRules(inner)
      .replace(/\.shelf-landing html\{/g, ".shelf-landing{")
      .replace(/html\{scroll-behavior:auto\}/g, ".shelf-landing{scroll-behavior:auto}");
    result += `${header}${scopedInner}}`;
    index = cursor;
  }

  return result;
}

const placeholderCss = `
.shelf-landing .hero-visual [data-placeholder="hero-image"] {
  position: absolute;
  z-index: 2;
  width: 82%;
  height: 66%;
  right: 0;
  bottom: 9%;
  border-radius: 32px 0 0 32px;
  box-shadow: -18px 26px 50px rgba(18, 18, 18, 0.22);
}
.shelf-landing .production-image [data-placeholder="production-image"] {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
}
.shelf-landing .festive-banner [data-placeholder="festive-banner-image"] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
@media (max-width: 1100px) {
  .shelf-landing .hero-visual [data-placeholder="hero-image"] {
    width: 88%;
    height: 76%;
  }
}
@media (max-width: 760px) {
  .shelf-landing .hero-visual [data-placeholder="hero-image"] {
    width: 94%;
    height: 72%;
    bottom: 8%;
    border-radius: 22px 0 0 22px;
  }
}
`;

const output = `/* Shelf Merch homepage — faithful reproduction from ShelfMerch-Homepage_final.html */
.shelf-landing,
.shelf-landing * {
  box-sizing: border-box;
}
.shelf-landing {
  scroll-behavior: smooth;
  margin: 0;
  --font-geist-sans: Arial, Helvetica, sans-serif;
  --font-geist-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --ink: #121212;
  --cream: #f7f3ea;
  --blue: #3155ff;
  --coral: #ff6d55;
  --mint: #72e2b8;
  --yellow: #ffd84a;
  --lilac: #c9b8ff;
  --plum: #29163f;
  --line: rgba(18, 18, 18, 0.14);
  background: var(--cream);
  color: var(--ink);
  font-family: var(--font-geist-sans), Arial, sans-serif;
  overflow-x: clip;
}
${scaleLandingCss(
  scopedRules
    .replace(/\.shelf-landing\{--font-geist-sans:[^}]+\}\.shelf-landing\{--ink:[^}]+\}/g, "")
    .replace(/translateX\(-45%\)/g, "translateX(-50%)"),
)}
${scaleLandingCss(placeholderCss)}
`;

fs.writeFileSync(
  path.resolve(__dirname, "../apps/web/src/components/landing-page.css"),
  output,
);
console.log("Wrote scoped landing-page.css", output.length, "bytes");
