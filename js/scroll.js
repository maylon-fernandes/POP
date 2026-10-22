(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  let instance = null;
  let enabled = true;

  function getWrapper() {
    return document.getElementById("main");
  }

  function init() {
    if (!enabled || instance) return instance;
    const wrapper = getWrapper();
    const content = document.getElementById("main-content");
    if (!window.Lenis || !wrapper || !content) return null;

    instance = new window.Lenis({
      wrapper,
      content,
      lerp: 0.09,
      duration: 1.1,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1,
      autoRaf: true,
      autoResize: true,
      respectReducedMotion: false,
      prevent: function (node) {
        return !!(node && node.closest && node.closest("textarea, [data-lenis-prevent], dialog"));
      },
    });
    return instance;
  }

  function destroy() {
    if (instance) {
      instance.destroy();
      instance = null;
    }
  }

  function setEnabled(value) {
    enabled = value !== false;
    if (enabled) init();
    else destroy();
  }

  function scrollTo(target, options) {
    const settings = Object.assign({ duration: 0.85 }, options || {});
    if (instance) {
      instance.scrollTo(target, settings);
      return;
    }
    const wrapper = getWrapper();
    if (!wrapper) return;
    const top = typeof target === "number" ? target : 0;
    if (settings.immediate) {
      wrapper.scrollTop = top;
    } else {
      wrapper.scrollTo({ top, behavior: "smooth" });
    }
  }

  function stop() {
    if (instance) instance.stop();
  }

  function start() {
    if (instance) instance.start();
  }

  NS.scroll = {
    init,
    setEnabled,
    scrollTo,
    stop,
    start,
    destroy,
    get instance() {
      return instance;
    },
  };
})();
