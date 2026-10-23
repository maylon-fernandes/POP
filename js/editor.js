(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  const utils = NS.utils;
  const security = NS.security;
  const proceduresService = NS.procedures;
  const images = NS.images;
  const ui = NS.ui;
  const importExport = NS.importExport;

  const BLOCK_SELECTOR = "p, div, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, hr, figure";
  const IMAGE_CLASS_PATTERN = /^(img-w-(25|50|75|100)|img-align-(left|center|right))$/;
  const TOP_LEVEL_BLOCKS = new Set([
    "P",
    "DIV",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "UL",
    "OL",
    "BLOCKQUOTE",
    "PRE",
    "HR",
    "FIGURE",
  ]);

  let activeEditor = null;

  class Editor {
    constructor(options) {
      this.options = options || {};
      this.procedure = this.options.procedure || null;
      this.isNew = !this.procedure;
      this.currentId = this.procedure ? this.procedure.id : null;
      this.createdAt = this.procedure ? this.procedure.createdAt : null;
      this.updatedAt = this.procedure ? this.procedure.updatedAt : null;
      this.draft = this.options.draft || null;
      this.availableDraft = this.options.availableDraft || null;
      this.dirty = false;
      this.saving = false;
      this.savePromise = null;
      this.destroyed = false;
      this.selectedImage = null;
      this.savedRange = null;
      this.imageDialogRange = null;
      this.toolbarFrame = null;
      this.imageFrame = null;
      this.controller = new AbortController();
      this.autoSave = utils.debounce(() => this.runAutoSave(), 900);
    }

    init() {
      this.cacheElements();
      this.bindEvents();
      this.populate();
      this.updateToolbar();
      this.renderDraftBanner();
      this.setStatus(
        this.isNew ? "draft" : "saved",
        this.isNew ? (this.availableDraft ? "Rascunho disponível" : "Novo procedimento") : "Salvo"
      );
      if (this.isNew) {
        window.setTimeout(() => {
          if (!this.destroyed) this.titleEl.focus();
        }, 80);
      }
      return this;
    }

    cacheElements() {
      this.titleEl = document.getElementById("editor-title");
      this.categoryEl = document.getElementById("editor-category");
      this.descriptionEl = document.getElementById("editor-description");
      this.contentEl = document.getElementById("editor-content");
      this.toolbarEl = document.getElementById("editor-toolbar");
      this.statusEl = document.getElementById("save-status");
      this.statusTextEl = document.getElementById("save-status-text");
      this.titleErrorEl = document.getElementById("editor-title-error");
      this.categoryErrorEl = document.getElementById("editor-category-error");
      this.saveButton = document.getElementById("editor-save");
      this.markdownButton = document.getElementById("editor-markdown");
      this.imageControls = document.getElementById("image-controls");
      this.imageFileInput = document.getElementById("image-file-input");
      this.markdownFileInput = document.getElementById("markdown-file-input");
      this.imageDialog = document.getElementById("image-dialog");
      this.imageDialogUrl = document.getElementById("image-dialog-url");
      this.imageDialogError = document.getElementById("image-dialog-error");
      this.imageDialogFile = document.getElementById("image-dialog-file");
      this.draftBanner = document.getElementById("editor-draft");
      this.draftBannerText = document.getElementById("editor-draft-text");
      this.draftRestoreButton = document.getElementById("editor-draft-restore");
      this.draftDiscardButton = document.getElementById("editor-draft-discard");
    }

    bindEvents() {
      const signal = this.controller.signal;
      const contentEl = this.contentEl;

      document.getElementById("editor-back").addEventListener("click", () => this.requestExit(), { signal });
      document.getElementById("editor-cancel").addEventListener("click", () => this.requestExit(), { signal });
      this.saveButton.addEventListener("click", () => this.saveExplicit(), { signal });
      this.markdownButton.addEventListener("click", () => this.showMarkdown(), { signal });
      if (this.draftRestoreButton) {
        this.draftRestoreButton.addEventListener("click", () => this.restoreDraft(), { signal });
      }
      if (this.draftDiscardButton) {
        this.draftDiscardButton.addEventListener("click", () => this.discardDraft(), { signal });
      }

      this.titleEl.addEventListener("input", () => {
        this.clearFieldError("title");
        this.markDirty();
      }, { signal });
      this.titleEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.contentEl.focus();
          this.placeCaretAtEnd();
        }
      }, { signal });
      this.categoryEl.addEventListener("change", () => {
        this.clearFieldError("category");
        this.markDirty();
      }, { signal });
      this.descriptionEl.addEventListener("input", () => {
        this.clearFieldError("description");
        this.markDirty();
      }, { signal });

      contentEl.addEventListener("input", () => this.onContentInput(), { signal });
      contentEl.addEventListener("change", (event) => {
        const target = event.target;
        if (target && target.matches && target.matches('input[type="checkbox"]')) {
          this.syncTaskCheckbox(target);
          this.markDirty();
        }
      }, { signal });
      contentEl.addEventListener("keydown", (event) => this.handleKeydown(event), { signal });
      contentEl.addEventListener("paste", (event) => this.handlePaste(event), { signal });
      contentEl.addEventListener("click", (event) => this.handleContentClick(event), { signal });
      contentEl.addEventListener("dragenter", (event) => this.handleDragEnter(event), { signal });
      contentEl.addEventListener("dragover", (event) => this.handleDragEnter(event), { signal });
      contentEl.addEventListener("dragleave", (event) => this.handleDragLeave(event), { signal });
      contentEl.addEventListener("drop", (event) => this.handleDrop(event), { signal });
      contentEl.addEventListener("focus", () => {
        try {
          document.execCommand("defaultParagraphSeparator", false, "p");
        } catch (error) {
          /* ignora navegadores sem suporte */
        }
      }, { signal });

      this.toolbarEl.addEventListener("mousedown", (event) => {
        const button = event.target.closest("button[data-command], button[data-block]");
        if (button) {
          event.preventDefault();
          this.savedRange = this.captureRange();
        }
      }, { signal });
      this.toolbarEl.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-command], button[data-block]");
        if (!button) return;
        if (button.dataset.block) this.applyBlock(button.dataset.block);
        else this.handleCommand(button.dataset.command);
      }, { signal });

      document.addEventListener("selectionchange", () => this.scheduleToolbarUpdate(), { signal });
      window.addEventListener("resize", () => this.scheduleImagePosition(), { signal });
      window.addEventListener("scroll", () => this.scheduleImagePosition(), { signal: this.controller.signal, capture: true });
      document.addEventListener("pointerdown", (event) => {
        if (!this.selectedImage) return;
        if (this.imageControls.contains(event.target)) return;
        if (event.target.closest && event.target.closest("img.doc-image")) return;
        this.hideImageControls();
      }, { signal });

      this.imageControls.addEventListener("mousedown", (event) => {
        if (event.target.closest("button")) event.preventDefault();
      }, { signal });
      this.imageControls.addEventListener("click", (event) => this.handleImageControlClick(event), { signal });

      this.imageDialogFile.addEventListener("click", () => {
        this.imageFileInput.value = "";
        this.imageFileInput.click();
      }, { signal });
      this.imageFileInput.addEventListener("change", () => {
        const file = this.imageFileInput.files && this.imageFileInput.files[0];
        this.imageFileInput.value = "";
        if (file) this.handleImageFile(file);
      }, { signal });
      this.imageDialog.addEventListener("submit", (event) => this.handleImageDialogSubmit(event), { signal });

      this.markdownFileInput.addEventListener("change", () => {
        const file = this.markdownFileInput.files && this.markdownFileInput.files[0];
        this.markdownFileInput.value = "";
        if (file) this.handleMarkdownFile(file);
      }, { signal });
    }

    populate() {
      const source = this.isNew ? this.draft : this.procedure;
      this.titleEl.value = source ? source.title || "" : "";
      this.categoryEl.value = source ? source.category || "" : "";
      this.descriptionEl.value = source ? source.description || "" : "";
      const content = security.sanitizeHtml(source ? source.content || "" : "", { allowDataImages: false });
      this.contentEl.innerHTML = content;
      this.maintainTaskLists();
      if (content) {
        images.resolve(this.contentEl).then(() => {
          if (!this.destroyed) this.maintainTaskLists();
        });
      }
      this.clearValidationErrors();
      this.lastSavedSnapshot = this.snapshot();
      this.dirty = false;
    }

    renderDraftBanner() {
      if (!this.draftBanner) return;
      const draft = this.isNew ? this.availableDraft : null;
      this.draftBanner.hidden = !draft;
      if (!draft) {
        if (this.draftBannerText) this.draftBannerText.textContent = "";
        return;
      }
      if (this.draftBannerText) {
        const when = utils.formatDateTime(draft.updatedAt);
        this.draftBannerText.textContent = `Salvo em ${when}. Abra em branco ou restaure o conteúdo anterior.`;
      }
    }

    restoreDraft() {
      if (!this.availableDraft) return;
      this.draft = this.availableDraft;
      this.availableDraft = null;
      this.populate();
      this.renderDraftBanner();
      this.setStatus("draft", "Rascunho restaurado");
      this.updateToolbar();
      window.setTimeout(() => {
        if (!this.destroyed) this.titleEl.focus();
      }, 40);
    }

    async discardDraft() {
      if (!this.availableDraft) return;
      this.availableDraft = null;
      this.draft = null;
      NS.storage.clearDraft();
      this.renderDraftBanner();
      this.setStatus("draft", "Novo procedimento");
      if (this.options.onDraftDiscarded) this.options.onDraftDiscarded();
      ui.toast("Rascunho descartado.", "info");
    }

    getPayload() {
      return {
        title: this.titleEl.value.trim(),
        category: this.categoryEl.value,
        description: this.descriptionEl.value.trim(),
        content: this.serializeContent(),
      };
    }

    snapshot() {
      const payload = this.getPayload();
      return JSON.stringify({
        title: payload.title,
        category: payload.category,
        description: payload.description,
        content: payload.content,
      });
    }

    markDirty() {
      if (this.availableDraft) {
        this.availableDraft = null;
        this.renderDraftBanner();
      }
      this.dirty = true;
      this.setStatus("dirty", "Alterações não salvas");
      this.autoSave();
    }

    setStatus(state, text) {
      if (!this.statusEl) return;
      this.statusEl.dataset.state = state;
      this.statusTextEl.textContent = text;
    }

    async runAutoSave() {
      if (this.destroyed) return;
      if (this.isNew) {
        this.saveDraftNow();
        return;
      }
      if (!this.hasValidFields()) {
        this.setStatus("dirty", "Preencha título e categoria");
        return;
      }
      await this.persist({ auto: true });
    }

    saveDraftNow() {
      if (!this.isNew) return false;
      const payload = this.getPayload();
      const draft = {
        title: payload.title,
        category: payload.category,
        description: payload.description,
        content: payload.content,
        updatedAt: new Date().toISOString(),
      };
      const saved = NS.storage.saveDraft(draft);
      if (saved) {
        this.lastSavedSnapshot = this.snapshot();
        this.dirty = false;
        this.setStatus("draft", "Rascunho salvo localmente");
      } else {
        this.setStatus("error", "Falha ao salvar rascunho");
        ui.toast("Não foi possível salvar o rascunho. O armazenamento local pode estar cheio ou indisponível.", "error", { duration: 7000 });
      }
      return saved;
    }

    hasValidFields() {
      const result = proceduresService.validateFields(this.getPayload());
      return result.valid;
    }

    async persist(options) {
      if (this.saving && this.savePromise) {
        await this.savePromise.catch(() => undefined);
      }
      const settings = options || {};
      if (this.isNew) {
        if (settings.auto) {
          return this.saveDraftNow();
        }
        return this.createProcedure();
      }
      this.saving = true;
      this.setStatus("saving", "Salvando...");
      this.savePromise = this.doPersistExisting(settings).finally(() => {
        this.saving = false;
        this.savePromise = null;
      });
      return this.savePromise;
    }

    async doPersistExisting(settings) {
      const payload = this.getPayload();
      const snapshotBefore = JSON.stringify(payload);
      try {
        const record = await proceduresService.update(this.currentId, payload);
        this.updatedAt = record.updatedAt;
        this.lastSavedSnapshot = snapshotBefore;
        const stillDirty = this.snapshot() !== snapshotBefore;
        this.dirty = stillDirty;
        if (stillDirty) {
          this.setStatus("dirty", "Alterações não salvas");
          this.autoSave();
        } else {
          this.setStatus("saved", settings.auto ? "Salvo automaticamente" : "Salvo");
        }
        if (this.options.onSaved) this.options.onSaved(record, { auto: !!settings.auto, created: false });
        if (!settings.auto) ui.toast("Procedimento salvo.", "success");
        return record;
      } catch (error) {
        return this.handleSaveError(error, "Não foi possível salvar o procedimento.");
      }
    }

    async createProcedure() {
      if (this.saving && this.savePromise) return this.savePromise;
      const validation = proceduresService.validateFields(this.getPayload());
      if (!validation.valid) {
        this.showValidationErrors(validation.errors);
        this.setStatus("dirty", "Revise os campos obrigatórios");
        ui.toast("Preencha o título e selecione uma categoria.", "warning");
        return null;
      }
      this.clearValidationErrors();
      this.saving = true;
      this.setStatus("saving", "Criando procedimento...");
      this.savePromise = (async () => {
        try {
          const payload = this.getPayload();
          const snapshotBefore = JSON.stringify(payload);
          const record = await proceduresService.create(payload);
          this.currentId = record.id;
          this.createdAt = record.createdAt;
          this.updatedAt = record.updatedAt;
          this.isNew = false;
          this.dirty = false;
          this.availableDraft = null;
          this.lastSavedSnapshot = snapshotBefore;
          NS.storage.clearDraft();
          this.renderDraftBanner();
          this.setStatus("saved", "Salvo");
          if (this.options.onCreated) this.options.onCreated(record);
          if (this.options.onSaved) this.options.onSaved(record, { auto: false, created: true });
          ui.toast("Procedimento criado.", "success");
          return record;
        } catch (error) {
          return this.handleSaveError(error, "Não foi possível criar o procedimento.");
        } finally {
          this.saving = false;
          this.savePromise = null;
        }
      })();
      return this.savePromise;
    }

    handleSaveError(error, fallbackMessage) {
      if (error && error.name === "ValidationError") {
        this.showValidationErrors(error.errors);
        this.setStatus("dirty", "Revise os campos obrigatórios");
        ui.toast("Revise os campos destacados.", "warning");
        return null;
      }
      this.dirty = true;
      this.setStatus("error", "Falha ao salvar");
      ui.toast(`${fallbackMessage} ${error && error.message ? error.message : ""}`.trim(), "error", { duration: 7000 });
      return null;
    }

    async saveExplicit() {
      this.autoSave.cancel();
      if (!this.isNew && !this.dirty && !this.saving) {
        ui.toast("Nenhuma alteração pendente.", "info");
        return true;
      }
      if (this.isNew) {
        await this.createProcedure();
        return !this.isNew;
      }
      const record = await this.persist({ auto: false });
      return !!record;
    }

    async flushBeforeLeave() {
      if (this.destroyed) return false;
      if (this.autoSave.pending()) {
        this.autoSave.cancel();
        await this.runAutoSave();
      }
      if (this.saving && this.savePromise) {
        await this.savePromise.catch(() => undefined);
      }
      if (this.dirty && !this.saving) {
        if (this.isNew) this.saveDraftNow();
        else if (this.hasValidFields()) await this.persist({ auto: true });
      }
      return this.hasUnsavedChanges();
    }

    hasUnsavedChanges() {
      return this.dirty || this.saving || this.autoSave.pending();
    }

    showValidationErrors(errors) {
      this.setFieldError("title", errors.title);
      this.setFieldError("category", errors.category);
      if (errors.title && this.titleEl) this.titleEl.focus();
      else if (errors.category && this.categoryEl) this.categoryEl.focus();
    }

    clearValidationErrors() {
      this.setFieldError("title", null);
      this.setFieldError("category", null);
    }

    setFieldError(field, message) {
      const errorEl = field === "title" ? this.titleErrorEl : this.categoryErrorEl;
      const inputEl = field === "title" ? this.titleEl : this.categoryEl;
      if (!errorEl || !inputEl) return;
      errorEl.textContent = message || "";
      errorEl.hidden = !message;
      if (message) inputEl.setAttribute("aria-invalid", "true");
      else inputEl.removeAttribute("aria-invalid");
    }

    clearFieldError(field) {
      if (field === "description") return;
      this.setFieldError(field, null);
    }

    serializeContent() {
      this.syncAllTaskCheckboxes();
      const clone = this.contentEl.cloneNode(true);
      this.normalizeTopLevel(clone);

      clone.querySelectorAll("img").forEach((img) => {
        img.classList.remove("is-selected", "is-missing");
        const imageId = img.getAttribute("data-image-id");
        if (imageId) {
          img.removeAttribute("src");
          img.removeAttribute("loading");
          img.removeAttribute("decoding");
          Array.from(img.classList).forEach((name) => {
            if (!IMAGE_CLASS_PATTERN.test(name)) img.classList.remove(name);
          });
          img.classList.add("doc-image");
        } else {
          const src = img.getAttribute("src") || "";
          if (!/^(https?:|\/\/)/i.test(src)) img.remove();
        }
      });

      clone.querySelectorAll("[align]").forEach((element) => {
        const align = element.getAttribute("align");
        if (/^(left|center|right|justify)$/i.test(align)) {
          element.style.textAlign = align.toLowerCase();
        }
        element.removeAttribute("align");
      });

      clone.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.setAttribute("contenteditable", "false");
        if (input.checked) input.setAttribute("checked", "");
        else input.removeAttribute("checked");
        const li = input.closest("li");
        if (li) li.setAttribute("data-checked", input.checked ? "true" : "false");
      });

      clone.querySelectorAll("li[data-checked]").forEach((li) => {
        const value = li.getAttribute("data-checked");
        if (value !== "true" && value !== "false") li.removeAttribute("data-checked");
      });

      clone.querySelectorAll('[contenteditable="true"]').forEach((element) => element.removeAttribute("contenteditable"));

      return security.sanitizeHtml(clone.innerHTML, { allowDataImages: false });
    }

    normalizeTopLevel(clone) {
      const output = [];
      let buffer = [];
      const flush = () => {
        if (!buffer.length) return;
        const hasContent = buffer.some((node) => {
          if (node.nodeType === 3) return node.nodeValue.trim();
          return node.nodeType === 1;
        });
        if (hasContent) {
          const paragraph = document.createElement("p");
          buffer.forEach((node) => paragraph.appendChild(node));
          output.push(paragraph);
        }
        buffer = [];
      };
      Array.from(clone.childNodes).forEach((node) => {
        if (node.nodeType === 1 && TOP_LEVEL_BLOCKS.has(node.tagName)) {
          flush();
          output.push(node);
        } else if (node.nodeType === 3 && !node.nodeValue.trim() && !buffer.length) {
          node.remove();
        } else {
          buffer.push(node);
        }
      });
      flush();
      clone.textContent = "";
      output.forEach((node) => clone.appendChild(node));
    }

    onContentInput() {
      this.maintainTaskLists();
      this.markDirty();
    }

    maintainTaskLists() {
      this.contentEl.querySelectorAll("ul.task-list, ol.task-list").forEach((list) => {
        Array.from(list.children).forEach((item) => {
          if (!item.matches || !item.matches("li")) return;
          let checkbox = Array.from(item.children).find(
            (child) => child.matches && child.matches('input[type="checkbox"]')
          );
          if (!checkbox) {
            checkbox = this.createTaskCheckbox();
            item.prepend(checkbox);
          }
          checkbox.setAttribute("contenteditable", "false");
          checkbox.classList.add("task-checkbox");
          const checked = item.getAttribute("data-checked") === "true" || checkbox.checked;
          checkbox.checked = checked;
          item.setAttribute("data-checked", checked ? "true" : "false");
          if (checked) checkbox.setAttribute("checked", "");
          else checkbox.removeAttribute("checked");
        });
      });
    }

    createTaskCheckbox() {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-checkbox";
      checkbox.setAttribute("contenteditable", "false");
      checkbox.setAttribute("aria-label", "Tarefa");
      return checkbox;
    }

    syncTaskCheckbox(checkbox) {
      const item = checkbox.closest("li");
      if (!item) return;
      if (checkbox.checked) {
        item.setAttribute("data-checked", "true");
        checkbox.setAttribute("checked", "");
      } else {
        item.setAttribute("data-checked", "false");
        checkbox.removeAttribute("checked");
      }
    }

    syncAllTaskCheckboxes() {
      this.contentEl.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        this.syncTaskCheckbox(checkbox);
      });
    }

    handleKeydown(event) {
      const isModifier = event.ctrlKey || event.metaKey;
      if (isModifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.saveExplicit();
        return;
      }
      if (isModifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        this.openLinkDialog();
        return;
      }
      if (event.key === "Escape") {
        this.hideImageControls();
      }

      const inPre = this.closestElement("pre");
      if (event.key === "Tab" && inPre) {
        event.preventDefault();
        this.insertPlainText("  ");
        this.markDirty();
        return;
      }
      if (event.key === "Tab") {
        return;
      }
      if (event.key === "Enter" && inPre && !event.shiftKey) {
        event.preventDefault();
        this.insertPlainText("\n");
        this.markDirty();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        const item = this.closestElement("li");
        const inTaskList = item && item.parentElement && item.parentElement.classList.contains("task-list");
        if (inTaskList) {
          window.setTimeout(() => {
            if (this.destroyed) return;
            const current = this.closestElement("li");
            if (current && !current.textContent.replace(/\s+/g, "").trim()) {
              const checkbox = Array.from(current.children).find(
                (child) => child.matches && child.matches('input[type="checkbox"]')
              );
              if (checkbox) {
                checkbox.checked = false;
                checkbox.removeAttribute("checked");
                current.setAttribute("data-checked", "false");
              }
            }
            this.maintainTaskLists();
          }, 0);
        }
      }
    }

    closestElement(selector) {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return null;
      let node = selection.anchorNode;
      if (!node || !this.contentEl.contains(node)) return null;
      if (node.nodeType === 3) node = node.parentElement;
      return node ? node.closest(selector) : null;
    }

    insertPlainText(text) {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!this.contentEl.contains(range.commonAncestorContainer)) return;
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    handleContentClick(event) {
      const image = event.target.closest && event.target.closest("img.doc-image");
      if (image && this.contentEl.contains(image)) {
        this.selectImage(image);
      }
    }

    captureRange() {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return null;
      const range = selection.getRangeAt(0);
      if (!this.contentEl.contains(range.commonAncestorContainer)) return null;
      return range.cloneRange();
    }

    restoreRange(range) {
      this.contentEl.focus();
      const selection = window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      if (range && this.contentEl.contains(range.commonAncestorContainer)) {
        selection.addRange(range);
      } else {
        const newRange = document.createRange();
        newRange.selectNodeContents(this.contentEl);
        newRange.collapse(false);
        selection.addRange(newRange);
      }
    }

    placeCaretAtEnd() {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(this.contentEl);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    ensureEditorFocus() {
      if (!this.contentEl.contains(window.getSelection().anchorNode)) {
        this.restoreRange(this.savedRange);
      }
    }

    insertHtml(html) {
      this.restoreRange(this.savedRange);
      this.savedRange = null;
      let inserted = false;
      try {
        inserted = document.execCommand("insertHTML", false, html);
      } catch (error) {
        inserted = false;
      }
      if (!inserted) {
        const template = document.createElement("template");
        template.innerHTML = html;
        const selection = window.getSelection();
        const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
        if (range && this.contentEl.contains(range.commonAncestorContainer)) {
          range.deleteContents();
          const fragment = template.content;
          const lastNode = fragment.lastChild;
          range.insertNode(fragment);
          if (lastNode) {
            range.setStartAfter(lastNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } else {
          this.contentEl.appendChild(template.content);
        }
      }
      this.maintainTaskLists();
    }

    applyBlock(tag) {
      this.ensureEditorFocus();
      this.hideImageControls();
      const normalized = tag === "p" ? "p" : tag;
      try {
        document.execCommand("formatBlock", false, normalized);
      } catch (error) {
        /* alguns navegadores usam <tag> */
        try {
          document.execCommand("formatBlock", false, `<${normalized}>`);
        } catch (innerError) {
          /* ignora */
        }
      }
      this.markDirty();
      this.updateToolbar();
    }

    handleCommand(command) {
      if (!command) return;
      this.ensureEditorFocus();
      switch (command) {
        case "undo":
          document.execCommand("undo");
          break;
        case "redo":
          document.execCommand("redo");
          break;
        case "inlineCode":
          this.wrapSelectionWithCode();
          return;
        case "taskList":
          this.toggleTaskList();
          return;
        case "link":
          this.openLinkDialog();
          return;
        case "image":
          this.openImageDialog();
          return;
        case "markdownImport":
          this.markdownFileInput.value = "";
          this.markdownFileInput.click();
          return;
        case "removeFormat":
          document.execCommand("removeFormat");
          break;
        case "insertHorizontalRule":
          document.execCommand("insertHorizontalRule");
          break;
        default:
          try {
            document.execCommand(command);
          } catch (error) {
            ui.toast("Este comando não é suportado pelo navegador.", "warning");
          }
      }
      this.markDirty();
      this.updateToolbar();
    }

    wrapSelectionWithCode() {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!this.contentEl.contains(range.commonAncestorContainer)) return;
      if (range.collapsed) {
        this.insertHtml("<code>\u200b</code>");
      } else {
        const text = selection.toString();
        this.insertHtml(`<code>${utils.escapeHtml(text)}</code>`);
      }
      this.markDirty();
      this.updateToolbar();
    }

    toggleTaskList() {
      this.ensureEditorFocus();
      const item = this.closestElement("li");
      if (item && item.parentElement) {
        const list = item.parentElement;
        if (list.classList.contains("task-list")) {
          list.classList.remove("task-list");
          Array.from(list.children).forEach((child) => {
            if (!child.matches("li")) return;
            Array.from(child.children).forEach((node) => {
              if (node.matches && node.matches('input[type="checkbox"]')) node.remove();
            });
            child.removeAttribute("data-checked");
          });
        } else {
          list.classList.add("task-list");
          this.maintainTaskLists();
        }
        this.markDirty();
        this.updateToolbar();
        return;
      }

      try {
        document.execCommand("insertUnorderedList");
      } catch (error) {
        ui.toast("Não foi possível criar a lista de tarefas.", "warning");
        return;
      }
      const createdItem = this.closestElement("li");
      if (createdItem && createdItem.parentElement) {
        createdItem.parentElement.classList.add("task-list");
        this.maintainTaskLists();
      }
      this.markDirty();
      this.updateToolbar();
    }

    openLinkDialog() {
      this.savedRange = this.captureRange();
      const selectedText = window.getSelection() ? window.getSelection().toString().trim() : "";
      ui.prompt({
        title: "Inserir link",
        label: "Endereço do link",
        helper: selectedText
          ? "O texto selecionado receberá o link."
          : "O endereço será inserido como texto clicável.",
        placeholder: "https://exemplo.com",
        confirmLabel: "Inserir link",
        validate: (value) => {
          if (!value.trim()) return "Informe um endereço.";
          if (!security.isSafeLink(value.trim())) return "Endereço inválido ou não permitido.";
          return null;
        },
      }).then((value) => {
        if (value == null) return;
        const url = security.normalizeExternalUrl(value.trim());
        if (!url) {
          ui.toast("Endereço de link inválido.", "error");
          return;
        }
        this.restoreRange(this.savedRange);
        this.savedRange = null;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          try {
            document.execCommand("createLink", false, url);
          } catch (error) {
            this.insertHtml(`<a href="${utils.escapeAttr(url)}">${utils.escapeHtml(selection.toString())}</a>`);
          }
        } else {
          this.insertHtml(`<a href="${utils.escapeAttr(url)}">${utils.escapeHtml(url)}</a>`);
        }
        this.markDirty();
      });
    }

    openImageDialog() {
      this.imageDialogRange = this.savedRange || this.captureRange();
      this.savedRange = null;
      this.imageDialogUrl.value = "";
      this.imageDialogError.hidden = true;
      this.imageDialogError.textContent = "";
      ui.openDialog("image-dialog");
      window.setTimeout(() => this.imageDialogUrl.focus(), 40);
    }

    async handleImageDialogSubmit(event) {
      if (event.submitter && event.submitter.value === "cancel") {
        return;
      }
      event.preventDefault();
      const raw = this.imageDialogUrl.value.trim();
      const url = this.normalizeImageUrl(raw);
      if (!url) {
        this.imageDialogError.textContent = "Informe uma URL de imagem válida (http, https ou dados de imagem).";
        this.imageDialogError.hidden = false;
        return;
      }
      const range = this.imageDialogRange;
      this.imageDialogRange = null;
      ui.closeDialog("image-dialog");
      await utils.nextFrame();
      if (this.destroyed) return;
      this.savedRange = range;
      this.insertExternalImage(url);
    }

    normalizeImageUrl(value) {
      if (!value) return null;
      if (/^data:image\//i.test(value)) {
        return security.isSafeImageSource(value, true) ? value : null;
      }
      let url = value;
      if (url.startsWith("//")) {
        url = `${window.location.protocol === "https:" ? "https:" : "http:"}${url}`;
      } else if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && /^[^\s/]+\.[^\s/]+/.test(url)) {
        url = `https://${url}`;
      }
      return security.isSafeImageSource(url, false) ? url : null;
    }

    insertExternalImage(url) {
      const alt = "Imagem";
      this.insertHtml(
        `<img class="doc-image" src="${utils.escapeAttr(url)}" alt="${utils.escapeAttr(alt)}" loading="lazy" decoding="async"><p><br></p>`
      );
      this.markDirty();
      ui.toast("Imagem inserida.", "success");
    }

    async handleImageFile(file) {
      if (!file) return;
      const range = this.imageDialogRange || this.captureRange();
      try {
        const record = await images.addFile(file);
        const url = await images.getUrl(record.id);
        if (!url) throw new Error("Não foi possível carregar a imagem.");
        this.imageDialogRange = null;
        ui.closeDialog("image-dialog");
        await utils.nextFrame();
        if (this.destroyed) return;
        this.savedRange = range;
        const alt = String(file.name || "Imagem").replace(/\.[^.]+$/, "");
        this.insertHtml(
          `<img data-image-id="${utils.escapeAttr(record.id)}" class="doc-image" src="${utils.escapeAttr(url)}" alt="${utils.escapeAttr(alt)}"><p><br></p>`
        );
        this.markDirty();
        this.scrollToLastImage();
        ui.toast("Imagem inserida e armazenada localmente.", "success");
      } catch (error) {
        ui.toast(error.message || "Não foi possível inserir a imagem.", "error");
      }
    }

    scrollToLastImage() {
      window.setTimeout(() => {
        if (this.destroyed) return;
        const imgs = this.contentEl.querySelectorAll("img.doc-image");
        const last = imgs[imgs.length - 1];
        if (last) last.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 60);
    }

    async handlePaste(event) {
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      const files = Array.from(clipboard.files || []).filter((file) => file.type && file.type.startsWith("image/"));
      if (files.length) {
        event.preventDefault();
        const range = this.captureRange();
        await this.insertImageFiles(files, range);
        return;
      }
      const html = clipboard.getData("text/html");
      if (!html) return;
      event.preventDefault();
      const range = this.captureRange();
      let sanitized;
      try {
        sanitized = security.sanitizeHtml(html, { allowDataImages: true });
        const extracted = await images.extractDataImages(sanitized, { stripInternalRefs: false });
        sanitized = extracted.html;
        if (extracted.warnings.length) ui.toast(extracted.warnings[0], "warning");
      } catch (error) {
        ui.toast("Não foi possível processar o conteúdo colado.", "error");
        return;
      }
      if (this.destroyed) return;
      this.savedRange = range;
      this.insertHtml(sanitized);
      await images.resolve(this.contentEl);
      this.markDirty();
    }

    async insertImageFiles(files, range) {
      let inserted = 0;
      for (const file of files) {
        try {
          const record = await images.addFile(file);
          const url = await images.getUrl(record.id);
          if (!url) throw new Error("Imagem não encontrada.");
          this.savedRange = range;
          const alt = String(file.name || "Imagem").replace(/\.[^.]+$/, "");
          this.insertHtml(
            `<img data-image-id="${utils.escapeAttr(record.id)}" class="doc-image" src="${utils.escapeAttr(url)}" alt="${utils.escapeAttr(alt)}"><p><br></p>`
          );
          range = this.captureRange();
          inserted += 1;
        } catch (error) {
          ui.toast(error.message || "Não foi possível inserir a imagem.", "error");
        }
      }
      if (inserted) {
        this.markDirty();
        ui.toast(utils.formatCount(inserted, "imagem inserida.", "imagens inseridas."), "success");
      }
    }

    handleDragEnter(event) {
      if (!event.dataTransfer) return;
      const types = Array.from(event.dataTransfer.types || []);
      if (types.includes("Files") || types.includes("text/html")) {
        event.preventDefault();
        this.contentEl.classList.add("is-drag-over");
      }
    }

    handleDragLeave(event) {
      if (!this.contentEl.contains(event.relatedTarget)) {
        this.contentEl.classList.remove("is-drag-over");
      }
    }

    async handleDrop(event) {
      if (!event.dataTransfer) return;
      this.contentEl.classList.remove("is-drag-over");
      this.placeCaretAtPoint(event.clientX, event.clientY);
      const files = Array.from(event.dataTransfer.files || []).filter((file) => file.type && file.type.startsWith("image/"));
      if (files.length) {
        event.preventDefault();
        const range = this.captureRange();
        await this.insertImageFiles(files, range);
        return;
      }
      const html = event.dataTransfer.getData("text/html");
      if (html) {
        event.preventDefault();
        const range = this.captureRange();
        try {
          const sanitized = security.sanitizeHtml(html, { allowDataImages: true });
          const extracted = await images.extractDataImages(sanitized, { stripInternalRefs: false });
          this.savedRange = range;
          this.insertHtml(extracted.html);
          await images.resolve(this.contentEl);
          this.markDirty();
        } catch (error) {
          ui.toast("Não foi possível processar o conteúdo arrastado.", "error");
        }
        return;
      }
      const text = event.dataTransfer.getData("text/plain");
      if (text) {
        event.preventDefault();
        this.insertPlainText(text);
        this.markDirty();
      }
    }

    placeCaretAtPoint(x, y) {
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range && this.contentEl.contains(range.startContainer)) {
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
      }
      if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y);
        if (position && this.contentEl.contains(position.offsetNode)) {
          const range = document.createRange();
          range.setStart(position.offsetNode, position.offset);
          range.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
      }
    }

    selectImage(image) {
      if (this.selectedImage && this.selectedImage !== image) {
        this.selectedImage.classList.remove("is-selected");
      }
      this.selectedImage = image;
      image.classList.add("is-selected");
      this.imageControls.hidden = false;
      this.updateImageControlState();
      this.positionImageControls();
    }

    hideImageControls() {
      if (this.selectedImage) this.selectedImage.classList.remove("is-selected");
      this.selectedImage = null;
      if (this.imageControls) this.imageControls.hidden = true;
    }

    updateImageControlState() {
      if (!this.selectedImage) return;
      const classes = Array.from(this.selectedImage.classList);
      const activeWidth = classes.find((name) => /^img-w-(25|50|75|100)$/.test(name));
      const activeAlign = classes.find((name) => /^img-align-(left|center|right)$/.test(name)) || "img-align-center";
      this.imageControls.querySelectorAll("[data-width]").forEach((button) => {
        button.classList.toggle("is-active", activeWidth === `img-w-${button.dataset.width}`);
      });
      this.imageControls.querySelectorAll("[data-align]").forEach((button) => {
        button.classList.toggle("is-active", activeAlign === `img-align-${button.dataset.align}`);
      });
    }

    positionImageControls() {
      if (!this.selectedImage || !this.selectedImage.isConnected || this.imageControls.hidden) return;
      const rect = this.selectedImage.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        this.imageControls.style.visibility = "hidden";
        return;
      }
      this.imageControls.style.visibility = "";
      const controlsRect = this.imageControls.getBoundingClientRect();
      let top = rect.top - controlsRect.height - 8;
      if (top < 8) top = rect.bottom + 8;
      let left = rect.left + rect.width / 2 - controlsRect.width / 2;
      left = utils.clamp(left, 8, window.innerWidth - controlsRect.width - 8);
      top = utils.clamp(top, 8, window.innerHeight - controlsRect.height - 8);
      this.imageControls.style.top = `${Math.round(top)}px`;
      this.imageControls.style.left = `${Math.round(left)}px`;
    }

    scheduleImagePosition() {
      if (!this.selectedImage || this.imageControls.hidden) return;
      if (this.imageFrame) cancelAnimationFrame(this.imageFrame);
      this.imageFrame = requestAnimationFrame(() => {
        this.imageFrame = null;
        this.positionImageControls();
      });
    }

    handleImageControlClick(event) {
      if (!this.selectedImage) return;
      const widthButton = event.target.closest("[data-width]");
      if (widthButton) {
        const width = widthButton.dataset.width;
        ["25", "50", "75", "100"].forEach((value) => this.selectedImage.classList.remove(`img-w-${value}`));
        this.selectedImage.classList.add(`img-w-${width}`);
        this.updateImageControlState();
        this.positionImageControls();
        this.markDirty();
        return;
      }
      const alignButton = event.target.closest("[data-align]");
      if (alignButton) {
        const align = alignButton.dataset.align;
        ["left", "center", "right"].forEach((value) => this.selectedImage.classList.remove(`img-align-${value}`));
        this.selectedImage.classList.add(`img-align-${align}`);
        this.updateImageControlState();
        this.positionImageControls();
        this.markDirty();
        return;
      }
      if (event.target.closest(".image-controls__remove")) {
        const image = this.selectedImage;
        this.hideImageControls();
        image.remove();
        this.markDirty();
        this.contentEl.focus();
      }
    }

    scheduleToolbarUpdate() {
      if (this.toolbarFrame) cancelAnimationFrame(this.toolbarFrame);
      this.toolbarFrame = requestAnimationFrame(() => {
        this.toolbarFrame = null;
        this.updateToolbar();
      });
    }

    updateToolbar() {
      if (!this.toolbarEl) return;
      const selection = window.getSelection();
      const inside =
        selection &&
        selection.rangeCount &&
        this.contentEl.contains(selection.anchorNode);
      if (!inside) return;

      const commandStates = {
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
        justifyLeft: document.queryCommandState("justifyLeft"),
        justifyCenter: document.queryCommandState("justifyCenter"),
        justifyRight: document.queryCommandState("justifyRight"),
        justifyFull: document.queryCommandState("justifyFull"),
      };
      const taskActive = !!this.closestElement("li") && this.closestElement("li").parentElement.classList.contains("task-list");
      this.toolbarEl.querySelectorAll("[data-command]").forEach((button) => {
        const command = button.dataset.command;
        const active = command === "taskList" ? taskActive : !!commandStates[command];
        button.classList.toggle("is-active", active);
        if (Object.prototype.hasOwnProperty.call(commandStates, command) || command === "taskList") {
          button.setAttribute("aria-pressed", active ? "true" : "false");
        }
      });

      let block = "";
      try {
        block = String(document.queryCommandValue("formatBlock") || "").replace(/[<>]/g, "").toLowerCase();
      } catch (error) {
        block = "";
      }
      if (block === "div" || block === "normal") block = "p";
      this.toolbarEl.querySelectorAll("[data-block]").forEach((button) => {
        const active = button.dataset.block === block;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    async showMarkdown() {
      const procedure = {
        title: this.titleEl.value.trim() || "Procedimento sem título",
        content: this.serializeContent(),
      };
      try {
        await importExport.showMarkdown(procedure, {
          editable: true,
          applyLabel: "Aplicar no editor",
          onApply: async (markdown) => {
            if (!markdown.trim()) {
              ui.toast("Cole um conteúdo Markdown antes de aplicar.", "warning");
              return false;
            }
            const applied = await this.applyMarkdown(markdown);
            if (!applied || this.destroyed) return false;
            this.contentEl.focus();
            this.placeCaretAtEnd();
            ui.toast("Markdown aplicado ao editor.", "success");
            return true;
          },
        });
      } catch (error) {
        ui.toast("Não foi possível gerar o Markdown.", "error");
      }
    }

    async applyMarkdown(markdown) {
      let html = NS.markdown.markdownToHtml(String(markdown || ""));
      const extracted = await images.extractDataImages(html, { stripInternalRefs: true });
      html = extracted.html;
      if (this.destroyed) return false;
      this.contentEl.innerHTML = security.sanitizeHtml(html, { allowDataImages: false });
      this.maintainTaskLists();
      await images.resolve(this.contentEl);
      if (this.destroyed) return false;
      if (!this.titleEl.value.trim()) {
        const heading = this.contentEl.querySelector("h1");
        if (heading) this.titleEl.value = utils.truncate(heading.textContent.trim(), proceduresService.MAX_TITLE);
      }
      this.hideImageControls();
      this.markDirty();
      this.updateToolbar();
      if (extracted.warnings.length) ui.toast(extracted.warnings[0], "warning");
      return true;
    }

    async handleMarkdownFile(file) {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        ui.toast("O arquivo Markdown excede o limite de 5 MB.", "error");
        return;
      }
      const hasContent = this.contentEl.textContent.trim().length > 0 || this.contentEl.querySelector("img");
      if (hasContent) {
        const proceed = await ui.confirm({
          title: "Substituir o conteúdo atual?",
          message: "O conteúdo do editor será substituído pelo conteúdo do arquivo Markdown. As imagens inseridas no documento atual que não forem usadas poderão ser removidas posteriormente.",
          confirmLabel: "Substituir conteúdo",
          danger: true,
        });
        if (!proceed) return;
      }
      try {
        const text = await utils.readFileAsText(file);
        const applied = await this.applyMarkdown(text);
        if (applied) ui.toast("Conteúdo Markdown importado.", "success");
      } catch (error) {
        ui.toast(`Não foi possível importar o Markdown: ${error.message}`, "error");
      }
    }

    requestExit() {
      if (this.options.onExit) this.options.onExit();
    }

    destroy() {
      this.destroyed = true;
      this.autoSave.cancel();
      this.hideImageControls();
      this.controller.abort();
      if (this.toolbarFrame) cancelAnimationFrame(this.toolbarFrame);
      if (this.imageFrame) cancelAnimationFrame(this.imageFrame);
      if (activeEditor === this) activeEditor = null;
    }
  }

  function mount(options) {
    if (activeEditor) activeEditor.destroy();
    const editor = new Editor(options);
    activeEditor = editor;
    return editor.init();
  }

  NS.editor = {
    mount,
    get active() {
      return activeEditor;
    },
  };
})();
