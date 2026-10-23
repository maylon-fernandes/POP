(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});

  const ALLOWED_TAGS = new Set([
    "p",
    "div",
    "br",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "del",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "hr",
    "a",
    "img",
    "input",
    "span",
    "figure",
    "figcaption",
    "sub",
    "sup",
    "mark",
  ]);

  const DROP_TAGS = new Set([
    "script",
    "style",
    "template",
    "iframe",
    "object",
    "embed",
    "applet",
    "link",
    "meta",
    "base",
    "form",
    "textarea",
    "select",
    "option",
    "optgroup",
    "button",
    "svg",
    "math",
    "video",
    "audio",
    "source",
    "track",
    "canvas",
    "noscript",
    "frame",
    "frameset",
    "head",
    "title",
  ]);

  const ALLOWED_CLASSES = new Set([
    "doc-image",
    "img-w-25",
    "img-w-50",
    "img-w-75",
    "img-w-100",
    "img-align-left",
    "img-align-center",
    "img-align-right",
    "task-list",
    "task-checkbox",
    "callout",
    "small",
  ]);

  const IMAGE_ID_PATTERN = /^img_[a-z0-9]+$/i;
  const SAFE_IMAGE_TYPE = /^data:image\/(png|jpe?g|gif|webp|bmp|avif);base64,/i;

  function sanitizeHtml(html, options) {
    const settings = Object.assign({ allowDataImages: false }, options || {});
    const template = document.createElement("template");
    template.innerHTML = String(html == null ? "" : html);
    sanitizeChildren(template.content, settings);
    const container = document.createElement("div");
    container.appendChild(template.content);
    return container.innerHTML;
  }

  function sanitizeChildren(parent, settings) {
    const children = Array.from(parent.childNodes);
    children.forEach((node) => sanitizeNode(node, settings));
  }

  function sanitizeNode(node, settings) {
    if (node.nodeType === 3) return;
    if (node.nodeType === 8) {
      node.remove();
      return;
    }
    if (node.nodeType !== 1) {
      node.remove();
      return;
    }

    const tag = node.tagName.toLowerCase();

    if (DROP_TAGS.has(tag)) {
      node.remove();
      return;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      sanitizeChildren(node, settings);
      unwrap(node);
      return;
    }

    if (tag === "input") {
      if (String(node.getAttribute("type") || "").toLowerCase() !== "checkbox") {
        node.remove();
        return;
      }
      node.setAttribute("type", "checkbox");
      node.setAttribute("contenteditable", "false");
      node.setAttribute("class", "task-checkbox");
      if (!node.hasAttribute("checked")) node.removeAttribute("checked");
      stripAllAttributesBut(node, ["type", "checked", "class", "contenteditable"]);
      return;
    }

    if (tag === "img") {
      sanitizeImage(node, settings);
      return;
    }

    cleanAttributes(node, tag, settings);
    sanitizeChildren(node, settings);
  }

  function cleanAttributes(element, tag, settings) {
    const attributes = Array.from(element.attributes);
    attributes.forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if (name === "class") {
        const filtered = filterClasses(value, tag);
        if (filtered) element.setAttribute("class", filtered);
        else element.removeAttribute("class");
        return;
      }

      if (name === "style") {
        const align = extractTextAlign(value);
        if (align) element.setAttribute("style", `text-align: ${align}`);
        else element.removeAttribute("style");
        return;
      }

      if (name === "title" || name === "dir") {
        if (name === "dir" && !/^(ltr|rtl|auto)$/i.test(value.trim())) {
          element.removeAttribute(name);
        }
        return;
      }

      if (tag === "a" && (name === "href" || name === "target" || name === "rel")) {
        if (name === "href" && !isSafeLink(value)) {
          element.removeAttribute("href");
        }
        if (name === "target" && value.trim() !== "_blank") {
          element.removeAttribute("target");
        }
        if (name === "rel") {
          const rel = value
            .toLowerCase()
            .split(/\s+/)
            .filter((token) => ["noopener", "noreferrer", "nofollow", "ugc"].includes(token))
            .join(" ");
          if (rel) element.setAttribute("rel", rel);
          else element.removeAttribute("rel");
        }
        return;
      }

      if (tag === "li" && name === "data-checked") {
        if (!/^(true|false)$/i.test(value.trim())) element.removeAttribute(name);
        else element.setAttribute(name, value.trim().toLowerCase());
        return;
      }

      if (tag === "ol" && name === "start") {
        if (!/^\d{1,6}$/.test(value.trim())) element.removeAttribute(name);
        return;
      }

      if (tag === "code" && name === "class") return;

      element.removeAttribute(attr.name);
    });

    if (tag === "a" && element.hasAttribute("href")) {
      const safeTarget = element.getAttribute("target");
      if (safeTarget === "_blank") element.setAttribute("rel", "noopener noreferrer");
      else element.removeAttribute("rel");
    }
  }

  function sanitizeImage(element, settings) {
    const id = (element.getAttribute("data-image-id") || "").trim();
    const hasId = IMAGE_ID_PATTERN.test(id);
    const src = (element.getAttribute("src") || "").trim();
    const safeSrc = src && isSafeImageSource(src, settings.allowDataImages) ? src : "";
    const alt = (element.getAttribute("alt") || "").slice(0, 300);
    const title = (element.getAttribute("title") || "").slice(0, 300);
    const width = element.getAttribute("width");
    const height = element.getAttribute("height");

    if (!hasId && !safeSrc) {
      element.remove();
      return;
    }

    const classes = filterClasses(element.getAttribute("class") || "", "img");
    stripAllAttributesBut(element, []);
    if (hasId) element.setAttribute("data-image-id", id);
    element.setAttribute("class", classes ? `${classes} doc-image` : "doc-image");
    if (safeSrc && !hasId) element.setAttribute("src", safeSrc);
    if (alt) element.setAttribute("alt", alt);
    if (title) element.setAttribute("title", title);
    if (width && /^\d{1,5}$/.test(width)) element.setAttribute("width", width);
    if (height && /^\d{1,5}$/.test(height)) element.setAttribute("height", height);
    element.setAttribute("loading", "lazy");
    element.setAttribute("decoding", "async");
  }

  function filterClasses(value, tag) {
    const tokens = String(value || "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const filtered = [];
    tokens.forEach((token) => {
      if (ALLOWED_CLASSES.has(token)) filtered.push(token);
      else if (/^language-[a-z0-9_+#.-]{1,24}$/i.test(token) && (tag === "code" || tag === "pre")) {
        filtered.push(token.toLowerCase());
      }
    });
    if (tag === "img" && !filtered.includes("doc-image")) filtered.push("doc-image");
    return Array.from(new Set(filtered)).join(" ");
  }

  function extractTextAlign(value) {
    const match = /(?:^|;)\s*text-align\s*:\s*(left|right|center|justify)\s*(?:;|$)/i.exec(String(value));
    return match ? match[1].toLowerCase() : "";
  }

  function stripAllAttributesBut(element, keep) {
    const allowed = new Set(keep.map((value) => value.toLowerCase()));
    Array.from(element.attributes).forEach((attr) => {
      if (!allowed.has(attr.name.toLowerCase())) element.removeAttribute(attr.name);
    });
  }

  function unwrap(node) {
    const parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    node.remove();
  }

  function normalizeForProtocol(value) {
    return String(value || "")
      .replace(/[\u0000-\u0020\u007f-\u009f]+/g, "")
      .replace(/\\/g, "/")
      .toLowerCase();
  }

  function isSafeLink(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.length > 4096) return false;
    const normalized = normalizeForProtocol(raw);
    if (!normalized) return false;
    if (/^(javascript|vbscript|data|file|blob|filesystem|chrome|about):/i.test(normalized)) return false;
    if (/^(https?:|mailto:|tel:)/i.test(normalized)) return true;
    if (normalized.startsWith("#") || normalized.startsWith("?") || normalized.startsWith("/")) return true;
    if (normalized.startsWith("./") || normalized.startsWith("../")) return true;
    const colonIndex = normalized.indexOf(":");
    const slashIndex = normalized.indexOf("/");
    if (colonIndex >= 0 && (slashIndex < 0 || colonIndex < slashIndex)) return false;
    return true;
  }

  function isSafeImageSource(value, allowDataImages) {
    const raw = String(value || "").trim();
    if (!raw || raw.length > 12 * 1024 * 1024) return false;
    const normalized = normalizeForProtocol(raw);
    if (/^(https?:|\/\/)/i.test(normalized)) return true;
    if (normalized.startsWith("data:")) {
      return !!allowDataImages && SAFE_IMAGE_TYPE.test(raw.replace(/\s+/g, ""));
    }
    return false;
  }

  function normalizeExternalUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (!isSafeLink(raw)) return null;
    const normalized = normalizeForProtocol(raw);
    if (/^(https?:|mailto:|tel:)/i.test(normalized)) return raw;
    if (normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../") || normalized.startsWith("#") || normalized.startsWith("?")) {
      return raw;
    }
    if (/^[^\s/:]+\.[^\s/:]+/.test(raw)) return `https://${raw}`;
    return raw;
  }

  function hardenRenderedContent(root) {
    if (!root) return;
    root.querySelectorAll("a[href]").forEach((anchor) => {
      const href = anchor.getAttribute("href") || "";
      if (/^(https?:)?\/\//i.test(href)) {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
      }
    });
    root.querySelectorAll("img[data-image-id]").forEach((img) => {
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
    });
    root.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.disabled = false;
      input.setAttribute("aria-label", input.hasAttribute("checked") ? "Tarefa concluída" : "Tarefa pendente");
    });
  }

  function containsScript(html) {
    const value = String(html || "");
    return /<\s*(script|iframe|object|embed|svg|math)\b/i.test(value) || /\son[a-z]+\s*=/i.test(value) || /javascript\s*:/i.test(value);
  }

  NS.security = {
    sanitizeHtml,
    isSafeLink,
    isSafeImageSource,
    normalizeExternalUrl,
    hardenRenderedContent,
    containsScript,
    SAFE_IMAGE_TYPE,
  };
})();
