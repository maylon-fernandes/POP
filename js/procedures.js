(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  const utils = NS.utils;
  const security = NS.security;
  const categories = NS.categories;

  const MAX_TITLE = 160;
  const MAX_DESCRIPTION = 300;

  class ValidationError extends Error {
    constructor(errors) {
      super("Dados inválidos.");
      this.name = "ValidationError";
      this.errors = errors || {};
    }
  }

  function validDate(value, fallback) {
    const date = utils.toDate(value);
    return date ? date.toISOString() : fallback;
  }

  function normalizeContent(content) {
    return security.sanitizeHtml(content || "", { allowDataImages: false });
  }

  function normalizeRecord(raw) {
    if (!raw || typeof raw !== "object") return null;
    const title = utils.truncate(String(raw.title || "").trim(), MAX_TITLE);
    const category = categories.get(raw.category);
    if (!title || !category) return null;
    const now = new Date().toISOString();
    const createdAt = validDate(raw.createdAt, now);
    const updatedAt = validDate(raw.updatedAt, createdAt);
    const content = normalizeContent(raw.content);
    const record = {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : utils.uid("pop"),
      title,
      category: category.id,
      description: utils.truncate(String(raw.description || "").trim(), MAX_DESCRIPTION),
      content,
      contentFormat: "html",
      createdAt,
      updatedAt,
    };
    Object.defineProperty(record, "_plainText", {
      value: utils.stripHtml(content),
      enumerable: false,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(record, "_searchText", {
      value: utils.normalizeText(`${record.title} ${record.description} ${record._plainText}`),
      enumerable: false,
      configurable: true,
      writable: true,
    });
    return record;
  }

  function toStored(record) {
    return {
      id: record.id,
      title: record.title,
      category: record.category,
      description: record.description,
      content: record.content,
      contentFormat: "html",
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  function validateFields(fields) {
    const errors = {};
    const title = String((fields && fields.title) || "").trim();
    const category = String((fields && fields.category) || "").trim().toLowerCase();
    const description = String((fields && fields.description) || "").trim();
    if (!title) errors.title = "Informe um título para o procedimento.";
    else if (title.length > MAX_TITLE) errors.title = `O título deve ter até ${MAX_TITLE} caracteres.`;
    if (!category) errors.category = "Selecione uma categoria.";
    else if (!categories.isValid(category)) errors.category = "Categoria inválida.";
    if (description.length > MAX_DESCRIPTION) errors.description = `A descrição deve ter até ${MAX_DESCRIPTION} caracteres.`;
    return {
      valid: Object.keys(errors).length === 0,
      errors,
      title,
      category,
      description,
      content: normalizeContent((fields && fields.content) || ""),
    };
  }

  async function getAll() {
    const raw = await NS.storage.getAllProcedures();
    return raw
      .map(normalizeRecord)
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async function get(id) {
    const raw = await NS.storage.getProcedure(id);
    return raw ? normalizeRecord(raw) : null;
  }

  async function create(fields) {
    const validation = validateFields(fields);
    if (!validation.valid) throw new ValidationError(validation.errors);
    const now = new Date().toISOString();
    const record = normalizeRecord({
      id: utils.uid("pop"),
      title: validation.title,
      category: validation.category,
      description: validation.description,
      content: validation.content,
      contentFormat: "html",
      createdAt: now,
      updatedAt: now,
    });
    await NS.storage.putProcedure(toStored(record));
    return record;
  }

  async function update(id, fields) {
    const existing = await NS.storage.getProcedure(id);
    if (!existing) throw new Error("Procedimento não encontrado.");
    const validation = validateFields(fields);
    if (!validation.valid) throw new ValidationError(validation.errors);
    const current = normalizeRecord(existing);
    if (!current) throw new Error("O procedimento armazenado é inválido.");
    const record = normalizeRecord({
      id: current.id,
      title: validation.title,
      category: validation.category,
      description: validation.description,
      content: validation.content,
      contentFormat: "html",
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await NS.storage.putProcedure(toStored(record));
    return record;
  }

  async function saveContent(id, content) {
    const existing = await NS.storage.getProcedure(id);
    if (!existing) throw new Error("Procedimento não encontrado.");
    const current = normalizeRecord(existing);
    if (!current) throw new Error("O procedimento armazenado é inválido.");
    current.content = normalizeContent(content);
    current.updatedAt = new Date().toISOString();
    Object.defineProperty(current, "_plainText", {
      value: utils.stripHtml(current.content),
      enumerable: false,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(current, "_searchText", {
      value: utils.normalizeText(`${current.title} ${current.description} ${current._plainText}`),
      enumerable: false,
      configurable: true,
      writable: true,
    });
    await NS.storage.putProcedure(toStored(current));
    return current;
  }

  async function remove(id) {
    await NS.storage.deleteProcedure(id);
  }

  function excerpt(procedure, length) {
    if (!procedure) return "";
    const limit = length || 170;
    if (procedure.description) return utils.truncate(procedure.description, limit);
    if (procedure._plainText) return utils.truncate(procedure._plainText, limit);
    return "Sem descrição. Abra o procedimento para visualizar o conteúdo.";
  }

  function readTime(procedure) {
    const text = (procedure && procedure._plainText) || "";
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    return Math.max(1, Math.ceil(words / 220));
  }

  function createFromImport(fields, options) {
    const settings = options || {};
    const validation = validateFields(fields);
    if (!validation.valid) {
      throw new ValidationError(validation.errors);
    }
    const now = new Date().toISOString();
    const record = normalizeRecord({
      id: settings.id || utils.uid("pop"),
      title: validation.title,
      category: validation.category,
      description: validation.description,
      content: validation.content,
      contentFormat: "html",
      createdAt: settings.createdAt || now,
      updatedAt: settings.updatedAt || settings.createdAt || now,
    });
    return record;
  }

  async function saveMany(records) {
    await NS.storage.putProcedures(records.map(toStored));
  }

  function plainText(procedure) {
    if (!procedure) return "";
    return procedure._plainText || utils.stripHtml(procedure.content);
  }

  NS.procedures = {
    ValidationError,
    MAX_TITLE,
    MAX_DESCRIPTION,
    normalizeRecord,
    normalizeContent,
    toStored,
    validateFields,
    getAll,
    get,
    create,
    update,
    saveContent,
    remove,
    excerpt,
    readTime,
    createFromImport,
    saveMany,
    plainText,
  };
})();
