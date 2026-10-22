(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  const utils = NS.utils;

  const MAX_FILE_SIZE = 8 * 1024 * 1024;
  const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"]);

  const urlCache = new Map();
  let generation = 0;

  function isAllowedType(type) {
    return ALLOWED_TYPES.has(String(type || "").toLowerCase());
  }

  function inferType(file) {
    const type = String((file && file.type) || "").toLowerCase();
    if (isAllowedType(type)) return type;
    const name = String((file && file.name) || "").toLowerCase();
    const extension = name.split(".").pop();
    const map = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      bmp: "image/bmp",
      avif: "image/avif",
    };
    return map[extension] || "";
  }

  function validateBlob(blob, name) {
    if (!(blob instanceof Blob)) {
      throw new Error("Arquivo de imagem inválido.");
    }
    const type = inferType({ type: blob.type, name: name || "" });
    if (!type) {
      throw new Error("Formato não suportado. Use PNG, JPG, GIF, WebP, BMP ou AVIF.");
    }
    if (blob.size > MAX_FILE_SIZE) {
      throw new Error(`A imagem excede o limite de ${utils.formatBytes(MAX_FILE_SIZE)}.`);
    }
    if (blob.size === 0) {
      throw new Error("A imagem está vazia.");
    }
    return { type, blob };
  }

  async function addBlob(blob, name) {
    const validated = validateBlob(blob, name);
    const normalizedBlob = validated.blob.type === validated.type ? validated.blob : validated.blob.slice(0, validated.blob.size, validated.type);
    const record = {
      id: utils.uid("img"),
      blob: normalizedBlob,
      mime: validated.type,
      name: utils.truncate(String(name || "imagem"), 160),
      size: normalizedBlob.size,
      createdAt: new Date().toISOString(),
    };
    await NS.storage.putImage(record);
    return record;
  }

  async function addFile(file) {
    if (!(file instanceof Blob)) throw new Error("Arquivo inválido.");
    return addBlob(file, file.name || "imagem");
  }

  async function addDataUrl(dataUrl, name) {
    if (!NS.security.isSafeImageSource(dataUrl, true)) {
      throw new Error("A imagem incorporada não possui um formato seguro.");
    }
    const blob = utils.dataUrlToBlob(dataUrl);
    return addBlob(blob, name || "imagem");
  }

  async function getUrl(id) {
    if (!id) return null;
    if (urlCache.has(id)) return urlCache.get(id);
    const record = await NS.storage.getImage(id);
    if (!record || !(record.blob instanceof Blob)) return null;
    const url = URL.createObjectURL(record.blob);
    urlCache.set(id, url);
    return url;
  }

  async function resolve(root) {
    if (!root) return;
    const scope = generation;
    const images = Array.from(root.querySelectorAll("img[data-image-id]"));
    await Promise.all(
      images.map(async (img) => {
        const id = img.getAttribute("data-image-id");
        if (!id) return;
        try {
          const url = await getUrl(id);
          if (scope !== generation) return;
          if (!url) {
            replaceMissingImage(img);
            return;
          }
          img.removeAttribute("loading");
          img.src = url;
          img.classList.remove("is-missing");
        } catch (error) {
          if (scope === generation) replaceMissingImage(img);
        }
      })
    );
  }

  function replaceMissingImage(img) {
    const note = document.createElement("span");
    note.className = "image-missing";
    note.textContent = "Imagem indisponível";
    if (img.parentNode) img.parentNode.replaceChild(note, img);
  }

  function releaseAll() {
    generation += 1;
    urlCache.forEach((url) => URL.revokeObjectURL(url));
    urlCache.clear();
  }

  async function getDataUrl(id) {
    const record = await NS.storage.getImage(id);
    if (!record || !(record.blob instanceof Blob)) return null;
    return utils.blobToDataUrl(record.blob);
  }

  async function extractDataImages(html, options) {
    const settings = Object.assign({ stripInternalRefs: false }, options || {});
    const template = document.createElement("template");
    template.innerHTML = String(html == null ? "" : html);
    const warnings = [];
    let imported = 0;
    let bytes = 0;

    template.content.querySelectorAll("img").forEach((img) => {
      if (settings.stripInternalRefs) img.removeAttribute("data-image-id");
    });

    const dataImages = Array.from(template.content.querySelectorAll("img")).filter((img) => {
      const src = img.getAttribute("src") || "";
      return /^\s*data:image\//i.test(src);
    });

    for (const img of dataImages) {
      const src = (img.getAttribute("src") || "").trim();
      const name = img.getAttribute("alt") || "imagem";
      if (!NS.security.isSafeImageSource(src, true)) {
        warnings.push(`Uma imagem (${utils.truncate(name, 40)}) foi ignorada por formato não suportado.`);
        img.remove();
        continue;
      }
      try {
        const blob = utils.dataUrlToBlob(src);
        const validated = validateBlob(blob, name);
        if (validated.type === "image/svg+xml") throw new Error("SVG não é suportado.");
        const record = await addBlob(blob, name);
        img.removeAttribute("src");
        img.removeAttribute("data-image-id");
        img.setAttribute("data-image-id", record.id);
        img.setAttribute("class", "doc-image");
        imported += 1;
        bytes += record.size;
      } catch (error) {
        warnings.push(`Imagem "${utils.truncate(name, 40)}" ignorada: ${error.message}`);
        img.remove();
      }
    }

    template.content.querySelectorAll("img[data-image-id]").forEach((img) => {
      img.removeAttribute("src");
    });

    const sanitized = NS.security.sanitizeHtml(template.innerHTML, { allowDataImages: false });
    return { html: sanitized, warnings, imported, bytes };
  }

  async function embedImagesForExport(content) {
    const template = document.createElement("template");
    template.innerHTML = NS.security.sanitizeHtml(content || "", { allowDataImages: true });
    const images = Array.from(template.content.querySelectorAll("img[data-image-id]"));
    for (const img of images) {
      const id = img.getAttribute("data-image-id");
      try {
        const dataUrl = await getDataUrl(id);
        if (!dataUrl) throw new Error("Imagem não encontrada.");
        img.setAttribute("src", dataUrl);
        img.removeAttribute("data-image-id");
        img.removeAttribute("loading");
        img.removeAttribute("decoding");
      } catch (error) {
        const note = document.createElement("span");
        note.className = "image-missing";
        note.textContent = "Imagem indisponível";
        img.parentNode.replaceChild(note, img);
      }
    }
    return template.innerHTML;
  }

  function collectReferencedIds(content) {
    const ids = new Set();
    const regex = /data-image-id="(img_[a-z0-9]+)"/gi;
    const value = String(content || "");
    let match;
    while ((match = regex.exec(value))) ids.add(match[1]);
    return ids;
  }

  async function cleanup(referencedIds) {
    const keep = referencedIds instanceof Set ? referencedIds : new Set(referencedIds || []);
    const ids = await NS.storage.getImageIds();
    const unused = ids.filter((id) => !keep.has(id));
    if (!unused.length) return 0;
    await NS.storage.deleteImages(unused);
    unused.forEach((id) => {
      if (urlCache.has(id)) {
        URL.revokeObjectURL(urlCache.get(id));
        urlCache.delete(id);
      }
    });
    return unused.length;
  }

  NS.images = {
    MAX_FILE_SIZE,
    ALLOWED_TYPES,
    isAllowedType,
    validateBlob,
    addBlob,
    addFile,
    addDataUrl,
    getUrl,
    getDataUrl,
    resolve,
    releaseAll,
    extractDataImages,
    embedImagesForExport,
    collectReferencedIds,
    cleanup,
  };
})();
