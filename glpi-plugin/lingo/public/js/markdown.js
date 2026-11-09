(function () {
  "use strict";

  const NS = (window.ITDocs = window.ITDocs || {});
  const utils = NS.utils;
  const security = NS.security;

  const TOKEN_START = "\u0000T";
  const TOKEN_END = "\u0000";
  const HARD_BREAK = "\u0001";
  const UNDERLINE_OPEN = "\u0002";
  const UNDERLINE_CLOSE = "\u0003";
  const ESCAPE_TOKEN = "\u0004";

  const BLOCK_TAGS = new Set([
    "p",
    "div",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "blockquote",
    "pre",
    "hr",
    "figure",
    "figcaption",
  ]);

  function inlineToHtml(value, options) {
    const settings = Object.assign({ links: true, media: true }, options || {});
    let work = String(value == null ? "" : value).replace(/\r\n?/g, "\n");
    const tokens = [];
    const escapes = [];

    const stash = (html) => {
      const token = `${TOKEN_START}${tokens.length}${TOKEN_END}`;
      tokens.push(html);
      return token;
    };

    work = work.replace(/\\([\\`*_{}\[\]()#+\-.!>~|<>])/g, function (match, character) {
      escapes.push(character);
      return `${ESCAPE_TOKEN}${escapes.length - 1}${ESCAPE_TOKEN}`;
    });

    work = work.replace(/(`+)([\s\S]*?)\1/g, function (match, fence, content) {
      let code = content;
      if (/^ [\s\S]* $/.test(code) && code.trim()) code = code.slice(1, -1);
      return stash(`<code>${utils.escapeHtml(code)}</code>`);
    });

    work = work.replace(/<(\/?)(u|ins)>/gi, function (match, closing) {
      return closing ? UNDERLINE_CLOSE : UNDERLINE_OPEN;
    });

    if (settings.links) {
      work = work.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gi, function (match, url) {
        if (!security.isSafeLink(url)) return utils.escapeHtml(match);
        return stash(`<a href="${utils.escapeAttr(url)}">${utils.escapeHtml(url)}</a>`);
      });
    }

    if (settings.media) {
      work = work.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, function (match, alt, url, title) {
        const cleanUrl = decodeEntities(url);
        if (!security.isSafeImageSource(cleanUrl, true)) return utils.escapeHtml(alt || "");
        const titleAttr = title ? ` title="${utils.escapeAttr(decodeEntities(title))}"` : "";
        return stash(
          `<img src="${utils.escapeAttr(cleanUrl)}" alt="${utils.escapeAttr(alt || "")}"${titleAttr}>`
        );
      });
    }

    if (settings.links) {
      work = work.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, function (match, label, url, title) {
        const cleanUrl = decodeEntities(url);
        const labelHtml = formatInlineLabel(label);
        if (!security.isSafeLink(cleanUrl)) return labelHtml;
        const titleAttr = title ? ` title="${utils.escapeAttr(decodeEntities(title))}"` : "";
        return stash(`<a href="${utils.escapeAttr(cleanUrl)}"${titleAttr}>${labelHtml}</a>`);
      });
    }

    let html = utils.escapeHtml(work);

    html = html.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/___(?=\S)([\s\S]*?\S)___/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(?=\S)([\s\S]*?\S)__/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^\w*])\*(?=\S)([^*\n]+?\S)\*(?!\*)/g, "$1<em>$2</em>");
    html = html.replace(/(^|[^\w_])_(?=\S)([^_\n]+?\S)_(?!\w)/g, "$1<em>$2</em>");
    html = html.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");

    html = html
      .replace(new RegExp(UNDERLINE_OPEN, "g"), "<u>")
      .replace(new RegExp(UNDERLINE_CLOSE, "g"), "</u>")
      .replace(new RegExp(HARD_BREAK, "g"), "<br>");

    html = restoreEscapes(html, escapes);
    html = restoreTokens(html, tokens);
    return html;
  }

  function formatInlineLabel(value) {
    return inlineToHtml(value, { links: false, media: false });
  }

  function restoreEscapes(html, escapes) {
    return html.replace(new RegExp(`${ESCAPE_TOKEN}(\\d+)${ESCAPE_TOKEN}`, "g"), function (match, index) {
      const character = escapes[Number(index)];
      return character == null ? "" : utils.escapeHtml(character);
    });
  }

  function restoreTokens(html, tokens) {
    let output = html;
    for (let pass = 0; pass < 6; pass += 1) {
      if (!new RegExp(`${TOKEN_START}\\d+${TOKEN_END}`).test(output)) break;
      output = output.replace(new RegExp(`${TOKEN_START}(\\d+)${TOKEN_END}`, "g"), function (match, index) {
        const token = tokens[Number(index)];
        return token == null ? "" : token;
      });
    }
    return output;
  }

  function decodeEntities(value) {
    const element = document.createElement("textarea");
    element.innerHTML = String(value == null ? "" : value);
    return element.value;
  }

  function countIndent(line) {
    const expanded = String(line).replace(/\t/g, "    ");
    const match = /^ */.exec(expanded);
    return match ? match[0].length : 0;
  }

  function matchListItem(line) {
    const expanded = String(line).replace(/\t/g, "    ");
    const match = /^( *)([-+*]|(\d{1,9})[.)])\s+(.*)$/.exec(expanded);
    if (!match) return null;
    return {
      indent: match[1].length,
      ordered: !!match[3],
      number: match[3] ? Number(match[3]) : null,
      text: match[4],
    };
  }

  function isHr(line) {
    const trimmed = line.trim();
    return /^(\*\s*){3,}$/.test(trimmed) || /^(-\s*){3,}$/.test(trimmed) || /^(_\s*){3,}$/.test(trimmed);
  }

  function isFence(line) {
    return /^ {0,3}(`{3,}|~{3,})\s*[^`]*$/.test(line) && !/^ {0,3}(`{3,}|~{3,})[^`]*`[^`]*$/.test(line.trim());
  }

  function isIndentedCode(line) {
    return /^( {4}|\t)/.test(line);
  }

  function isBlockStart(line) {
    return (
      /^ {0,3}#{1,6}\s+/.test(line) ||
      /^ {0,3}(`{3,}|~{3,})/.test(line) ||
      /^ {0,3}>/.test(line) ||
      !!matchListItem(line) ||
      isHr(line) ||
      isIndentedCode(line)
    );
  }

  function parseBlocks(lines) {
    let html = "";
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fenceMatch = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)\s*$/.exec(line);
      if (fenceMatch) {
        const fenceChar = fenceMatch[1][0];
        const fenceLength = fenceMatch[1].length;
        const info = fenceMatch[2] || "";
        const codeLines = [];
        index += 1;
        const closing = new RegExp(`^ {0,3}${fenceChar === "`" ? "`" : "~"}{${fenceLength},}\\s*$`);
        while (index < lines.length && !closing.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const language = /^[a-z0-9_+#.-]{1,24}$/i.test(info) ? info.toLowerCase() : "";
        const className = language ? ` class="language-${language}"` : "";
        html += `<pre><code${className}>${utils.escapeHtml(codeLines.join("\n"))}</code></pre>`;
        continue;
      }

      const headingMatch = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
      if (headingMatch) {
        const level = headingMatch[1].length;
        html += `<h${level}>${inlineToHtml(headingMatch[2])}</h${level}>`;
        index += 1;
        continue;
      }

      if (isHr(line)) {
        html += "<hr>";
        index += 1;
        continue;
      }

      if (/^ {0,3}>/.test(line)) {
        const quoteLines = [];
        while (index < lines.length) {
          const quoteMatch = /^ {0,3}>\s?(.*)$/.exec(lines[index]);
          if (quoteMatch) {
            quoteLines.push(quoteMatch[1]);
            index += 1;
            continue;
          }
          if (!lines[index].trim()) {
            let next = index + 1;
            while (next < lines.length && !lines[next].trim()) next += 1;
            if (next < lines.length && /^ {0,3}>/.test(lines[next])) {
              quoteLines.push("");
              index += 1;
              continue;
            }
            break;
          }
          if (quoteLines.length && !isBlockStart(lines[index])) {
            quoteLines.push(lines[index]);
            index += 1;
            continue;
          }
          break;
        }
        html += `<blockquote>${parseBlocks(quoteLines)}</blockquote>`;
        continue;
      }

      const listItem = matchListItem(line);
      if (listItem && listItem.indent <= 3) {
        const parsed = parseList(lines, index);
        html += parsed.html;
        index = parsed.next;
        continue;
      }

      if (isIndentedCode(line)) {
        const codeLines = [];
        while (index < lines.length) {
          if (isIndentedCode(lines[index])) {
            codeLines.push(lines[index].replace(/^ {4}|\t/, ""));
            index += 1;
          } else if (!lines[index].trim()) {
            let next = index + 1;
            while (next < lines.length && !lines[next].trim()) next += 1;
            if (next < lines.length && isIndentedCode(lines[next])) {
              codeLines.push("");
              index += 1;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        html += `<pre><code>${utils.escapeHtml(codeLines.join("\n").replace(/\n+$/, ""))}</code></pre>`;
        continue;
      }

      const paragraphLines = [];
      let hardBreak = false;
      while (index < lines.length && lines[index].trim() && (paragraphLines.length === 0 || !isBlockStart(lines[index]))) {
        const current = lines[index];
        const currentHardBreak = / {2,}$/.test(current) || /\\$/.test(current);
        let content = current.replace(/ {2,}$/, "");
        if (content.endsWith("\\")) content = content.slice(0, -1);
        if (paragraphLines.length) paragraphLines.push(hardBreak ? HARD_BREAK : " ");
        paragraphLines.push(content.trim());
        hardBreak = currentHardBreak;
        index += 1;
      }
      if (paragraphLines.length) {
        html += `<p>${inlineToHtml(paragraphLines.join(""))}</p>`;
      } else {
        index += 1;
      }
    }

    return html;
  }

  function parseList(lines, start) {
    const first = matchListItem(lines[start]);
    const baseIndent = first.indent;
    const tokens = [];
    let index = start;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        let next = index + 1;
        while (next < lines.length && !lines[next].trim()) next += 1;
        if (next < lines.length) {
          const nextItem = matchListItem(lines[next]);
          const nextIndent = countIndent(lines[next]);
          if ((nextItem && nextItem.indent >= baseIndent) || nextIndent > baseIndent) {
            index = next;
            continue;
          }
        }
        break;
      }

      const item = matchListItem(line);
      if (item) {
        if (item.indent < baseIndent) break;
        tokens.push(item);
        index += 1;
        continue;
      }

      const indent = countIndent(line);
      if (indent > baseIndent && tokens.length && !isBlockStart(line)) {
        tokens[tokens.length - 1].text += ` ${line.trim()}`;
        index += 1;
        continue;
      }
      break;
    }

    const root = { indent: baseIndent, ordered: first.ordered, items: [] };
    const stack = [root];

    tokens.forEach((token) => {
      while (stack.length > 1 && token.indent < stack[stack.length - 1].indent) {
        stack.pop();
      }
      let list = stack[stack.length - 1];
      if (token.indent > list.indent) {
        const parentItem = list.items[list.items.length - 1];
        if (parentItem) {
          const child = { indent: token.indent, ordered: token.ordered, items: [] };
          parentItem.children.push(child);
          stack.push(child);
          list = child;
        }
      }

      const taskMatch = /^\[([ xX])\]\s+(.*)$/.exec(token.text);
      list.items.push({
        text: taskMatch ? taskMatch[2] : token.text,
        task: !!taskMatch,
        checked: taskMatch ? taskMatch[1].toLowerCase() === "x" : false,
        children: [],
      });
    });

    return { html: renderList(root), next: index };
  }

  function renderList(list) {
    const tag = list.ordered ? "ol" : "ul";
    const hasTasks = list.items.some((item) => item.task);
    let html = `<${tag}${hasTasks ? ' class="task-list"' : ""}>`;
    list.items.forEach((item) => {
      const checkbox = item.task
        ? `<input type="checkbox"${item.checked ? " checked" : ""} contenteditable="false">`
        : "";
      html += `<li${item.task ? ` data-checked="${item.checked ? "true" : "false"}"` : ""}>${checkbox}${inlineToHtml(item.text)}`;
      item.children.forEach((child) => {
        html += renderList(child);
      });
      html += "</li>";
    });
    html += `</${tag}>`;
    return html;
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown == null ? "" : markdown).replace(/\r\n?/g, "\n").split("\n");
    return parseBlocks(lines);
  }

  function escapeMarkdownText(value) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .replace(/([\\`*_~\[\]<>])/g, "\\$1");
  }

  function wrapInline(marker, inner) {
    if (!inner) return "";
    const leading = /^\s*/.exec(inner)[0];
    const trailing = /\s*$/.exec(inner)[0];
    const core = inner.trim();
    if (!core) return inner;
    return `${leading}${marker}${core}${marker}${trailing}`;
  }

  function inlineCode(value) {
    const text = String(value == null ? "" : value).replace(/\r\n?/g, "\n");
    const runs = text.match(/`+/g) || [];
    const fence = "`".repeat(Math.max(1, ...runs.map((run) => run.length + 1)));
    const padding = /^`|`$|^\s|\s$/.test(text) ? " " : "";
    return `${fence}${padding}${text}${padding}${fence}`;
  }

  function escapeLinkUrl(value) {
    return String(value || "")
      .replace(/\s/g, "%20")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29");
  }

  function serializeInlineNode(node) {
    if (!node) return "";
    if (node.nodeType === 3) {
      return escapeMarkdownText(node.nodeValue.replace(/\u00a0/g, " "));
    }
    if (node.nodeType !== 1) return "";
    const tag = node.tagName.toLowerCase();

    if (tag === "br") return "  \n";
    if (tag === "input") return "";
    if (tag === "img") {
      const src = node.getAttribute("src") || "";
      const alt = node.getAttribute("alt") || "";
      const title = node.getAttribute("title");
      if (!src) return alt ? escapeMarkdownText(alt) : "";
      const titlePart = title ? ` "${String(title).replace(/"/g, '\\"')}"` : "";
      return `![${escapeMarkdownText(alt)}](${escapeLinkUrl(src)}${titlePart})`;
    }
    if (tag === "a") {
      const inner = serializeInlineNodes(node.childNodes);
      const href = node.getAttribute("href") || "";
      if (!href) return inner;
      const title = node.getAttribute("title");
      const titlePart = title ? ` "${String(title).replace(/"/g, '\\"')}"` : "";
      return `[${inner}](${escapeLinkUrl(href)}${titlePart})`;
    }
    if (tag === "strong" || tag === "b") return wrapInline("**", serializeInlineNodes(node.childNodes));
    if (tag === "em" || tag === "i") return wrapInline("*", serializeInlineNodes(node.childNodes));
    if (tag === "u" || tag === "ins") return `<u>${serializeInlineNodes(node.childNodes)}</u>`;
    if (tag === "s" || tag === "strike" || tag === "del") return wrapInline("~~", serializeInlineNodes(node.childNodes));
    if (tag === "code") return inlineCode(node.textContent || "");
    if (tag === "mark") return serializeInlineNodes(node.childNodes);
    if (tag === "sub" || tag === "sup") return serializeInlineNodes(node.childNodes);
    if (tag === "figcaption") return serializeInlineNodes(node.childNodes);
    if (BLOCK_TAGS.has(tag)) return serializeInlineNodes(node.childNodes);
    return serializeInlineNodes(node.childNodes);
  }

  function serializeInlineNodes(nodes) {
    return Array.from(nodes)
      .map(serializeInlineNode)
      .join("");
  }

  function isBlockElement(node) {
    if (!node || node.nodeType !== 1) return false;
    return BLOCK_TAGS.has(node.tagName.toLowerCase());
  }

  function hasBlockChildren(node) {
    return Array.from(node.children).some(isBlockElement);
  }

  function serializeChildren(parent) {
    const blocks = [];
    let inlineBuffer = [];

    const flush = () => {
      if (!inlineBuffer.length) return;
      const text = serializeInlineNodes(inlineBuffer).trim();
      inlineBuffer = [];
      if (text) blocks.push(text);
    };

    Array.from(parent.childNodes).forEach((node) => {
      if (node.nodeType === 3) {
        if (node.nodeValue.trim() || inlineBuffer.length) inlineBuffer.push(node);
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();

      if (tag === "br") {
        if (inlineBuffer.length) inlineBuffer.push(node);
        return;
      }

      if (!BLOCK_TAGS.has(tag)) {
        inlineBuffer.push(node);
        return;
      }

      flush();

      if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        const text = serializeInlineNodes(node.childNodes).replace(/\s*\n\s*/g, " ").trim();
        if (text) blocks.push(`${"#".repeat(level)} ${text}`);
        return;
      }

      if (tag === "p") {
        const text = serializeInlineNodes(node.childNodes).trim();
        if (text) blocks.push(text);
        return;
      }

      if (tag === "div") {
        if (hasBlockChildren(node)) {
          serializeChildren(node).forEach((block) => blocks.push(block));
        } else {
          const text = serializeInlineNodes(node.childNodes).trim();
          if (text) blocks.push(text);
        }
        return;
      }

      if (tag === "ul" || tag === "ol") {
        const list = serializeList(node);
        if (list) blocks.push(list);
        return;
      }

      if (tag === "blockquote") {
        const inner = serializeChildren(node);
        if (inner.length) {
          const lines = inner.join("\n\n").split("\n");
          blocks.push(lines.map((line) => (line ? `> ${line}` : ">")).join("\n"));
        }
        return;
      }

      if (tag === "pre") {
        const code = serializeCodeBlock(node);
        if (code) blocks.push(code);
        return;
      }

      if (tag === "hr") {
        blocks.push("---");
        return;
      }

      if (tag === "figure") {
        serializeChildren(node).forEach((block) => blocks.push(block));
        return;
      }

      if (tag === "figcaption") {
        const text = serializeInlineNodes(node.childNodes).trim();
        if (text) blocks.push(text);
        return;
      }

      serializeChildren(node).forEach((block) => blocks.push(block));
    });

    flush();
    return blocks;
  }

  function serializeCodeBlock(pre) {
    const codeElement = pre.querySelector("code");
    const source = codeElement || pre;
    const text = (source.textContent || "").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
    const classValue = `${pre.className || ""} ${codeElement ? codeElement.className : ""}`;
    const languageMatch = /(?:^|\s)language-([a-z0-9_+#.-]{1,24})/i.exec(classValue);
    const language = languageMatch ? languageMatch[1].toLowerCase() : "";
    const runs = text.match(/`+/g) || [];
    const fence = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
    return `${fence}${language}\n${text}\n${fence}`;
  }

  function isTaskItem(item) {
    return (
      item.hasAttribute("data-checked") ||
      Array.from(item.children).some(
        (child) => child.tagName && child.tagName.toLowerCase() === "input" && child.getAttribute("type") === "checkbox"
      )
    );
  }

  function serializeList(list) {
    const ordered = list.tagName.toLowerCase() === "ol";
    const start = ordered ? Number(list.getAttribute("start")) || 1 : 1;
    const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === "li");
    const lines = [];

    items.forEach((item, itemIndex) => {
      const task = isTaskItem(item);
      const checkbox = Array.from(item.children).find(
        (child) => child.tagName && child.tagName.toLowerCase() === "input" && child.getAttribute("type") === "checkbox"
      );
      const checked =
        item.getAttribute("data-checked") === "true" ||
        (checkbox && (checkbox.checked || checkbox.hasAttribute("checked")));
      const prefix = task ? `- [${checked ? "x" : " "}] ` : ordered ? `${start + itemIndex}. ` : "- ";

      const inlineNodes = [];
      const nestedLists = [];

      Array.from(item.childNodes).forEach((child) => {
        if (child.nodeType === 1) {
          const tag = child.tagName.toLowerCase();
          if (tag === "ul" || tag === "ol") {
            nestedLists.push(child);
            return;
          }
          if (tag === "input") return;
          if (tag === "p" || tag === "div") {
            inlineNodes.push(...Array.from(child.childNodes));
            return;
          }
        }
        inlineNodes.push(child);
      });

      const content = serializeInlineNodes(inlineNodes).replace(/\s+/g, " ").trim();
      const itemLines = content ? [`${prefix}${content}`] : [prefix.trimEnd()];

      nestedLists.forEach((nested) => {
        const nestedText = serializeList(nested);
        if (!nestedText) return;
        nestedText.split("\n").forEach((line) => itemLines.push(`  ${line}`));
      });

      lines.push(...itemLines);
    });

    return lines.join("\n");
  }

  function htmlToMarkdown(html) {
    const container = document.createElement("div");
    container.innerHTML = security.sanitizeHtml(html || "", { allowDataImages: true });
    const blocks = serializeChildren(container).filter((block) => block && block.trim());
    return blocks.join("\n\n").trim();
  }

  NS.markdown = {
    markdownToHtml,
    htmlToMarkdown,
  };
})();
