import fs from "node:fs";

const API_BASE = "https://graph.instagram.com/v26.0";
const token = process.env.INSTAGRAM_ACCESS_TOKEN;
const userId = process.env.INSTAGRAM_USER_ID;
const pagesBaseUrl = process.env.PAGES_BASE_URL;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!token) throw new Error("O secret INSTAGRAM_ACCESS_TOKEN não está configurado.");
if (!userId) throw new Error("O secret INSTAGRAM_USER_ID não está configurado.");
if (!pagesBaseUrl) throw new Error("PAGES_BASE_URL não foi informado.");

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const body = event.issue?.body?.trim();
const carouselId = String(event.issue?.number || "");
if (!body || !carouselId) throw new Error("Issue de publicação inválida.");

const payload = JSON.parse(body);
const caption = payload.caption;
const slides = payload.slides;
if (typeof caption !== "string" || !caption.trim() || [...caption].length > 2200) {
  throw new Error("Legenda inválida ou acima de 2.200 caracteres.");
}
if (!Array.isArray(slides) || slides.length < 2 || slides.length > 10) {
  throw new Error("O carrossel precisa conter de 2 a 10 slides.");
}

const base = pagesBaseUrl.endsWith("/") ? pagesBaseUrl : `${pagesBaseUrl}/`;
const imageUrls = slides.map((_, index) => `${base}carousels/${carouselId}/slide-${String(index + 1).padStart(2, "0")}.jpg`);

async function request(path, params = {}, method = "POST", attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const url = new URL(`${API_BASE}/${path}`);
    const form = new URLSearchParams({ ...params, access_token: token });
    const options = method === "GET" ? {} : { method, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form };
    if (method === "GET") for (const [key, value] of form) url.searchParams.set(key, value);
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (response.ok && !data.error) return data;
    const message = data.error?.message || `HTTP ${response.status}`;
    lastError = new Error(`Instagram API: ${message}`);
    const transient = response.status === 429 || response.status >= 500 || /not ready|processing|temporarily/i.test(message);
    if (!transient || attempt === attempts) break;
    await wait(Math.min(attempt * 5000, 20000));
  }
  throw lastError;
}

async function waitForPublicImage(url) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (response?.ok && /image\/jpeg/i.test(response.headers.get("content-type") || "")) return;
    await wait(5000);
  }
  throw new Error(`A imagem pública ainda não está disponível: ${url}`);
}

async function waitForContainer(id) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const data = await request(id, { fields: "status_code,status" }, "GET");
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      throw new Error(`Falha no processamento do container ${id}: ${data.status || data.status_code}`);
    }
    await wait(5000);
  }
  throw new Error(`O container ${id} não ficou pronto dentro do tempo esperado.`);
}

const profile = await request("me", { fields: "user_id,username" }, "GET");
if (String(profile.user_id || profile.id) !== String(userId)) {
  throw new Error(`O token pertence a outra conta do Instagram (${profile.username || "desconhecida"}).`);
}

for (const imageUrl of imageUrls) await waitForPublicImage(imageUrl);

const childIds = [];
for (const imageUrl of imageUrls) {
  const child = await request(`${userId}/media`, { image_url: imageUrl, is_carousel_item: "true" });
  await waitForContainer(child.id);
  childIds.push(child.id);
}

const parent = await request(`${userId}/media`, {
  media_type: "CAROUSEL",
  children: childIds.join(","),
  caption: caption.trim(),
});
await waitForContainer(parent.id);

const published = await request(`${userId}/media_publish`, { creation_id: parent.id });
const media = await request(published.id, { fields: "permalink" }, "GET");

let storyStatus = "não publicado";
let storyId = "";
try {
  const storyUrl = `${base}carousels/${carouselId}/story.jpg`;
  await waitForPublicImage(storyUrl);
  const storyContainer = await request(`${userId}/media`, {
    image_url: storyUrl,
    media_type: "STORIES",
  });
  await waitForContainer(storyContainer.id);
  const storyPublished = await request(`${userId}/media_publish`, { creation_id: storyContainer.id });
  storyId = storyPublished.id || "";
  storyStatus = "publicado";
  console.log(`Story publicado: ${storyId}`);
} catch (error) {
  storyStatus = `falhou: ${error.message}`;
  console.warn(`Carrossel publicado, mas o Story não foi enviado: ${error.message}`);
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `post_id=${published.id}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `permalink=${media.permalink || ""}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `story_id=${storyId}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `story_status=${storyStatus.replaceAll("\n", " ")}\n`);
}

console.log(`Carrossel publicado: ${media.permalink || published.id}`);
