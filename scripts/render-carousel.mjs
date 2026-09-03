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
const categories = new Set(["prompt", "news", "guide", "curiosity", "business"]);
const requestedCategory = String(payload.category || "").toLowerCase();

if (typeof caption !== "string" || !caption.trim() || [...caption].length > 2200) {
  throw new Error('"caption" deve ser um texto entre 1 e 2.200 caracteres.');
}
if (!Array.isArray(slides) || slides.length < 2 || slides.length > 10) {
  throw new Error('"slides" deve conter de 2 a 10 itens.');
}
if (requestedCategory && !categories.has(requestedCategory)) {
  throw new Error('"category" deve ser prompt, news, guide, curiosity ou business.');
}

const allowedTypes = new Set(["cover", "prompt", "content", "cta"]);
for (const [index, slide] of slides.entries()) {
  if (!slide || typeof slide !== "object") throw new Error(`Slide ${index + 1} inválido.`);
  if (!allowedTypes.has(slide.type)) throw new Error(`Tipo inválido no slide ${index + 1}.`);
  if (typeof slide.title !== "string" || !slide.title.trim()) throw new Error(`Slide ${index + 1} precisa de título.`);
  if ([...slide.title].length > 120) throw new Error(`Título do slide ${index + 1} excede 120 caracteres.`);
  if (slide.body && [...String(slide.body)].length > 420) throw new Error(`Texto do slide ${index + 1} excede 420 caracteres.`);
  if (slide.prompt && [...String(slide.prompt)].length > 620) throw new Error(`Prompt do slide ${index + 1} excede 620 caracteres.`);
}

const outputDir = path.join("public", "carousels", carouselId);
fs.mkdirSync(outputDir, { recursive: true });

const escapeXml = value => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&apos;");

const themes = {
  prompt: { bg1: "#050B18", bg2: "#102448", accent: "#35D5FF", accent2: "#7567FF", soft: "#C8D7E8", card: "#0D2448", label: "PROMPTS PRÁTICOS" },
  news: { bg1: "#10090D", bg2: "#301017", accent: "#FF5263", accent2: "#FFB84D", soft: "#F2D7DB", card: "#35131D", label: "RADAR DE IA" },
  guide: { bg1: "#041311", bg2: "#0B3A35", accent: "#42E6B4", accent2: "#FFD166", soft: "#D1E8E2", card: "#0B332F", label: "GUIA PRÁTICO" },
  curiosity: { bg1: "#100821", bg2: "#2E1754", accent: "#D56BFF", accent2: "#35D5FF", soft: "#E7D8F2", card: "#281443", label: "VOCÊ SABIA?" },
  business: { bg1: "#07110D", bg2: "#173128", accent: "#57E389", accent2: "#F6C85F", soft: "#D7E8DE", card: "#112D23", label: "IA PARA NEGÓCIOS" },
};

function inferCategory() {
  if (categories.has(requestedCategory)) return requestedCategory;
  const text = `${caption} ${slides.map(s => `${s.eyebrow || ""} ${s.title} ${s.body || ""}`).join(" ")}`.toLowerCase();
  if (/notícia|news|lançou|lançamento|atualização|novo recurso|breaking/.test(text)) return "news";
  if (/guia|passo a passo|checklist|roteiro|como fazer/.test(text)) return "guide";
  if (/curiosidade|você sabia|segredo|surpreendente|ninguém conta/.test(text)) return "curiosity";
  if (/negócio|venda|cliente|marketing|dinheiro|economia|lucro/.test(text)) return "business";
  return "prompt";
}

const category = inferCategory();
const theme = themes[category];

function charFactor(char) {
  if (char === " ") return 0.32;
  if (/[MWQOÇG@%]/.test(char)) return 0.82;
  if (/[IÍÌÎÏ1!|.,:;]/.test(char)) return 0.30;
  if (/[A-ZÁÀÂÃÉÊÍÓÔÕÚÜ0-9]/.test(char)) return 0.64;
  return 0.55;
}

function estimatedWidth(value, size, letterSpacing = 0) {
  return [...String(value)].reduce((sum, char) => sum + charFactor(char) * size + letterSpacing, 0);
}

function wrapPixels(value, maxWidth, size, letterSpacing = 0) {
  const paragraphs = String(value ?? "").split(/\n+/).map(item => item.trim()).filter(Boolean);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && estimatedWidth(candidate, size, letterSpacing) > maxWidth) {
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

function fitText(value, maxWidth, startSize, minSize, maxLines, letterSpacing = 0) {
  for (let size = startSize; size >= minSize; size -= 2) {
    const lines = wrapPixels(value, maxWidth, size, letterSpacing);
    if (lines.length <= maxLines && lines.every(line => estimatedWidth(line, size, letterSpacing) <= maxWidth)) {
      return { lines, size, lineHeight: Math.round(size * 1.12) };
    }
  }
  throw new Error(`O texto “${String(value).slice(0, 45)}” não cabe na área segura.`);
}

function textBlock(lines, x, y, size, lineHeight, weight = 500, fill = "#F7FBFF", anchor = "start", letterSpacing = 0) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${letterSpacing}">${lines.map((line, i) => `<tspan x="${x}" dy="${i ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function brandMark() {
  return `<g transform="translate(66 54)">
    <rect width="52" height="46" rx="13" fill="none" stroke="${theme.accent}" stroke-width="4"/>
    <path d="M12 24h7l5-9 8 18 5-9h6" fill="none" stroke="${theme.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="70" y="33" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" fill="#FFFFFF" letter-spacing="1.8">MUNDO DO PROMPT</text>
  </g>`;
}

function topicKind(slide) {
  const text = `${slide.eyebrow || ""} ${slide.title} ${slide.body || ""} ${slide.prompt || ""}`.toLowerCase();
  if (/\b(vídeo|vídeos|capcut|reels?|edição)\b/.test(text)) return "video";
  if (/\b(dinheiro|custos?|economia|economizar|assinaturas?|preço|lucro)\b/.test(text)) return "money";
  if (/\b(carreira|currículo|emprego|entrevista|linkedin)\b/.test(text)) return "career";
  if (/\b(estudo|estudar|aprender|aulas?|idioma|duolingo)\b/.test(text)) return "study";
  if (/\b(viagem|roteiro|destino|passagem)\b/.test(text)) return "travel";
  if (/\b(conteúdo|marketing|vendas?|clientes?|posts?)\b/.test(text)) return "marketing";
  if (/\b(decisão|decisões|comparar|comparação|critério|escolha|premissa|premissas)\b/.test(text)) return "decision";
  if (/\b(notícia|notícias|lançou|lançamento|atualização)\b|novo recurso/.test(text)) return "news";
  return "prompt";
}

function illustration(slide, x = 540, y = 870, scale = 1) {
  const kind = topicKind(slide);
  const a = theme.accent;
  const b = theme.accent2;
  const common = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const art = {
    video: `<rect x="-190" y="-105" width="380" height="220" rx="28" fill="${theme.card}" stroke="${a}" stroke-width="6"/><path d="M-45-55 75 5-45 65z" fill="${b}"/><path d="M-160 145h320M-90 128v34M15 128v34M110 128v34" ${common} stroke="${a}" stroke-width="8"/>`,
    money: `<path d="M-170-70h340v220h-340z" fill="${theme.card}" stroke="${a}" stroke-width="6"/><circle cx="0" cy="40" r="62" fill="none" stroke="${b}" stroke-width="9"/><path d="M18-5c-48-25-75 40-18 45 58 5 32 71-23 43M0-28v132" ${common} stroke="${b}" stroke-width="8"/><path d="M-145-35h60M85 115h60" ${common} stroke="${a}" stroke-width="7"/>`,
    career: `<rect x="-165" y="-120" width="330" height="300" rx="26" fill="${theme.card}" stroke="${a}" stroke-width="6"/><circle cx="-85" cy="-35" r="35" fill="none" stroke="${b}" stroke-width="7"/><path d="M-135 35c18-38 82-38 100 0M15-52h108M15-5h108M-130 88h255M-130 132h180" ${common} stroke="${a}" stroke-width="7"/>`,
    study: `<path d="M0-90c-55-40-125-42-180-20v230c58-20 122-16 180 22 58-38 122-42 180-22v-230c-55-22-125-20-180 20z" fill="${theme.card}" stroke="${a}" stroke-width="6"/><path d="M0-90v232M-145-55h95M-145-15h105M50-55h95M40-15h105" ${common} stroke="${b}" stroke-width="6"/>`,
    travel: `<circle cx="0" cy="0" r="145" fill="${theme.card}" stroke="${a}" stroke-width="6"/><path d="M-145 0h290M0-145c75 78 75 212 0 290M0-145c-75 78-75 212 0 290M-115-85h230M-115 85h230" ${common} stroke="${a}" stroke-width="5"/><path d="m-28-10 125-55-60 120-15-46z" fill="${b}"/>`,
    marketing: `<path d="M-180-25 40-105v225l-220-80z" fill="${theme.card}" stroke="${a}" stroke-width="7"/><path d="M40-50c62 18 62 97 0 115M-125 58l22 104h75L-55 85" ${common} stroke="${b}" stroke-width="9"/><circle cx="126" cy="-80" r="15" fill="${b}"/><circle cx="155" cy="5" r="12" fill="${a}"/>`,
    decision: `<path d="M0-135v275M-130-90h260M-105-90-175 38h140zM105-90 35 38h140zM-90 150h180" ${common} stroke="${a}" stroke-width="8"/><circle cx="0" cy="-142" r="17" fill="${b}"/><path d="m-28 95 20 20 48-58" ${common} stroke="${b}" stroke-width="10"/>`,
    news: `<rect x="-185" y="-115" width="370" height="260" rx="24" fill="${theme.card}" stroke="${a}" stroke-width="6"/><rect x="-145" y="-72" width="118" height="92" rx="12" fill="${b}"/><path d="M12-65h125M12-22h125M-145 62h282M-145 105h205" ${common} stroke="${a}" stroke-width="8"/>`,
    prompt: `<rect x="-195" y="-115" width="390" height="260" rx="30" fill="${theme.card}" stroke="${a}" stroke-width="6"/><circle cx="-145" cy="-70" r="10" fill="${a}"/><circle cx="-112" cy="-70" r="10" fill="${b}"/><path d="M-145-20h150M-145 27h250M-145 74h195" ${common} stroke="${a}" stroke-width="9"/><path d="m118 68 68 28-43 15-18 42z" fill="${b}"/>`,
  }[kind];
  return `<g transform="translate(${x} ${y}) scale(${scale})">${art}</g>`;
}

function background(index) {
  const pattern = category === "news"
    ? `<path d="M0 1090 1080 780V1350H0z" fill="${theme.accent}" opacity=".05"/>`
    : category === "guide"
      ? `<path d="M80 1110c250-180 420 80 640-120 120-110 210-55 300-160" fill="none" stroke="${theme.accent}" stroke-width="5" stroke-dasharray="14 18" opacity=".12"/>`
      : `<circle cx="945" cy="205" r="360" fill="${theme.accent}" opacity=".07"/><circle cx="110" cy="1210" r="300" fill="${theme.accent2}" opacity=".06"/>`;
  return `<defs><linearGradient id="bg${index}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${theme.bg1}"/><stop offset="1" stop-color="${theme.bg2}"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#bg${index})"/>${pattern}`;
}

function footer(index) {
  const isLast = index === slides.length - 1;
  return `<g>
    <line x1="66" y1="1245" x2="1014" y2="1245" stroke="${theme.accent}" stroke-opacity=".22"/>
    <text x="68" y="1294" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="${theme.soft}" letter-spacing="1.8">${isLast ? "SALVE • COMPARTILHE" : "DESLIZE PARA O LADO  →"}</text>
    <rect x="914" y="1260" width="100" height="52" rx="26" fill="${theme.card}" stroke="${theme.accent}" stroke-width="2"/>
    <text x="964" y="1295" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" fill="${theme.accent}">${index + 1}/${slides.length}</text>
  </g>`;
}

function promptCard(slide, startY) {
  const labelHeight = 48;
  const maxHeight = 1230 - startY;
  let size = 29;
  let lines = wrapPixels(slide.prompt, 840, size);
  while ((lines.length * Math.round(size * 1.42) + 120 > maxHeight || lines.length > 12) && size > 23) {
    size -= 1;
    lines = wrapPixels(slide.prompt, 840, size);
  }
  const lineHeight = Math.round(size * 1.42);
  const height = Math.max(260, lines.length * lineHeight + 120);
  if (height > maxHeight) throw new Error(`O prompt não cabe no layout.`);
  return `<rect x="66" y="${startY}" width="948" height="${height}" rx="30" fill="${theme.card}" stroke="${theme.accent}" stroke-opacity=".65" stroke-width="2"/>
    <rect x="96" y="${startY + 28}" width="126" height="${labelHeight}" rx="24" fill="${theme.accent}"/>
    <text x="159" y="${startY + 61}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="900" fill="${theme.bg1}" letter-spacing="1.5">PROMPT</text>
    ${textBlock(lines, 104, startY + 120, size, lineHeight, 400, "#F4F8FC")}`;
}

function baseSvg(slide, index) {
  const isCover = slide.type === "cover";
  const isCta = slide.type === "cta";
  const titleFit = fitText(slide.title.toUpperCase(), 930, isCover ? 72 : 56, isCover ? 48 : 40, isCover ? 4 : 3);
  const titleY = isCover ? 278 : 258;
  const titleBottom = titleY + (titleFit.lines.length - 1) * titleFit.lineHeight + titleFit.size;
  const bodyFit = slide.body ? fitText(slide.body, isCta ? 820 : 900, isCover ? 34 : 33, 27, isCover ? 5 : 6) : { lines: [], size: 32, lineHeight: 46 };
  const bodyY = titleBottom + (isCover ? 62 : 52);
  const bodyBottom = bodyY + Math.max(0, bodyFit.lines.length - 1) * bodyFit.lineHeight + bodyFit.size;
  const eyebrow = escapeXml(slide.eyebrow || (isCover ? theme.label : isCta ? "PRÓXIMO PASSO" : "APLIQUE AGORA"));
  let content = `${brandMark()}
    <rect x="66" y="160" width="${Math.min(520, 34 + estimatedWidth(eyebrow, 22, 2.3))}" height="48" rx="24" fill="${theme.card}" stroke="${theme.accent}" stroke-opacity=".7"/>
    <text x="90" y="191" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" fill="${theme.accent}" letter-spacing="2.3">${eyebrow}</text>
    ${textBlock(titleFit.lines, 66, titleY, titleFit.size, titleFit.lineHeight, 900)}
    ${bodyFit.lines.length ? textBlock(bodyFit.lines, isCta ? 540 : 70, bodyY, bodyFit.size, bodyFit.lineHeight, 400, theme.soft, isCta ? "middle" : "start") : ""}`;

  if (slide.prompt) {
    content += promptCard(slide, bodyBottom + 58);
  } else if (isCta) {
    content += `${illustration(slide, 540, 790, .72)}
      <rect x="126" y="1010" width="828" height="128" rx="36" fill="${theme.accent}"/>
      <text x="540" y="1064" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="29" font-weight="900" fill="${theme.bg1}">${escapeXml(slide.cta || "SALVE E COMPARTILHE")}</text>
      <text x="540" y="1105" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${theme.bg1}">@mundodoprompt</text>`;
  } else {
    const artY = Math.max(800, bodyBottom + 235);
    content += illustration(slide, 540, Math.min(940, artY), isCover ? .92 : .78);
  }

  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">${background(index)}${content}${footer(index)}</svg>`;
}

for (const [index, slide] of slides.entries()) {
  const svg = baseSvg(slide, index);
  const filename = `slide-${String(index + 1).padStart(2, "0")}.jpg`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toFile(path.join(outputDir, filename));
  console.log(`Gerado: ${filename}`);
}

fs.writeFileSync("public/index.html", "<!doctype html><meta charset='utf-8'><title>Mundo do Prompt</title>");
fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({ caption, count: slides.length, category }, null, 2));

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `carousel_id=${carouselId}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `slide_count=${slides.length}\n`);
}
