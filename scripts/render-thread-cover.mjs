import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error("GITHUB_EVENT_PATH não foi informado.");

const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
const body = event.issue?.body?.trim();
const issueNumber = String(event.issue?.number || "preview");
if (!body) throw new Error("A issue não contém o JSON da thread.");

const payload = JSON.parse(body);
if (!Array.isArray(payload.parts) || !payload.parts.length) {
  throw new Error('"parts" precisa conter pelo menos um texto.');
}

const firstPart = String(payload.parts[0]).trim();
const sections = firstPart.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
const title = sections[0].replace(/^[^\p{L}\p{N}]+/u, "").toUpperCase();
const subtitle = sections.slice(1).join(" ");
if (!title) throw new Error("Não foi possível extrair o título da primeira parte.");

const escapeXml = value => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

function wrap(value, maxChars, maxLines) {
  const words = String(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.,;:!?…]+$/, "")}…`;
  return visible;
}

function textBlock(lines, x, y, size, lineHeight, weight, fill, maxWidth) {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" ${maxWidth ? `textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : ""}>${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

const titleSize = title.length > 92 ? 58 : title.length > 68 ? 66 : 76;
const titleChars = title.length > 92 ? 27 : title.length > 68 ? 24 : 21;
const titleLines = wrap(title, titleChars, 4);
const subtitleLines = wrap(subtitle, 48, 3);
const titleY = 340;
const subtitleY = titleY + titleLines.length * Math.round(titleSize * 1.06) + 58;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050914"/><stop offset="0.56" stop-color="#09172F"/><stop offset="1" stop-color="#102349"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="#31D5FF" stop-opacity=".25"/><stop offset="1" stop-color="#31D5FF" stop-opacity="0"/></radialGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#000" flood-opacity=".35"/></filter>
  </defs>
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <circle cx="950" cy="155" r="440" fill="url(#glow)"/>
  <circle cx="70" cy="1220" r="340" fill="#6B5CFF" opacity=".08"/>

  <g transform="translate(72 70)">
    <rect width="60" height="52" rx="15" fill="none" stroke="#31D5FF" stroke-width="5"/>
    <path d="M13 27h9l6-11 9 22 6-11h7" fill="none" stroke="#31D5FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="82" y="38" font-family="Arial, Helvetica, sans-serif" font-size="29" font-weight="800" fill="#FFF" letter-spacing="2">MUNDO DO PROMPT</text>
  </g>
  <text x="1008" y="104" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" fill="#91A6C2" letter-spacing="2">THREAD • @mundodoprompt</text>

  <g transform="translate(72 216)">
    <rect width="250" height="48" rx="24" fill="#31D5FF" opacity=".12"/>
    <circle cx="27" cy="24" r="6" fill="#31D5FF"/>
    <text x="48" y="32" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800" fill="#54DEFF" letter-spacing="2">PROMPT PRÁTICO</text>
  </g>

  ${textBlock(titleLines, 72, titleY, titleSize, Math.round(titleSize * 1.06), 900, "#F8FBFF")}
  ${subtitleLines.length ? textBlock(subtitleLines, 76, subtitleY, 30, 45, 400, "#BFD0E4") : ""}

  <g transform="translate(72 900)" filter="url(#shadow)">
    <rect width="936" height="252" rx="34" fill="#0C203E" stroke="#244D70" stroke-width="2"/>
    <circle cx="42" cy="38" r="7" fill="#FF6B6B"/><circle cx="68" cy="38" r="7" fill="#FFD166"/><circle cx="94" cy="38" r="7" fill="#3DDC97"/>
    <text x="42" y="105" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="#31D5FF">&gt; transforme uma dúvida em decisão</text>
    <rect x="42" y="137" width="690" height="16" rx="8" fill="#E7F1FA" opacity=".18"/>
    <rect x="42" y="174" width="560" height="16" rx="8" fill="#E7F1FA" opacity=".11"/>
    <rect x="42" y="211" width="16" height="5" rx="2" fill="#31D5FF"/>
    <g transform="translate(786 68)">
      <path d="M62 5v30M62 91v30M5 63h30M89 63h30M21 22l21 21M82 83l21 21M103 22 82 43M42 83l-21 21" stroke="#31D5FF" stroke-width="3" opacity=".55"/>
      <circle cx="62" cy="63" r="38" fill="#122E55" stroke="#31D5FF" stroke-width="4"/>
      <path d="M43 63c0-15 9-25 20-25 13 0 22 10 22 25 0 17-10 25-22 25-11 0-20-8-20-25Z" fill="none" stroke="#31D5FF" stroke-width="4"/>
      <path d="M52 55h20M52 66h20M57 77h10" stroke="#31D5FF" stroke-width="3" stroke-linecap="round"/>
    </g>
  </g>

  <text x="72" y="1246" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="800" fill="#FFFFFF" letter-spacing="2">ABRA A THREAD</text>
  <path d="M306 1236h54m-16-16 16 16-16 16" fill="none" stroke="#31D5FF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const outputDir = path.join("public", "thread-covers", issueNumber);
fs.mkdirSync(outputDir, { recursive: true });
await sharp(Buffer.from(svg)).jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toFile(path.join(outputDir, "cover.jpg"));

if (!fs.existsSync("public/index.html")) {
  fs.writeFileSync("public/index.html", "<!doctype html><meta charset='utf-8'><title>Mundo do Prompt</title>");
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `cover_path=thread-covers/${issueNumber}/cover.jpg\n`);
}

console.log(`Capa gerada: ${outputDir}/cover.jpg`);
