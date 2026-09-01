import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const defaultSourceDirectory = "/Users/m.koloskov/Desktop/Obsidian/koloskof/00. Контакты";
const sourceDirectory = path.resolve(process.argv[2] || defaultSourceDirectory);
const outputFile = path.resolve(process.argv[3] || path.join(projectRoot, "server/contacts-data.js"));

const categoryValues = new Set([
  "Analytics",
  "Business Development",
  "CEO",
  "Coach",
  "Design",
  "Development",
  "Editor",
  "Founder",
  "Government",
  "HR",
  "Investor",
  "Management",
  "Marketing",
  "Product",
  "Project",
  "PR",
  "Strategy",
  "Tracker",
]);
const statusValues = new Set(["Просмотрен", "Интересен для найма"]);
const metadataKeys = new Set(["facebook", "роль", "категория", "поле5", "поле6", "telegram"]);
const urlPattern = /https?:\/\/[^\s)<>]+/giu;

function compactWhitespace(value = "") {
  return value.replace(/\u00a0/gu, " ").replace(/[ \t]+/gu, " ").trim();
}

function cleanRole(value = "") {
  const cleaned = compactWhitespace(value).replace(/^[-–—]\s*/u, "");
  return /^https?:\/\//iu.test(cleaned) ? "" : cleaned;
}

function cleanNotes(lines) {
  const compacted = [];
  for (const line of lines) {
    const normalized = line.replace(/\u00a0/gu, " ").replace(/[ \t]+$/u, "");
    if (!normalized.trim() && !compacted.at(-1)?.trim()) continue;
    compacted.push(normalized);
  }
  while (compacted.length && !compacted.at(-1).trim()) compacted.pop();
  return compacted.join("\n").trim();
}

function linkLabel(url) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return "Ссылка";
  }
  if (hostname === "facebook.com" || hostname === "web.facebook.com") return "Facebook";
  if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) return "LinkedIn";
  if (hostname === "t.me" || hostname === "telegram.me") return "Telegram";
  if (hostname === "instagram.com") return "Instagram";
  if (hostname === "x.com" || hostname === "twitter.com") return "X";
  return "Сайт";
}

function contactLinks(contents) {
  const links = [];
  const seen = new Set();
  for (const match of contents.matchAll(urlPattern)) {
    const url = match[0].replace(/[.,;:]+$/u, "");
    const label = linkLabel(url);
    if (seen.has(url) || ["figma.com", "docs.google.com"].some((host) => {
      try { return new URL(url).hostname.toLowerCase().replace(/^www\./u, "") === host; } catch { return false; }
    })) continue;
    seen.add(url);
    links.push({ label, url });
  }
  return links.slice(0, 6);
}

function stableContactId(relativePath) {
  return createHash("sha256").update(relativePath).digest("hex").slice(0, 20);
}

async function collectMarkdownFiles(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "ru"))) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdownFiles(absolutePath, relativePath));
    if (entry.isFile() && entry.name.endsWith(".md")) files.push({ absolutePath, relativePath });
  }
  return files;
}

function parseContact({ contents, relativePath }) {
  const parts = relativePath.split(path.sep);
  const sourceName = path.basename(parts.at(-1), ".md").trim();
  if (/^(?:Без названия(?:\s|$)|[-–—]\s)/iu.test(sourceName)) return null;

  const company = compactWhitespace(parts.length > 1 ? parts[0] : "Не отсортированные");
  const fields = new Map();
  const noteLines = [];
  for (const line of contents.split(/\r?\n/u)) {
    const fieldMatch = line.match(/^\s*\*\*([^*]+):\*\*\s*(.*?)\s*$/u);
    if (!fieldMatch) {
      noteLines.push(line);
      continue;
    }
    const key = compactWhitespace(fieldMatch[1]);
    const normalizedKey = key.toLocaleLowerCase("ru");
    if (!fields.has(normalizedKey)) fields.set(normalizedKey, compactWhitespace(fieldMatch[2]));
    if (!metadataKeys.has(normalizedKey)) noteLines.push(line);
  }

  const rawCategory = fields.get("категория") || "";
  const rawStatus = fields.get("поле5") || "";
  const shiftedImport = categoryValues.has(sourceName) && Boolean(fields.get("роль"));
  if (categoryValues.has(sourceName) && !shiftedImport && !contents.trim()) return null;
  const name = shiftedImport ? compactWhitespace(fields.get("роль")) : sourceName;
  let role = shiftedImport ? cleanRole(rawStatus) : cleanRole(fields.get("роль") || "");
  if (!shiftedImport && !role && rawCategory && !categoryValues.has(rawCategory)) role = cleanRole(rawCategory);
  if (!shiftedImport && !role && rawStatus && !statusValues.has(rawStatus)) role = cleanRole(rawStatus);
  const category = shiftedImport
    ? (categoryValues.has(fields.get("поле6")) ? fields.get("поле6") : "")
    : (categoryValues.has(rawCategory) ? rawCategory : "");
  const status = shiftedImport
    ? (statusValues.has(fields.get("facebook")) ? fields.get("facebook") : "")
    : (statusValues.has(rawStatus) ? rawStatus : "");

  const links = contactLinks(contents);
  return {
    id: stableContactId(relativePath),
    name,
    company,
    role,
    category,
    status,
    links,
    notes: cleanNotes(noteLines),
  };
}

function dedupeKey(contact) {
  const socialLink = contact.links.find((link) => ["Facebook", "LinkedIn", "Telegram"].includes(link.label));
  if (!socialLink) return "";
  return socialLink.url
    .toLocaleLowerCase("en")
    .replace(/^https?:\/\/(?:www\.|web\.)?/u, "")
    .replace(/\/$/u, "");
}

function contactQuality(contact) {
  return (contact.company === "Не отсортированные" ? 0 : 100)
    + (contact.name ? 20 : 0)
    + (contact.role ? 10 : 0)
    + (contact.category ? 5 : 0)
    + (contact.status ? 2 : 0)
    + (contact.notes ? 1 : 0);
}

function mergeContacts(left, right) {
  const preferred = contactQuality(right) > contactQuality(left) ? right : left;
  const alternate = preferred === left ? right : left;
  const links = [...preferred.links];
  const linkUrls = new Set(links.map((link) => link.url));
  for (const link of alternate.links) {
    if (!linkUrls.has(link.url)) links.push(link);
  }
  return {
    ...preferred,
    role: preferred.role || alternate.role,
    category: preferred.category || alternate.category,
    status: preferred.status || alternate.status,
    links,
    notes: preferred.notes || alternate.notes,
  };
}

const markdownFiles = await collectMarkdownFiles(sourceDirectory);
const importedContacts = [];
for (const file of markdownFiles) {
  const contents = await readFile(file.absolutePath, "utf8");
  const contact = parseContact({ contents, relativePath: file.relativePath });
  if (contact) importedContacts.push(contact);
}
const uniqueContacts = new Map();
for (const contact of importedContacts) {
  const key = dedupeKey(contact) || `path:${contact.id}`;
  const existing = uniqueContacts.get(key);
  uniqueContacts.set(key, existing ? mergeContacts(existing, contact) : contact);
}
const contacts = [...uniqueContacts.values()];
contacts.sort((left, right) => left.name.localeCompare(right.name, "ru") || left.company.localeCompare(right.company, "ru"));

const companies = [...new Set(contacts.map((contact) => contact.company))]
  .map((company) => ({ company, count: contacts.filter((contact) => contact.company === company).length }))
  .sort((left, right) => right.count - left.count || left.company.localeCompare(right.company, "ru"));
const categories = [...new Set(contacts.map((contact) => contact.category).filter(Boolean))]
  .map((category) => ({ category, count: contacts.filter((contact) => contact.category === category).length }))
  .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category, "ru"));

const output = `// Generated by scripts/import-obsidian-contacts.mjs. Do not edit by hand.\n`
  + `export const CONTACTS = ${JSON.stringify(contacts, null, 2)};\n`
  + `export const CONTACT_COMPANIES = ${JSON.stringify(companies, null, 2)};\n`
  + `export const CONTACT_CATEGORIES = ${JSON.stringify(categories, null, 2)};\n`;

await writeFile(outputFile, output, "utf8");
console.log(`Imported ${contacts.length} contacts from ${companies.length} companies into ${path.relative(projectRoot, outputFile)}`);
