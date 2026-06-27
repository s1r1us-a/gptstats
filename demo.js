/* ============================================================
   demo.js — Beispieldaten-Generator ("Demo-Modus")
   Erzeugt realistische Fake-Daten im echten ChatGPT-Export-Format,
   damit man die App ohne eigenen Upload erleben kann.
   Reproduzierbar dank seeded RNG. Exponiert global:
     buildDemoExport()  -> Array von Konversations-Objekten (eine "conversations.json")
     buildDemoAssets()  -> {file_id: name}  (eine "conversation_asset_file_names.json")
   ============================================================ */
(function () {
  // deterministischer PRNG (mulberry32)
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let DEMO_ASSETS = {};
  let assetSeq = 0;

  const MODELS = [
    ['gpt-4o', 38], ['gpt-4o-mini', 22], ['o3-mini', 12],
    ['o1', 8], ['gpt-4-turbo', 10], ['gpt-4.5', 6], ['gpt-3.5-turbo', 4],
  ];
  const REASON_MODELS = new Set(['o1', 'o3-mini']);

  const TOPICS = [
    { t: 'Python-Skript für CSV-Analyse', w: ['python', 'pandas', 'dataframe', 'funktion', 'spalte', 'analyse', 'schleife', 'fehler', 'import', 'ausgabe', 'skript'], code: true },
    { t: 'React-Komponente debuggen', w: ['react', 'komponente', 'state', 'hook', 'render', 'props', 'javascript', 'effect', 'button', 'styling'], code: true },
    { t: 'Marketing-Strategie 2025', w: ['marketing', 'strategie', 'zielgruppe', 'kampagne', 'content', 'reichweite', 'budget', 'kanal', 'conversion', 'markenbildung'] },
    { t: 'Reiseplanung Japan', w: ['japan', 'tokyo', 'reise', 'route', 'tempel', 'hotel', 'kyoto', 'essen', 'kultur', 'planung'], web: true },
    { t: 'Fitness-Trainingsplan', w: ['training', 'muskel', 'wiederholung', 'ernährung', 'protein', 'regeneration', 'ausdauer', 'fortschritt', 'übung'] },
    { t: 'Rezept-Ideen Pasta', w: ['rezept', 'pasta', 'sauce', 'knoblauch', 'olivenöl', 'parmesan', 'kochen', 'zutaten', 'tomaten', 'basilikum'] },
    { t: 'Datenbank-Design', w: ['datenbank', 'tabelle', 'index', 'abfrage', 'schema', 'relation', 'postgres', 'migration', 'primärschlüssel', 'performance'], code: true },
    { t: 'Lebenslauf-Feedback', w: ['lebenslauf', 'bewerbung', 'erfahrung', 'formulierung', 'position', 'skills', 'abschnitt', 'arbeitgeber', 'motivation'] },
    { t: 'Machine-Learning-Modell', w: ['modell', 'training', 'daten', 'genauigkeit', 'neuronal', 'netzwerk', 'feature', 'validierung', 'overfitting', 'gradient'], code: true },
    { t: 'Geschichte erklären', w: ['geschichte', 'jahrhundert', 'ereignis', 'revolution', 'gesellschaft', 'politik', 'entwicklung', 'quelle', 'zusammenhang'], web: true },
    { t: 'Englisch-Übersetzung', w: ['übersetzung', 'english', 'grammatik', 'bedeutung', 'formulierung', 'sprache', 'vokabel', 'kontext', 'sentence'] },
    { t: 'Steuererklärung-Fragen', w: ['steuer', 'erklärung', 'freibetrag', 'werbungskosten', 'finanzamt', 'beleg', 'formular', 'abzug', 'einkommen'] },
    { t: 'Wochenplan & Produktivität', w: ['planung', 'produktivität', 'aufgabe', 'priorität', 'kalender', 'gewohnheit', 'fokus', 'routine', 'notiz'] },
    { t: 'Logo-Design-Konzept', w: ['design', 'logo', 'farbe', 'typografie', 'konzept', 'marke', 'minimalismus', 'kontrast', 'symbol'], img: true },
    { t: 'Bewerbungsgespräch üben', w: ['interview', 'antwort', 'stärke', 'schwäche', 'beispiel', 'erfahrung', 'frage', 'gehalt', 'vorbereitung'] },
  ];
  const GENERIC = ['idee', 'beispiel', 'lösung', 'ansatz', 'frage', 'schritt', 'option', 'vorteil', 'nachteil', 'grund', 'ziel', 'ergebnis', 'version', 'methode', 'struktur', 'konzept', 'detail', 'aufgabe', 'problem', 'überblick', 'empfehlung'];
  const CONNECT = ['und', 'mit', 'für', 'das', 'ist', 'eine', 'der', 'die', 'bei', 'an', 'im', 'dann', 'also', 'sehr', 'noch', 'auch', 'wie', 'wenn', 'man', 'hier', 'so'];
  const OPENERS = ['Kannst du mir helfen mit', 'Ich habe eine Frage zu', 'Erkläre mir bitte', 'Wie funktioniert', 'Schreib mir etwas zu', 'Was ist der beste Weg für', 'Gib mir ein Beispiel für', 'Ich verstehe nicht ganz'];
  const IMG_NAMES = ['screenshot.png', 'foto.jpg', 'mockup.png', 'whiteboard.jpg', 'diagramm.png', 'urlaub.jpeg', 'beleg.jpg', 'skizze.png'];
  const DOC_NAMES = ['bericht.pdf', 'notizen.md', 'tabelle.xlsx', 'praesentation.pptx', 'vertrag.pdf', 'daten.csv', 'brief.docx'];
  const AUDIO_EXT = ['wav', 'm4a', 'mp3'];

  function buildDemoExport() {
    const rng = mulberry32(0x5eed1234);
    DEMO_ASSETS = {};
    assetSeq = 0;

    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const rint = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const chance = (p) => rng() < p;
    const weighted = (pairs) => {
      const total = pairs.reduce((s, p) => s + p[1], 0);
      let r = rng() * total;
      for (const [v, wgt] of pairs) { if ((r -= wgt) <= 0) return v; }
      return pairs[0][0];
    };
    function natural(pool, sentences) {
      const out = [];
      for (let i = 0; i < sentences; i++) {
        const len = rint(6, 14), parts = [];
        for (let j = 0; j < len; j++) parts.push(j % 2 === 0 ? pick(pool.concat(GENERIC)) : pick(CONNECT));
        const s = parts.join(' ');
        out.push(s.charAt(0).toUpperCase() + s.slice(1));
      }
      return out.join('. ') + '.';
    }
    function addAsset(name) { const id = 'file_' + String(assetSeq++).padStart(6, '0'); DEMO_ASSETS[id] = name; return id; }

    const DAY = 86400;
    const now = Math.floor(Date.now() / 1000);
    const startDay = now - 392 * DAY;
    const convs = [];
    let cid = 0;

    function hourOfDay() {
      // Tagesprofil: Morgen- und Abendspitzen
      const buckets = [[8, 11, 26], [12, 14, 14], [15, 18, 16], [19, 23, 30], [0, 7, 6], [0, 23, 8]];
      const b = weighted(buckets.map((x) => [x, x[2]]));
      return rint(b[0], b[1]);
    }

    function makeConversation(t0) {
      const topic = pick(TOPICS);
      const mapping = {};
      mapping['root'] = { id: 'root', message: null, parent: null, children: [] };
      let prevId = 'root';
      let t = t0;
      let nodeSeq = 0;
      const cidStr = 'demo-' + cid;

      const addNode = (message) => {
        const id = cidStr + '-n' + (nodeSeq++);
        mapping[id] = { id, message, parent: prevId, children: [] };
        mapping[prevId].children.push(id);
        prevId = id;
        return id;
      };

      const voiceLive = chance(0.06);
      const voiceStd = !voiceLive && chance(0.045);
      const isVoice = voiceLive || voiceStd;
      const reasoning = chance(0.16);
      const model = reasoning ? (chance(0.6) ? 'o3-mini' : 'o1') : weighted(MODELS.filter((m) => !REASON_MODELS.has(m[0])));
      const turns = isVoice ? rint(3, 9) : rint(1, 7);
      const longAnswerTurn = chance(0.12) ? rint(0, turns - 1) : -1;

      for (let turn = 0; turn < turns; turn++) {
        /* ---- USER ---- */
        const userParts = [];
        let userMeta = {};
        const wantImg = topic.img ? chance(0.55) : chance(0.05);
        const wantDoc = chance(0.06);
        let userText = pick(OPENERS) + ' ' + natural(topic.w, 1).toLowerCase();
        if (voiceLive) {
          userParts.push({ content_type: 'real_time_user_audio_video_asset_pointer', asset_pointer: 'file-service://' + addAsset('voice_' + cid + '.wav') });
          userParts.push(userText);
        } else if (voiceStd) {
          userParts.push({ content_type: 'audio_asset_pointer', asset_pointer: 'file-service://' + addAsset('audio_' + cid + '_' + turn + '.m4a') });
          userParts.push(userText);
          userMeta.audio_transcription = userText;
        } else if (wantImg && turn === 0) {
          const aid = addAsset(pick(IMG_NAMES));
          userParts.push(userText);
          userParts.push({ content_type: 'image_asset_pointer', asset_pointer: 'file-service://' + aid, metadata: {} });
        } else {
          userParts.push(userText);
        }
        if (wantDoc && turn === 0 && !isVoice) {
          userMeta.attachments = [{ id: addAsset(pick(DOC_NAMES)), name: DEMO_ASSETS[Object.keys(DEMO_ASSETS).pop()] }];
        }
        addNode({
          author: { role: 'user' },
          create_time: t,
          content: { content_type: userParts.some((p) => typeof p === 'object') ? 'multimodal_text' : 'text', parts: userParts },
          metadata: userMeta,
        });

        // hin und wieder bleibt die letzte Nachricht unbeantwortet (realistische Asymmetrie)
        if (turn === turns - 1 && !isVoice && chance(0.14)) break;

        /* ---- THINKING (nur bei Reasoning-Modellen) ---- */
        if (reasoning && chance(0.85)) {
          addNode({
            author: { role: 'assistant' },
            create_time: t + rint(2, 6),
            content: { content_type: 'thoughts', thoughts: [{ summary: 'Überlege ' + pick(topic.w), content: natural(topic.w, rint(2, 4)) }] },
            metadata: { model_slug: model },
          });
        }

        /* ---- ASSISTANT ---- */
        const latency = isVoice ? rint(2, 12) : rint(4, 220);
        const aTime = t + latency;
        const nSent = turn === longAnswerTurn ? rint(12, 20) : rint(2, 7);
        let answer = '';
        const paras = isVoice ? 1 : rint(1, 2);
        for (let p = 0; p < paras; p++) answer += (p ? '\n\n' : '') + natural(topic.w, Math.ceil(nSent / paras));
        const wantCode = topic.code && !isVoice && chance(0.7);
        const wantWeb = topic.web && chance(0.7);
        const aMeta = { model_slug: model };
        if (wantCode) {
          answer += '\n\n```python\n# ' + pick(topic.w) + '\ndef ' + pick(topic.w) + '():\n    return ' + rint(1, 99) + '\n```';
          aMeta.code_blocks = { '0': { language: 'python' } };
        } else if (chance(0.25) && !isVoice) {
          answer += '\n\n- ' + pick(topic.w) + ': ' + natural(topic.w, 1) + '\n- ' + pick(topic.w) + ': ' + natural(topic.w, 1) + '\n- ' + pick(topic.w) + ': ' + natural(topic.w, 1);
        }
        if (wantWeb) {
          aMeta.search_result_groups = [{ type: 'search_result_group', entries: [{ url: 'https://example.com/' + pick(topic.w) }] }];
          if (chance(0.7)) aMeta.content_references = [{ type: 'webpage', url: 'https://example.com/' + pick(topic.w) }];
        }
        addNode({ author: { role: 'assistant' }, create_time: aTime, content: { content_type: 'text', parts: [answer] }, metadata: aMeta });

        t = aTime + rint(20, 900);
      }

      cid++;
      return {
        id: cidStr,
        conversation_id: cidStr,
        title: topic.t,
        create_time: t0,
        update_time: t,
        current_node: prevId,
        voice: isVoice,
        mapping,
      };
    }

    for (let d = 0; d < 392; d++) {
      // Urlaubslücke (sorgt für "Längste Pause")
      if (d >= 250 && d < 271) continue;
      const dayStart = startDay + d * DAY;
      const dow = new Date(dayStart * 1000).getDay(); // 0 So .. 6 Sa
      const weekend = dow === 0 || dow === 6;
      let p = weekend ? 0.42 : 0.8;
      p *= 0.5 + 0.55 * (d / 392); // Nutzung steigt mit der Zeit
      if (!chance(Math.min(0.96, p))) continue;
      const n = rint(1, weekend ? 3 : 5);
      for (let k = 0; k < n; k++) {
        const t0 = dayStart + hourOfDay() * 3600 + rint(0, 3400);
        convs.push(makeConversation(t0));
      }
    }

    // ein paar zusätzliche geteilte Dateien für eine reichere Datei-Statistik
    for (let i = 0; i < 18; i++) addAsset(pick(DOC_NAMES));
    for (let i = 0; i < 10; i++) addAsset('clip_' + i + '.' + AUDIO_EXT[i % AUDIO_EXT.length]);

    return convs;
  }

  function buildDemoAssets() { return DEMO_ASSETS; }

  window.buildDemoExport = buildDemoExport;
  window.buildDemoAssets = buildDemoAssets;
})();
