/* ═══════════════════════════════════════════════════════════
   markdown.js — Minimaler Markdown-Renderer für den Chat-Reader.
   Bewusst ohne externe Bibliothek (Seite bleibt offline nutzbar).
   Unterstützt: Überschriften, fetten/kursiven Text, Inline-Code,
   Code-Blöcke, Listen, Tabellen, Zitate, Links, Trennlinien.
   Aller Input wird zuerst HTML-escaped — Ausgabe ist sicher.
   ═══════════════════════════════════════════════════════════ */

const Markdown = (() => {
  "use strict";

  const escapeHtml = (s) => s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  /* Inline-Formatierung (Input bereits escaped) */
  function inline(s) {
    s = s.replace(/`([^`]+)`/g, (_, c) => "<code>" + c + "</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isTableSep = (l) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-");

  function tableHtml(rows) {
    const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => inline(c.trim()));
    let html = "<table>";
    rows.forEach((r, i) => {
      if (i === 1 && isTableSep(r)) return;
      const tag = i === 0 ? "th" : "td";
      html += "<tr>" + cells(r).map(c => `<${tag}>${c}</${tag}>`).join("") + "</tr>";
    });
    return html + "</table>";
  }

  /* Blöcke außerhalb von Code-Fences */
  function renderBlocks(text) {
    const lines = text.split("\n");
    let html = "", para = [], list = null, listItems = [], table = [];

    const flushPara = () => {
      if (para.length) { html += "<p>" + para.map(inline).join("<br>") + "</p>"; para = []; }
    };
    const flushList = () => {
      if (list) { html += `<${list}>` + listItems.map(i => "<li>" + inline(i) + "</li>").join("") + `</${list}>`; list = null; listItems = []; }
    };
    const flushTable = () => {
      if (table.length) { html += tableHtml(table); table = []; }
    };
    const flushAll = () => { flushPara(); flushList(); flushTable(); };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");

      if (isTableRow(line)) { flushPara(); flushList(); table.push(line); continue; }
      flushTable();

      const h = line.match(/^(#{1,6})\s+(.*)/);
      if (h) {
        // Überschriften um 2 Ebenen abstufen (# → h3), damit sie in
        // Chat-Bubbles nicht riesig wirken; h6 ist das Minimum.
        const lvl = Math.min(h[1].length + 2, 6);
        flushAll(); html += `<h${lvl}>` + inline(h[2]) + `</h${lvl}>`; continue;
      }

      if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { flushAll(); html += "<hr>"; continue; }

      const q = line.match(/^>\s?(.*)/);
      if (q) { flushAll(); html += "<blockquote><p>" + inline(q[1]) + "</p></blockquote>"; continue; }

      const ul = line.match(/^\s*[-*+]\s+(.*)/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      if (ul || ol) {
        flushPara();
        const want = ul ? "ul" : "ol";
        if (list !== want) { flushList(); list = want; }
        listItems.push((ul || ol)[1]);
        continue;
      }

      if (!line.trim()) { flushAll(); continue; }
      flushList();
      para.push(line);
    }
    flushAll();
    return html;
  }

  /* Haupteinstieg: Code-Fences abtrennen, Rest als Blöcke rendern */
  function render(md) {
    if (!md) return "";
    const chunks = escapeHtml(md).split(/^```|\n```/);
    let html = "";
    chunks.forEach((chunk, i) => {
      if (i % 2) {
        const nl = chunk.indexOf("\n");
        const code = nl > -1 ? chunk.slice(nl + 1) : chunk;
        html += "<pre><code>" + code.replace(/\n$/, "") + "</code></pre>";
      } else {
        html += renderBlocks(chunk);
      }
    });
    return html;
  }

  return { render };
})();
