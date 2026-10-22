(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});

  function uid(prefix) {
    const stamp = Date.now().toString(36);
    let random;
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(8);
      window.crypto.getRandomValues(bytes);
      random = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    } else {
      random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    return `${prefix || "id"}_${stamp}${random}`;
  }

  function debounce(fn, wait) {
    let timer = null;
    let lastArgs = null;
    const wrapped = function (...args) {
      lastArgs = args;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        timer = null;
        fn.apply(null, lastArgs);
      }, wait);
    };
    wrapped.cancel = function () {
      if (timer) window.clearTimeout(timer);
      timer = null;
    };
    wrapped.flush = function () {
      if (!timer) return undefined;
      window.clearTimeout(timer);
      timer = null;
      return fn.apply(null, lastArgs);
    };
    wrapped.pending = function () {
      return timer !== null;
    };
    return wrapped;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function stripHtml(html) {
    if (!html) return "";
    const template = document.createElement("template");
    template.innerHTML = String(html);
    template.content.querySelectorAll("script, style, template").forEach((node) => node.remove());
    return (template.content.textContent || "").replace(/\s+/g, " ").trim();
  }

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatDate(value, style) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const options =
      style === "long"
        ? { day: "2-digit", month: "long", year: "numeric" }
        : { day: "2-digit", month: "short", year: "numeric" };
    try {
      return new Intl.DateTimeFormat("pt-BR", options)
        .format(date)
        .replace(/\s+de\s+/g, " ")
        .replace(/\./g, "")
        .replace(/\s+/g, " ")
        .trim();
    } catch (error) {
      return date.toLocaleDateString();
    }
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  }

  function toDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function truncate(value, length) {
    const text = String(value == null ? "" : value).trim();
    if (text.length <= length) return text;
    return text.slice(0, Math.max(0, length - 1)).trimEnd() + "…";
  }

  function slugify(value, maxLength) {
    const slug = normalizeText(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return truncate(slug, maxLength || 64).replace(/-+$/g, "") || "procedimento";
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatCount(value, singular, plural) {
    return `${value} ${value === 1 ? singular : plural}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function downloadText(text, filename, type) {
    downloadBlob(new Blob([text], { type: type || "text/plain;charset=utf-8" }), filename);
  }

  function downloadJson(data, filename) {
    downloadText(JSON.stringify(data, null, 2), filename, "application/json;charset=utf-8");
  }

  function fileStamp(date) {
    const d = date instanceof Date ? date : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo."));
      reader.readAsText(file, "utf-8");
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo."));
      reader.readAsDataURL(file);
    });
  }

  function fileToBlob(file) {
    if (file instanceof Blob) return Promise.resolve(file);
    return Promise.reject(new Error("Arquivo inválido."));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Falha ao converter a imagem."));
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const value = String(dataUrl || "");
    const match = /^data:([^;,]+)?((?:;[^;,]+)*?)?,(.*)$/is.exec(value);
    if (!match) throw new Error("Data URL inválida.");
    const mime = (match[1] || "application/octet-stream").toLowerCase();
    const meta = match[2] || "";
    const payload = match[3];
    let bytes;
    if (/;base64/i.test(meta)) {
      try {
        const binary = window.atob(payload);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      } catch (error) {
        throw new Error("Conteúdo Base64 inválido.");
      }
    } else {
      const decoded = decodeURIComponent(payload.replace(/\+/g, " "));
      bytes = new TextEncoder().encode(decoded);
    }
    return new Blob([bytes], { type: mime });
  }

  function copyText(text) {
    const value = String(text == null ? "" : text);
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value).catch(() => legacyCopy(value));
    }
    return Promise.resolve().then(() => legacyCopy(value));
  }

  function legacyCopy(value) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    textarea.remove();
    if (!ok) throw new Error("Não foi possível copiar o texto.");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function pluralize(value, singular, plural) {
    return value === 1 ? singular : plural;
  }

  function el(tag, options, children) {
    const node = document.createElement(tag);
    const opts = options || {};
    Object.keys(opts).forEach((key) => {
      const value = opts[key];
      if (value == null || value === false) return;
      if (key === "className") node.className = value;
      else if (key === "textContent") node.textContent = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key === "attrs") {
        Object.keys(value).forEach((attr) => {
          if (value[attr] != null) node.setAttribute(attr, value[attr]);
        });
      } else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        node.setAttribute(key, "");
      } else {
        node.setAttribute(key, value);
      }
    });
    if (children) {
      const list = Array.isArray(children) ? children : [children];
      list.forEach((child) => {
        if (child == null) return;
        node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
      });
    }
    return node;
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function safeJsonParse(text) {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (error) {
      return { ok: false, error };
    }
  }

  NS.utils = {
    uid,
    debounce,
    escapeHtml,
    escapeAttr,
    escapeRegExp,
    stripHtml,
    normalizeText,
    formatDate,
    formatDateTime,
    toDate,
    truncate,
    slugify,
    formatBytes,
    formatCount,
    downloadBlob,
    downloadText,
    downloadJson,
    fileStamp,
    readFileAsText,
    readFileAsDataUrl,
    fileToBlob,
    blobToDataUrl,
    dataUrlToBlob,
    copyText,
    clamp,
    isPlainObject,
    pluralize,
    el,
    nextFrame,
    safeJsonParse,
  };
})();
