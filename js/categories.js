(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});

  const categories = [
      {
            id: "sistema",
            label: "Sistema",
            icon: "i-software",
            description: "Instalação, configuração de aplicativos, e-mail e resolução de erros.",
            color: "sistema",
          },
      {
        id: "hardware",
        label: "Hardware",
        icon: "i-hardware",
        description: "Manutenção, componentes, periféricos e diagnóstico de equipamentos.",
        color: "hardware",
      },
      {
        id: "rede",
        label: "Rede",
        icon: "i-network",
        description: "Conectividade, IP, DNS, DHCP, Wi-Fi, switches e roteadores.",
        color: "rede",
      },
      {
        id: "tasy",
        label: "Tasy",
        icon: "i-tasy",
        description: "Procedimentos e configurações do sistema Tasy.",
        color: "tasy",
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
