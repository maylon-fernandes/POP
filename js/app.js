(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  const utils = NS.utils;
  const security = NS.security;
  const proceduresService = NS.procedures;
  const search = NS.search;
  const categories = NS.categories;
  const ui = NS.ui;
  const images = NS.images;
  const importExport = NS.importExport;
  const animations = NS.animations;
  const scroll = NS.scroll;

  const state = {
    procedures: [],
    filterCategory: null,
    query: "",
    sort: "updated-desc",
    sidebarCollapsed: false,
    animations: true,
    view: "list",
    currentRoute: "#/",
    returnHash: "",
    editorReturnHash: "#/",
    readerProcedure: null,
    activeEditor: null,
    initialized: false,
  };

  let routing = false;
  let queuedRoute = null;
  let sidebarHideTimer = null;

  const elements = {};

  function cacheElements() {
    elements.app = document.getElementById("app");
    elements.main = document.getElementById("main");
    elements.sidebar = document.getElementById("sidebar");
    elements.overlay = document.getElementById("sidebar-overlay");
    elements.mobileMenu = document.getElementById("mobile-menu-btn");
    elements.viewList = document.getElementById("view-list");
    elements.viewEditor = document.getElementById("view-editor");
    elements.viewReader = document.getElementById("view-reader");
    elements.listTitle = document.getElementById("list-title");
    elements.listSubtitle = document.getElementById("list-subtitle");
    elements.listSearch = document.getElementById("list-search");
    elements.listSearchClear = document.getElementById("list-search-clear");
    elements.sortSelect = document.getElementById("sort-select");
    elements.filterChips = document.getElementById("filter-chips");
    elements.listSummary = document.getElementById("list-summary");
    elements.proceduresContainer = document.getElementById("procedures-container");
    elements.readerBack = document.getElementById("reader-back");
    elements.readerEdit = document.getElementById("reader-edit");
    elements.readerMore = document.getElementById("reader-more");
    elements.readerExportMd = document.getElementById("reader-export-md");
    elements.readerTitle = document.getElementById("reader-title");
    elements.readerDescription = document.getElementById("reader-description");
    elements.readerBadges = document.getElementById("reader-badges");
    elements.readerMeta = document.getElementById("reader-meta");
    elements.readerContent = document.getElementById("reader-content");
    elements.storageIndicator = document.getElementById("storage-indicator");
    elements.storageIndicatorText = document.getElementById("storage-indicator-text");
    elements.animationsToggle = document.getElementById("animations-toggle");
  }

  function parseHash(hash) {
    const value = String(hash || "").replace(/^#\/?/, "");
    if (!value) return { name: "list" };
    const parts = value.split("/").map((part) => decodeURIComponent(part));
    if (parts[0] === "categoria" && parts[1]) {
      return { name: "list", category: parts[1].toLowerCase() };
    }
    if (parts[0] === "novo") return { name: "new" };
    if (parts[0] === "editar" && parts[1]) return { name: "edit", id: parts[1] };
    if (parts[0] === "procedimento" && parts[1]) return { name: "view", id: parts[1] };
    return { name: "notfound" };
  }

  function navigate(hash) {
    const target = hash || "#/";
    closeSidebar();
    ui.closeMenu();
    if (location.hash === target) {
      handleRoute();
      return;
    }
    location.hash = target;
  }

  async function init() {
    cacheElements();
    ui.init();
    importExport.init();
    bindStaticEvents();

    const storageInfo = await NS.storage.init();
    const settings = NS.storage.loadSettings();
    state.sort = search.SORT_OPTIONS.has(settings.sort) ? settings.sort : "updated-desc";
    state.sidebarCollapsed = !!settings.sidebarCollapsed;
    state.animations = settings.animations !== false;
    animations.setEnabled(state.animations);
    scroll.setEnabled(state.animations);
    applySidebarState();
    updateAnimationsToggle();
    elements.sortSelect.value = state.sort;
    updateStorageIndicator(storageInfo);

    if (!NS.storage.getLocalStorageStatus()) {
      ui.toast("O LocalStorage está indisponível. Rascunhos e preferências podem não ser mantidos.", "warning", { duration: 7000 });
    }

    await refreshData();
    await renderHash(location.hash || "#/");
    if (!location.hash) history.replaceState(null, "", "#/");
    state.currentRoute = location.hash || "#/";
    state.initialized = true;
    animations.initial();

    cleanupImages().catch(() => undefined);
  }

  function bindStaticEvents() {
    document.getElementById("new-procedure-btn").addEventListener("click", () => navigate("#/novo"));
    document.getElementById("list-new-btn").addEventListener("click", () => navigate("#/novo"));
    document.getElementById("mobile-new-btn").addEventListener("click", () => navigate("#/novo"));

    document.getElementById("sidebar-collapse").addEventListener("click", toggleSidebarCollapsed);
    elements.animationsToggle.addEventListener("click", toggleAnimations);
    document.getElementById("mobile-menu-btn").addEventListener("click", () => {
      if (elements.app.classList.contains("is-sidebar-open")) closeSidebar();
      else openSidebar();
    });
    elements.overlay.addEventListener("click", closeSidebar);
    elements.sidebar.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (link) closeSidebar();
    });

    document.getElementById("import-btn").addEventListener("click", () => importExport.openPicker());
    document.getElementById("export-all-btn").addEventListener("click", () => importExport.exportAll());

    const onSearchInput = (event) => {
      state.query = event.target.value;
      syncSearchInputs();
      updateClearButton();
      scheduleListRender();
    };
    elements.listSearch.addEventListener("input", onSearchInput);

    elements.listSearchClear.addEventListener("click", () => {
      state.query = "";
      syncSearchInputs();
      updateClearButton();
      renderList();
      elements.listSearch.focus();
    });

    elements.sortSelect.addEventListener("change", function () {
      const value = search.SORT_OPTIONS.has(elements.sortSelect.value) ? elements.sortSelect.value : "updated-desc";
      state.sort = value;
      NS.storage.saveSettings({ sort: value });
      if (state.view === "list") renderList();
    });

    elements.filterChips.addEventListener("click", function (event) {
      const chip = event.target.closest("[data-category]");
      if (!chip) return;
      const category = chip.dataset.category;
      navigate(category ? `#/categoria/${category}` : "#/");
    });

    elements.proceduresContainer.addEventListener("click", function (event) {
      const card = event.target.closest(".procedure-card");
      if (!card) return;
      const procedure = state.procedures.find((item) => item.id === card.dataset.id);
      if (!procedure) return;
      openReader(procedure.id);
    });
    elements.proceduresContainer.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest(".procedure-card");
      if (!card) return;
      event.preventDefault();
      openReader(card.dataset.id);
    });

    elements.readerBack.addEventListener("click", () => {
      navigate(state.returnHash || (state.readerProcedure ? `#/categoria/${state.readerProcedure.category}` : "#/"));
    });
    elements.readerEdit.addEventListener("click", () => {
      if (!state.readerProcedure) return;
      state.returnHash = state.returnHash || state.currentRoute;
      navigate(`#/editar/${encodeURIComponent(state.readerProcedure.id)}`);
    });
    elements.readerExportMd.addEventListener("click", () => {
      if (state.readerProcedure) importExport.exportMarkdown(state.readerProcedure);
    });
    elements.readerMore.addEventListener("click", () => openReaderMenu());
    elements.readerContent.addEventListener("change", handleReaderCheckboxChange);

    window.addEventListener("hashchange", handleRoute);
    window.addEventListener("beforeunload", function (event) {
      if (state.activeEditor && state.activeEditor.hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && elements.app.classList.contains("is-sidebar-open")) {
        closeSidebar();
      }
    });

    document.addEventListener("itdocs:procedures-changed", async function () {
      await refreshData();
      if (state.view === "list") renderList();
      if (state.view === "reader" && state.readerProcedure) {
        const updated = await proceduresService.get(state.readerProcedure.id);
        if (updated) {
          renderReader(updated);
        } else {
          navigate("#/");
        }
      }
      await cleanupImages();
      updateSidebarCounts();
    });
  }

  function updateStorageIndicator(info) {
    if (!elements.storageIndicator) return;
    elements.storageIndicator.classList.remove("is-error", "is-warning");
    if (!info || !info.persistent) {
      elements.storageIndicator.classList.add("is-error");
      elements.storageIndicatorText.textContent = "Modo temporário";
      elements.storageIndicator.title =
        "O IndexedDB indisponível. Os dados serão mantidos apenas enquanto esta página estiver aberta.";
      ui.toast(
        "O armazenamento persistente (IndexedDB) não está disponível. As alterações serão mantidas apenas nesta sessão.",
        "error",
        { duration: 9000 }
      );
    } else {
      elements.storageIndicatorText.textContent = "Armazenamento local";
      elements.storageIndicator.title = "Procedimentos e imagens salvos neste navegador.";
    }
  }

  function applySidebarState() {
    elements.app.classList.toggle("is-sidebar-collapsed", state.sidebarCollapsed);
    const button = document.getElementById("sidebar-collapse");
    if (button) {
      button.setAttribute("aria-label", state.sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral");
      button.title = state.sidebarCollapsed ? "Expandir menu" : "Recolher menu";
    }
  }

  function toggleSidebarCollapsed() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    applySidebarState();
    NS.storage.saveSettings({ sidebarCollapsed: state.sidebarCollapsed });
  }

  function updateAnimationsToggle() {
    const toggle = elements.animationsToggle;
    if (!toggle) return;
    toggle.classList.toggle("is-on", state.animations);
    toggle.setAttribute("aria-pressed", String(state.animations));
    toggle.title = state.animations ? "Desativar animações" : "Ativar animações";
  }

  function toggleAnimations() {
    state.animations = !state.animations;
    animations.setEnabled(state.animations);
    scroll.setEnabled(state.animations);
    updateAnimationsToggle();
    NS.storage.saveSettings({ animations: state.animations });
    if (state.animations) {
      animations.viewIn(state.view);
      if (state.view === "list") animations.listIn(elements.proceduresContainer);
      ui.toast("Animações ativadas.", "success", { duration: 2200 });
    } else {
      ui.toast("Animações desativadas.", "info", { duration: 2200 });
    }
  }

  function openSidebar() {
    if (sidebarHideTimer) {
      clearTimeout(sidebarHideTimer);
      sidebarHideTimer = null;
    }
    elements.overlay.hidden = false;
    void elements.overlay.offsetWidth;
    elements.app.classList.add("is-sidebar-open");
    elements.overlay.classList.add("is-visible");
    animations.sidebarOpen(elements.sidebar);
    scroll.stop();
    elements.mobileMenu.setAttribute("aria-expanded", "true");
    const firstLink = elements.sidebar.querySelector(".nav-link");
    if (firstLink) window.setTimeout(() => firstLink.focus(), 220);
  }

  function closeSidebar() {
    if (!elements.app.classList.contains("is-sidebar-open")) {
      elements.overlay.hidden = true;
      elements.mobileMenu.setAttribute("aria-expanded", "false");
      return;
    }
    elements.app.classList.remove("is-sidebar-open");
    elements.overlay.classList.remove("is-visible");
    scroll.start();
    elements.mobileMenu.setAttribute("aria-expanded", "false");
    if (sidebarHideTimer) clearTimeout(sidebarHideTimer);
    sidebarHideTimer = window.setTimeout(() => {
      if (!elements.app.classList.contains("is-sidebar-open")) elements.overlay.hidden = true;
      sidebarHideTimer = null;
    }, 220);
  }

  async function refreshData(options) {
    const settings = options || {};
    state.procedures = await proceduresService.getAll();
    updateSidebarCounts();
    if (settings.renderList && state.view === "list") renderList();
  }

  function updateSidebarCounts() {
      const counts = search.counts(state.procedures);
      const all = document.getElementById("count-all");
      const sistema = document.getElementById("count-sistema");
      const hardware = document.getElementById("count-hardware");
      const rede = document.getElementById("count-rede");
      const tasy = document.getElementById("count-tasy");
      if (all) all.textContent = String(counts.all);
      if (sistema) sistema.textContent = String(counts.sistema);
      if (hardware) hardware.textContent = String(counts.hardware);
      if (rede) rede.textContent = String(counts.rede);
      if (tasy) tasy.textContent = String(counts.tasy);
      const total = document.getElementById("sidebar-total");
      const totalLabel = document.getElementById("sidebar-total-label");
      if (total) total.textContent = String(counts.all);
      if (totalLabel) totalLabel.textContent = counts.all === 1 ? "procedimento salvo" : "procedimentos salvos";
    }

  function updateClearButton() {
    elements.listSearchClear.hidden = !state.query;
  }

  function syncSearchInputs() {
    if (elements.listSearch.value !== state.query) elements.listSearch.value = state.query;
  }

  const scheduleListRender = utils.debounce(function () {
    if (state.view === "list") renderList();
  }, 120);

  function setActiveNav(category) {
    const target = category || "all";
    document.querySelectorAll("[data-nav]").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.nav === target);
    });
  }

  function showView(name) {
    state.view = name;
    elements.viewList.hidden = name !== "list";
    elements.viewEditor.hidden = name !== "editor";
    elements.viewReader.hidden = name !== "reader";
  }

  function renderList() {
    if (!state.filterCategory) {
      elements.listTitle.textContent = "Todos os procedimentos";
      elements.listSubtitle.textContent = "Documentação técnica organizada para consulta rápida.";
    } else {
      const category = categories.get(state.filterCategory);
      elements.listTitle.textContent = category ? category.label : "Procedimentos";
      elements.listSubtitle.textContent = category ? category.description : "Documentação técnica organizada.";
    }
    setActiveNav(state.filterCategory || "all");
    syncSearchInputs();
    updateClearButton();
    elements.sortSelect.value = state.sort;

    elements.filterChips.querySelectorAll("[data-category]").forEach((chip) => {
      const value = chip.dataset.category || null;
      chip.classList.toggle("is-active", value === state.filterCategory);
      chip.setAttribute("aria-pressed", value === state.filterCategory ? "true" : "false");
    });

    const filtered = search.filter(state.procedures, {
      query: state.query,
      category: state.filterCategory || "",
      sort: state.sort,
    });

    renderSummary(filtered);
    elements.proceduresContainer.innerHTML = "";

    if (!filtered.length) {
      elements.proceduresContainer.appendChild(buildEmptyState());
      showView("list");
      animations.listIn(elements.proceduresContainer);
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((procedure) => fragment.appendChild(buildProcedureCard(procedure)));
    elements.proceduresContainer.appendChild(fragment);
    showView("list");
    animations.listIn(elements.proceduresContainer);
  }

  function renderSummary(filtered) {
    elements.listSummary.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = String(filtered.length);
    elements.listSummary.appendChild(strong);
    const total = state.procedures.length;
    let text = filtered.length === 1 ? " procedimento" : " procedimentos";
    if (filtered.length !== total) text += ` de ${total}`;
    elements.listSummary.appendChild(document.createTextNode(text));
    if (state.query.trim()) {
      const query = document.createElement("span");
      query.className = "list-summary__query";
      query.textContent = ` · resultado para “${state.query.trim()}”`;
      query.title = state.query;
      elements.listSummary.appendChild(query);
    }
  }

  function buildEmptyState() {
    const wrapper = document.createElement("div");
    wrapper.className = "empty-state";
    const iconWrap = document.createElement("div");
    iconWrap.className = "empty-state__icon";
    iconWrap.appendChild(ui.icon(state.procedures.length ? "i-search-off" : "i-file-text"));
    wrapper.appendChild(iconWrap);

    const title = document.createElement("h2");
    const description = document.createElement("p");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--primary";

    if (!state.procedures.length) {
      title.textContent = "Nenhum procedimento cadastrado";
      description.textContent =
        "Comece criando o primeiro POP da equipe. Organize por categoria, escreva no editor visual e mantenha tudo em um só lugar.";
      button.innerHTML = "";
      button.appendChild(ui.icon("i-plus"));
      const label = document.createElement("span");
      label.textContent = "Criar primeiro procedimento";
      button.appendChild(label);
      button.addEventListener("click", () => navigate("#/novo"));
    } else {
      title.textContent = "Nenhum resultado encontrado";
      const category = state.filterCategory ? categories.get(state.filterCategory) : null;
      const parts = [];
      if (state.query.trim()) parts.push(`“${state.query.trim()}”`);
      if (category) parts.push(`na categoria ${category.label}`);
      description.textContent = parts.length
        ? `Não encontramos procedimentos para ${parts.join(" ")}. Ajuste a pesquisa ou remova os filtros.`
        : "Ajuste a pesquisa ou remova os filtros para ver mais procedimentos.";
      button.innerHTML = "";
      const label = document.createElement("span");
      label.textContent = "Limpar filtros";
      button.appendChild(label);
      button.addEventListener("click", () => {
        state.query = "";
        syncSearchInputs();
        updateClearButton();
        navigate("#/");
      });
    }

    wrapper.appendChild(title);
    wrapper.appendChild(description);
    wrapper.appendChild(button);
    return wrapper;
  }

  function buildProcedureCard(procedure) {
      const card = document.createElement("article");
      card.className = "procedure-card";
      card.dataset.id = procedure.id;
      card.dataset.category = procedure.category;
      card.tabIndex = 0;
      card.setAttribute("role", "link");
      card.setAttribute("aria-label", `Abrir procedimento: ${procedure.title}`);

      const title = document.createElement("h2");
      title.className = "procedure-card__title";
      title.textContent = procedure.title;

      const description = String(procedure.description || "").trim();
      const excerpt = document.createElement("p");
      excerpt.className = "procedure-card__excerpt";
      excerpt.textContent = description || "Sem descrição.";
      if (!description) excerpt.classList.add("is-empty");

      const category = categories.get(procedure.category);
      const badge = document.createElement("span");
      badge.className = `category-badge category-badge--${category?.color || "accent"}`;
      badge.appendChild(ui.icon(category?.icon || "i-info"));
      const badgeText = document.createElement("span");
      badgeText.textContent = category?.label || "Sem categoria";
      badge.appendChild(badgeText);

      card.appendChild(title);
      card.appendChild(excerpt);
      card.appendChild(badge);
      return card;
    }

  function openReader(id) {
    state.returnHash = state.currentRoute;
    navigate(`#/procedimento/${encodeURIComponent(id)}`);
  }

  function renderReader(procedure) {
    state.readerProcedure = procedure;
    showView("reader");
    setActiveNav(procedure.category);
    images.releaseAll();
    document.title = `${procedure.title} — Lingo`;

    const category = categories.get(procedure.category);
    elements.readerBadges.innerHTML = "";
    if (category) {
      const badge = document.createElement("span");
      badge.className = `category-badge category-badge--${category.color}`;
      badge.appendChild(ui.icon(category.icon));
      const text = document.createElement("span");
      text.textContent = category.label;
      badge.appendChild(text);
      elements.readerBadges.appendChild(badge);
    }

    elements.readerTitle.textContent = procedure.title;
    if (procedure.description) {
      elements.readerDescription.textContent = procedure.description;
      elements.readerDescription.hidden = false;
    } else {
      elements.readerDescription.hidden = true;
      elements.readerDescription.textContent = "";
    }

    updateReaderMeta(procedure);

    elements.readerContent.innerHTML = security.sanitizeHtml(procedure.content, { allowDataImages: false });
    security.hardenRenderedContent(elements.readerContent);
    images.resolve(elements.readerContent).catch(() => undefined);
    scroll.scrollTo(0, { immediate: true });
  }

  function updateReaderMeta(procedure) {
    elements.readerMeta.innerHTML = "";
    elements.readerMeta.appendChild(buildMetaItem("i-calendar", `Criado em ${utils.formatDate(procedure.createdAt, "long")}`));
    elements.readerMeta.appendChild(buildMetaItem("i-clock", `Atualizado em ${utils.formatDate(procedure.updatedAt, "long")}`));
    elements.readerMeta.appendChild(buildMetaItem("i-file-text", `${proceduresService.readTime(procedure)} min de leitura`));
  }

  function buildMetaItem(iconName, text) {
    const item = document.createElement("span");
    item.className = "reader-meta__item";
    item.appendChild(ui.icon(iconName));
    const label = document.createElement("span");
    label.textContent = text;
    item.appendChild(label);
    return item;
  }

  function openReaderMenu() {
    if (!state.readerProcedure) return;
    const procedure = state.readerProcedure;
    ui.openMenu(elements.readerMore, [
      { label: "Exportar JSON", icon: "i-download", onClick: () => importExport.exportProcedure(procedure) },
      { label: "Exportar Markdown", icon: "i-file-text", onClick: () => importExport.exportMarkdown(procedure) },
      { label: "Copiar Markdown", icon: "i-copy", onClick: () => importExport.copyMarkdown(procedure) },
      {
        label: "Copiar link",
        icon: "i-link",
        onClick: () => {
          const base = window.location.href.replace(/#.*$/, "");
          ui.copy(`${base}#/procedimento/${encodeURIComponent(procedure.id)}`, "Link do procedimento copiado.");
        },
      },
      "separator",
      { label: "Excluir procedimento", icon: "i-trash", danger: true, onClick: () => deleteProcedure(procedure) },
    ]);
  }

  async function deleteProcedure(procedure) {
    if (!procedure) return;
    const confirmed = await ui.confirm({
      title: "Excluir procedimento?",
      message: `O procedimento “${procedure.title}” será excluído permanentemente, incluindo as imagens armazenadas nele. Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir procedimento",
      cancelLabel: "Manter",
      danger: true,
      icon: "i-trash",
    });
    if (!confirmed) return;

    try {
      await proceduresService.remove(procedure.id);
      await refreshData();
      if (state.view === "reader" && state.readerProcedure && state.readerProcedure.id === procedure.id) {
        state.readerProcedure = null;
        navigate(state.returnHash || "#/");
      } else if (state.view === "list") {
        renderList();
      }
      await cleanupImages();
      ui.toast("Procedimento excluído.", "success");
    } catch (error) {
      ui.toast(`Não foi possível excluir o procedimento: ${error.message}`, "error", { duration: 7000 });
    }
  }

  async function handleReaderCheckboxChange(event) {
    const target = event.target;
    if (!target || !target.matches || !target.matches('input[type="checkbox"]')) return;
    const procedure = state.readerProcedure;
    if (!procedure) return;
    const item = target.closest("li");
    if (item) item.setAttribute("data-checked", target.checked ? "true" : "false");
    elements.readerContent.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      if (checkbox.checked) checkbox.setAttribute("checked", "");
      else checkbox.removeAttribute("checked");
      const li = checkbox.closest("li");
      if (li) li.setAttribute("data-checked", checkbox.checked ? "true" : "false");
    });
    try {
      const updated = await proceduresService.saveContent(procedure.id, elements.readerContent.innerHTML);
      if (state.readerProcedure && state.readerProcedure.id === updated.id) {
        state.readerProcedure = updated;
        updateProcedureInState(updated);
        updateReaderMeta(updated);
      }
    } catch (error) {
      ui.toast(`Não foi possível salvar o estado da checklist: ${error.message}`, "error");
    }
  }

  function updateProcedureInState(procedure) {
    const index = state.procedures.findIndex((item) => item.id === procedure.id);
    if (index >= 0) state.procedures[index] = procedure;
    else state.procedures.push(procedure);
    updateSidebarCounts();
  }

  function keepEditorVisibleAfterSave(record) {
    const editHash = `#/editar/${encodeURIComponent(record.id)}`;
    if (location.hash !== editHash) history.replaceState(null, "", editHash);
    state.currentRoute = editHash;
    state.editorReturnHash = `#/procedimento/${encodeURIComponent(record.id)}`;
    showView("editor");
    setActiveNav(record.category);
    document.title = `Editando: ${record.title} — Lingo`;
  }

  async function renderEditor(procedure, options) {
    const settings = options || {};
    if (settings.isNew) {
      const availableDraft = getAvailableDraft();
      state.editorReturnHash = deriveNewReturnHash();
      const editor = NS.editor.mount({
        procedure: null,
        draft: null,
        availableDraft,
        onDraftDiscarded: function () {
          cleanupImages().catch(() => undefined);
        },
        onCreated: function (record) {
          updateProcedureInState(record);
          refreshData()
            .then(() => navigate("#/"))
            .catch(() => navigate("#/"));
        },
        onSaved: function (record) {
          updateProcedureInState(record);
          refreshData().catch(() => undefined);
        },
        onExit: function () {
          navigate(state.editorReturnHash || "#/");
        },
      });
      state.activeEditor = editor;
      showView("editor");
      setActiveNav(null);
      document.title = "Novo procedimento — Lingo";
      scroll.scrollTo(0, { immediate: true });
      return;
    }

    if (!procedure) {
      ui.toast("Procedimento não encontrado.", "error");
      history.replaceState(null, "", "#/");
      await renderHash("#/");
      return;
    }

    state.editorReturnHash = `#/procedimento/${encodeURIComponent(procedure.id)}`;
    const editor = NS.editor.mount({
      procedure,
      onCreated: function (record) {
        keepEditorVisibleAfterSave(record);
        refreshData().catch(() => undefined);
      },
      onSaved: function (record) {
        updateProcedureInState(record);
        keepEditorVisibleAfterSave(record);
        refreshData().catch(() => undefined);
      },
      onExit: function () {
        navigate(state.editorReturnHash || "#/");
      },
    });
    state.activeEditor = editor;
    showView("editor");
    setActiveNav(procedure.category);
    document.title = `Editando: ${procedure.title} — Lingo`;
    scroll.scrollTo(0, { immediate: true });
  }

  function deriveNewReturnHash() {
    const previous = state.currentRoute || "#/";
    if (previous === "#/" || previous.startsWith("#/categoria/") || previous.startsWith("#/procedimento/")) {
      return previous;
    }
    return "#/";
  }

  function getAvailableDraft() {
    const draft = NS.storage.getDraft();
    if (!draft) return null;
    const hasData =
      draft.title.trim() || draft.description.trim() || utils.stripHtml(draft.content).trim() || /<img\b/i.test(draft.content);
    if (!hasData) {
      NS.storage.clearDraft();
      return null;
    }
    return draft;
  }

  async function renderHash(hash) {
    const route = parseHash(hash);
    ui.closeMenu();

    if (route.name === "list") {
      if (route.category && !categories.isValid(route.category)) {
        ui.toast("Categoria não encontrada.", "warning");
        history.replaceState(null, "", "#/");
        state.filterCategory = null;
        renderList();
        animations.viewIn("list");
        return;
      }
      state.filterCategory = route.category || null;
      renderList();
      document.title = state.filterCategory ? `${categories.get(state.filterCategory).label} — Lingo` : "Lingo — Procedimentos Operacionais";
      scroll.scrollTo(0, { immediate: true });
      animations.viewIn("list");
      return;
    }

    if (route.name === "new") {
      await renderEditor(null, { isNew: true });
      animations.viewIn("editor");
      return;
    }

    if (route.name === "edit") {
      const procedure = await proceduresService.get(route.id);
      if (!procedure) {
        ui.toast("O procedimento que você tentou editar não existe mais.", "warning");
        history.replaceState(null, "", "#/");
        state.filterCategory = null;
        renderList();
        animations.viewIn("list");
        return;
      }
      await renderEditor(procedure, { isNew: false });
      animations.viewIn("editor");
      return;
    }

    if (route.name === "view") {
      const procedure = await proceduresService.get(route.id);
      if (!procedure) {
        ui.toast("O procedimento solicitado não foi encontrado.", "warning");
        history.replaceState(null, "", "#/");
        state.filterCategory = null;
        renderList();
        animations.viewIn("list");
        return;
      }
      renderReader(procedure);
      animations.viewIn("reader");
      return;
    }

    ui.toast("Página não encontrada. Exibindo a lista de procedimentos.", "warning");
    history.replaceState(null, "", "#/");
    state.filterCategory = null;
    renderList();
    animations.viewIn("list");
  }

  async function handleRoute() {
    const target = location.hash || "#/";
    if (routing) {
      queuedRoute = target;
      return;
    }
    if (state.activeEditor && target === state.currentRoute) {
      return;
    }
    routing = true;
    try {
      if (state.activeEditor) {
        const editor = state.activeEditor;
        const unsaved = await editor.flushBeforeLeave();
        if (unsaved) {
          const leave = await ui.confirm({
            title: "Sair do editor?",
            message: "Existem alterações que ainda não puderam ser salvas. Se sair agora, essas alterações serão perdidas.",
            confirmLabel: "Sair sem salvar",
            cancelLabel: "Continuar editando",
            danger: true,
            icon: "i-warning",
          });
          if (!leave) {
            history.replaceState(null, "", state.currentRoute);
            return;
          }
        }
        editor.destroy();
        state.activeEditor = null;
        state.readerProcedure = null;
      }
      images.releaseAll();
      showView(state.view);
      await renderHash(target);
      state.currentRoute = location.hash || target;
    } catch (error) {
      ui.toast(`Não foi possível abrir a página: ${error.message}`, "error", { duration: 7000 });
    } finally {
      routing = false;
      if (queuedRoute && queuedRoute !== location.hash) {
        const next = queuedRoute;
        queuedRoute = null;
        handleRoute();
      } else {
        queuedRoute = null;
      }
    }
  }

  async function cleanupImages() {
    const referenced = new Set();
    state.procedures.forEach((procedure) => {
      images.collectReferencedIds(procedure.content).forEach((id) => referenced.add(id));
    });
    const draft = NS.storage.getDraft();
    if (draft) images.collectReferencedIds(draft.content).forEach((id) => referenced.add(id));
    if (state.activeEditor) {
      try {
        images.collectReferencedIds(state.activeEditor.serializeContent()).forEach((id) => referenced.add(id));
      } catch (error) {
        /* o editor pode estar em transição */
      }
    }
    try {
      await images.cleanup(referenced);
    } catch (error) {
      /* limpeza é oportunista */
    }
  }

  window.ITDocsApp = {
    state,
    navigate,
    refreshData,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
