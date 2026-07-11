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
    const h = t.match(/(\d+)\s*(?:h|std|stunde|stunden|hour|hours)\b/);
    if (h) { sec += +h[1] * 3600; found = true; }
    const m = t.match(/(\d+)\s*(?:m|min|minute|minutes|minuten)\b/);
    if (m) { sec += +m[1] * 60; found = true; }
    const s = t.match(/(\d+)\s*(?:s|sek|sekunde|sekunden|second|seconds)\b/);
    if (s) { sec += +s[1]; found = true; }
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
      "text/markdown": "Markdown",
      "text/html": "HTML",
      "text/x-diff": "Diff",
      "image/svg+xml": "SVG",
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
  function selectedMappingNodes(c) {
    if (!c.mapping) return { nodes: [], isFinalPath: false };
    const nodes = [];
    const seen = new Set();
    let id = c.current_node;

    while (id && c.mapping[id] && !seen.has(id)) {
      seen.add(id);
      nodes.push(c.mapping[id]);
      id = c.mapping[id].parent;
    }

    // Manche alten oder synthetischen Exporte haben keinen brauchbaren
    // current_node. Dann lieber bisheriges Verhalten statt leere Chats.
    const finalNodes = nodes.reverse();
    if (!finalNodes.some(node => node && node.message)) {
      return { nodes: Object.values(c.mapping), isFinalPath: false };
    }
    return { nodes: finalNodes, isFinalPath: true };
  }

  function normalizeConversation(c) {
    const msgs = [];
    let isFinalPath = false;
    if (c.mapping) {
      const selected = selectedMappingNodes(c);
      isFinalPath = selected.isFinalPath;
      for (const node of selected.nodes) {
        if (node && node.message) msgs.push(normalizeMessage(node.message));
      }
    }
    const totalMessageNodes = c.mapping
      ? Object.values(c.mapping).filter(node => node && node.message).length
      : msgs.length;

    // Kaputte Zeitstempel reparieren: Der Export enthält vereinzelt Antworten,
    // deren create_time WEIT vor der zugehörigen Frage liegt (z. T. Wochen).
    // Innerhalb des finalen Pfads darf eine Nachricht nicht deutlich vor ihrer
    // Vorgängerin liegen — solche Ausreißer werden auf deren Zeit angehoben.
    // Toleranz 1 h, denn regenerierte Alternativen dürfen leicht rückdatiert sein.
    let repairedTimestamps = 0;
    if (isFinalPath) {
      const TOLERANCE_SEC = 3600;
      let runMax = c.create_time || 0;
      for (const m of msgs) {
        if (!m.t) continue;
        if (runMax > 0 && m.t < runMax - TOLERANCE_SEC) { m.t = runMax; repairedTimestamps++; }
        else if (m.t > runMax) runMax = m.t;
      }
    }

    if (!isFinalPath) msgs.sort((a, b) => (a.t || 0) - (b.t || 0));
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
      skippedAltMsgs: Math.max(0, totalMessageNodes - msgs.length),
      repairedTimestamps,
      msgs,
    };
  }

  /* ── Bibliothek & Manifest normalisieren ──────────────── */

  /* Ein Eintrag aus library_files.json (ChatGPT-Bibliothek) → flaches Objekt.
     Gibt null zurück für gelöschte/papierkorbte Einträge. */
  function normalizeLibraryFile(e) {
    if (!e || typeof e !== "object") return null;
    if (e.trashed_at || e.deleted_at) return null;
    const parsed = e.created_at ? Date.parse(e.created_at) : NaN;
    return {
      id: (e.id && e.id.id) || e.file_id || null,
      name: e.file_name || "Unbenannt",
      mime: e.mime_type || "",
      mimeLabel: mimeLabel(e.mime_type),
      category: e.library_file_category || "other",
      sizeBytes: e.file_size_bytes || 0,
      createdAt: Number.isFinite(parsed) ? parsed / 1000 : null,
      convId: e.origination_thread_id || e.initiating_conversation_id || null,
      isArtifact: !!e.library_artifact_type,
    };
  }

  /* export_manifest.json → nur Aggregatzahlen; die .dat-Dateien sind die
     Binär-Assets des Exports (Bilder, Audio, Anhänge). */
  function summarizeManifest(data) {
    const files = Array.isArray(data.export_files) ? data.export_files : [];
    let totalBytes = 0, mediaFiles = 0, mediaBytes = 0;
    for (const f of files) {
      const size = (f && f.size_bytes) || 0;
      totalBytes += size;
      if (f && /\.dat$/i.test(f.path || "")) { mediaFiles++; mediaBytes += size; }
    }
    return { totalFiles: files.length, totalBytes, mediaFiles, mediaBytes };
  }

  /* ── Payload-Klassifizierung & Merge ──────────────────── */

  // Ein geparstes JSON einordnen: Konversations-Array, Bibliothek
  // (library_files.json), Export-Manifest, Asset-Namen-Map oder
  // user.json (Konto-Infos)?
  function classify(data) {
    if (Array.isArray(data)) {
      if (data.length === 0) return "empty";
      const first = data[0];
      if (first && typeof first === "object") {
        if ("mapping" in first || "conversation_id" in first) return "conversations";
        if ("file_id" in first && ("library_file_category" in first || "file_name" in first)) return "library";
      }
      return "unknown";
    }
    if (data && typeof data === "object") {
      if (Array.isArray(data.export_files)) return "manifest";
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

  /* Billige Vorschau für Datei-Chips & Zähler: gleiche Report-Texte wie
     buildModel, aber ohne Normalisierung — dedupliziert nur die
     Konversations-IDs gegen die bereits bekannten (knownIds). */
  function preview(payloads, knownIds) {
    const ids = new Set(knownIds);
    const report = [];
    for (const { name, data } of payloads) {
      const kind = classify(data);
      if (kind === "conversations") {
        let added = 0;
        for (const c of data) {
          const id = c.conversation_id || c.id;
          if (!ids.has(id)) { ids.add(id); added++; }
        }
        report.push({ name, ok: true, info: `${added} Konversationen` });
      } else if (kind === "library") {
        report.push({ name, ok: true, info: `${data.length} Bibliotheks-Dateien` });
      } else if (kind === "manifest") {
        report.push({ name, ok: true, info: `Export-Manifest (${data.export_files.length} Dateien)` });
      } else if (kind === "assets") {
        report.push({ name, ok: true, info: `${Object.keys(data).length} Asset-Namen` });
      } else if (kind === "user") {
        report.push({ name, ok: true, info: "Konto-Infos" });
      } else if (kind === "empty") {
        report.push({ name, ok: true, info: "leer" });
      } else {
        report.push({ name, ok: false, info: "Format nicht erkannt" });
      }
    }
    return { report, ids };
  }

  /* payloads: [{name, data}] →
     {conversations:[…], assetNames:{}, userInfo, libraryFiles:[…], manifest, report:[…]} */
  function buildModel(payloads) {
    const byId = new Map();
    const assetNames = {};
    const libById = new Map();
    let userInfo = null;
    let manifest = null;
    const report = [];

    for (const { name, data } of payloads) {
      const kind = classify(data);
      if (kind === "conversations") {
        let added = 0, repaired = 0;
        for (const c of data) {
          const conv = normalizeConversation(c);
          if (!byId.has(conv.id)) { byId.set(conv.id, conv); added++; repaired += conv.repairedTimestamps; }
        }
        report.push({ name, ok: true, info: `${added} Konversationen` +
          (repaired ? ` · ${repaired} fehlerhafte Zeitstempel repariert` : "") });
      } else if (kind === "library") {
        let added = 0;
        for (const e of data) {
          const f = normalizeLibraryFile(e);
          if (!f) continue;
          const key = f.id || `${f.name}|${f.createdAt}`;
          if (!libById.has(key)) { libById.set(key, f); added++; }
        }
        report.push({ name, ok: true, info: `${added} Bibliotheks-Dateien` });
      } else if (kind === "manifest") {
        manifest = summarizeManifest(data);
        report.push({ name, ok: true, info: `Export-Manifest (${manifest.totalFiles} Dateien)` });
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
    return { conversations, assetNames, userInfo, libraryFiles: [...libById.values()], manifest, report };
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

  return { readFiles, preview, buildModel, cleanText, countWords, mimeLabel, parseRecapSeconds };
})();
