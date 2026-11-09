(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let userEnabled = null;

  function enabled() {
    if (!window.gsap || userEnabled === false) return false;
    return userEnabled === true || !reduceMotion.matches;
  }

  function setEnabled(value, options) {
    const settings = options || {};
    if (!settings.explicit && reduceMotion.matches) {
      userEnabled = false;
      return;
    }
    userEnabled = value === true;
  }

  function prefersReducedMotion() {
    return reduceMotion.matches;
  }

  function visible(targets) {
    return Array.from(targets).filter((element) => element && element.isConnected && element.getClientRects().length > 0);
  }

  function fadeUp(targets, options) {
    if (!enabled()) return false;
    const list = visible(targets);
    if (!list.length) return false;
    const settings = options || {};
    window.gsap.fromTo(
      list,
      { opacity: 0, y: settings.y == null ? 12 : settings.y },
      {
        opacity: 1,
        y: 0,
        duration: settings.duration || 0.34,
        ease: "power2.out",
        stagger: settings.stagger == null ? 0.05 : settings.stagger,
        overwrite: true,
        clearProps: "opacity,transform",
      }
    );
    return true;
  }

  function initial() {
    if (!enabled()) return;
    const sidebar = document.getElementById("sidebar");
    if (sidebar) {
      const targets = sidebar.querySelectorAll(
        ".brand, .sidebar__new, .nav-section-label, .nav-link, .sidebar__footer"
      );
      window.gsap.fromTo(
        visible(targets),
        { opacity: 0, x: -10 },
        {
          opacity: 1,
          x: 0,
          duration: 0.42,
          ease: "power3.out",
          stagger: 0.035,
          overwrite: true,
          clearProps: "opacity,transform",
        }
      );
    }
  }

  function viewIn(name) {
    if (!enabled()) return false;
    const view = document.getElementById(`view-${name}`);
    if (!view || view.hidden) return false;

    if (name === "list") {
      return fadeUp(view.querySelectorAll(".page-header__top, .list-toolbar, .filter-chips, .list-summary"), {
        duration: 0.32,
        stagger: 0.045,
      });
    }

    if (name === "reader") {
      return fadeUp(
        view.querySelectorAll(".reader-topbar, .reader-header, .reader-doc > .doc-content, .reader-footer"),
        { duration: 0.38, stagger: 0.06 }
      );
    }

    if (name === "editor") {
      return fadeUp(view.querySelectorAll(".editor-topbar, .editor-doc"), {
        duration: 0.38,
        stagger: 0.07,
      });
    }

    return false;
  }

  function listIn(container) {
    if (!enabled() || !container) return false;
    const cards = visible(container.querySelectorAll(".procedure-card"));
    if (!cards.length) {
      const empty = visible(container.querySelectorAll(".empty-state"));
      return fadeUp(empty, { duration: 0.3, stagger: 0 });
    }
    const stagger = cards.length > 24 ? 0.012 : cards.length > 12 ? 0.025 : 0.045;
    window.gsap.fromTo(
      cards,
      { opacity: 0, y: 14 },
      {
        opacity: 1,
        y: 0,
        duration: 0.32,
        ease: "power2.out",
        stagger,
        overwrite: true,
        clearProps: "opacity,transform",
      }
    );
    return true;
  }

  function sidebarOpen(sidebar) {
    if (!enabled() || !sidebar) return false;
    const targets = sidebar.querySelectorAll(".sidebar__new, .nav-section-label, .nav-link, .sidebar__footer");
    return fadeUp(targets, { duration: 0.3, stagger: 0.035, y: 8 });
  }

  function dialogIn(dialog) {
    if (!enabled() || !dialog) return false;
    const surface = dialog.querySelector(".dialog__surface");
    if (!surface) return false;
    surface.style.animation = "none";
    window.gsap.fromTo(
      surface,
      { opacity: 0, y: 16, scale: 0.985 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.3,
        ease: "power3.out",
        overwrite: true,
        clearProps: "opacity,transform",
      }
    );
    return true;
  }

  function toastIn(node) {
    if (!enabled() || !node) return false;
    node.style.animation = "none";
    window.gsap.fromTo(
      node,
      { opacity: 0, y: 14, scale: 0.97 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.3,
        ease: "power3.out",
        overwrite: true,
        clearProps: "opacity,transform",
      }
    );
    return true;
  }

  function toastOut(node, done) {
    if (!enabled() || !node) return false;
    window.gsap.to(node, {
      opacity: 0,
      y: 8,
      scale: 0.98,
      duration: 0.2,
      ease: "power2.in",
      overwrite: true,
      onComplete: function () {
        node.remove();
        if (typeof done === "function") done();
      },
    });
    return true;
  }

  NS.animations = {
    enabled,
    setEnabled,
    prefersReducedMotion,
    initial,
    viewIn,
    listIn,
    sidebarOpen,
    dialogIn,
    toastIn,
    toastOut,
  };
})();
