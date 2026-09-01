import fs from "node:fs";

const API_BASE = "https://graph.threads.net/v1.0";
const token = process.env.THREADS_ACCESS_TOKEN;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!token) throw new Error("O secret THREADS_ACCESS_TOKEN não está configurado.");

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const body = event.issue?.body?.trim();
if (!body) throw new Error("A issue não contém o JSON da publicação.");

function extractJson(value) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : value;
}

const payload = JSON.parse(extractJson(body));
const parts = payload.parts;
const initialReplyToId = payload.reply_to_id ? String(payload.reply_to_id) : undefined;

if (!Array.isArray(parts) || parts.length < 1 || parts.length > 20) {
  throw new Error('"parts" deve conter de 1 a 20 textos.');
}
if (initialReplyToId && !/^\d+$/.test(initialReplyToId)) {
  throw new Error('"reply_to_id" deve ser um ID numérico do Threads.');
}

for (const [index, part] of parts.entries()) {
  if (typeof part !== "string" || !part.trim()) {
    throw new Error(`Parte ${index + 1} está vazia ou não é texto.`);
  }
  const length = [...part].length;
  if (length > 500) {
    throw new Error(`Parte ${index + 1} possui ${length} caracteres; o limite é 500.`);
  }
}

async function api(path, params, maxAttempts = 4) {
  const url = new URL(`${API_BASE}/${path}`);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const form = new URLSearchParams({ ...params, access_token: token });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && !data.error) return data;

    const message = data.error?.message || `HTTP ${response.status}`;
    lastError = new Error(`Threads API: ${message}`);
    const transient =
      response.status === 429 ||
      response.status >= 500 ||
      /requested resource does not exist/i.test(message) ||
      /not ready|processing/i.test(message);

    if (!transient || attempt === maxAttempts) break;

    const delay = Math.min(5000 * attempt, 20000);
    console.log(`Tentativa ${attempt}/${maxAttempts} ainda não ficou pronta; aguardando ${delay / 1000}s.`);
    await wait(delay);
  }

  throw lastError;
}

async function publishText(text, replyToId) {
  const creation = await api("me/threads", {
    media_type: "TEXT",
    text: text.trim(),
    ...(replyToId ? { reply_to_id: replyToId } : {}),
  });

  await wait(4000);
  const published = await api("me/threads_publish", { creation_id: creation.id }, 6);
  return published.id;
}

async function preflight() {
  const url = new URL(`${API_BASE}/me`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(`Falha na validação do token: ${data.error?.message || response.status}`);
  }
}

async function deletePost(id) {
  const url = new URL(`${API_BASE}/${id}`);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    console.error(`Não foi possível remover ${id}: ${data.error?.message || response.status}`);
  }
}

await preflight();

let previousId = initialReplyToId;
let firstPublishedId;
const publishedIds = [];

try {
  for (const [index, part] of parts.entries()) {
    const publishedId = await publishText(part, previousId);
    publishedIds.push(publishedId);
    firstPublishedId ||= publishedId;
    previousId = publishedId;
    console.log(`Parte ${index + 1}/${parts.length} publicada: ${publishedId}`);
    if (index < parts.length - 1) await wait(5000);
  }
} catch (error) {
  console.error("Falha definitiva. Removendo as partes desta tentativa para não deixar conteúdo cortado.");
  for (const id of [...publishedIds].reverse()) {
    await deletePost(id);
  }
  throw error;
}

let permalink = "";
try {
  const url = new URL(`${API_BASE}/${firstPublishedId}`);
  url.searchParams.set("fields", "permalink");
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const data = await response.json();
  permalink = data.permalink || "";
} catch {}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `root_id=${firstPublishedId}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `permalink=${permalink}\n`);
}
