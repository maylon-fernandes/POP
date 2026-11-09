(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});

  const SETTINGS_KEY = "itdocs:settings";
  const DRAFT_KEY = "itdocs:draft";

  const DEFAULT_SETTINGS = {
    sidebarCollapsed: false,
    sort: "updated-desc",
    lastCategory: "all",
    animations: true,
  };

  const SORT_VALUES = new Set(["updated-desc", "updated-asc", "title-asc", "created-desc"]);

  let lastError = null;

  function clone(value) {
    if (value == null) return value;
    if (typeof window.structuredClone === "function") {
      try {
        return window.structuredClone(value);
      } catch (error) {
        return JSON.parse(JSON.stringify(value));
      }
    }
    return JSON.parse(JSON.stringify(value));
  }

  async function init() {
    lastError = null;
    return { mode: "glpi", persistent: true, error: null };
  }

  function getAllProcedures() {
    return NS.api
      .get("procedures", { action: "list" })
      .then((data) => (data && Array.isArray(data.procedures) ? data.procedures : []))
      .catch((error) => {
        lastError = error;
        throw error;
      });
  }

  function getProcedure(id) {
    if (!id) return Promise.resolve(null);
    return NS.api
      .get("procedures", { action: "get", id })
      .then((data) => (data && data.procedure ? data.procedure : null))
      .catch((error) => {
        if (error && error.status === 404) return null;
        throw error;
      });
  }

  function putProcedure(record) {
    if (!record || !record.id) {
      return Promise.reject(new Error("Procedimento inválido para salvar."));
    }
    return NS.api.post("procedures", Object.assign({ action: "save" }, record)).then((data) => {
      if (!data || !data.procedure) throw new Error("Resposta inválida ao salvar o procedimento.");
      return data.procedure;
    });
  }

  function putProcedures(records) {
    const list = Array.isArray(records) ? records : [];
    if (!list.length) return Promise.resolve([]);
    return NS.api.post("procedures", { action: "bulk_save", records: list }).then((data) => {
      const result = data && data.result ? data.result : {};
      if (result.failed) {
        const message = Array.isArray(result.errors) && result.errors.length
          ? result.errors[0]
          : "Alguns procedimentos não puderam ser importados.";
        const error = new Error(message);
        error.result = result;
        throw error;
      }
      return list;
    });
  }

  function deleteProcedure(id) {
    if (!id) return Promise.resolve();
    return NS.api.post("procedures", { action: "delete", id }).then(() => undefined);
  }

  function putImage(record) {
    if (!record || !record.id || !(record.blob instanceof Blob)) {
      return Promise.reject(new Error("Imagem inválida para armazenar."));
    }

    const form = new FormData();
    form.set("action", "upload");
    form.set("file", record.blob, record.name || "imagem");

    return NS.api.upload("images", form).then((data) => {
      if (!data || !data.image) throw new Error("Resposta inválida ao enviar a imagem.");
      return data.image;
    });
  }

  function getImage(id) {
    if (!id) return Promise.resolve(null);
    return fetch(NS.api.imageUrl(id), { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error("Imagem não encontrada.");
        return response.blob();
      })
      .then((blob) => ({ id, blob, mime: blob.type }));
  }

  function getImageIds() {
    return NS.api
      .get("images", { action: "ids" })
      .then((data) => (data && Array.isArray(data.ids) ? data.ids : []));
  }

  function deleteImage(id) {
    return deleteImages([id]);
  }

  function deleteImages(ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!list.length) return Promise.resolve();
    return NS.api.post("images", { action: "delete", ids: list }).then(() => undefined);
  }

  function loadSettings() {
    const settings = Object.assign({}, DEFAULT_SETTINGS);
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.sidebarCollapsed === "boolean") {
            settings.sidebarCollapsed = parsed.sidebarCollapsed;
          }
          if (SORT_VALUES.has(parsed.sort)) settings.sort = parsed.sort;
          if (typeof parsed.lastCategory === "string") settings.lastCategory = parsed.lastCategory;
          if (typeof parsed.animations === "boolean") settings.animations = parsed.animations;
        }
      }
    } catch (error) {
      lastError = error;
    }
    return settings;
  }

  function saveSettings(patch) {
    const current = loadSettings();
    const next = Object.assign({}, current, patch || {});
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return true;
    } catch (error) {
      lastError = error;
      return false;
    }
  }

  function getDraft() {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        title: typeof parsed.title === "string" ? parsed.title : "",
        category: typeof parsed.category === "string" ? parsed.category : "",
        description: typeof parsed.description === "string" ? parsed.description : "",
        content: typeof parsed.content === "string" ? parsed.content : "",
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      };
    } catch (error) {
      lastError = error;
      return null;
    }
  }

  function saveDraft(draft) {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      return true;
    } catch (error) {
      lastError = error;
      return false;
    }
  }

  function clearDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
      return true;
    } catch (error) {
      lastError = error;
      return false;
    }
  }

  function getLocalStorageStatus() {
    try {
      const key = "itdocs:test";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      lastError = error;
      return false;
    }
  }

  function getEstimate() {
    return Promise.resolve(null);
  }

  NS.storage = {
    init,
    get mode() {
      return "glpi";
    },
    get persistent() {
      return true;
    },
    get lastError() {
      return lastError;
    },
    getAllProcedures,
    getProcedure,
    putProcedure,
    putProcedures,
    deleteProcedure,
    putImage,
    getImage,
    getImageIds,
    deleteImage,
    deleteImages,
    loadSettings,
    saveSettings,
    getDraft,
    saveDraft,
    clearDraft,
    getLocalStorageStatus,
    getEstimate,
    DEFAULT_SETTINGS,
  };
})();
