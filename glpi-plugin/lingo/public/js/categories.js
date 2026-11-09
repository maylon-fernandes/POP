(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});

  const fallback = [
    {
      id: "sistema",
      label: "Sistema",
      icon: "i-software",
      description: "Instalação, configuração de aplicativos, e-mail e resolução de erros.",
      color: "#8ab4f8",
      soft: "rgba(110, 168, 254, 0.16)",
    },
    {
      id: "hardware",
      label: "Hardware",
      icon: "i-hardware",
      description: "Manutenção, componentes, periféricos e diagnóstico de equipamentos.",
      color: "#ffda6a",
      soft: "rgba(255, 218, 106, 0.15)",
    },
    {
      id: "rede",
      label: "Rede",
      icon: "i-network",
      description: "Conectividade, IP, DNS, DHCP, Wi-Fi, switches e roteadores.",
      color: "#20c997",
      soft: "rgba(32, 201, 151, 0.16)",
    },
    {
      id: "tasy",
      label: "Tasy",
      icon: "i-tasy",
      description: "Procedimentos e configurações do sistema Tasy.",
      color: "#e6a6f0",
      soft: "rgba(217, 130, 232, 0.16)",
    },
  ];

  function normalize(category) {
    if (!category || typeof category !== "object") return null;
    const id = String(category.id || category.slug || "").trim().toLowerCase();
    const label = String(category.label || category.name || "").trim();
    if (!id || !label) return null;
    return {
      id,
      label,
      icon: String(category.icon || "i-info"),
      description: String(category.description || ""),
      color: String(category.color || "#8ab4f8"),
      soft: String(category.soft || "rgba(138, 180, 248, 0.16)"),
    };
  }

  const configured = window.LINGO_CONFIG && Array.isArray(window.LINGO_CONFIG.categories)
    ? window.LINGO_CONFIG.categories.map(normalize).filter(Boolean)
    : [];

  const categories = configured.length ? configured : fallback;
  const byId = new Map(categories.map((category) => [category.id, category]));

  function get(id) {
    return byId.get(String(id || "").toLowerCase()) || null;
  }

  function isValid(id) {
    return byId.has(String(id || "").toLowerCase());
  }

  function list() {
    return categories.slice();
  }

  NS.categories = {
    list,
    get,
    isValid,
    ids: categories.map((category) => category.id),
  };
})();
