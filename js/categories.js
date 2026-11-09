(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});

  const categories = [
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
