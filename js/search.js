(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  const utils = NS.utils;

  const SORT_OPTIONS = new Set(["updated-desc", "updated-asc", "title-asc", "created-desc"]);

  function tokenize(query) {
    return utils
      .normalizeText(query)
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function haystack(procedure) {
    if (procedure._searchText !== undefined) return procedure._searchText;
    const text = utils.normalizeText(
      `${procedure.title || ""} ${procedure.description || ""} ${utils.stripHtml(procedure.content || "")}`
    );
    Object.defineProperty(procedure, "_searchText", {
      value: text,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    return text;
  }

  function filter(procedures, options) {
    const settings = Object.assign({ query: "", category: "", sort: "updated-desc" }, options || {});
    const tokens = tokenize(settings.query);
    let list = Array.isArray(procedures) ? procedures.slice() : [];

    if (settings.category) {
      list = list.filter((procedure) => procedure.category === settings.category);
    }

    if (tokens.length) {
      list = list.filter((procedure) => {
        const hay = haystack(procedure);
        return tokens.every((token) => hay.includes(token));
      });
    }

    const sort = SORT_OPTIONS.has(settings.sort) ? settings.sort : "updated-desc";
    list.sort((a, b) => compare(a, b, sort));
    return list;
  }

  function compare(a, b, sort) {
    if (sort === "title-asc") {
      return String(a.title).localeCompare(String(b.title), "pt-BR", { sensitivity: "base", numeric: true });
    }
    if (sort === "created-desc") {
      return new Date(b.createdAt) - new Date(a.createdAt) || String(a.title).localeCompare(String(b.title), "pt-BR");
    }
    if (sort === "updated-asc") {
      return new Date(a.updatedAt) - new Date(b.updatedAt) || String(a.title).localeCompare(String(b.title), "pt-BR");
    }
    return new Date(b.updatedAt) - new Date(a.updatedAt) || String(a.title).localeCompare(String(b.title), "pt-BR");
  }

  function counts(procedures) {
      const result = { all: procedures.length, sistema: 0, hardware: 0, rede: 0, tasy: 0 };
      procedures.forEach((procedure) => {
        if (Object.prototype.hasOwnProperty.call(result, procedure.category)) {
          result[procedure.category] += 1;
        }
      });
      return result;
    }

  NS.search = {
    SORT_OPTIONS,
    filter,
    counts,
    tokenize,
  };
})();
