/* ═══════════════════════════════════════════════════════════
   demo.js — Erzeugt einen synthetischen ChatGPT-Export im
   Original-Schema (Array von Konversationen mit mapping),
   damit die komplette Parser-Pipeline durchlaufen wird.
   Seeded RNG → bei jedem Aufruf identische Demo-Daten.
   ═══════════════════════════════════════════════════════════ */

const Demo = (() => {
  "use strict";

  /* Deterministischer Zufall (mulberry32) */
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── Inhalts-Bausteine ────────────────────────────────── */

  const TOPICS = ["Python Pandas", "Reiseplanung Japan", "Bewerbungsschreiben", "Docker Compose",
    "Ernährungsplan", "Excel Formeln", "React Hooks", "Steuererklärung", "Marathon Training",
    "Git Rebase", "Wohnung einrichten", "Linux Server", "Spanisch lernen", "SQL Joins",
    "Fotografie Tipps", "Kündigungsschreiben", "Home Office Setup", "REST API Design",
    "Gartenplanung", "Machine Learning Basics", "PowerPoint Präsentation", "Miete Nebenkosten",
    "CSS Grid Layout", "Kaufvertrag prüfen", "Meal Prep Ideen", "TypeScript Generics",
    "Urlaubsantrag", "Netzwerk Grundlagen", "Motivationsschreiben", "Raspberry Pi Projekt"];

  const TITLE_SUFFIX = ["Hilfe", "erklärt", "Tipps", "Übersicht", "Fragen", "Vergleich", "Anleitung", "Ideen", "Fehler beheben", "optimieren"];

  const USER_MSGS = [
    "Kannst du mir das Schritt für Schritt erklären?",
    "Wie funktioniert das genau? Ich verstehe den Unterschied nicht ganz.",
    "Mach mir bitte eine übersichtliche Tabelle daraus.",
    "Danke! 🙏 Und wie mache ich das am besten in der Praxis?",
    "Gibt es dafür Best Practices? Was empfiehlst du?",
    "Ich bekomme eine Fehlermeldung, wenn ich das ausprobiere. Woran kann das liegen?",
    "Fass mir das bitte kurz zusammen.",
    "Kannst du mir ein konkretes Beispiel zeigen?",
    "Welche Alternativen gibt es dazu und was sind die Vor- und Nachteile?",
    "Perfekt, das hat funktioniert! 🎉 Noch eine Frage: wie skaliert das?",
    "Schreib mir bitte einen Code-Entwurf dafür.",
    "Was sollte ich dabei unbedingt beachten?",
    "Kannst du das für einen Anfänger einfacher formulieren?",
    "Recherchiere bitte die aktuellsten Informationen dazu.",
    "Und wie sieht das rechtlich aus in Deutschland?",
    "Okay verstanden. Was wäre dein konkreter Vorschlag für mein Szenario?",
  ];

  const AI_PARAGRAPHS = [
    "Gerne! Das lässt sich am besten in drei Schritten erklären. Zunächst solltest du die Grundlagen verstehen, denn darauf baut alles Weitere auf. Der wichtigste Punkt dabei: fang klein an und erweitere schrittweise.",
    "Das ist eine sehr gute Frage. Der entscheidende Unterschied liegt im Detail — während die eine Variante auf Einfachheit setzt, bietet die andere deutlich mehr Flexibilität, ist dafür aber komplexer in der Wartung.",
    "In der Praxis hat sich folgendes Vorgehen bewährt:\n\n- **Vorbereitung**: Anforderungen sauber definieren\n- **Umsetzung**: iterativ arbeiten, früh testen\n- **Kontrolle**: Ergebnisse regelmäßig überprüfen\n- **Optimierung**: erst messen, dann verbessern",
    "Hier ein Vergleich der wichtigsten Optionen:\n\n| Option | Vorteil | Nachteil |\n|---|---|---|\n| Variante A | schnell einsatzbereit | wenig flexibel |\n| Variante B | sehr anpassbar | steile Lernkurve |\n| Variante C | guter Mittelweg | weniger verbreitet |",
    "Hier ist ein einfaches Beispiel, das du direkt ausprobieren kannst:\n\n```python\ndef verarbeite_daten(eintraege):\n    ergebnis = []\n    for e in eintraege:\n        if e.get(\"aktiv\"):\n            ergebnis.append(e[\"name\"].strip())\n    return sorted(ergebnis)\n```\n\nDie Funktion filtert aktive Einträge und gibt sie sortiert zurück.",
    "Kurz zusammengefasst: Es kommt auf deinen Anwendungsfall an. Für den Einstieg empfehle ich die einfachste Lösung — die deckt in den meisten Fällen bereits 90 % der Anforderungen ab.",
    "Die Fehlermeldung deutet in der Regel auf eines von zwei Problemen hin: entweder fehlt eine Berechtigung, oder die Konfiguration wird nicht gefunden. Prüfe zuerst die Pfade, das ist die häufigste Ursache.",
    "Dazu solltest du drei Dinge beachten:\n\n1. Plane genügend Puffer ein\n2. Dokumentiere deine Entscheidungen\n3. Hole dir früh Feedback\n\nGerade der letzte Punkt wird oft unterschätzt.",
  ];

  const VOICE_USER = ["Hey, kannst du mir kurz bei einer Sache helfen?",
    "Erzähl mir was Interessantes über das Thema.",
    "Wie spät müsste ich losfahren, um pünktlich zu sein?",
    "Was koche ich heute am besten mit dem, was ich noch da habe?"];
  const VOICE_AI = ["Klar, sehr gerne! Worum geht es denn genau?",
    "Das ist tatsächlich spannender als man denkt — lass es mich kurz erklären.",
    "Wenn du gegen halb losfährst, bist du rechtzeitig da.",
    "Mit den Zutaten würde ich dir eine schnelle Gemüsepfanne vorschlagen."];

  const DOMAINS = ["wikipedia.org", "reddit.com", "github.com", "stackoverflow.com",
    "heise.de", "openai.com", "golem.de", "chip.de", "medium.com", "docs.python.org"];

  const FILES = [
    { name: "Projektplan_2026.pdf", mime: "application/pdf", size: 284000 },
    { name: "Lebenslauf_final.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 48000 },
    { name: "Auswertung_Q2.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 156000 },
    { name: "screenshot_fehler.png", mime: "image/png", size: 512000 },
    { name: "notizen.txt", mime: "text/plain", size: 4200 },
  ];

  const MODELS = [
    { slug: "gpt-5-5-thinking", w: 0.42, thinking: true },
    { slug: "gpt-5-5", w: 0.36, thinking: false },
    { slug: "gpt-5-4-thinking", w: 0.10, thinking: true },
    { slug: "o3", w: 0.06, thinking: true },
    { slug: "gpt-5-3-mini", w: 0.06, thinking: false },
  ];

  const THOUGHT_CHUNKS = [
    "Der Nutzer möchte eine praxisnahe Erklärung — ich sollte ein konkretes Beispiel einbauen.",
    "Ich überlege, welche Struktur am verständlichsten ist: erst das Konzept, dann die Umsetzung.",
    "Hier ist eine Tabelle sinnvoll, um die Optionen gegenüberzustellen.",
    "Ich sollte auf den häufigsten Fehler hinweisen, bevor der Nutzer ihn selbst macht.",
    "Die Frage bezieht sich auf den vorherigen Kontext — ich knüpfe an die letzte Antwort an.",
  ];

  /* ── Generator ────────────────────────────────────────── */

  function generate() {
    const rnd = mulberry32(20260702);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const chance = (p) => rnd() < p;
    const pickModel = () => {
      let r = rnd(), acc = 0;
      for (const m of MODELS) { acc += m.w; if (r <= acc) return m; }
      return MODELS[0];
    };

    const DAY = 86400;
    const end = Math.floor(Date.now() / 1000) - DAY;
    const start = end - 75 * DAY;
    const convs = [];
    let fileNo = 0;

    for (let ci = 0; ci < 120; ci++) {
      // Startzeitpunkt: Abende und Wochenenden leicht bevorzugt
      let t = start + rnd() * (end - start);
      const d = new Date(t * 1000);
      const hour = chance(0.55) ? int(17, 23) : (chance(0.15) ? int(0, 8) : int(9, 16));
      d.setHours(hour, int(0, 59), int(0, 59));
      t = Math.floor(d.getTime() / 1000);

      const isVoice = chance(0.08);
      const model = pickModel();
      const convId = "demo-" + String(ci).padStart(4, "0");
      const mapping = {};
      let prevId = null, nodeNo = 0;

      const addNode = (message) => {
        const id = convId + "-n" + (nodeNo++);
        mapping[id] = { id, parent: prevId, children: [], message };
        if (prevId) mapping[prevId].children.push(id);
        prevId = id;
        return id;
      };

      const turns = isVoice ? int(2, 5) : (chance(0.35) ? 1 : int(2, 9));
      for (let turn = 0; turn < turns; turn++) {
        /* — User-Nachricht — */
        const userMeta = {};
        let userContent;
        if (isVoice) {
          userContent = {
            content_type: "multimodal_text",
            parts: [
              { content_type: "audio_transcription", text: pick(VOICE_USER) },
              { content_type: "real_time_user_audio_video_asset_pointer", audio_asset_pointer: { content_type: "audio_asset_pointer", asset_pointer: "sediment://file_demo_rt_" + (fileNo++) } },
            ],
          };
        } else if (chance(0.07)) {
          // Bild-Upload
          userContent = {
            content_type: "multimodal_text",
            parts: [
              { content_type: "image_asset_pointer", asset_pointer: "sediment://file_demo_img_" + (fileNo++), size_bytes: int(80000, 900000), width: int(600, 1600), height: int(400, 1200) },
              pick(USER_MSGS),
            ],
          };
        } else {
          userContent = { content_type: "text", parts: [pick(USER_MSGS)] };
          if (chance(0.08)) {
            const f = pick(FILES);
            userMeta.attachments = [{ id: "file_demo_att_" + (fileNo++), name: f.name, mime_type: f.mime, size: f.size + int(-2000, 2000) }];
          }
        }
        addNode({ author: { role: "user", name: null }, create_time: t, content: userContent, metadata: userMeta });
        t += int(20, 300);

        /* — Reasoning (bei Thinking-Modellen) — */
        if (model.thinking && !isVoice && chance(0.8)) {
          const nChunks = chance(0.3) ? 0 : int(1, 3);
          const chunks = Array.from({ length: nChunks }, () => pick(THOUGHT_CHUNKS));
          addNode({
            author: { role: "assistant", name: null }, create_time: t,
            content: { content_type: "thoughts", thoughts: nChunks ? [{ summary: "Anfrage analysieren", chunks }] : [] },
            metadata: { model_slug: model.slug },
          });
          const sec = chance(0.3) ? 0 : int(2, 45);
          addNode({
            author: { role: "assistant", name: null }, create_time: t + 1,
            content: { content_type: "reasoning_recap", content: sec ? `Nachgedacht für ${sec}s` : "Nachgedacht für ein paar Sekunden" },
            metadata: { model_slug: model.slug },
          });
          t += (sec || 3) + 2;
        }

        /* — KI-Bildgenerierung (DALL·E-Stil: tool-Nachricht mit Bild) — */
        if (!isVoice && chance(0.05)) {
          addNode({
            author: { role: "tool", name: "dalle.text2im" }, create_time: t,
            content: {
              content_type: "multimodal_text",
              parts: [{ content_type: "image_asset_pointer", asset_pointer: "sediment://file_demo_gen_" + (fileNo++), size_bytes: int(200000, 2000000), width: 1024, height: 1024 }],
            },
            metadata: { model_slug: model.slug },
          });
          t += int(5, 30);
        }

        /* — KI-Antwort — */
        const aiMeta = { model_slug: model.slug };
        let aiContent;
        if (isVoice) {
          aiContent = {
            content_type: "multimodal_text",
            parts: [
              { content_type: "audio_transcription", text: pick(VOICE_AI) },
              { content_type: "audio_asset_pointer", asset_pointer: "sediment://file_demo_a_" + (fileNo++), size_bytes: int(40000, 400000) },
            ],
          };
        } else {
          const nParas = int(1, 3);
          const text = Array.from({ length: nParas }, () => pick(AI_PARAGRAPHS)).join("\n\n");
          aiContent = { content_type: "text", parts: [text] };
          if (text.includes("```")) aiMeta.code_blocks = { 0: { edited: false, id: "demo", previewable: false } };
          if (chance(0.2)) {
            aiMeta.search_result_groups = Array.from({ length: int(1, 4) }, () => ({
              domain: pick(DOMAINS),
              entries: Array.from({ length: int(1, 5) }, (_, i) => ({
                url: "https://" + pick(DOMAINS) + "/artikel-" + i,
                title: "Hintergrundartikel " + (i + 1),
                snippet: "Kurzer Auszug aus der zitierten Quelle …",
                attribution: "Demo",
              })),
            }));
          }
        }
        addNode({ author: { role: "assistant", name: null }, create_time: t, content: aiContent, metadata: aiMeta });
        t += int(30, 3600 * (chance(0.15) ? 8 : 1)); // gelegentlich später weiterchatten
      }

      convs.push({
        conversation_id: convId,
        id: convId,
        title: pick(TOPICS) + " " + pick(TITLE_SUFFIX),
        create_time: Math.floor(new Date(d).getTime() / 1000),
        update_time: t,
        current_node: prevId,
        default_model_slug: chance(0.5) ? "auto" : model.slug,
        voice: isVoice ? pick(["maple", "glimmer", "juniper", "orbit"]) : null,
        conversation_template_id: chance(0.12) ? "g-demo-custom-gpt" : null,
        is_archived: false,
        is_starred: null,
        mapping,
      });
    }
    return convs;
  }

  return { generate };
})();
