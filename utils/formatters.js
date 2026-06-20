export function normalizeGeminiResult(result) {
  const tags = Array.isArray(result.tags)
    ? result.tags
    : String(result.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

  return {
    description: stringOrFallback(result.description, "No description returned."),
    ocr_text: stringOrFallback(result.ocr_text, ""),
    tags: tags.map((tag) => sanitizeTag(tag)).filter(Boolean).slice(0, 18),
    alt_text: stringOrFallback(result.alt_text, "Image uploaded to Eclyps Vision."),
    summary: stringOrFallback(result.summary, "No summary returned."),
    structured_data: result.structured_data && typeof result.structured_data === "object" ? result.structured_data : {},
  };
}

export function buildMarkdown(data) {
  const tags = data.tags.map((tag) => `#${tag}`).join(" ");
  return `# Eclyps Vision Analysis

**Source:** ${data.source}
**Generated:** ${data.generated_at}

## Summary

${data.summary}

## Description

${data.description}

## OCR Text

\`\`\`text
${data.ocr_text || "No OCR text detected."}
\`\`\`

## Semantic Tags

${tags || "No tags returned."}

## Alt Text

${data.alt_text}

## Structured Data

\`\`\`json
${JSON.stringify(data.structured_data, null, 2)}
\`\`\`
`;
}

export function buildCsv(data) {
  const rows = [
    ["field", "value"],
    ["source", data.source],
    ["generated_at", data.generated_at],
    ["summary", data.summary],
    ["description", data.description],
    ["ocr_text", data.ocr_text],
    ["tags", data.tags.map((tag) => `#${tag}`).join(" ")],
    ["alt_text", data.alt_text],
    ["structured_data", JSON.stringify(data.structured_data)],
  ];

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function highlightJson(json) {
  return escapeHtml(json).replace(
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let className = "token-number";
      if (/^"/.test(match)) {
        className = /:$/.test(match) ? "token-key" : "token-string";
      } else if (/true|false/.test(match)) {
        className = "token-boolean";
      } else if (/null/.test(match)) {
        className = "token-null";
      }
      return `<span class="${className}">${match}</span>`;
    },
  );
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function safeFilename(name) {
  return name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "eclyps-vision";
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function sanitizeTag(tag) {
  return String(tag)
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stringOrFallback(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}
