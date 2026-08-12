import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, "../../../ShelfMerch-Homepage_final.html");
const outDir = path.resolve(__dirname, "../apps/web/src/components/landing/_extracted");

fs.mkdirSync(outDir, { recursive: true });

const html = fs.readFileSync(htmlPath, "utf8");
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];

if (styleMatch) {
  fs.writeFileSync(path.join(outDir, "style.css"), styleMatch[1]);
  console.log("CSS bytes:", styleMatch[1].length);
}

if (bodyMatch) {
  let body = bodyMatch[1];
  // Strip base64 image data for readability
  body = body.replace(/src="data:image[^"]+"/g, 'src="__PLACEHOLDER__"');
  fs.writeFileSync(path.join(outDir, "body.html"), body);
  const imgCount = (body.match(/<img/g) || []).length;
  console.log("Body bytes:", body.length, "Images:", imgCount);
}

if (scriptMatches.length) {
  fs.writeFileSync(
    path.join(outDir, "scripts.js"),
    scriptMatches.map((m) => m[1]).join("\n\n"),
  );
  console.log("Scripts:", scriptMatches.length);
}
