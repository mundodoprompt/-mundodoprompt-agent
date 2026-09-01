import fs from "node:fs";

const API_BASE = "https://graph.threads.net/v1.0";
const token = process.env.THREADS_ACCESS_TOKEN;

if (!token) {
  throw new Error("O secret THREADS_ACCESS_TOKEN não está configurado.");
}

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const body = event.issue?.body?.trim();

if (!body) {
  throw new Error("A issue não contém o JSON da publicação.");
}

function extractJson(value) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1] : value;
}

const payload = JSON.parse(extractJson(body));
const parts = payload.parts;

if (!Array.isArray(parts) || parts.length < 1 || parts.length > 20) {
  throw new Error('"parts" deve conter de 1 a 20 textos.');
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

async function api(path, params, method = "POST") {
  const url = new URL(`${API_BASE}/${path}`);
  const form = new URLSearchParams({ ...params, access_token: token });

  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: method === "POST" ? form : undefined,
    });

    if (response.ok || (response.status < 500 && response.status !== 429)) break;
    await new Promise(resolve => setTimeout(resolve, attempt * 2000));
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const message = data.error?.message || `HTTP ${response.status}`;
    throw new Error(`Threads API: ${message}`);
  }

  return data;
}

async function publishText(text, replyToId) {
  const creation = await api("me/threads", {
    media_type: "TEXT",
    text: text.trim(),
    ...(replyToId ? { reply_to_id: replyToId } : {}),
  });

  const published = await api("me/threads_publish", {
    creation_id: creation.id,
  });

  return published.id;
}

let previousId;
let rootId;

for (const [index, part] of parts.entries()) {
  const publishedId = await publishText(part, previousId);
  rootId ||= publishedId;
  previousId = publishedId;
  console.log(`Parte ${index + 1}/${parts.length} publicada: ${publishedId}`);

  if (index < parts.length - 1) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

let permalink = "";
try {
  const url = new URL(`${API_BASE}/${rootId}`);
  url.searchParams.set("fields", "permalink");
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const data = await response.json();
  permalink = data.permalink || "";
} catch {
  // A publicação já foi concluída; o link é apenas informativo.
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `root_id=${rootId}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `permalink=${permalink}\n`);
}
