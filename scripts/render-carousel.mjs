import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error("GITHUB_EVENT_PATH não foi informado.");

const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
const body = event.issue?.body?.trim();
const carouselId = String(event.issue?.number || "preview");
if (!body) throw new Error("A issue não contém o JSON do carrossel.");

const payload = JSON.parse(body);
const caption = payload.caption;
const slides = payload.slides;

if (typeof caption !== "string" || !caption.trim() || [...caption].length > 2200) {
  throw new Error('"caption" deve ser um texto entre 1 e 2.200 caracteres.');
}
if (!Array.isArray(slides) || slides.length < 2 || slides.length > 10) {
  throw new Error('"slides" deve conter de 2 a 10 itens.');
}

const allowedTypes = new Set(["cover", "prompt", "content", "cta"]);
for (const [index, slide] of slides.entries()) {
  if (!slide || typeof slide !== "object") throw new Error(`Slide ${index + 1} inválido.`);
  if (!allowedTypes.has(slide.type)) throw new Error(`Tipo inválido no slide ${index + 1}.`);
  if (typeof slide.title !== "string" || !slide.title.trim()) {
    throw new Error(`Slide ${index + 1} precisa de título.`);
  }
  if ([...slide.title].length > 120) throw new Error(`Título do slide ${index + 1} excede 120 caracteres.`);
  if (slide.body && [...String(slide.body)].length > 420) throw new Error(`Texto do slide ${index + 1} excede 420 caracteres.`);
  if (slide.prompt && [...String(slide.prompt)].length > 620) throw new Error(`Prompt do slide ${index + 1} excede 620 caracteres.`);
}

const outputDir = path.join("public", "carousels", carouselId);
fs.mkdirSync(outputDir, { recursive: true });

const escapeXml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

function wrap(value, maxChars) {
  const paragraphs = String(value ?? "").split(/\n+/).map(item => item.trim()).filter(Boolean);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
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
  }
  return lines;
}

function textBlock(lines, x, y, size, lineHeight, weight = 500, fill = "#F7FBFF") {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function brandMark() {
  return `
    <g transform="translate(72 68)">
      <rect width="56" height="48" rx="14" fill="none" stroke="#35D5FF" stroke-width="5"/>
      <path d="M13 24h7l5-9 8 18 5-9h7" fill="none" stroke="#35D5FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="76" y="35" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="800" fill="#FFFFFF" letter-spacing="2">MUNDO DO PROMPT</text>
    </g>`;
}

function neuralArt() {
  return `
    <g opacity="0.95" transform="translate(690 790)">
      <circle cx="140" cy="85" r="80" fill="#122B55" stroke="#35D5FF" stroke-width="5"/>
      <rect x="91" y="45" width="98" height="70" rx="24" fill="#08152D" stroke="#35D5FF" stroke-width="5"/>
      <circle cx="122" cy="79" r="8" fill="#35D5FF"/><circle cx="158" cy="79" r="8" fill="#35D5FF"/>
      <path d="M118 98h44" stroke="#35D5FF" stroke-width="5" stroke-linecap="round"/>
      <path d="M140 5V-32M60 85H15M220 85h46M82 28 48-8M198 28l34-36" stroke="#35D5FF" stroke-width="4"/>
      <circle cx="140" cy="-40" r="10" fill="#6C63FF"/><circle cx="6" cy="85" r="10" fill="#6C63FF"/><circle cx="275" cy="85" r="10" fill="#6C63FF"/><circle cx="42" cy="-14" r="10" fill="#35D5FF"/><circle cx="238" cy="-14" r="10" fill="#35D5FF"/>
      <path d="M35 235c40-48 170-48 210 0v96H35z" fill="#0B2145" stroke="#35D5FF" stroke-width="5"/>
      <rect x="-72" y="330" width="420" height="30" rx="15" fill="#35D5FF"/>
      <path d="M10 330c18-54 62-80 118-80 70 0 126 22 164 80" fill="#0B1733" stroke="#6C63FF" stroke-width="5"/>
    </g>`;
}

function baseSvg(slide, index) {
  const isCover = slide.type === "cover";
  const isCta = slide.type === "cta";
  const titleSize = isCover ? (slide.title.length > 80 ? 62 : slide.title.length > 55 ? 70 : 78) : 54;
  const titleWidth = isCover ? 22 : 31;
  const titleLines = wrap(slide.title.toUpperCase(), titleWidth);
  if (titleLines.length > (isCover ? 5 : 3)) throw new Error(`O título do slide ${index + 1} não cabe no layout.`);

  const bodyLines = wrap(slide.body, isCover ? 43 : 52);
  const promptLines = wrap(slide.prompt, 58);
  if (bodyLines.length > 7) throw new Error(`O texto do slide ${index + 1} não cabe no layout.`);
  if (promptLines.length > 12) throw new Error(`O prompt do slide ${index + 1} não cabe no layout.`);

  const titleY = isCover ? 315 : 235;
  const titleHeight = titleLines.length * (titleSize * 1.08);
  const bodyY = titleY + titleHeight + 56;
  const promptY = bodyY + Math.max(bodyLines.length, 1) * 46 + 75;
  const dots = slides.map((_, dotIndex) => `<circle cx="${450 + dotIndex * 24}" cy="1272" r="6" fill="${dotIndex === index ? "#35D5FF" : "#36506E"}"/>`).join("");
  const eyebrow = escapeXml(slide.eyebrow || (isCover ? "PROMPTS PRÁTICOS" : isCta ? "PRÓXIMO PASSO" : "APLIQUE AGORA"));

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050B18"/><stop offset="0.58" stop-color="#0A1730"/><stop offset="1" stop-color="#101E3F"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#35D5FF" stop-opacity="0.20"/><stop offset="1" stop-color="#35D5FF" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#bg)"/>
    <circle cx="980" cy="120" r="420" fill="url(#glow)"/>
    <circle cx="80" cy="1190" r="340" fill="#6C63FF" opacity="0.07"/>
    ${brandMark()}
    <text x="72" y="195" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="#35D5FF" letter-spacing="3">${eyebrow}</text>
    ${textBlock(titleLines, 72, titleY, titleSize, Math.round(titleSize * 1.08), 900)}
    ${bodyLines.length ? textBlock(bodyLines, 74, bodyY, isCover ? 31 : 29, 46, 400, "#C8D7E8") : ""}
    ${slide.prompt ? `<rect x="66" y="${promptY - 54}" width="948" height="${Math.max(230, promptLines.length * 39 + 92)}" rx="30" fill="#0D2448" stroke="#24799B" stroke-width="2"/><text x="104" y="${promptY - 14}" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="800" fill="#35D5FF" letter-spacing="2">PROMPT</text>${textBlock(promptLines, 104, promptY + 34, 27, 39, 400, "#F3F8FC")}` : ""}
    ${isCover ? neuralArt() : ""}
    ${isCta ? `<rect x="72" y="930" width="936" height="164" rx="34" fill="#35D5FF"/><text x="540" y="1000" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="900" fill="#04101F">${escapeXml(slide.cta || "SALVE E COMPARTILHE")}</text><text x="540" y="1048" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600" fill="#08203B">@mundodoprompt</text>` : ""}
    <g>${dots}</g>
  </svg>`;
}

for (const [index, slide] of slides.entries()) {
  const svg = baseSvg(slide, index);
  const filename = `slide-${String(index + 1).padStart(2, "0")}.jpg`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 93, chromaSubsampling: "4:4:4" }).toFile(path.join(outputDir, filename));
  console.log(`Gerado: ${filename}`);
}

fs.writeFileSync("public/index.html", "<!doctype html><meta charset='utf-8'><title>Mundo do Prompt</title>");
fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({ caption, count: slides.length }, null, 2));

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `carousel_id=${carouselId}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `slide_count=${slides.length}\n`);
}
