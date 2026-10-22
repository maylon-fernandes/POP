(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});

  const DB_NAME = "itdocs";
  const DB_VERSION = 1;
  const PROCEDURES_STORE = "procedures";
  const IMAGES_STORE = "images";
  const SETTINGS_KEY = "itdocs:settings";
  const DRAFT_KEY = "itdocs:draft";

  const DEFAULT_SETTINGS = {
    sidebarCollapsed: false,
    sort: "updated-desc",
    lastCategory: "all",
    animations: true,
  };

  const SORT_VALUES = new Set(["updated-desc", "updated-asc", "title-asc", "created-desc"]);

  let database = null;
  let mode = "idb";
  let lastError = null;
  let memory = createMemoryStores();

  function createMemoryStores() {
    return { procedures: new Map(), images: new Map() };
  }

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
    mode = "idb";
    lastError = null;
    try {
      database = await openDatabase();
    } catch (error) {
      database = null;
      mode = "memory";
      lastError = error;
      memory = createMemoryStores();
    }
    return { mode, persistent: mode === "idb", error: lastError };
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB não é suportado neste navegador."));
        return;
      }
      let request;
      try {
        request = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }

      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROCEDURES_STORE)) {
          const store = db.createObjectStore(PROCEDURES_STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("category", "category", { unique: false });
        }
        if (!db.objectStoreNames.contains(IMAGES_STORE)) {
          db.createObjectStore(IMAGES_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = function () {
        const db = request.result;
        db.onversionchange = function () {
          db.close();
          database = null;
        };
        resolve(db);
      };

      request.onerror = function () {
        reject(request.error || new Error("Não foi possível abrir o armazenamento local."));
      };

      request.onblocked = function () {
        reject(new Error("O armazenamento está bloqueado por outra aba. Feche as demais abas e tente novamente."));
      };
    });
  }

  function transaction(storeName, transactionMode, operation) {
    if (mode === "memory") {
      return Promise.resolve();
    }
    if (!database) {
      return Promise.reject(new Error("Armazenamento local indisponível."));
    }
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = database.transaction(storeName, transactionMode);
      } catch (error) {
        reject(error);
        return;
      }
      const store = tx.objectStore(storeName);
      let result;
      let failure = null;

      try {
        operation(store, (value) => {
          result = value;
        });
      } catch (error) {
        failure = error;
        try {
          tx.abort();
        } catch (abortError) {
          reject(error);
        }
      }

      tx.oncomplete = function () {
        if (failure) reject(failure);
        else resolve(result);
      };
      tx.onerror = function () {
        reject(failure || tx.error || new Error("Falha ao acessar o armazenamento local."));
      };
      tx.onabort = function () {
        reject(failure || tx.error || new Error("Operação de armazenamento cancelada."));
      };
    });
  }

  function getAllProcedures() {
    if (mode === "memory") {
      return Promise.resolve(Array.from(memory.procedures.values()).map(clone));
    }
    return transaction(PROCEDURES_STORE, "readonly", (store, setResult) => {
      const request = store.getAll();
      request.onsuccess = () => setResult(request.result || []);
    }).then((records) => records || []);
  }

  function getProcedure(id) {
    if (!id) return Promise.resolve(null);
    if (mode === "memory") {
      return Promise.resolve(memory.procedures.has(id) ? clone(memory.procedures.get(id)) : null);
    }
    return transaction(PROCEDURES_STORE, "readonly", (store, setResult) => {
      const request = store.get(id);
      request.onsuccess = () => setResult(request.result || null);
    });
  }

  function putProcedure(record) {
    if (!record || !record.id) {
      return Promise.reject(new Error("Procedimento inválido para salvar."));
    }
    if (mode === "memory") {
      memory.procedures.set(record.id, clone(record));
      return Promise.resolve(record);
    }
    return transaction(PROCEDURES_STORE, "readwrite", (store, setResult) => {
      store.put(record).onsuccess = () => setResult(record);
    });
  }

  function putProcedures(records) {
    const list = Array.isArray(records) ? records : [];
    if (!list.length) return Promise.resolve([]);
    if (mode === "memory") {
      list.forEach((record) => memory.procedures.set(record.id, clone(record)));
      return Promise.resolve(list);
    }
    return transaction(PROCEDURES_STORE, "readwrite", (store, setResult) => {
      list.forEach((record) => store.put(record));
      setResult(list);
    });
  }

  function deleteProcedure(id) {
    if (!id) return Promise.resolve();
    if (mode === "memory") {
      memory.procedures.delete(id);
      return Promise.resolve();
    }
    return transaction(PROCEDURES_STORE, "readwrite", (store, setResult) => {
      store.delete(id).onsuccess = () => setResult(true);
    });
  }

  function putImage(record) {
    if (!record || !record.id || !(record.blob instanceof Blob)) {
      return Promise.reject(new Error("Imagem inválida para armazenar."));
    }
    if (mode === "memory") {
      memory.images.set(record.id, record);
      return Promise.resolve(record);
    }
    return transaction(IMAGES_STORE, "readwrite", (store, setResult) => {
      store.put(record).onsuccess = () => setResult(record);
    });
  }

  function getImage(id) {
    if (!id) return Promise.resolve(null);
    if (mode === "memory") {
      return Promise.resolve(memory.images.get(id) || null);
    }
    return transaction(IMAGES_STORE, "readonly", (store, setResult) => {
      const request = store.get(id);
      request.onsuccess = () => setResult(request.result || null);
    });
  }

  function getImageIds() {
    if (mode === "memory") {
      return Promise.resolve(Array.from(memory.images.keys()));
    }
    return transaction(IMAGES_STORE, "readonly", (store, setResult) => {
      const request = store.getAllKeys();
      request.onsuccess = () => setResult(request.result || []);
    }).then((keys) => keys || []);
  }

  function deleteImage(id) {
    return deleteImages([id]);
  }

  function deleteImages(ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!list.length) return Promise.resolve();
    if (mode === "memory") {
      list.forEach((id) => memory.images.delete(id));
      return Promise.resolve();
    }
    return transaction(IMAGES_STORE, "readwrite", (store, setResult) => {
      list.forEach((id) => store.delete(id));
      setResult(true);
    });
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

  async function getEstimate() {
    if (!navigator.storage || typeof navigator.storage.estimate !== "function") return null;
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
      };
    } catch (error) {
      return null;
    }
  }

  NS.storage = {
    init,
    get mode() {
      return mode;
    },
    get persistent() {
      return mode === "idb";
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
