/* ═══════════════════════════════════════════════════════════
   parser.js — Dateien einlesen & in ein flaches Datenmodell
   normalisieren. Keine DOM-Zugriffe außer FileReader.
   ═══════════════════════════════════════════════════════════ */

const Parser = (() => {
  "use strict";

  /* ── Textbereinigung ──────────────────────────────────
     ChatGPT-Exporte enthalten Marker in Private-Use-Unicode:
     U+E200 <inhalt> U+E201, mit U+E202 als Trenner. Beispiele:
       \uE200cite\uE202turn0search0\uE201          → Zitat-Marker
       \uE200url\uE202ChatGPT\uE202https://…\uE201 → Link
       \uE200entity["company","Google","…"]\uE201  → Entity   */
  function cleanText(raw) {
    if (!raw) return "";
    let s = raw;

    s = s.replace(/\uE200[^\uE201]*\uE201/g, (m) => {
      const inner = m.slice(1, -1);
      const parts = inner.split("\uE202");
      const head = parts[0] || "";
      if (head.startsWith("entity")) {
        // entity["company","Google","Gemini AI platform"] → "Google"
        const q = inner.match(/"((?:[^"\\]|\\.)*)"/g);
        return q && q[1] ? q[1].slice(1, -1) : " ";
      }
      if (head === "url" || head === "link") return parts[1] || " ";
      return " "; // cite / navlist / video / … entfernen
    });

    // Übrige (unpaarige) Private-Use-Zeichen entfernen
    s = s.replace(/[\uE000-\uF8FF]/g, " ");

    // Marker-Reste ohne Wrapper
    s = s.replace(/\bcite(?:turn\d+\w+)+/g, " ");
    s = s.replace(/\bturn\d+(?:search|news|reddit|view|fetch|image|forecast|maps)\d+\b/g, " ");

    return s;
  }

  function countWords(s) {
    if (!s) return 0;
    const m = s.trim().match(/\S+/g);
    return m ? m.length : 0;
  }

  /* Denkzeit aus "reasoning_recap" parsen, z. B.
     "Nachgedacht für 4s", "… für 1m 30s", "… für eine Sekunde",
     "… für ein paar Sekunden". Rückgabe: {sec, estimated}   */
  function parseRecapSeconds(text) {
    if (!text) return null;
    const t = text.toLowerCase();
    let sec = 0, found = false;
    const h = t.match(/(\d+)\s*h/);           if (h) { sec += +h[1] * 3600; found = true; }
    const m = t.match(/(\d+)\s*m(?![a-z])/);  if (m) { sec += +m[1] * 60;   found = true; }
    const s = t.match(/(\d+)\s*s(?:ek)?/);    if (s) { sec += +s[1];        found = true; }
    if (found) return { sec, estimated: false };
    // Textvarianten (DE + EN) → grobe Schätzwerte
    if (/eine sekunde|a second/.test(t))                 return { sec: 1, estimated: true };
    if (/ein paar sekunden|a couple of seconds/.test(t)) return { sec: 3, estimated: true };
    if (/einige wenige sekunden|a few seconds/.test(t))  return { sec: 5, estimated: true };
    if (/einige sekunden|several seconds/.test(t))       return { sec: 8, estimated: true };
    if (/sekunden|seconds/.test(t))                      return { sec: 5, estimated: true };
    if (/minute/.test(t))                                return { sec: 60, estimated: true };
    // "Denkvorgang beendet" / "Stopped thinking" u. ä.: keine Zeitangabe
    return null;
  }

  /* MIME-Typ → lesbares Kürzel */
  function mimeLabel(mime) {
    if (!mime) return "Sonstige";
    const map = {
      "application/pdf": "PDF",
      "text/plain": "Text",
      "text/csv": "CSV",
      "application/json": "JSON",
      "application/zip": "ZIP",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
      "application/msword": "Word",
    };
    if (map[mime]) return map[mime];
    if (mime.startsWith("image/")) return mime.slice(6).toUpperCase();
    if (mime.startsWith("audio/")) return "Audio";
    if (mime.startsWith("video/")) return "Video";
    if (mime.startsWith("text/"))  return mime.slice(5).toUpperCase();
    const tail = mime.split("/").pop();
    return tail.length <= 6 ? tail.toUpperCase() : "Sonstige";
  }

  /* ── Eine Nachricht normalisieren ─────────────────────── */
  function normalizeMessage(m) {
    const ct = m.content ? m.content.content_type : null;
    const meta = m.metadata || {};
    const out = {
      role: m.author ? m.author.role : "unknown",
      ct,
      t: m.create_time || null,
      text: "",
      words: 0,
      chars: 0,
      model: meta.model_slug || null,
      recap: null,            // {sec, estimated}
      recapText: "",          // z. B. "Nachgedacht für 4s"
      thoughtsWords: 0,
      thoughtsText: "",       // mitlesbare Gedanken (für den Chat-Reader)
      images: [],             // {bytes, w, h}
      audioCount: 0,
      rtCount: 0,             // Realtime-Audio/Video (Voice-Modus)
      transcriptWords: 0,
      attachments: [],        // {name, mime, mimeLabel, size}
      codeBlocks: 0,
      searchGroups: null,     // [{domain, entries}]
      refTypes: [],
      isVisible: false,
    };

    if (ct === "text" && m.content.parts) {
      out.text = cleanText(m.content.parts.filter(p => typeof p === "string").join("\n"));
      out.isVisible = true;
    } else if (ct === "multimodal_text" && m.content.parts) {
      const texts = [];
      for (const p of m.content.parts) {
        if (typeof p === "string") { texts.push(p); continue; }
        if (!p || !p.content_type) continue;
        if (p.content_type === "image_asset_pointer") {
          out.images.push({ bytes: p.size_bytes || 0, w: p.width || 0, h: p.height || 0 });
        } else if (p.content_type === "audio_transcription") {
          out.transcriptWords += countWords(p.text || "");
          texts.push(p.text || "");
        } else if (p.content_type === "audio_asset_pointer") {
          out.audioCount++;
        } else if (p.content_type === "real_time_user_audio_video_asset_pointer") {
          out.rtCount++;
        }
      }
      out.text = cleanText(texts.join("\n"));
      out.isVisible = true;
    } else if (ct === "thoughts" && m.content.thoughts) {
      const texts = [];
      for (const th of m.content.thoughts) {
        if (th && th.summary) texts.push("**" + th.summary + "**");
        if (th && Array.isArray(th.chunks)) texts.push(...th.chunks);
        else if (th && th.content) texts.push(th.content);
      }
      out.thoughtsText = cleanText(texts.join("\n\n")).trim();
      out.thoughtsWords = countWords(out.thoughtsText);
    } else if (ct === "reasoning_recap" && m.content.content) {
      out.recap = parseRecapSeconds(m.content.content);
      out.recapText = m.content.content;
    }

    out.words = countWords(out.text);
    out.chars = out.text.length;

    if (Array.isArray(meta.attachments)) {
      for (const a of meta.attachments) {
        out.attachments.push({
          name: a.name || "Unbenannt",
          mime: a.mime_type || "",
          mimeLabel: mimeLabel(a.mime_type),
          size: a.size || 0,
        });
      }
    }
    if (meta.code_blocks) out.codeBlocks = Object.keys(meta.code_blocks).length;
    if (Array.isArray(meta.search_result_groups)) {
      out.searchGroups = meta.search_result_groups.map(g => ({
        domain: g.domain || "unbekannt",
        entries: Array.isArray(g.entries) ? g.entries.length : 0,
      }));
    }
    if (Array.isArray(meta.content_references)) {
      out.refTypes = meta.content_references.map(r => r.type).filter(Boolean);
    }
    return out;
  }

  /* ── Eine Konversation normalisieren ──────────────────── */
  function normalizeConversation(c) {
    const msgs = [];
    if (c.mapping) {
      for (const node of Object.values(c.mapping)) {
        if (node && node.message) msgs.push(normalizeMessage(node.message));
      }
    }
    msgs.sort((a, b) => (a.t || 0) - (b.t || 0));
    return {
      id: c.conversation_id || c.id,
      title: c.title || "Ohne Titel",
      createTime: c.create_time || null,
      updateTime: c.update_time || null,
      defaultModel: c.default_model_slug || null,
      voice: c.voice || null,
      templateId: c.conversation_template_id || null,
      isArchived: !!c.is_archived,
      isStarred: !!c.is_starred,
      msgs,
    };
  }

  /* ── Payload-Klassifizierung & Merge ──────────────────── */

  // Ein geparstes JSON einordnen: Konversations-Array, Asset-Namen-Map
  // oder user.json (Konto-Infos)?
  function classify(data) {
    if (Array.isArray(data)) {
      if (data.length === 0) return "empty";
      if (data[0] && typeof data[0] === "object" && ("mapping" in data[0] || "conversation_id" in data[0])) {
        return "conversations";
      }
      return "unknown";
    }
    if (data && typeof data === "object") {
      // user.json VOR der Asset-Map prüfen — sie besteht ebenfalls nur aus
      // String-Werten und würde sonst als Asset-Namen fehlklassifiziert
      if ("chatgpt_plus_user" in data || "email" in data ||
          (typeof data.id === "string" && data.id.startsWith("user-"))) {
        return "user";
      }
      const keys = Object.keys(data);
      if (keys.length && keys.every(k => typeof data[k] === "string")) return "assets";
    }
    return "unknown";
  }

  /* payloads: [{name, data}] → {conversations:[…], assetNames:{}, userInfo, report:[…]} */
  function buildModel(payloads) {
    const byId = new Map();
    const assetNames = {};
    let userInfo = null;
    const report = [];

    for (const { name, data } of payloads) {
      const kind = classify(data);
      if (kind === "conversations") {
        let added = 0;
        for (const c of data) {
          const conv = normalizeConversation(c);
          if (!byId.has(conv.id)) { byId.set(conv.id, conv); added++; }
        }
        report.push({ name, ok: true, info: `${added} Konversationen` });
      } else if (kind === "assets") {
        Object.assign(assetNames, data);
        report.push({ name, ok: true, info: `${Object.keys(data).length} Asset-Namen` });
      } else if (kind === "user") {
        userInfo = data;
        report.push({ name, ok: true, info: "Konto-Infos" });
      } else if (kind === "empty") {
        report.push({ name, ok: true, info: "leer" });
      } else {
        report.push({ name, ok: false, info: "Format nicht erkannt" });
      }
    }

    const conversations = [...byId.values()].sort((a, b) => (a.createTime || 0) - (b.createTime || 0));
    return { conversations, assetNames, userInfo, report };
  }

  /* ── Datei-Handling ───────────────────────────────────── */

  function readFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve({ name: file.name, data: JSON.parse(reader.result) });
        } catch (e) {
          resolve({ name: file.name, error: "Kein gültiges JSON" });
        }
      };
      reader.onerror = () => resolve({ name: file.name, error: "Lesefehler" });
      reader.readAsText(file);
    });
  }

  async function readFiles(fileList) {
    const files = [...fileList].filter(f => /\.json$/i.test(f.name) || f.type === "application/json");
    const results = await Promise.all(files.map(readFile));
    return {
      payloads: results.filter(r => !r.error),
      errors: results.filter(r => r.error),
      skipped: fileList.length - files.length,
    };
  }

  return { readFiles, buildModel, cleanText, countWords, mimeLabel, parseRecapSeconds };
})();
