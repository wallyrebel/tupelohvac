import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "src", "content", "blog");
const TOPIC_LOG_PATH = path.join(ROOT, "src", "content", ".topic-log.json");
const TOPIC_POOL_PATH = path.join(ROOT, "src", "content", ".topic-pool.json");
const BLOG_IMAGE_DIR = path.join(ROOT, "public", "images", "blog");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const OPENAI_PRIMARY_MODEL = process.env.OPENAI_PRIMARY_MODEL || "gpt-5-mini";
const OPENAI_FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || "gpt-4.1-nano";

const CATEGORY_SERVICE_PAGE = {
  maintenance: "/hvac-maintenance-tupelo/",
  troubleshooting: "/ac-repair-tupelo/",
  efficiency: "/ac-service-tupelo/",
  seasonal: "/ac-service-tupelo/",
  iaq: "/hvac-maintenance-tupelo/",
  thermostat: "/ac-service-tupelo/",
  "warning-signs": "/heat-repair-tupelo/",
  "storm-prep": "/ac-repair-tupelo/"
};

const PEXELS_QUERY_BY_CATEGORY = {
  maintenance: "hvac maintenance technician",
  troubleshooting: "air conditioner repair",
  efficiency: "smart thermostat home",
  seasonal: "hvac service home",
  iaq: "home air filter ventilation",
  thermostat: "digital thermostat",
  "warning-signs": "furnace technician inspection",
  "storm-prep": "outdoor air conditioner unit storm"
};

function pexelsQueryForTopic(topic) {
  if (topic.season_tag === "winter") return "winter heating furnace technician";
  if (topic.season_tag === "summer") return "air conditioner repair in hot weather";
  if (topic.season_tag === "spring") return "hvac maintenance spring service";
  if (topic.season_tag === "fall") return "heating system fall maintenance";
  return PEXELS_QUERY_BY_CATEGORY[topic.category] || "hvac technician";
}

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return new Set(normalize(value).split(" ").filter((word) => word.length > 2));
}

function similarity(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const token of ta) {
    if (tb.has(token)) overlap += 1;
  }
  return overlap / Math.max(ta.size, tb.size);
}

function toSlug(value) {
  return normalize(value)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function randomFrom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizePathname(pathname) {
  if (!pathname) return "/";
  const trimmed = pathname.trim();
  if (!trimmed) return "/";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withLeading.length > 1 && withLeading.endsWith("/")) {
    return withLeading.slice(0, -1);
  }
  return withLeading;
}

function parseLinkTarget(rawTarget) {
  const value = String(rawTarget || "").trim().replace(/^<|>$/g, "");
  if (!value) return { path: "", hash: "" };
  if (value.startsWith("#")) return { path: "", hash: value };
  try {
    const url = value.match(/^https?:\/\//i) ? new URL(value) : new URL(value, "https://tupelohvac.com");
    return {
      path: normalizePathname(url.pathname),
      hash: url.hash || ""
    };
  } catch {
    return { path: "", hash: "" };
  }
}

function collectLinkedTargets(body) {
  const links = [];
  const markdownLinkRegex = /\[[^\]]+\]\(([^)\s]+(?:\s+"[^"]*")?)\)/g;
  const htmlHrefRegex = /href\s*=\s*["']([^"']+)["']/gi;

  let match;
  while ((match = markdownLinkRegex.exec(body)) !== null) {
    const raw = match[1].replace(/\s+"[^"]*"$/, "").trim();
    links.push(parseLinkTarget(raw));
  }
  while ((match = htmlHrefRegex.exec(body)) !== null) {
    links.push(parseLinkTarget(match[1]));
  }

  return links;
}

function hasRequiredLink(body, targetUrl) {
  const target = parseLinkTarget(targetUrl);
  const links = collectLinkedTargets(body);
  return links.some((link) => {
    if (target.hash) {
      const targetPath = target.path || "/";
      const linkPath = link.path || "/";
      return link.hash === target.hash && normalizePathname(linkPath) === normalizePathname(targetPath);
    }
    return normalizePathname(link.path) === normalizePathname(target.path);
  });
}

async function readJson(filePath, fallback) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function listBlogFiles() {
  try {
    const files = await fs.readdir(BLOG_DIR);
    return files.filter((file) => file.endsWith(".md"));
  } catch {
    return [];
  }
}

async function chooseTopic() {
  const topicPool = await readJson(TOPIC_POOL_PATH, { categories: [] });
  const topicLog = await readJson(TOPIC_LOG_PATH, []);
  const recent10 = topicLog.slice(-10);
  const recent30 = topicLog.slice(-30);

  const blockedCategories = new Set(recent10.map((entry) => entry.category));
  const candidateCategories = topicPool.categories.filter((item) => !blockedCategories.has(item.category));
  const pool = candidateCategories.length ? candidateCategories : topicPool.categories;
  if (!pool.length) throw new Error("No topic categories available in src/content/.topic-pool.json");

  let selected = null;
  for (const categoryEntry of pool) {
    for (const seed of categoryEntry.prompt_seeds) {
      const tooClose = recent30.some((entry) => similarity(seed, entry.title || "") > 0.55);
      if (tooClose) continue;
      selected = { categoryEntry, seed };
      break;
    }
    if (selected) break;
  }

  if (!selected) {
    const fallbackCategory = randomFrom(pool);
    selected = { categoryEntry: fallbackCategory, seed: randomFrom(fallbackCategory.prompt_seeds) };
  }

  const previousSeason = topicLog.length ? topicLog[topicLog.length - 1].season_tag : "";
  const seasonOptions = selected.categoryEntry.season_tags.filter((item) => item !== previousSeason);
  const season_tag = randomFrom(seasonOptions.length ? seasonOptions : selected.categoryEntry.season_tags);
  const primary_keyword = randomFrom(selected.categoryEntry.primary_keywords);

  return {
    category: selected.categoryEntry.category,
    season_tag,
    seed: selected.seed,
    primary_keyword,
    recentTitles: recent30.map((entry) => entry.title || "")
  };
}

function buildPrompt({ category, season_tag, seed, primary_keyword, servicePage }, strictInstruction = "") {
  return `
Write one original HVAC blog post for TupeloHVAC.com.

Topic seed: ${seed}
Category: ${category}
Season tag: ${season_tag}
Primary keyword: ${primary_keyword}
Required repair/service link: ${servicePage}

Rules:
- 300 to 500 words total.
- Helpful, trustworthy, plain language.
- Strong local relevance to Tupelo, MS / North Mississippi weather.
- No business names.
- No pricing claims.
- No guarantees ("always", "will fix", "guaranteed").
- Include at least two H2 subheadings.
- Include at least one numbered or bulleted practical checklist.
- Include a FAQ section with exactly 2 or 3 Q&As.
- Include CTA block near the end with these links:
  1) /#request-service
  2) /contact/
  3) ${servicePage}
  4) /tupelo-hvac-guide/
- Mention the primary keyword in the title and once in the first 120 words.

Output format exactly:
TITLE: <one line title>
DESCRIPTION: <meta description <= 160 chars>
BODY:
<markdown body only, no code fences>

${strictInstruction}
  `.trim();
}

async function callOpenAI(prompt, model) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "You write practical local SEO blog content for HVAC service pages. Follow constraints exactly and avoid fluff."
        },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed (${model}): ${text}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error(`OpenAI response missing content (${model}).`);
  }
  return content;
}

function parseModelOutput(raw) {
  const titleMatch = raw.match(/TITLE:\s*(.+)/i);
  const descriptionMatch = raw.match(/DESCRIPTION:\s*(.+)/i);
  const bodyMatch = raw.match(/BODY:\s*([\s\S]*)$/i);

  if (!titleMatch || !descriptionMatch || !bodyMatch) {
    throw new Error("Model output did not follow TITLE/DESCRIPTION/BODY format.");
  }

  const title = titleMatch[1].trim();
  const description = descriptionMatch[1].trim().replace(/\s+/g, " ");
  const body = bodyMatch[1].trim();
  return { title, description, body };
}

function qualityChecks({ title, body, description, recentTitles, servicePage }) {
  const checks = [];
  const wc = wordCount(body);
  const subheadCount = (body.match(/^##\s+/gm) || []).length;

  checks.push({ ok: /tupelo(?:,\s*ms)?|north mississippi/i.test(body), reason: "Missing local hook." });
  checks.push({ ok: subheadCount >= 2, reason: "Needs at least two H2 subheadings." });
  checks.push({ ok: /^(\d+\.\s+|- )/m.test(body), reason: "Needs numbered or bulleted list." });
  checks.push({ ok: wc >= 300 && wc <= 500, reason: `Word count out of range (${wc}).` });
  checks.push({ ok: /##\s*FAQ/i.test(body), reason: "Missing FAQ section." });
  checks.push({
    ok: hasRequiredLink(body, "/#request-service"),
    reason: "Missing Request Service link."
  });
  checks.push({
    ok: hasRequiredLink(body, "/contact/"),
    reason: "Missing contact page link."
  });
  checks.push({
    ok: hasRequiredLink(body, servicePage),
    reason: "Missing Schedule Repair service link."
  });
  checks.push({
    ok: hasRequiredLink(body, "/tupelo-hvac-guide/"),
    reason: "Missing Tupelo HVAC Guide link."
  });
  checks.push({ ok: title.length > 20 && title.length < 95, reason: "Title length out of range." });
  checks.push({ ok: description.length <= 160, reason: "Description exceeds 160 characters." });
  checks.push({
    ok: !/(guarantee|guaranteed|always|will fix)/i.test(body),
    reason: "Contains prohibited guarantee language."
  });
  checks.push({
    ok: !/\b(LLC|Inc\.?|Corporation|Corp\.?)\b/i.test(body),
    reason: "Contains business name formatting."
  });
  checks.push({
    ok: !/\$\s?\d|\d+\s?(dollars|usd)/i.test(body),
    reason: "Contains pricing claim."
  });

  const similarTitle = recentTitles.some((recentTitle) => similarity(title, recentTitle) > 0.72);
  checks.push({ ok: !similarTitle, reason: "Title too similar to a recent post." });

  const hasActionableSteps = /checklist|steps|what to do|before calling/i.test(body);
  checks.push({ ok: hasActionableSteps, reason: "Missing actionable checklist/steps language." });

  const failed = checks.filter((item) => !item.ok).map((item) => item.reason);
  return { passed: failed.length === 0, failed };
}

async function fetchPexelsImage(query, slug) {
  const searchUrl = new URL("https://api.pexels.com/v1/search");
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("orientation", "landscape");
  searchUrl.searchParams.set("per_page", "6");

  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: PEXELS_API_KEY }
  });
  if (!searchResponse.ok) {
    const text = await searchResponse.text();
    throw new Error(`Pexels search failed: ${text}`);
  }
  const searchData = await searchResponse.json();
  const photos = Array.isArray(searchData.photos) ? searchData.photos : [];
  if (!photos.length) throw new Error("No Pexels photo results.");

  const photo = randomFrom(photos);
  const imageUrl = photo.src?.large2x || photo.src?.large || photo.src?.original;
  if (!imageUrl) throw new Error("Pexels photo is missing a usable image URL.");

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error("Pexels image download failed.");
  const buffer = Buffer.from(await imageResponse.arrayBuffer());

  await fs.mkdir(BLOG_IMAGE_DIR, { recursive: true });
  const filePath = path.join(BLOG_IMAGE_DIR, `${slug}.jpg`);
  await fs.writeFile(filePath, buffer);

  return {
    featured_image: `/images/blog/${slug}.jpg`,
    featured_image_alt: photo.alt || `${slug.replace(/-/g, " ")} in Tupelo, MS`,
    pexels_url: photo.url || "https://www.pexels.com/",
    pexels_photographer: photo.photographer || "Pexels Contributor",
    pexels_photographer_url: photo.photographer_url || "https://www.pexels.com/"
  };
}

function buildMarkdownPost({
  title,
  dateIso,
  description,
  keywords,
  slug,
  imageData,
  category,
  season_tag,
  primary_keyword,
  body
}) {
  const kw = keywords.map((item) => `  - ${item}`).join("\n");
  return `---
title: "${title.replace(/"/g, '\\"')}"
date: ${dateIso}
description: "${description.replace(/"/g, '\\"')}"
keywords:
${kw}
slug: ${slug}
featured_image: ${imageData.featured_image}
featured_image_alt: "${String(imageData.featured_image_alt).replace(/"/g, '\\"')}"
pexels_url: ${imageData.pexels_url}
pexels_photographer: "${String(imageData.pexels_photographer).replace(/"/g, '\\"')}"
pexels_photographer_url: ${imageData.pexels_photographer_url}
canonical: https://tupelohvac.com/blog/${slug}/
category: ${category}
season_tag: ${season_tag}
primary_keyword: "${primary_keyword}"
---
${body}
`;
}

async function saveTopicLog(entry) {
  const existing = await readJson(TOPIC_LOG_PATH, []);
  existing.push(entry);
  await fs.writeFile(TOPIC_LOG_PATH, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
}

async function main() {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");
  if (!PEXELS_API_KEY) throw new Error("PEXELS_API_KEY is required.");

  const topic = await chooseTopic();
  const servicePage = CATEGORY_SERVICE_PAGE[topic.category] || "/ac-repair-tupelo/";
  const strictInstruction =
    "Make this more specific to Tupelo/North Mississippi weather and include practical steps and warning signs. No fluff. No business names. No pricing. No guarantees.";

  let modelOutput;
  const prompt = buildPrompt({ ...topic, servicePage });
  try {
    modelOutput = await callOpenAI(prompt, OPENAI_PRIMARY_MODEL);
  } catch {
    modelOutput = await callOpenAI(prompt, OPENAI_FALLBACK_MODEL);
  }

  let parsed = parseModelOutput(modelOutput);
  let slug = toSlug(parsed.title);
  const existingFiles = await listBlogFiles();
  if (existingFiles.some((file) => file.endsWith(`${slug}.md`))) {
    slug = `${slug}-${Date.now().toString().slice(-5)}`;
  }

  let checks = qualityChecks({
    ...parsed,
    recentTitles: topic.recentTitles,
    servicePage
  });

  if (!checks.passed) {
    const retryPrompt = buildPrompt({ ...topic, servicePage }, strictInstruction);
    let retryRaw;
    try {
      retryRaw = await callOpenAI(retryPrompt, OPENAI_PRIMARY_MODEL);
    } catch {
      retryRaw = await callOpenAI(retryPrompt, OPENAI_FALLBACK_MODEL);
    }
    parsed = parseModelOutput(retryRaw);
    slug = toSlug(parsed.title);
    checks = qualityChecks({
      ...parsed,
      recentTitles: topic.recentTitles,
      servicePage
    });
    if (!checks.passed) {
      throw new Error(`Quality gate failed after regeneration: ${checks.failed.join(" | ")}`);
    }
  }

  const pexelsQuery = pexelsQueryForTopic(topic);
  const imageData = await fetchPexelsImage(pexelsQuery, slug);
  const dateIso = new Date().toISOString().split("T")[0];
  const keywords = [topic.primary_keyword, "Tupelo HVAC", "Tupelo, MS", topic.category];

  const markdown = buildMarkdownPost({
    title: parsed.title,
    dateIso,
    description: parsed.description,
    keywords,
    slug,
    imageData,
    category: topic.category,
    season_tag: topic.season_tag,
    primary_keyword: topic.primary_keyword,
    body: parsed.body
  });

  await fs.mkdir(BLOG_DIR, { recursive: true });
  const filePath = path.join(BLOG_DIR, `${dateIso}-${slug}.md`);
  await fs.writeFile(filePath, markdown, "utf8");

  await saveTopicLog({
    date: dateIso,
    slug,
    title: parsed.title,
    category: topic.category,
    season_tag: topic.season_tag,
    primary_keyword: topic.primary_keyword
  });

  console.log(`Created blog post: ${path.relative(ROOT, filePath)}`);
  console.log(`Saved image: ${imageData.featured_image}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
