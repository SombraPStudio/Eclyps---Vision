import { copyText, showToast } from "./components/copy.js";
import {
  buildCsv,
  buildMarkdown,
  escapeHtml,
  highlightJson,
  normalizeGeminiResult,
  safeFilename,
} from "./utils/formatters.js";

const GEMINI_MODEL = "gemini-2.5-flash";
const API_KEY_STORAGE = "eclyps:gemini-api-key";
const THEME_STORAGE = "eclyps:theme";

const state = {
  file: null,
  imageDataUrl: "",
  activeTab: "json",
  outputs: {
    json: "",
    markdown: "",
    csv: "",
  },
  result: null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  drag: null,
};

const elements = {
  uploadForm: document.querySelector("#uploadForm"),
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  dropTitle: document.querySelector("#dropTitle"),
  dropMeta: document.querySelector("#dropMeta"),
  analyzeButton: document.querySelector("#analyzeButton"),
  formMessage: document.querySelector("#formMessage"),
  loadingSection: document.querySelector("#loadingSection"),
  progressBar: document.querySelector("#progressBar"),
  loadingMessage: document.querySelector("#loadingMessage"),
  results: document.querySelector("#results"),
  footer: document.querySelector("#footer"),
  previewImage: document.querySelector("#previewImage"),
  imageStage: document.querySelector("#imageStage"),
  descriptionOutput: document.querySelector("#descriptionOutput"),
  ocrOutput: document.querySelector("#ocrOutput"),
  tagOutput: document.querySelector("#tagOutput"),
  altOutput: document.querySelector("#altOutput"),
  summaryOutput: document.querySelector("#summaryOutput"),
  structuredOutput: document.querySelector("#structuredOutput"),
  copyStructured: document.querySelector("#copyStructured"),
  downloadStructured: document.querySelector("#downloadStructured"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsModal: document.querySelector("#settingsModal"),
  closeSettings: document.querySelector("#closeSettings"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  toggleKeyVisibility: document.querySelector("#toggleKeyVisibility"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast"),
  zoomIn: document.querySelector("#zoomIn"),
  zoomOut: document.querySelector("#zoomOut"),
  zoomReset: document.querySelector("#zoomReset"),
};

const loadingSteps = [
  "Scanning image...",
  "Extracting OCR...",
  "Generating tags...",
  "Building structured outputs...",
  "Finalizing...",
];

let loadingTimer = null;

init();

function init() {
  elements.apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE) || "";
  document.documentElement.dataset.theme = localStorage.getItem(THEME_STORAGE) || "dark";
  bindEvents();
  updateAnalyzeState();
}

function bindEvents() {
  elements.dropZone.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) {
      handleFile(file);
    }
  });

  elements.uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await analyzeImage();
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("dragging");
    });
  });

  elements.dropZone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    if (file) {
      handleFile(file);
    }
  });

  window.addEventListener("paste", (event) => {
    const file = [...event.clipboardData.files].find((item) => item.type.startsWith("image/"));
    if (file) {
      handleFile(file);
    }
  });

  elements.settingsButton.addEventListener("click", openSettings);
  elements.settingsModal.addEventListener("close", () => document.body.classList.remove("modal-open"));
  elements.apiKeyInput.addEventListener("input", () => {
    localStorage.setItem(API_KEY_STORAGE, elements.apiKeyInput.value.trim());
  });
  elements.toggleKeyVisibility.addEventListener("click", toggleKeyVisibility);
  elements.themeToggle.addEventListener("click", toggleTheme);

  document.querySelectorAll(".copy-button").forEach((button) => {
    button.addEventListener("click", () => copyResult(button.dataset.copy));
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });

  elements.copyStructured.addEventListener("click", () => {
    copyText(state.outputs[state.activeTab], elements.toast);
  });
  elements.downloadStructured.addEventListener("click", downloadStructuredOutput);

  elements.zoomIn.addEventListener("click", () => setZoom(state.zoom + 0.18));
  elements.zoomOut.addEventListener("click", () => setZoom(state.zoom - 0.18));
  elements.zoomReset.addEventListener("click", resetImageTransform);
  elements.imageStage.addEventListener("wheel", handleImageWheel, { passive: false });
  elements.imageStage.addEventListener("pointerdown", startPan);
  elements.imageStage.addEventListener("pointermove", movePan);
  elements.imageStage.addEventListener("pointerup", endPan);
  elements.imageStage.addEventListener("pointercancel", endPan);
}

async function handleFile(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    setFormMessage("Use a PNG, JPG, or WEBP image.");
    return;
  }

  state.file = file;
  state.imageDataUrl = await readFileAsDataUrl(file);
  elements.dropTitle.textContent = file.name;
  elements.dropMeta.textContent = `${formatBytes(file.size)} - ${file.type.replace("image/", "").toUpperCase()}`;
  elements.previewImage.src = state.imageDataUrl;
  setFormMessage("Image ready.");
  updateAnalyzeState();
  resetImageTransform();
}

async function analyzeImage() {
  const apiKey = elements.apiKeyInput.value.trim();
  if (!state.file) {
    setFormMessage("Choose an image first.");
    return;
  }

  if (!apiKey) {
    setFormMessage("Add your Gemini API key in settings.");
    openSettings();
    return;
  }

  setBusy(true);
  startLoading();

  try {
    const result = await requestGeminiAnalysis(apiKey, state.file, state.imageDataUrl);
    state.result = normalizeGeminiResult(result);
    buildOutputs();
    renderResults();
    showToast("Analysis complete.", elements.toast);
  } catch (error) {
    console.error(error);
    setFormMessage(error.message || "Analysis failed. Check your API key and try again.");
    showToast("Analysis failed.", elements.toast);
  } finally {
    stopLoading();
    setBusy(false);
  }
}

async function requestGeminiAnalysis(apiKey, file, dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Analyze this image and return only valid JSON with these keys: description, ocr_text, tags, alt_text, summary, structured_data. " +
                "description should be detailed. ocr_text should preserve line breaks. tags must be an array of lowercase semantic tags without hash symbols. " +
                "alt_text must be concise and accessibility-focused. summary should be brief. structured_data should contain any useful extracted entities, tables, dates, amounts, labels, or observations.",
            },
            {
              inlineData: {
                mimeType: file.type,
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Gemini request failed with status ${response.status}.`;
    throw new Error(message);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return parseGeminiJson(text);
}

function parseGeminiJson(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Gemini response was not valid JSON.");
  }
}

function buildOutputs() {
  const exportData = {
    source: state.file?.name || "uploaded-image",
    generated_at: new Date().toISOString(),
    ...state.result,
  };

  state.outputs.json = JSON.stringify(exportData, null, 2);
  state.outputs.markdown = buildMarkdown(exportData);
  state.outputs.csv = buildCsv(exportData);
}

function renderResults() {
  const result = state.result;
  elements.descriptionOutput.textContent = result.description;
  elements.ocrOutput.textContent = result.ocr_text || "No OCR text detected.";
  elements.altOutput.textContent = result.alt_text;
  elements.summaryOutput.textContent = result.summary;
  elements.tagOutput.innerHTML = "";

  result.tags.forEach((tag) => {
    const pill = document.createElement("span");
    pill.className = "tag-pill";
    pill.textContent = `#${tag.replace(/^#/, "")}`;
    elements.tagOutput.append(pill);
  });

  setActiveTab("json");
  elements.results.hidden = false;
  elements.footer.hidden = false;
  requestAnimationFrame(() => {
    elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
    button.setAttribute("aria-selected", String(button.dataset.tab === tab));
  });

  const output = state.outputs[tab] || "";
  elements.structuredOutput.innerHTML = tab === "json" ? highlightJson(output) : escapeHtml(output);
}

function copyResult(type) {
  const result = state.result;
  if (!result) {
    return;
  }

  const valueMap = {
    description: result.description,
    ocr: result.ocr_text,
    tags: result.tags.map((tag) => `#${tag.replace(/^#/, "")}`).join(", "),
    alt: result.alt_text,
    summary: result.summary,
  };

  copyText(valueMap[type] || "", elements.toast);
}

function downloadStructuredOutput() {
  const extensionMap = {
    json: "json",
    markdown: "md",
    csv: "csv",
  };
  const mimeMap = {
    json: "application/json",
    markdown: "text/markdown",
    csv: "text/csv",
  };
  const content = state.outputs[state.activeTab];
  const blob = new Blob([content], { type: `${mimeMap[state.activeTab]};charset=utf-8` });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${safeFilename(state.file?.name || "eclyps-vision")}.${extensionMap[state.activeTab]}`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function startLoading() {
  elements.loadingSection.hidden = false;
  let index = 0;
  elements.progressBar.style.width = "12%";
  elements.loadingMessage.textContent = loadingSteps[index];
  loadingTimer = window.setInterval(() => {
    index = Math.min(index + 1, loadingSteps.length - 1);
    elements.loadingMessage.textContent = loadingSteps[index];
    elements.progressBar.style.width = `${Math.min(92, 12 + index * 20)}%`;
  }, 950);
}

function stopLoading() {
  if (loadingTimer) {
    window.clearInterval(loadingTimer);
  }
  elements.progressBar.style.width = "100%";
  window.setTimeout(() => {
    elements.loadingSection.hidden = true;
    elements.progressBar.style.width = "0%";
  }, 350);
}

function setBusy(isBusy) {
  elements.analyzeButton.disabled = isBusy;
  elements.analyzeButton.textContent = isBusy ? "Analyzing..." : "Analyze Image";
}

function updateAnalyzeState() {
  elements.analyzeButton.disabled = !state.file;
}

function setFormMessage(message) {
  elements.formMessage.textContent = message;
}

function openSettings() {
  document.body.classList.add("modal-open");
  elements.settingsModal.showModal();
  window.setTimeout(() => elements.apiKeyInput.focus(), 60);
}

function toggleKeyVisibility() {
  const isHidden = elements.apiKeyInput.type === "password";
  elements.apiKeyInput.type = isHidden ? "text" : "password";
  elements.toggleKeyVisibility.textContent = isHidden ? "Hide" : "Show";
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem(THEME_STORAGE, nextTheme);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setZoom(value) {
  state.zoom = Math.min(4, Math.max(0.35, value));
  applyImageTransform();
}

function resetImageTransform() {
  state.zoom = 1;
  state.pan = { x: 0, y: 0 };
  applyImageTransform();
}

function applyImageTransform() {
  elements.previewImage.style.setProperty("--zoom", state.zoom);
  elements.previewImage.style.setProperty("--pan-x", `${state.pan.x}px`);
  elements.previewImage.style.setProperty("--pan-y", `${state.pan.y}px`);
}

function handleImageWheel(event) {
  event.preventDefault();
  setZoom(state.zoom + (event.deltaY > 0 ? -0.12 : 0.12));
}

function startPan(event) {
  elements.imageStage.setPointerCapture(event.pointerId);
  state.drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: state.pan.x,
    originY: state.pan.y,
  };
}

function movePan(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) {
    return;
  }
  state.pan.x = state.drag.originX + event.clientX - state.drag.startX;
  state.pan.y = state.drag.originY + event.clientY - state.drag.startY;
  applyImageTransform();
}

function endPan(event) {
  if (state.drag?.pointerId === event.pointerId) {
    state.drag = null;
  }
}
