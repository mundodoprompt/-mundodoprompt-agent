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
const visualStyles = new Set(["cinematic", "editorial", "annotated", "newsroom", "prompt-card", "business"]);
const requestedVisualStyle = String(payload.visual_style || "").toLowerCase();

if (typeof caption !== "string" || !caption.trim() || [...caption].length > 2200) {
  throw new Error('"caption" deve ser um texto entre 1 e 2.200 caracteres.');
}
if (!Array.isArray(slides) || slides.length < 2 || slides.length > 10) {
  throw new Error('"slides" deve conter de 2 a 10 itens.');
}
if (requestedCategory && !categories.has(requestedCategory)) {
  throw new Error('"category" deve ser prompt, news, guide, curiosity ou business.');
}
if (requestedVisualStyle && !visualStyles.has(requestedVisualStyle)) {
  throw new Error('"visual_style" inválido.');
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
const visualStyle = requestedVisualStyle || ({news:"newsroom", guide:"annotated", curiosity:"editorial", business:"business", prompt:"prompt-card"}[category]);

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
  const desk = `<path d="M-330 135h660v42h-660z" fill="#111827"/><path d="M-260 177h28v130h-28M232 177h28v130h-28" stroke="#111827" stroke-width="18"/>`;
  const person = `<circle cx="-150" cy="-80" r="57" fill="#E9B89A"/><path d="M-205-33q55-34 110 0l30 190h-190z" fill="${b}"/><path d="M-195-100q40-68 91-15l12 34q-55-25-113 4z" fill="#161B2C"/><path d="M-105 20 5 86M-188 25-275 92" stroke="#E9B89A" stroke-width="30" stroke-linecap="round"/>`;
  const laptop = `<path d="M-20-38h220v145H-20z" rx="12" fill="${theme.card}" stroke="${a}" stroke-width="7"/><path d="M-52 110h285l-28 35H-25z" fill="#DDE7F1"/><circle cx="90" cy="35" r="18" fill="${a}" opacity=".8"/>`;
  const scenes = {
    video: `${person}${desk}${laptop}<rect x="80" y="-130" width="250" height="155" rx="18" fill="#111827" stroke="${a}" stroke-width="7"/><path d="m170-93 82 41-82 42z" fill="${b}"/><path d="M72 62h245M112 48v28M190 48v28M270 48v28" stroke="${a}" stroke-width="8"/>`,
    money: `${person}${desk}${laptop}<g transform="translate(220 -75) rotate(7)"><rect x="-72" y="-45" width="145" height="90" rx="12" fill="${b}"/><circle r="28" fill="none" stroke="#0B1628" stroke-width="7"/><path d="M-9-14c24-12 36 17 5 20-28 2-13 31 12 20" fill="none" stroke="#0B1628" stroke-width="6"/></g><path d="M170-120l35-45 35 34 42-72" fill="none" stroke="${a}" stroke-width="10"/>`,
    career: `${person}${desk}${laptop}<rect x="180" y="-160" width="155" height="205" rx="16" fill="#F7FBFF"/><circle cx="230" cy="-105" r="26" fill="${b}"/><path d="M275-116h38M275-91h38M205-55h105M205-25h82" stroke="#17223A" stroke-width="8"/><path d="m225 5 18 18 46-55" fill="none" stroke="${a}" stroke-width="11"/>`,
    study: `${person}${desk}${laptop}<path d="M145-155q85-38 170 0V65q-85-35-170 0z" fill="#FFF8E8" stroke="${a}" stroke-width="7"/><path d="M230-170V50M170-105h42M248-105h42M170-65h38M248-65h42" stroke="${b}" stroke-width="7"/><circle cx="282" cy="92" r="34" fill="${b}"/><path d="m270 92 10 10 20-27" fill="none" stroke="#111827" stroke-width="7"/>`,
    travel: `${person}${desk}${laptop}<path d="M175-170h130v235H175z" rx="18" fill="#F7FBFF" stroke="${a}" stroke-width="7"/><path d="m195-105 90-42-42 92-15-34z" fill="${b}"/><path d="M196-20h88M196 10h63" stroke="#17223A" stroke-width="8"/><path d="M-300 95h80v92h-80z" fill="${b}"/><path d="M-280 95V65h40v30" fill="none" stroke="${a}" stroke-width="8"/>`,
    marketing: `${person}${desk}${laptop}<path d="M170-135 300-180V10l-130-45z" fill="${b}" stroke="${a}" stroke-width="7"/><path d="M300-125q75 30 0 78M188 0l18 80h55l-23-65" fill="none" stroke="${a}" stroke-width="10"/><circle cx="328" cy="45" r="18" fill="${a}"/><circle cx="288" cy="83" r="12" fill="${b}"/>`,
    decision: `${person}${desk}${laptop}<path d="M225-165v205M130-110h190M150-110 105-15h90zM300-110 255-15h90z" fill="none" stroke="${a}" stroke-width="9"/><path d="m185 72 25 25 58-70" fill="none" stroke="${b}" stroke-width="13"/>`,
    news: `${person}${desk}${laptop}<rect x="145" y="-170" width="205" height="205" rx="18" fill="#F7FBFF" transform="rotate(5 247 -67)"/><rect x="170" y="-135" width="75" height="58" fill="${b}"/><path d="M260-125h65M260-95h65M170-50h155M170-18h110" stroke="#17223A" stroke-width="8"/><rect x="128" y="-205" width="122" height="38" rx="19" fill="${a}"/><text x="189" y="-179" text-anchor="middle" font-family="Arial" font-size="20" font-weight="900" fill="#07111F">AGORA</text>`,
    prompt: `${person}${desk}${laptop}<rect x="145" y="-160" width="210" height="190" rx="22" fill="#F7FBFF" stroke="${a}" stroke-width="7"/><path d="M178-112h115M178-72h145M178-32h105" stroke="#17223A" stroke-width="9" stroke-linecap="round"/><path d="m288-5 70 28-45 14-18 42z" fill="${b}"/>`
  };
  return `<g transform="translate(${x} ${y}) scale(${scale})">${scenes[kind] || scenes.prompt}</g>`;
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
  const eyebrow = escapeXml(slide.eyebrow || (isCover ? theme.label : isCta ? "PRÓXIMO PASSO" : "APLIQUE AGORA"));

  if (isCover) {
    const titleFit = fitText(slide.title.toUpperCase(), 900, 88, 56, 4);
    const titleY = 270;
    const lineBg = titleFit.lines.map((line, i) => {
      const w = Math.min(930, estimatedWidth(line, titleFit.size) + 38);
      const y = titleY - titleFit.size + i * titleFit.lineHeight - 9;
      return i === 1 || (titleFit.lines.length === 1 && i === 0)
        ? `<rect x="55" y="${y}" width="${w}" height="${titleFit.size + 22}" rx="8" fill="${theme.accent}" opacity=".95"/>`
        : "";
    }).join("");
    const titleText = titleFit.lines.map((line, i) => {
      const fill = i === 1 || (titleFit.lines.length === 1 && i === 0) ? theme.bg1 : "#FFFFFF";
      return `<text x="70" y="${titleY + i * titleFit.lineHeight}" font-family="Arial Narrow, Arial, sans-serif" font-size="${titleFit.size}" font-weight="900" fill="${fill}" letter-spacing="-1.5">${escapeXml(line)}</text>`;
    }).join("");
    const support = slide.body ? fitText(slide.body, 820, 31, 25, 2) : {lines:[]};
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">${background(index)}
      ${brandMark()}
      <rect x="66" y="142" width="${Math.min(500, 38 + estimatedWidth(eyebrow, 21, 2))}" height="44" rx="8" fill="${theme.accent2}"/>
      <text x="86" y="171" font-family="Arial" font-size="21" font-weight="900" fill="#07111F" letter-spacing="2">${eyebrow}</text>
      ${lineBg}${titleText}
      ${support.lines.length ? textBlock(support.lines, 70, titleY + titleFit.lines.length * titleFit.lineHeight + 34, support.size, support.lineHeight, 700, theme.soft) : ""}
      <path d="M705 598c165-55 292 75 250 230-45 165-240 260-430 174-135-62-94-301 180-404z" fill="${theme.accent}" opacity=".10"/>
      ${illustration(slide, 565, 920, 1.12)}
      <text x="70" y="1215" font-family="Arial" font-size="22" font-weight="800" fill="${theme.soft}">DESLIZE PARA VER  →</text>
      ${footer(index)}
    </svg>`;
  }

  const titleFit = fitText(slide.title.toUpperCase(), 930, 60, 42, 3);
  const titleY = 265;
  const titleBottom = titleY + (titleFit.lines.length - 1) * titleFit.lineHeight + titleFit.size;
  const bodyFit = slide.body ? fitText(slide.body, isCta ? 820 : 900, 35, 28, 6) : { lines: [], size: 32, lineHeight: 46 };
  const bodyY = titleBottom + 48;
  const bodyBottom = bodyY + Math.max(0, bodyFit.lines.length - 1) * bodyFit.lineHeight + bodyFit.size;
  let content = `${brandMark()}
    <text x="68" y="178" font-family="Arial" font-size="22" font-weight="900" fill="${theme.accent}" letter-spacing="2.1">${eyebrow}</text>
    ${textBlock(titleFit.lines, 66, titleY, titleFit.size, titleFit.lineHeight, 900)}
    ${bodyFit.lines.length ? textBlock(bodyFit.lines, isCta ? 540 : 70, bodyY, bodyFit.size, bodyFit.lineHeight, 500, theme.soft, isCta ? "middle" : "start") : ""}`;

  if (slide.prompt) {
    content += promptCard(slide, Math.max(520, bodyBottom + 48));
  } else if (isCta) {
    content += `${illustration(slide, 540, 790, .78)}
      <rect x="100" y="1000" width="880" height="142" rx="28" fill="${theme.accent}"/>
      <text x="540" y="1060" text-anchor="middle" font-family="Arial" font-size="31" font-weight="900" fill="${theme.bg1}">${escapeXml(slide.cta || "SALVE • COMPARTILHE • SIGA")}</text>
      <text x="540" y="1107" text-anchor="middle" font-family="Arial" font-size="25" font-weight="800" fill="${theme.bg1}">@mundodoprompt</text>`;
  } else {
    content += illustration(slide, 540, Math.min(930, Math.max(770, bodyBottom + 240)), .88);
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
fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({ caption, count: slides.length, category, visualStyle, visualBrief: payload.visual_brief || "" }, null, 2));

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `carousel_id=${carouselId}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `slide_count=${slides.length}\n`);
}
