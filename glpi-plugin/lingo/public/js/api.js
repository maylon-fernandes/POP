(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  const config = window.LINGO_CONFIG || {};
  const base = String(config.apiBase || "").replace(/\/+$/, "");

  function endpoint(name) {
    return `${base}/${name}.php`;
  }

  async function parseResponse(response) {
    const contentType = String(response.headers.get("content-type") || "");
    let data = null;

    if (contentType.indexOf("application/json") !== -1) {
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }
    } else {
      const text = await response.text();
      data = { message: text };
    }

    if (!response.ok) {
      const failure = new Error((data && data.message) || `Erro ${response.status}`);
      failure.status = response.status;
      failure.data = data;
      throw failure;
    }

    return data;
  }

  function buildUrl(name, params) {
    const url = new URL(endpoint(name), window.location.href);
    const values = params || {};
    Object.keys(values).forEach((key) => {
      const value = values[key];
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  function get(name, params) {
    return fetch(buildUrl(name, params), {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).then(parseResponse);
  }

  function post(name, payload) {
    const body = new URLSearchParams();
    body.set("_glpi_csrf_token", config.csrfToken || "");

    Object.keys(payload || {}).forEach((key) => {
      const value = payload[key];
      if (value !== undefined && value !== null) {
        body.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
    });

    return fetch(endpoint(name), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: body.toString(),
    }).then(parseResponse);
  }

  function upload(name, formData) {
    formData.set("_glpi_csrf_token", config.csrfToken || "");
    return fetch(endpoint(name), {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      body: formData,
    }).then(parseResponse);
  }

  function imageUrl(id) {
    const url = new URL(config.imageBase || "front/image.php", window.location.href);
    url.searchParams.set("id", id);
    return url.toString();
  }

  NS.api = {
    config,
    get,
    post,
    upload,
    imageUrl,
    endpoint,
  };
})();
