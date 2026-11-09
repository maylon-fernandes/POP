(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  const utils = NS.utils;

  const TOAST_ICONS = {
    success: "i-check",
    error: "i-warning",
    warning: "i-warning",
    info: "i-info",
  };

  let initialized = false;
  let markdownFilename = "procedimento.md";
  let markdownApplyHandler = null;
  let activeMenu = null;
  let activeMenuTrigger = null;
  let menuCleanup = null;

  function icon(name, className) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", className || "icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${name}`);
    svg.appendChild(use);
    return svg;
  }

  function toast(message, options) {
    const settings = typeof options === "string" ? { type: options } : Object.assign({}, options || {});
    const type = TOAST_ICONS[settings.type] ? settings.type : "info";
    const region = document.getElementById("toast-region");
    if (!region) return null;

    const node = document.createElement("div");
    node.className = `toast toast--${type}`;
    node.setAttribute("role", type === "error" ? "alert" : "status");

    const iconWrap = document.createElement("span");
    iconWrap.className = "toast__icon";
    iconWrap.appendChild(icon(TOAST_ICONS[type]));

    const messageWrap = document.createElement("div");
    messageWrap.className = "toast__message";
    messageWrap.textContent = String(message == null ? "" : message);

    if (settings.action && typeof settings.action.onClick === "function") {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "toast__action";
      action.textContent = settings.action.label || "Abrir";
      action.addEventListener("click", function () {
        settings.action.onClick();
        dismiss();
      });
      messageWrap.appendChild(document.createElement("br"));
      messageWrap.appendChild(action);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast__close";
    close.setAttribute("aria-label", "Fechar notificação");
    close.appendChild(icon("i-x"));

    node.appendChild(iconWrap);
    node.appendChild(messageWrap);
    node.appendChild(close);

    let timer = null;
    let removed = false;

    function dismiss() {
      if (removed) return;
      removed = true;
      if (timer) window.clearTimeout(timer);
      const animations = NS.animations;
      if (!animations || !animations.toastOut(node)) {
        node.classList.add("is-leaving");
        window.setTimeout(() => node.remove(), 220);
      }
    }

    close.addEventListener("click", dismiss);
    node.addEventListener("mouseenter", () => {
      if (timer) window.clearTimeout(timer);
      timer = null;
    });
    node.addEventListener("mouseleave", () => {
      if (!removed) timer = window.setTimeout(dismiss, 2200);
    });

    region.appendChild(node);
    if (NS.animations) NS.animations.toastIn(node);
    const toasts = Array.from(region.children);
    if (toasts.length > 4) toasts.slice(0, toasts.length - 4).forEach((child) => child.remove());

    const duration = settings.duration || (type === "error" ? 6500 : 4200);
    if (duration > 0) timer = window.setTimeout(dismiss, duration);
    return { dismiss };
  }

  function confirm(options) {
    const settings = Object.assign(
      {
        title: "Confirmar ação",
        message: "",
        html: false,
        confirmLabel: "Confirmar",
        cancelLabel: "Cancelar",
        danger: false,
        icon: null,
      },
      options || {}
    );
    const dialog = document.getElementById("confirm-dialog");
    if (!dialog) return Promise.resolve(false);

    document.getElementById("confirm-title").textContent = settings.title;
    const messageNode = document.getElementById("confirm-message");
    messageNode.textContent = "";
    if (settings.message instanceof Node) {
      messageNode.appendChild(settings.message);
    } else if (settings.html) {
      messageNode.innerHTML = String(settings.message || "");
    } else {
      messageNode.textContent = String(settings.message || "");
    }

    const ok = document.getElementById("confirm-ok");
    const cancel = document.getElementById("confirm-cancel");
    const iconNode = document.getElementById("confirm-icon");
    ok.textContent = settings.confirmLabel;
    cancel.textContent = settings.cancelLabel;
    ok.classList.toggle("btn--danger", !!settings.danger);
    ok.classList.toggle("btn--primary", !settings.danger);
    iconNode.className = `dialog__icon${settings.danger ? " is-danger" : " is-info"}`;
    iconNode.textContent = "";
    iconNode.appendChild(icon(settings.icon || (settings.danger ? "i-warning" : "i-info")));
    dialog.returnValue = "";

    return new Promise((resolve) => {
      const onClose = function () {
        dialog.removeEventListener("close", onClose);
        resolve(dialog.returnValue === "confirm");
      };
      dialog.addEventListener("close", onClose);
      dialog.showModal();
      if (NS.animations) NS.animations.dialogIn(dialog);
      window.setTimeout(() => cancel.focus(), 30);
    });
  }

  function prompt(options) {
    const settings = Object.assign(
      {
        title: "Informe um valor",
        label: "Valor",
        helper: "",
        value: "",
        placeholder: "",
        confirmLabel: "Confirmar",
        type: "text",
      },
      options || {}
    );
    const dialog = document.getElementById("prompt-dialog");
    if (!dialog) return Promise.resolve(null);
    const form = document.getElementById("prompt-form");
    const input = document.getElementById("prompt-input");
    const error = document.getElementById("prompt-error");

    document.getElementById("prompt-title").textContent = settings.title;
    document.getElementById("prompt-label").textContent = settings.label;
    const helper = document.getElementById("prompt-helper");
    helper.textContent = settings.helper || "";
    helper.hidden = !settings.helper;
    document.getElementById("prompt-ok").textContent = settings.confirmLabel;
    input.type = settings.type || "text";
    input.value = settings.value || "";
    input.placeholder = settings.placeholder || "";
    error.hidden = true;
    error.textContent = "";
    form.dataset.validate = settings.validate ? "true" : "false";
    dialog.returnValue = "";

    return new Promise((resolve) => {
      function onClose() {
        dialog.removeEventListener("close", onClose);
        form.removeEventListener("submit", onSubmit);
        resolve(dialog.returnValue === "confirm" ? input.value : null);
      }

      function onSubmit(event) {
        if (!settings.validate) return;
        const message = settings.validate(input.value);
        if (message) {
          event.preventDefault();
          error.textContent = message;
          error.hidden = false;
          input.focus();
        }
      }

      form.addEventListener("submit", onSubmit);
      dialog.addEventListener("close", onClose);
      dialog.showModal();
      if (NS.animations) NS.animations.dialogIn(dialog);
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 30);
    });
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return null;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    if (NS.animations) NS.animations.dialogIn(dialog);
    return dialog;
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  function showMarkdown(markdown, filename, options) {
    const dialog = document.getElementById("markdown-dialog");
    const output = document.getElementById("markdown-output");
    if (!dialog || !output) return;
    const settings = options || {};
    const editable = !!settings.editable;
    const help = document.getElementById("markdown-help");
    const applyButton = document.getElementById("markdown-apply");

    output.value = String(markdown || "");
    output.readOnly = !editable;
    output.setAttribute("aria-label", editable ? "Conteúdo Markdown para aplicar ao editor" : "Conteúdo em Markdown");
    markdownFilename = filename || "procedimento.md";
    dialog.dataset.filename = markdownFilename;

    if (help) {
      help.textContent = editable
        ? "Cole ou edite o Markdown abaixo. Ao aplicar, o conteúdo atual do editor será substituído."
        : "Este é o conteúdo convertido para Markdown. Imagens aparecem como links e podem ser copiadas.";
    }

    markdownApplyHandler = editable && typeof settings.onApply === "function" ? settings.onApply : null;
    if (applyButton) {
      applyButton.hidden = !markdownApplyHandler;
      applyButton.disabled = false;
      const label = applyButton.querySelector("span");
      if (label) label.textContent = settings.applyLabel || "Aplicar no editor";
    }

    openDialog("markdown-dialog");
    window.setTimeout(() => {
      output.focus();
      if (editable) output.select();
    }, 40);
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.classList.toggle("is-loading", !!busy);
    button.disabled = !!busy;
    if (busy) button.setAttribute("aria-busy", "true");
    else button.removeAttribute("aria-busy");
  }

  function closeMenu() {
    if (!activeMenu) return;
    if (menuCleanup) menuCleanup();
    activeMenu.remove();
    if (activeMenuTrigger) activeMenuTrigger.setAttribute("aria-expanded", "false");
    activeMenu = null;
    activeMenuTrigger = null;
    menuCleanup = null;
  }

  function openMenu(trigger, items) {
    closeMenu();
    if (!trigger || !Array.isArray(items) || !items.length) return;
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.setAttribute("role", "menu");

    const buttons = [];
    items.forEach((item) => {
      if (item === "separator" || item.type === "separator") {
        const separator = document.createElement("div");
        separator.className = "context-menu__sep";
        separator.setAttribute("role", "separator");
        menu.appendChild(separator);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = `context-menu__item${item.danger ? " context-menu__item--danger" : ""}`;
      button.setAttribute("role", "menuitem");
      if (item.icon) button.appendChild(icon(item.icon));
      const label = document.createElement("span");
      label.textContent = item.label;
      button.appendChild(label);
      button.addEventListener("click", function () {
        closeMenu();
        if (typeof item.onClick === "function") item.onClick();
      });
      menu.appendChild(button);
      buttons.push(button);
    });

    document.body.appendChild(menu);
    const rect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = rect.right - menuRect.width;
    let top = rect.bottom + 6;
    if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - 6;
    left = utils.clamp(left, 8, window.innerWidth - menuRect.width - 8);
    top = utils.clamp(top, 8, window.innerHeight - menuRect.height - 8);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;

    activeMenu = menu;
    activeMenuTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");

    const onPointerDown = function (event) {
      if (menu.contains(event.target) || trigger.contains(event.target)) return;
      closeMenu();
    };
    const onKeyDown = function (event) {
      const currentIndex = buttons.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        trigger.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + buttons.length) % buttons.length;
        buttons[nextIndex].focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        buttons[0].focus();
      } else if (event.key === "End") {
        event.preventDefault();
        buttons[buttons.length - 1].focus();
      } else if (event.key === "Tab") {
        closeMenu();
      }
    };
    const onViewportChange = function () {
      closeMenu();
    };

    window.setTimeout(() => document.addEventListener("pointerdown", onPointerDown), 0);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    menuCleanup = function () {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };

    if (trigger.matches(":focus-visible")) buttons[0].focus();
  }

  async function copy(value, successMessage) {
    try {
      await utils.copyText(value);
      toast(successMessage || "Copiado para a área de transferência.", "success");
      return true;
    } catch (error) {
      toast(error.message || "Não foi possível copiar.", "error");
      return false;
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    ["prompt-form", "image-dialog-form"].forEach((id) => {
      const form = document.getElementById(id);
      if (!form) return;
      form.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        const target = event.target;
        if (!target || target.tagName !== "INPUT") return;
        const primary = form.querySelector('button[type="submit"].btn--primary');
        if (!primary) return;
        event.preventDefault();
        primary.click();
      });
    });

    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => closeDialog(button.getAttribute("data-close-dialog")));
    });

    const copyButton = document.getElementById("markdown-copy");
    const downloadButton = document.getElementById("markdown-download");
    const applyButton = document.getElementById("markdown-apply");
    if (applyButton) {
      applyButton.addEventListener("click", async () => {
        const output = document.getElementById("markdown-output");
        const handler = markdownApplyHandler;
        if (!output || !handler) return;
        setBusy(applyButton, true);
        try {
          const applied = await handler(output.value);
          if (applied !== false) closeDialog("markdown-dialog");
        } catch (error) {
          toast(error.message || "Não foi possível aplicar o Markdown.", "error");
        } finally {
          setBusy(applyButton, false);
        }
      });
    }
    if (copyButton) {
      copyButton.addEventListener("click", () => {
        copy(document.getElementById("markdown-output").value, "Markdown copiado.");
      });
    }
    if (downloadButton) {
      downloadButton.addEventListener("click", () => {
        const output = document.getElementById("markdown-output");
        const dialog = document.getElementById("markdown-dialog");
        utils.downloadText(output.value + (output.value.endsWith("\n") ? "" : "\n"), dialog.dataset.filename || markdownFilename, "text/markdown;charset=utf-8");
        toast("Arquivo Markdown gerado.", "success");
      });
    }

    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.addEventListener("click", function (event) {
        if (event.target === dialog && dialog.id !== "confirm-dialog") {
          closeDialog(dialog.id);
        }
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });
  }

  NS.ui = {
    init,
    icon,
    toast,
    confirm,
    prompt,
    openDialog,
    closeDialog,
    showMarkdown,
    setBusy,
    openMenu,
    closeMenu,
    copy,
  };
})();
