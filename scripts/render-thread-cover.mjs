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
  throw new Error('\"parts\" precisa conter pelo menos um texto.');
}

const firstPart = String(payload.parts[0]).trim();
const allText = payload.parts.join(" ").toLowerCase();
const sections = firstPart.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
const title = sections[0].replace(/^[^\p{L}\p{N}]+/u, "").toUpperCase();
const subtitle = sections.slice(1).join(" ").replace(/use estes prompts.*$/i, "").trim();
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
    } else line = candidate;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.,;:!?…]+$/, "")}…`;
  return visible;
}

function textBlock(lines, x, y, size, lineHeight, weight, fill) {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function detectScene(text) {
  const rules = [
    ["meeting", /reuni[aã]o|ata|pauta|equipe|respons[aá]vel|decis[aã]o/],
    ["design", /canva|design|imagem|visual|foto|criativ|layout|marca/],
    ["money", /dinheiro|econom|assinatura|pre[cç]o|custo|finan[cç]|venda/],
    ["travel", /viagem|passagem|hotel|voo|roteiro|destino/],
    ["study", /estud|prova|aprender|aula|livro|carreira|curr[ií]culo/],
    ["marketing", /marketing|conte[uú]do|campanha|cliente|oferta|engaj|post/],
    ["automation", /automat|fluxo|processo|tarefas repetitivas|agente/],
  ];
  return rules.find(([, regex]) => regex.test(text))?.[0] || "work";
}

const scene = detectScene(allText);
const sceneMeta = {
  meeting: ["DA CONVERSA À AÇÃO", "#31D5FF", "#755CFF"],
  design: ["DO BRIEFING À ARTE", "#FF4FD8", "#31D5FF"],
  money: ["MENOS DESPERDÍCIO", "#55E59A", "#FFD166"],
  travel: ["PLANEJE COM CLAREZA", "#31D5FF", "#FF9B57"],
  study: ["APRENDA MELHOR", "#9B7BFF", "#31D5FF"],
  marketing: ["IDEIA QUE VIRA AÇÃO", "#FF6B6B", "#FFD166"],
  automation: ["TRABALHO EM FLUXO", "#31D5FF", "#55E59A"],
  work: ["PROMPT NA PRÁTICA", "#31D5FF", "#755CFF"],
}[scene];
const [eyebrow, accent, accent2] = sceneMeta;

function person(x, y, shirt, skin = "#C98562", flip = 1) {
  return `<g transform="translate(${x} ${y}) scale(${flip} 1)">
    <ellipse cx="0" cy="0" rx="42" ry="47" fill="${skin}"/>
    <path d="M-42-5q5-55 47-45 33 7 36 42-20-16-38-20-22 17-45 23Z" fill="#17213A"/>
    <path d="M-69 125q7-91 69-91t69 91Z" fill="${shirt}"/>
    <path d="M-18 37q18 14 36 0v24q-18 16-36 0Z" fill="${skin}" opacity=".92"/>
    <circle cx="-14" cy="2" r="3" fill="#17213A"/><circle cx="14" cy="2" r="3" fill="#17213A"/>
    <path d="M-10 20q10 7 20 0" fill="none" stroke="#6E3F32" stroke-width="3" stroke-linecap="round"/>
  </g>`;
}

function card(x, y, w, h, color, icon = "check") {
  const mark = icon === "check"
    ? `<path d="M22 41l12 12 23-28" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
    : icon === "image"
      ? `<rect x="18" y="20" width="48" height="40" rx="7" fill="none" stroke="${color}" stroke-width="5"/><circle cx="32" cy="33" r="6" fill="${color}"/><path d="m22 55 13-14 10 10 8-8 11 12" fill="none" stroke="${color}" stroke-width="4"/>`
      : `<circle cx="40" cy="40" r="21" fill="none" stroke="${color}" stroke-width="5"/><path d="M40 27v15l12 8" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
  return `<g transform="translate(${x} ${y})" filter="url(#softShadow)"><rect width="${w}" height="${h}" rx="24" fill="#102746" stroke="${color}" stroke-width="2"/>${mark}<rect x="82" y="23" width="${w-108}" height="11" rx="6" fill="#EAF5FF" opacity=".82"/><rect x="82" y="48" width="${Math.max(50,w-145)}" height="9" rx="5" fill="#EAF5FF" opacity=".28"/></g>`;
}

function meetingScene() {
  return `<g transform="translate(72 740)">
    <path d="M114 110C250 10 650 10 830 132" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="9 12" opacity=".45"/>
    <g transform="translate(35 40)"><rect width="210" height="110" rx="34" fill="#152F51" stroke="#355473" stroke-width="2"/><circle cx="55" cy="52" r="10" fill="${accent}"/><circle cx="90" cy="52" r="10" fill="${accent2}"/><circle cx="125" cy="52" r="10" fill="#55E59A"/><path d="M90 110l22 35 24-35" fill="#152F51"/></g>
    ${card(640,30,260,90,accent,"check")}${card(675,140,225,90,accent2,"clock")}
    <ellipse cx="470" cy="345" rx="360" ry="92" fill="#173253" stroke="#31557A" stroke-width="4"/>
    <rect x="204" y="324" width="180" height="18" rx="9" fill="#FFD166"/><rect x="405" y="324" width="130" height="18" rx="9" fill="#FF7A90"/><rect x="555" y="324" width="155" height="18" rx="9" fill="#55E59A"/>
    ${person(255,220,"#2B70D8")}${person(690,220,"#754FD4","#8F5B42",-1)}
    <g transform="translate(430 210)"><rect width="130" height="105" rx="18" fill="#071426" stroke="${accent}" stroke-width="3"/><path d="M25 30h80M25 52h60M25 74h70" stroke="#CFEAFF" stroke-width="7" stroke-linecap="round" opacity=".75"/></g>
  </g>`;
}

function designScene() {
  return `<g transform="translate(72 730)">
    <g transform="translate(395 35)" filter="url(#softShadow)"><rect width="500" height="315" rx="30" fill="#0A172B" stroke="#385A7C" stroke-width="4"/><rect x="28" y="30" width="444" height="232" rx="18" fill="#162C4A"/>
      <rect x="52" y="55" width="150" height="180" rx="16" fill="#243957"/><path d="M70 206 108 154l33 35 31-55 17 72Z" fill="${accent}" opacity=".78"/><circle cx="160" cy="92" r="23" fill="${accent2}"/>
      <rect x="228" y="58" width="206" height="24" rx="12" fill="#F4F8FF"/><rect x="228" y="101" width="160" height="15" rx="8" fill="#A9BCD2" opacity=".6"/><rect x="228" y="145" width="72" height="72" rx="16" fill="${accent}"/><rect x="317" y="145" width="117" height="72" rx="16" fill="${accent2}" opacity=".8"/>
      <path d="M190 315h120l28 58H162Z" fill="#183653"/></g>
    ${person(260,265,"#E64ABF","#C98562",-1)}
    <path d="M266 350q75-55 155-75" fill="none" stroke="#C98562" stroke-width="27" stroke-linecap="round"/>
    <g transform="translate(38 35)"><circle cx="45" cy="45" r="38" fill="#FF4FD8"/><circle cx="119" cy="45" r="38" fill="#31D5FF"/><circle cx="82" cy="110" r="38" fill="#FFD166"/></g>
    ${card(38,170,235,90,accent,"image")}
  </g>`;
}

function moneyScene() {
  return `<g transform="translate(72 740)">${person(245,250,"#218C67")}
    <g transform="translate(390 75)" filter="url(#softShadow)"><rect width="470" height="310" rx="34" fill="#102746" stroke="#2F5D71" stroke-width="3"/><path d="M55 235 145 165l75 42 105-125 90 46" fill="none" stroke="${accent}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><circle cx="325" cy="82" r="18" fill="${accent2}"/><rect x="55" y="58" width="150" height="20" rx="10" fill="#EAF5FF" opacity=".8"/><path d="M52 270h370" stroke="#66809C" stroke-width="3"/></g>
    <circle cx="300" cy="335" r="78" fill="none" stroke="${accent2}" stroke-width="14"/><path d="M355 390l62 62" stroke="${accent2}" stroke-width="20" stroke-linecap="round"/>
    ${card(630,8,260,90,accent,"check")}
  </g>`;
}

function travelScene() {
  return `<g transform="translate(72 745)">${person(250,250,"#F07B4E")}
    <path d="M360 125C510 12 710 5 850 130" fill="none" stroke="${accent}" stroke-width="5" stroke-dasharray="13 14"/>
    <path d="m830 100 70 20-66 26 18-22Z" fill="${accent}"/>
    <g transform="translate(440 100)" filter="url(#softShadow)"><path d="M0 40Q110-25 230 35t215 0v300q-110 65-225 5T0 345Z" fill="#153250" stroke="#41698A" stroke-width="4"/><path d="M65 110c75-85 105 95 180 0s90 90 165-5" fill="none" stroke="${accent2}" stroke-width="12" stroke-linecap="round"/><circle cx="67" cy="110" r="20" fill="${accent2}"/><circle cx="410" cy="105" r="20" fill="${accent}"/></g>
    <g transform="translate(120 330)"><rect width="175" height="170" rx="26" fill="#173858" stroke="${accent}" stroke-width="4"/><path d="M58 0v-40h60V0" fill="none" stroke="${accent}" stroke-width="12"/><circle cx="42" cy="183" r="12" fill="#89A4BD"/><circle cx="134" cy="183" r="12" fill="#89A4BD"/></g>
  </g>`;
}

function studyScene() {
  return `<g transform="translate(72 745)"><rect x="80" y="390" width="810" height="55" rx="20" fill="#173553"/>${person(300,260,"#6F55D8")}
    <g transform="translate(390 75)" filter="url(#softShadow)"><rect width="440" height="285" rx="30" fill="#102746" stroke="#3A5E80" stroke-width="4"/><path d="M58 76q90-45 160 12v140q-72-45-160-12Zm324 0q-90-45-160 12v140q72-45 160-12Z" fill="#EAF5FF" opacity=".9"/><path d="M220 88v140" stroke="${accent}" stroke-width="6"/><circle cx="220" cy="55" r="27" fill="${accent2}"/><path d="M220 34v42M199 55h42" stroke="#FFF" stroke-width="5"/></g>
    <rect x="112" y="330" width="125" height="32" rx="9" fill="#FF7A90"/><rect x="125" y="297" width="125" height="32" rx="9" fill="#31D5FF"/><rect x="105" y="264" width="125" height="32" rx="9" fill="#FFD166"/>
    ${card(650,342,240,90,accent,"check")}
  </g>`;
}

function marketingScene() {
  return `<g transform="translate(72 745)">${person(250,260,"#E85D68")}
    <g transform="translate(350 150) rotate(-8)"><path d="M0 70 240 0v175L0 110Z" fill="${accent2}"/><rect x="-55" y="67" width="75" height="48" rx="18" fill="#EAF5FF"/><path d="M225 42q90 45 0 92" fill="none" stroke="${accent}" stroke-width="13" stroke-linecap="round"/></g>
    <g transform="translate(650 45)" filter="url(#softShadow)"><rect width="245" height="170" rx="28" fill="#112A49" stroke="#3D6381" stroke-width="3"/><path d="M40 125 87 84l38 20 55-65 30 22" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round"/><circle cx="181" cy="39" r="13" fill="${accent2}"/></g>
    ${card(600,285,290,90,accent,"check")}
  </g>`;
}

function automationScene() {
  return `<g transform="translate(72 745)">${person(235,270,"#2870C8")}
    <g transform="translate(360 75)">${card(0,0,235,90,accent,"clock")}${card(315,0,235,90,accent2,"check")}${card(155,230,235,90,"#55E59A","check")}
      <path d="M235 45h70m35 60-80 105m130 0 85-105" fill="none" stroke="#6B89A7" stroke-width="5" stroke-dasharray="10 10"/>
      <g transform="translate(275 155)"><circle r="64" fill="#142F4F" stroke="${accent}" stroke-width="7"/><circle r="22" fill="${accent}"/><path d="M0-92v28M0 64v28M-92 0h28M64 0h28M-65-65l20 20M45 45l20 20M65-65 45-45M-45 45l-20 20" stroke="${accent}" stroke-width="12" stroke-linecap="round"/></g></g>
  </g>`;
}

function workScene() {
  return `<g transform="translate(72 745)">${person(260,260,"#336FD1")}
    <g transform="translate(405 85)" filter="url(#softShadow)"><rect width="450" height="300" rx="32" fill="#102746" stroke="#3B5F80" stroke-width="4"/><rect x="32" y="34" width="386" height="68" rx="18" fill="#0A1A30"/><text x="58" y="78" font-family="Arial" font-size="24" font-weight="700" fill="${accent}">&gt; descreva o resultado</text>${card(32,132,386,95,accent2,"check")}</g>
    <path d="M285 350q85-45 140-75" fill="none" stroke="#C98562" stroke-width="28" stroke-linecap="round"/>
  </g>`;
}

const illustration = {
  meeting: meetingScene,
  design: designScene,
  money: moneyScene,
  travel: travelScene,
  study: studyScene,
  marketing: marketingScene,
  automation: automationScene,
  work: workScene,
}[scene]();

const titleSize = title.length > 78 ? 57 : title.length > 55 ? 64 : 72;
const titleChars = title.length > 78 ? 29 : title.length > 55 ? 27 : 24;
const titleLines = wrap(title, titleChars, 3);
const subtitleLines = wrap(subtitle, 55, 2);
const titleY = 315;
const subtitleY = titleY + titleLines.length * Math.round(titleSize * 1.05) + 38;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050914"/><stop offset="0.58" stop-color="#09172F"/><stop offset="1" stop-color="#102349"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".24"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <filter id="softShadow"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity=".32"/></filter>
  </defs>
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <circle cx="950" cy="160" r="430" fill="url(#glow)"/>
  <circle cx="80" cy="1240" r="360" fill="${accent2}" opacity=".07"/>

  <g transform="translate(72 64)">
    <rect width="60" height="52" rx="15" fill="none" stroke="${accent}" stroke-width="5"/>
    <path d="M13 27h9l6-11 9 22 6-11h7" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="82" y="38" font-family="Arial, Helvetica, sans-serif" font-size="29" font-weight="800" fill="#FFF" letter-spacing="2">MUNDO DO PROMPT</text>
  </g>
  <text x="1008" y="98" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" fill="#91A6C2" letter-spacing="2">THREAD • @mundodoprompt</text>

  <g transform="translate(72 185)"><rect width="330" height="48" rx="24" fill="${accent}" opacity=".14"/><circle cx="27" cy="24" r="6" fill="${accent}"/><text x="48" y="32" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800" fill="${accent}" letter-spacing="2">${escapeXml(eyebrow)}</text></g>

  ${textBlock(titleLines,72,titleY,titleSize,Math.round(titleSize*1.05),900,"#F8FBFF")}
  ${subtitleLines.length ? textBlock(subtitleLines,76,subtitleY,28,40,400,"#BDD0E4") : ""}
  ${illustration}

  <g transform="translate(72 1260)"><rect width="255" height="58" rx="29" fill="${accent}"/><text x="28" y="38" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="900" fill="#061020">ABRA A THREAD</text><path d="M213 29h22m-10-10 10 10-10 10" fill="none" stroke="#061020" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>
  <text x="1008" y="1298" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" fill="#91A6C2">PROMPTS PRÁTICOS • SEM ENROLAÇÃO</text>
</svg>`;

const outputDir = path.join("public", "thread-covers", issueNumber);
fs.mkdirSync(outputDir, { recursive: true });
await sharp(Buffer.from(svg)).jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toFile(path.join(outputDir, "cover.jpg"));

if (!fs.existsSync("public/index.html")) fs.writeFileSync("public/index.html", "<!doctype html><meta charset='utf-8'><title>Mundo do Prompt</title>");
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `cover_path=thread-covers/${issueNumber}/cover.jpg\n`);
console.log(`Capa contextual (${scene}) gerada: ${outputDir}/cover.jpg`);
