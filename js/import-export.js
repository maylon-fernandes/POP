(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  const utils = NS.utils;
  const security = NS.security;
  const proceduresService = NS.procedures;
  const images = NS.images;
  const ui = NS.ui;

  const SCHEMA_VERSION = 1;
  const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
  const MAX_IMPORT_ITEMS = 5000;

  let pendingPlan = null;
  let initialized = false;

  function envelope(procedures, scope) {
    return {
      app: "IT Docs",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      scope: scope || "all",
      imageFormat: "data-url",
      procedures: procedures,
    };
  }

  async function buildExportProcedure(procedure) {
    return {
      id: procedure.id,
      title: procedure.title,
      category: procedure.category,
      description: procedure.description || "",
      contentFormat: "html",
      content: await images.embedImagesForExport(procedure.content || ""),
      createdAt: procedure.createdAt,
      updatedAt: procedure.updatedAt,
    };
  }

  async function exportAll() {
    const list = await proceduresService.getAll();
    if (!list.length) {
      ui.toast("Não há procedimentos para exportar.", "warning");
      return null;
    }
    const exported = [];
    for (const procedure of list) {
      exported.push(await buildExportProcedure(procedure));
    }
    const data = envelope(exported, "all");
    const filename = `it-docs-procedimentos-${utils.fileStamp()}.json`;
    utils.downloadJson(data, filename);
    ui.toast(`${utils.formatCount(exported.length, "procedimento exportado", "procedimentos exportados")}.`, "success");
    return data;
  }

  async function exportProcedure(procedure) {
    if (!procedure) return null;
    const data = envelope([await buildExportProcedure(procedure)], "single");
    const filename = `pop-${utils.slugify(procedure.title)}-${utils.fileStamp()}.json`;
    utils.downloadJson(data, filename);
    ui.toast("Procedimento exportado em JSON.", "success");
    return data;
  }

  async function getMarkdown(procedure) {
    if (!procedure) return "";
    const content = await images.embedImagesForExport(procedure.content || "");
    return NS.markdown.htmlToMarkdown(content);
  }

  async function exportMarkdown(procedure) {
    if (!procedure) return;
    const markdown = await getMarkdown(procedure);
    const filename = `pop-${utils.slugify(procedure.title)}.md`;
    utils.downloadText(markdown + (markdown.endsWith("\n") ? "" : "\n"), filename, "text/markdown;charset=utf-8");
    ui.toast("Procedimento exportado em Markdown.", "success");
  }

  async function showMarkdown(procedure, options) {
    if (!procedure) return;
    const markdown = await getMarkdown(procedure);
    ui.showMarkdown(markdown, `pop-${utils.slugify(procedure.title)}.md`, options);
  }

  async function copyMarkdown(procedure) {
    if (!procedure) return;
    const markdown = await getMarkdown(procedure);
    await ui.copy(markdown, "Markdown copiado.");
  }

  function openPicker() {
    const input = document.getElementById("import-file-input");
    if (!input) return;
    input.value = "";
    input.click();
  }

  async function readImportFile(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error(`O arquivo excede o limite de ${utils.formatBytes(MAX_IMPORT_BYTES)}.`);
    }
    const name = String(file.name || "").toLowerCase();
    if (name && !name.endsWith(".json") && file.type !== "application/json") {
      throw new Error("Selecione um arquivo JSON exportado pelo IT Docs.");
    }
    const text = await utils.readFileAsText(file);
    const parsed = utils.safeJsonParse(text);
    if (!parsed.ok) {
      throw new Error("O arquivo não contém um JSON válido.");
    }
    return { data: parsed.value, file };
  }

  function validateEnvelope(data) {
    const warnings = [];
    let rawProcedures;
    let schemaVersion = SCHEMA_VERSION;
    let appName = "";
    let exportedAt = "";

    if (Array.isArray(data)) {
      rawProcedures = data;
      warnings.push("O arquivo contém uma lista simples de procedimentos, sem os metadados do IT Docs.");
    } else if (data && typeof data === "object") {
      rawProcedures = data.procedures;
      appName = typeof data.app === "string" ? data.app : "";
      exportedAt = typeof data.exportedAt === "string" ? data.exportedAt : "";
      if (data.schemaVersion != null) {
        schemaVersion = Number(data.schemaVersion);
        if (!Number.isFinite(schemaVersion) || schemaVersion < 1) {
          throw new Error("A versão do formato de dados do arquivo é inválida.");
        }
        if (schemaVersion > SCHEMA_VERSION) {
          throw new Error(
            `O arquivo usa a versão ${schemaVersion}, mais recente que a suportada por esta aplicação (${SCHEMA_VERSION}).`
          );
        }
      } else {
        warnings.push("O arquivo não informa a versão do formato. A importação será tentada como versão 1.");
      }
      if (appName && appName !== "IT Docs") {
        warnings.push(`O arquivo foi gerado por "${utils.truncate(appName, 50)}". Os dados serão validados antes da importação.`);
      }
    } else {
      throw new Error("Estrutura inválida: o arquivo deve conter um objeto com a lista de procedimentos.");
    }

    if (!Array.isArray(rawProcedures)) {
      throw new Error("Estrutura inválida: a propriedade \"procedures\" não é uma lista.");
    }
    if (rawProcedures.length > MAX_IMPORT_ITEMS) {
      throw new Error(`O arquivo contém mais de ${MAX_IMPORT_ITEMS} procedimentos e não pode ser importado de uma vez.`);
    }

    return { rawProcedures, warnings, schemaVersion, appName, exportedAt };
  }

  function normalizeImportedItem(raw, index, context) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      context.invalid.push(`Item ${index + 1}: estrutura inválida.`);
      return null;
    }

    const titleValue = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!titleValue) {
      context.invalid.push(`Item ${index + 1}: título ausente.`);
      return null;
    }
    if (titleValue.length > proceduresService.MAX_TITLE) {
      context.warnings.push(`Item ${index + 1}: o título foi reduzido para ${proceduresService.MAX_TITLE} caracteres.`);
    }

    const categoryValue = String(raw.category || "").trim().toLowerCase();
    if (!NS.categories.isValid(categoryValue)) {
      context.invalid.push(`Item ${index + 1} ("${utils.truncate(titleValue, 50)}"): categoria inválida.`);
      return null;
    }

    let id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || id.length > 200) {
      id = utils.uid("pop");
      context.warnings.push(`Item ${index + 1}: identificador ausente ou inválido. Um novo identificador foi gerado.`);
    }

    const format = String(raw.contentFormat || "html").toLowerCase();
    let content = typeof raw.content === "string" ? raw.content : "";
    if (raw.content != null && typeof raw.content !== "string") {
      context.invalid.push(`Item ${index + 1} ("${utils.truncate(titleValue, 50)}"): conteúdo inválido.`);
      return null;
    }
    if (format === "markdown") {
      content = NS.markdown.markdownToHtml(content);
    } else if (format !== "html") {
      context.invalid.push(`Item ${index + 1} ("${utils.truncate(titleValue, 50)}"): formato de conteúdo não suportado (${format}).`);
      return null;
    }

    const sanitized = security.sanitizeHtml(content, { allowDataImages: true });
    if (security.containsScript(content) && sanitized.length < content.length) {
      context.warnings.push(`Item ${index + 1} ("${utils.truncate(titleValue, 50)}"): elementos ou atributos inseguros foram removidos.`);
    }

    const descriptionValue = typeof raw.description === "string" ? raw.description.trim() : "";
    if (descriptionValue.length > proceduresService.MAX_DESCRIPTION) {
      context.warnings.push(`Item ${index + 1}: a descrição foi reduzida para ${proceduresService.MAX_DESCRIPTION} caracteres.`);
    }

    const now = new Date().toISOString();
    const created = utils.toDate(raw.createdAt);
    const updated = utils.toDate(raw.updatedAt);
    if (raw.createdAt && !created) {
      context.warnings.push(`Item ${index + 1}: data de criação inválida; foi usada a data atual.`);
    }
    if (raw.updatedAt && !updated) {
      context.warnings.push(`Item ${index + 1}: data de atualização inválida; foi usada a data de criação.`);
    }
    const createdAt = created ? created.toISOString() : now;
    const updatedAt = updated ? updated.toISOString() : createdAt;

    return {
      index,
      originalId: id,
      id,
      title: utils.truncate(titleValue, proceduresService.MAX_TITLE),
      category: categoryValue,
      description: utils.truncate(descriptionValue, proceduresService.MAX_DESCRIPTION),
      content: sanitized,
      createdAt,
      updatedAt,
      embeddedImages: (sanitized.match(/<img\b[^>]*\bsrc="data:image\//gi) || []).length,
    };
  }

  function makeUniqueId(preferred, used) {
    let id = preferred;
    if (!id || used.has(id)) id = utils.uid("pop");
    while (used.has(id)) id = utils.uid("pop");
    used.add(id);
    return id;
  }

  async function preparePlan(data, file) {
    const envelopeData = validateEnvelope(data);
    const warnings = envelopeData.warnings.slice();
    const invalid = [];
    const context = { warnings, invalid };
    const existing = await proceduresService.getAll();
    const existingById = new Map(existing.map((procedure) => [procedure.id, procedure]));
    const existingTitles = new Map();
    existing.forEach((procedure) => {
      const key = utils.normalizeText(procedure.title);
      if (!existingTitles.has(key)) existingTitles.set(key, []);
      existingTitles.get(key).push(procedure);
    });

    const items = [];
    const seenIds = new Set();
    const fileTitles = new Map();

    envelopeData.rawProcedures.forEach((raw, index) => {
      const item = normalizeImportedItem(raw, index, context);
      if (!item) return;
      if (seenIds.has(item.id)) {
        const newId = utils.uid("pop");
        warnings.push(`Item ${index + 1}: identificador duplicado no arquivo. Um novo identificador foi gerado.`);
        item.id = newId;
      }
      seenIds.add(item.id);
      const titleKey = utils.normalizeText(item.title);
      if (!fileTitles.has(titleKey)) fileTitles.set(titleKey, []);
      fileTitles.get(titleKey).push(item.title);
      items.push(item);
    });

    let conflicts = 0;
    let newItems = 0;
    items.forEach((item) => {
      if (existingById.has(item.id)) {
        conflicts += 1;
        item.conflict = true;
      } else {
        newItems += 1;
        item.conflict = false;
      }
    });

    fileTitles.forEach((titles, key) => {
      if (titles.length > 1) {
        warnings.push(`Título repetido dentro do arquivo: "${utils.truncate(titles[0], 60)}" (${titles.length} itens).`);
      } else if (existingTitles.has(key)) {
        warnings.push(`Possível duplicata por título: "${utils.truncate(titles[0], 60)}" já existe com outro identificador.`);
      }
    });

    const totalEmbedded = items.reduce((sum, item) => sum + item.embeddedImages, 0);
    if (totalEmbedded) {
      warnings.push(`${utils.formatCount(totalEmbedded, "imagem incorporada será processada", "imagens incorporadas serão processadas")} e armazenada localmente.`);
    }

    return {
      file,
      items,
      warnings,
      invalid,
      conflicts,
      newItems,
      total: items.length,
      schemaVersion: envelopeData.schemaVersion,
      appName: envelopeData.appName,
      exportedAt: envelopeData.exportedAt,
      existingById,
    };
  }

  function buildSummary(plan) {
    const summary = document.getElementById("import-summary");
    summary.innerHTML = "";
    const stats = [
      { label: "Procedimentos válidos", value: plan.total, tone: "" },
      { label: "Novos", value: plan.newItems, tone: "" },
      { label: "Conflitos de ID", value: plan.conflicts, tone: plan.conflicts ? " warning" : "" },
    ];
    stats.forEach((stat) => {
      const box = document.createElement("div");
      box.className = `import-stat${stat.tone}`;
      const value = document.createElement("strong");
      value.className = "import-stat__value";
      value.textContent = String(stat.value);
      const label = document.createElement("span");
      label.className = "import-stat__label";
      label.textContent = stat.label;
      box.appendChild(value);
      box.appendChild(label);
      summary.appendChild(box);
    });

    const meta = document.createElement("p");
    meta.className = "dialog__text";
    meta.style.gridColumn = "1 / -1";
    meta.style.margin = "2px 0 0";
    const fileLabel = plan.file && plan.file.name ? plan.file.name : "arquivo selecionado";
    const versionLabel = `versão ${plan.schemaVersion}`;
    meta.textContent = `${fileLabel} · ${versionLabel}${plan.exportedAt ? ` · exportado em ${utils.formatDateTime(plan.exportedAt)}` : ""}`;
    summary.appendChild(meta);

    const warnings = document.getElementById("import-warnings");
    warnings.innerHTML = "";
    const allWarnings = plan.warnings.concat(plan.invalid);
    if (allWarnings.length) {
      const list = document.createElement("ul");
      allWarnings.slice(0, 40).forEach((message) => {
        const item = document.createElement("li");
        item.textContent = message;
        list.appendChild(item);
      });
      if (allWarnings.length > 40) {
        const item = document.createElement("li");
        item.textContent = `… e mais ${allWarnings.length - 40} avisos.`;
        list.appendChild(item);
      }
      warnings.appendChild(list);
    }

    const options = document.getElementById("import-options");
    options.hidden = plan.conflicts === 0;
    const skip = document.querySelector('input[name="import-strategy"][value="skip"]');
    if (skip) skip.checked = true;

    const confirm = document.getElementById("import-confirm");
    confirm.disabled = plan.total === 0;
    confirm.querySelector("span").textContent = plan.total
      ? `Importar ${utils.formatCount(plan.total, "procedimento", "procedimentos")}`
      : "Nada para importar";
    ui.setBusy(confirm, false);
  }

  function showPlan(plan) {
    pendingPlan = plan;
    buildSummary(plan);
    ui.openDialog("import-dialog");
  }

  async function handleImportFile(file) {
    try {
      const fileData = await readImportFile(file);
      const plan = await preparePlan(fileData.data, fileData.file);
      showPlan(plan);
    } catch (error) {
      ui.toast(error.message || "Não foi possível importar o arquivo.", "error", { duration: 7000 });
    }
  }

  function selectedStrategy() {
    const selected = document.querySelector('input[name="import-strategy"]:checked');
    return selected ? selected.value : "skip";
  }

  async function applyImport() {
    if (!pendingPlan) return;
    const plan = pendingPlan;
    const strategy = selectedStrategy();
    const confirmButton = document.getElementById("import-confirm");

    if (strategy === "update" && plan.conflicts > 0) {
      const proceed = await ui.confirm({
        title: "Substituir procedimentos existentes?",
        message: `${utils.formatCount(plan.conflicts, "procedimento existente será substituído", "procedimentos existentes serão substituídos")} pelos dados do arquivo. Esta ação não pode ser desfeita.`,
        confirmLabel: "Substituir e importar",
        danger: true,
        icon: "i-warning",
      });
      if (!proceed) return;
    }

    ui.setBusy(confirmButton, true);
    const existing = await proceduresService.getAll();
    const existingById = new Map(existing.map((procedure) => [procedure.id, procedure]));
    const usedIds = new Set(existing.map((procedure) => procedure.id));
    const records = [];
    const results = {
      created: 0,
      updated: 0,
      skipped: strategy === "skip" ? 0 : 0,
      failed: 0,
      images: 0,
    };
    const runtimeWarnings = [];

    for (const item of plan.items) {
      const current = existingById.get(item.id);
      if (current && strategy === "skip") {
        results.skipped += 1;
        continue;
      }
      let targetId = item.id;
      if (current && strategy === "new") {
        targetId = utils.uid("pop");
        while (usedIds.has(targetId)) targetId = utils.uid("pop");
      } else if (!current) {
        targetId = makeUniqueId(item.id, usedIds);
      }
      usedIds.add(targetId);

      try {
        let content = item.content;
        if (item.embeddedImages > 0) {
          const extracted = await images.extractDataImages(content, { stripInternalRefs: true });
          content = extracted.html;
          results.images += extracted.imported;
          runtimeWarnings.push(...extracted.warnings);
        } else {
          const cleaned = security.sanitizeHtml(content, { allowDataImages: false });
          content = cleaned;
        }

        const record = proceduresService.createFromImport(
          {
            title: item.title,
            category: item.category,
            description: item.description,
            content: content,
          },
          {
            id: targetId,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          }
        );

        records.push(record);
        if (current && strategy === "update") results.updated += 1;
        else results.created += 1;
      } catch (error) {
        results.failed += 1;
        runtimeWarnings.push(`"${utils.truncate(item.title, 50)}" não foi importado: ${error.message}`);
      }
    }

    try {
      if (records.length) await proceduresService.saveMany(records);
    } catch (error) {
      ui.setBusy(confirmButton, false);
      ui.toast(`Falha ao salvar a importação: ${error.message}`, "error", { duration: 8000 });
      return;
    }

    ui.setBusy(confirmButton, false);
    ui.closeDialog("import-dialog");
    pendingPlan = null;

    const totalApplied = results.created + results.updated;
    if (totalApplied) {
      const parts = [];
      if (results.created) parts.push(`${results.created} novo${results.created === 1 ? "" : "s"}`);
      if (results.updated) parts.push(`${results.updated} atualizado${results.updated === 1 ? "" : "s"}`);
      if (results.skipped) parts.push(`${results.skipped} ignorado${results.skipped === 1 ? "" : "s"}`);
      if (results.failed) parts.push(`${results.failed} com falha`);
      ui.toast(`Importação concluída: ${parts.join(", ")}.`, results.failed ? "warning" : "success", { duration: 6500 });
    } else if (plan.total === 0) {
      ui.toast("Nenhum procedimento válido foi encontrado no arquivo.", "warning");
    } else {
      ui.toast("Nenhum procedimento foi importado.", "warning");
    }

    if (runtimeWarnings.length) {
      ui.toast(utils.truncate(runtimeWarnings[0], 120), "warning", { duration: 6500 });
    }

    document.dispatchEvent(
      new CustomEvent("itdocs:procedures-changed", {
        detail: { source: "import", created: results.created, updated: results.updated, skipped: results.skipped },
      })
    );
  }

  function init() {
    if (initialized) return;
    initialized = true;
    const input = document.getElementById("import-file-input");
    if (input) {
      input.addEventListener("change", function () {
        const file = input.files && input.files[0];
        input.value = "";
        if (file) handleImportFile(file);
      });
    }
    const confirm = document.getElementById("import-confirm");
    if (confirm) confirm.addEventListener("click", applyImport);
    const cancel = document.getElementById("import-cancel");
    if (cancel) {
      cancel.addEventListener("click", function () {
        pendingPlan = null;
        ui.closeDialog("import-dialog");
      });
    }
    const dialog = document.getElementById("import-dialog");
    if (dialog) {
      dialog.addEventListener("close", function () {
        pendingPlan = null;
      });
    }
    document.querySelectorAll('input[name="import-strategy"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!pendingPlan) return;
        const confirmButton = document.getElementById("import-confirm");
        if (confirmButton) {
          const strategy = selectedStrategy();
          const label =
            strategy === "update"
              ? "Substituir e importar"
              : strategy === "new"
                ? "Importar como novos"
                : "Importar";
          confirmButton.querySelector("span").textContent = pendingPlan.total
            ? `${label} ${pendingPlan.total}`
            : "Nada para importar";
          const warnings = document.getElementById("import-warnings");
          let notice = warnings.querySelector(".import-update-warning");
          if (strategy === "update" && pendingPlan.conflicts) {
            if (!notice) {
              notice = document.createElement("div");
              notice.className = "import-update-warning";
              notice.textContent = `${utils.formatCount(pendingPlan.conflicts, "procedimento existente será substituído", "procedimentos existentes serão substituídos")}.`;
              warnings.prepend(notice);
            }
          } else if (notice) {
            notice.remove();
          }
        }
      });
    });
  }

  NS.importExport = {
    init,
    openPicker,
    handleImportFile,
    exportAll,
    exportProcedure,
    exportMarkdown,
    showMarkdown,
    copyMarkdown,
    getMarkdown,
    SCHEMA_VERSION,
  };
})();
