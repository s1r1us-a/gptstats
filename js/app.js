/* ═══════════════════════════════════════════════════════════
   app.js — Orchestrierung: Dateien laden, Sektionen rendern,
   Animationen, Theme-Umschalter.
   ═══════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const nf = new Intl.NumberFormat("de-DE");
  const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

  /* ── Format-Helfer ────────────────────────────────────── */

  const fmtInt = (n) => nf.format(Math.round(n));
  const fmt1 = (n) => nf1.format(n);
  const fmtPct = (n) => nf1.format(n) + " %";

  function fmtBytes(b) {
    if (b >= 1e9) return nf1.format(b / 1e9) + " GB";
    if (b >= 1e6) return nf1.format(b / 1e6) + " MB";
    if (b >= 1e3) return nf1.format(b / 1e3) + " KB";
    return fmtInt(b) + " B";
  }

  const nf2 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

  function fmtWater(ml) {
    if (ml >= 1e6) return nf1.format(ml / 1e6) + " m³";
    if (ml >= 1000) return nf1.format(ml / 1000) + " L";
    return fmtInt(ml) + " ml";
  }

  function fmtEnergy(wh) {
    if (wh >= 1000) return nf1.format(wh / 1000) + " kWh";
    return nf1.format(wh) + " Wh";
  }

  function fmtCo2(g) {
    if (g >= 1000) return nf1.format(g / 1000) + " kg";
    return nf1.format(g) + " g";
  }

  // Vergleichszahl möglichst gut lesbar: große Werte ganzzahlig,
  // kleine mit ein bis zwei Nachkommastellen.
  function fmtCompare(n) {
    if (n >= 10) return fmtInt(n);
    if (n >= 1) return nf1.format(n);
    return nf2.format(n);
  }

  const nf3 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  function fmtFoodAmount(n) {
    if (!n) return "0";
    if (n >= 10) return fmtInt(n);
    if (n >= 1) return nf1.format(n);
    if (n >= 0.01) return nf2.format(n);
    if (n >= 0.001) return nf3.format(n);
    return "< 0,001";
  }

  const impactFootprint = (I) => "Benchmark: Wasser " + fmtWater(I.waterMl) + " · CO₂-Szenario " + fmtCo2(I.co2g);
  const withFootprint = (I, s) => s + " · " + impactFootprint(I);

  function fmtDur(sec) {
    sec = Math.round(sec);
    if (sec >= 3600) return Math.floor(sec / 3600) + " h " + Math.round((sec % 3600) / 60) + " min";
    if (sec >= 60) return Math.floor(sec / 60) + " min " + (sec % 60) + " s";
    return sec + " s";
  }

  const fmtClock = (mins) => {
    const rounded = ((Math.round(mins) % 1440) + 1440) % 1440;
    return String(Math.floor(rounded / 60)).padStart(2, "0") + ":" +
      String(rounded % 60).padStart(2, "0");
  };

  function fmtDate(ts) {
    return new Date(ts * 1000).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  }

  function fmtDateTime(ts) {
    return new Date(ts * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  // "YYYY-MM" → "Mai 26"
  function fmtMonthKey(key) {
    return new Date(key + "-15T12:00:00").toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
  }

  function fmtDateKey(key, long) {
    if (!key) return "—";
    const d = new Date(key + "T12:00:00");
    return long
      ? d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" })
      : d.getDate() + "." + (d.getMonth() + 1) + ".";
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const gespraeche = (n) => n === 1 ? "Gespräch" : "Gespräche";

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* ── Count-Up-Animation ───────────────────────────────── */

  const countUps = [];
  const countObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      countObserver.unobserve(e.target);
      const { num, fmt } = countUps[+e.target.dataset.countIdx];
      const dur = 1400, start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        e.target.innerHTML = fmt(num * eased);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.4 });

  function countUpEl(el, num, fmt) {
    el.dataset.countIdx = countUps.length;
    countUps.push({ num, fmt });
    // Endwert sofort setzen — die Animation ist nur Kosmetik und darf
    // bei nicht feuerndem Observer keinen falschen Wert hinterlassen.
    el.innerHTML = fmt(num);
    countObserver.observe(el);
  }

  /* ── Karten-Bausteine ─────────────────────────────────── */

  const ACCENTS = ["blue", "indigo", "purple", "pink", "orange", "green", "teal", "yellow"];

  /* Stat-Kachel: {num, fmt} animiert oder {val} statisch */
  function statCard(grid, i, opts) {
    const card = document.createElement("div");
    card.className = "stat-card accent-" + (opts.accent || ACCENTS[i % ACCENTS.length]) + (opts.wide ? " wide" : "");
    const val = document.createElement("div");
    val.className = "val";
    if (opts.num !== undefined) countUpEl(val, opts.num, opts.fmt || fmtInt);
    else val.innerHTML = opts.val;
    card.appendChild(val);
    card.insertAdjacentHTML("beforeend", `<div class="lbl">${opts.lbl}</div>`);
    if (opts.sub) card.insertAdjacentHTML("beforeend", `<div class="sub">${opts.sub}</div>`);
    grid.appendChild(card);
  }

  function fillGrid(gridId, cards) {
    const grid = $(gridId);
    grid.innerHTML = "";
    cards.forEach((c, i) => statCard(grid, i, c));
  }

  /* Chart-Karte mit Titel; gibt Body-Container zurück */
  function chartCard(containerId, title, sub, span2) {
    const card = document.createElement("div");
    card.className = "chart-card" + (span2 ? " span-2" : "");
    card.innerHTML = `<h3>${title}</h3>` + (sub ? `<div class="chart-sub">${sub}</div>` : "");
    const body = document.createElement("div");
    body.className = "chart-body";
    card.appendChild(body);
    $(containerId).appendChild(card);
    return body;
  }

  /* ── Sektionen rendern ────────────────────────────────── */

  function renderAll(S) {
    document.querySelectorAll(".chart-grid").forEach(el => el.innerHTML = "");
    Charts.reset();

    renderHero(S);
    renderActivity(S);
    renderModels(S);
    renderReasoning(S);
    renderConversations(S);
    renderMedia(S);
    renderWeb(S);
    renderTexts(S);
    renderImpact(S);
  }

  function renderHero(S) {
    const o = S.overview;
    $("heroHeadline").textContent = fmtInt(o.convCount) + " " + gespraeche(o.convCount) + ".";
    $("heroSub").textContent =
      `${fmtDate(o.firstT)} – ${fmtDate(o.lastT)} · aktiv an ${o.activeDays} von ${o.spanDays} Tagen`;

    const hn = $("heroNumbers");
    hn.innerHTML = "";
    [
      { num: o.msgCount, lbl: "Nachrichten" },
      { num: o.totalWords, lbl: "Wörter gewechselt" },
      { num: o.estTokens, lbl: "≈ sichtbare Text-Tokens" },
      { num: o.avgMsgsPerActiveDay, lbl: "Eigene Nachrichten pro Tag", fmt: fmt1 },
    ].forEach((h) => {
      const div = document.createElement("div");
      div.className = "hero-num";
      const val = document.createElement("div");
      val.className = "val";
      countUpEl(val, h.num, h.fmt || fmtInt);
      div.appendChild(val);
      div.insertAdjacentHTML("beforeend", `<div class="lbl">${h.lbl}</div>`);
      hn.appendChild(div);
    });

    const snippet = (s, n) => {
      const clean = (s || "").replace(/\s+/g, " ").trim();
      return clean.length > n ? clean.slice(0, n - 1).trimEnd() + "…" : (clean || "(ohne Text)");
    };
    const msgTime = (m) => new Date(m.t * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

    const cards = [
      { num: o.userCount, lbl: "Deine Nachrichten" },
      { num: o.aiCount, lbl: "KI-Antworten" },
      { num: o.userWords, lbl: "Deine Wörter" },
      { num: o.aiWords, lbl: "KI-Wörter", sub: `das ${fmt1(o.aiWords / Math.max(1, o.userWords))}-fache deiner Wörter` },
      { num: o.avgConvsPerActiveDay, fmt: fmt1, lbl: "Neue Gespräche pro Tag" },
      { num: o.avgMsgsPerConv, fmt: fmt1, lbl: "Ø Nachrichten pro Gespräch" },
      { num: o.reasoningEntries, lbl: "Denkprozesse", sub: "sichtbare Gedankengänge der KI" },
      { num: o.spanDays, lbl: "Tage Zeitraum", sub: `davon ${o.activeDays} aktiv (${fmtPct(o.activeDays / o.spanDays * 100)})` },
    ];
    const q = S.quality;
    cards.push({ num: q.assistantModelCoveragePct, fmt: fmtPct, lbl: "Modell-Abdeckung", sub: `${fmtInt(q.assistantWithoutModel)} KI-Antworten ohne Modell`, accent: "indigo" });
    if (q.hiddenMessagesExcluded) cards.push({ num: q.hiddenMessagesExcluded, lbl: "Versteckte Nachrichten ausgeschlossen", accent: "green" });
    if (q.skippedAlternativeMessages) cards.push({ num: q.skippedAlternativeMessages, lbl: "Alternative Zweige verworfen", accent: "orange" });
    if (q.repairedTimestamps || q.missingTimestamps) cards.push({
      val: `${fmtInt(q.repairedTimestamps)} / ${fmtInt(q.missingTimestamps)}`,
      lbl: "Zeitstempel repariert / fehlend", accent: "yellow",
    });
    if (o.firstMsg) cards.push({
      val: fmtDate(o.firstMsg.t), lbl: "Deine allererste Nachricht",
      sub: `„${esc(snippet(o.firstMsg.text, 130))}“ — um ${msgTime(o.firstMsg)} Uhr`,
      accent: "green", wide: true,
    });
    if (o.lastMsg) cards.push({
      val: fmtDate(o.lastMsg.t), lbl: "Deine letzte Nachricht",
      sub: `„${esc(snippet(o.lastMsg.text, 130))}“ — um ${msgTime(o.lastMsg)} Uhr`,
      accent: "pink", wide: true,
    });
    fillGrid("grid-uebersicht", cards);
  }

  function renderActivity(S) {
    const a = S.activity;
    fillGrid("grid-aktivitaet", [
      { val: fmtDateKey(a.busiestDay.date, true), lbl: "Aktivster Tag", sub: fmtInt(a.busiestDay.msgs) + " eigene Nachrichten", accent: "orange" },
      { num: a.longestStreak, fmt: (n) => fmtInt(n) + '<span class="unit">Tage</span>', lbl: "Längste Serie", sub: "tägliche Nutzung am Stück", accent: "pink" },
      { val: a.peakWeekday + ", " + a.peakHour + "–" + (a.peakHour + 1) + " Uhr", lbl: "Deine Prime-Time", accent: "purple" },
      { num: a.nightPct, fmt: fmtPct, lbl: "Nachteulen-Quote", sub: "deine Nachrichten zwischen 0 und 6 Uhr", accent: "indigo" },
      { num: a.weekendPct, fmt: fmtPct, lbl: "Wochenend-Anteil", accent: "teal" },
      { val: fmtClock(a.avgFirstMins), lbl: "Ø erste Nachricht", sub: "Tagesstart mit ChatGPT", accent: "green" },
      { val: fmtClock(a.avgLastMins), lbl: "Ø letzte Nachricht", sub: "so endet dein ChatGPT-Tag", accent: "blue" },
      { num: a.curStreak, fmt: (n) => fmtInt(n) + '<span class="unit">Tage</span>', lbl: "Serie am Ende des Exports", accent: "yellow" },
      { num: a.recordHour.count, fmt: (n) => fmtInt(n) + '<span class="unit">Nachr.</span>', lbl: "Rekord-Stunde",
        sub: a.recordHour.date ? `am ${fmtDateKey(a.recordHour.date, true)}, ${a.recordHour.hour}–${a.recordHour.hour + 1} Uhr` : "", accent: "pink" },
      { num: a.recordConvsDay.count, lbl: "Meiste neue Gespräche an einem Tag",
        sub: a.recordConvsDay.date ? "am " + fmtDateKey(a.recordConvsDay.date, true) : "", accent: "blue" },
    ]);

    const c = "charts-aktivitaet";
    Charts.area(chartCard(c, "Verlauf", "deine Nachrichten & neue Gespräche pro Tag", true), {
      labels: a.perDay.map(d => fmtDateKey(d.date)),
      tipLabel: (i) => fmtDateKey(a.perDay[i].date, true),
      series: [
        { name: "Deine Nachrichten", color: Charts.PALETTE[0], values: a.perDay.map(d => d.msgs) },
        { name: "Neue Gespräche", color: Charts.PALETTE[2], values: a.perDay.map(d => d.convs) },
      ],
      aria: `Liniendiagramm: Nachrichten und neue Gespräche pro Tag, Spitzenwert ${fmtInt(a.busiestDay.msgs)} Nachrichten am ${fmtDateKey(a.busiestDay.date, true)}`,
    });
    Charts.bars(chartCard(c, "Wochentage", "deine Nachrichten je Wochentag"), {
      labels: a.weekdayLabels, values: a.perWeekday, color: Charts.PALETTE[1], height: 210,
      aria: `Balkendiagramm: Nachrichten je Wochentag, am meisten am ${a.peakWeekday}`,
    });
    Charts.bars(chartCard(c, "Uhrzeiten", "deine Nachrichten je Stunde"), {
      labels: [...Array(24).keys()].map(String), values: a.perHour, color: Charts.PALETTE[4], height: 210,
      tipLabel: (i) => i + "–" + (i + 1) + " Uhr",
      aria: `Balkendiagramm: Nachrichten je Stunde, am meisten zwischen ${a.peakHour} und ${a.peakHour + 1} Uhr`,
    });
    Charts.heatmap(chartCard(c, "Aktivitäts-Heatmap", "Wochentag × Uhrzeit — wann du am meisten schreibst", true), {
      heat: a.heat, rowLabels: a.weekdayLabels,
      aria: `Heatmap Wochentag mal Uhrzeit: aktivste Zeit ${a.peakWeekday} zwischen ${a.peakHour} und ${a.peakHour + 1} Uhr`,
    });
    Charts.calendar(chartCard(c, "Kalender", "jeder Tag ein Kästchen — je grüner, desto mehr Nachrichten", true), {
      perDay: a.perDay,
      aria: `Aktivitätskalender: aktiv an ${fmtInt(S.overview.activeDays)} von ${fmtInt(S.overview.spanDays)} Tagen, aktivster Tag ${fmtDateKey(a.busiestDay.date, true)} mit ${fmtInt(a.busiestDay.msgs)} Nachrichten`,
    });
  }

  function renderModels(S) {
    const m = S.models;
    fillGrid("grid-modelle", [
      { num: m.distinctCount, lbl: "Verschiedene Modelle", accent: "blue" },
      { num: m.thinkingPct, fmt: fmtPct, lbl: "Thinking-Anteil", sub: "Antworten von Reasoning-Modellen", accent: "purple" },
      { val: m.dist[0] ? esc(m.dist[0].label) : "—", lbl: "Meistgenutztes Modell", sub: m.dist[0] ? fmtInt(m.dist[0].count) + " Antworten" : "", accent: "pink" },
      { num: m.autoStartPct, fmt: fmtPct, lbl: "Start im Auto-Modus", sub: "du lässt ChatGPT das Modell wählen", accent: "teal" },
      { num: m.coveragePct, fmt: fmtPct, lbl: "Modell-Abdeckung", sub: fmtInt(m.unknownCount) + " Antworten unbekannt", accent: "indigo" },
    ]);

    const c = "charts-modelle";
    Charts.donut(chartCard(c, "Modell-Verteilung", "welches Modell deine Antworten geschrieben hat"), {
      items: m.dist.map(d => ({ label: d.label, value: d.count })),
      centerLabel: "Antworten",
      aria: "Ringdiagramm: Verteilung der KI-Antworten nach Modell" + (m.dist[0] ? `, am häufigsten ${m.dist[0].label}` : ""),
    });
    Charts.hbars(chartCard(c, "Gewähltes Modell beim Start", "die Einstellung, mit der deine Gespräche begonnen haben"), {
      items: m.defaultDist.map(d => ({ label: d.label, value: d.count })),
      palette: true,
      aria: "Ranking: gewähltes Modell beim Gesprächsstart",
    });
    Charts.stackedBars(chartCard(c, "Modellnutzung über Zeit", "KI-Antworten pro Tag, gestapelt nach Modell", true), {
      labels: m.perDaySeries.data.map(d => fmtDateKey(d.date)),
      tipLabel: (i) => fmtDateKey(m.perDaySeries.data[i].date, true),
      seriesLabels: m.perDaySeries.labels,
      data: m.perDaySeries.data,
      colors: Charts.PALETTE,
      aria: "Gestapeltes Balkendiagramm: KI-Antworten pro Tag nach Modell (" + m.perDaySeries.labels.join(", ") + ")",
    });
  }

  function renderReasoning(S) {
    const r = S.reasoning;
    fillGrid("grid-reasoning", [
      { num: r.recapCount, lbl: "Antworten mit Nachdenken", sub: fmtPct(r.sharePct) + " aller KI-Antworten", accent: "purple" },
      { val: fmtDur(r.totalThinkSec), lbl: "Gesamte Denkzeit", sub: "so lange hat die KI zusammengerechnet über deine Fragen nachgedacht", accent: "indigo" },
      { val: fmtDur(r.avgThinkSec), lbl: "Ø Denkzeit pro Antwort", sub: "Median: " + fmtDur(r.medianThinkSec), accent: "blue" },
      { val: fmtDur(r.maxThink.sec), lbl: "Längstes Grübeln", sub: "in „" + esc(r.maxThink.title) + "“", accent: "pink" },
      { num: r.thoughtsMsgCount, lbl: "Gedankengänge", sub: "so oft konntest du der KI beim Denken zusehen", accent: "teal" },
      { num: r.thoughtsWords, lbl: "Gedanken-Wörter", sub: "Umfang der mitlesbaren Überlegungen", accent: "orange" },
    ]);

    Charts.bars(chartCard("charts-reasoning", "Verteilung der Denkzeiten", "Wie lange die Modelle nachgedacht haben", true), {
      labels: r.buckets.map(b => b.label),
      values: r.buckets.map(b => b.count),
      colors: [Charts.PALETTE[6], Charts.PALETTE[0], Charts.PALETTE[1], Charts.PALETTE[2], Charts.PALETTE[3], Charts.PALETTE[4]],
      height: 230,
      tipLabel: (i) => "Denkzeit " + r.buckets[i].label,
      aria: `Balkendiagramm: Verteilung der Denkzeiten über ${fmtInt(r.recapCount)} Antworten, Median ${fmtDur(r.medianThinkSec)}`,
    });
  }

  function renderConversations(S) {
    const g = S.conversations;
    const o = S.overview;
    fillGrid("grid-gespraeche", [
      { num: o.avgMsgsPerConv, fmt: fmt1, lbl: "Ø Nachrichten pro Gespräch", sub: "Median: " + fmt1(g.medianMsgs), accent: "blue" },
      { num: g.revisited, lbl: "Wieder aufgegriffen", sub: "Gespräche, die länger als 1 Tag liefen", accent: "green" },
      { val: fmt1(g.longestDur.durationDays) + '<span class="unit">Tage</span>', lbl: "Langläufer", sub: "„" + esc(g.longestDur.title) + "“", accent: "orange" },
      { num: g.oneShot, lbl: "One-Shot-Gespräche", sub: "nur eine einzige Frage", accent: "teal" },
      { num: g.gizmoCount, lbl: "Custom-GPT-Gespräche", accent: "purple" },
      { num: g.voiceConvCount, lbl: "Voice-Gespräche", accent: "pink" },
      { num: g.avgUserWordsPerMsg, fmt: fmt1, lbl: "Ø Wörter pro Prompt", accent: "yellow" },
      { num: g.avgAiWordsPerReply, fmt: fmt1, lbl: "Ø Wörter pro KI-Antwort", accent: "indigo" },
    ]);

    const c = "charts-gespraeche";
    const top = chartCard(c, "Top 10 Gespräche", "nach Anzahl Nachrichten", true);
    const list = document.createElement("div");
    list.className = "toplist";
    g.topByMsgs.forEach((conv, i) => {
      const row = document.createElement("div");
      row.className = "toplist-row";
      row.style.cursor = "pointer";
      row.title = "Im Chat-Reader öffnen";
      row.innerHTML =
        `<span class="tl-rank">${i + 1}</span>` +
        `<span class="tl-title">${esc(conv.title)}</span>` +
        `<span class="tl-meta">${fmtInt(conv.msgs)} Nachrichten · ${fmtInt(conv.words)} Wörter</span>`;
      row.addEventListener("click", () => {
        showView("reader");
        openConversation(conv.id);
      });
      list.appendChild(row);
    });
    top.appendChild(list);

    Charts.wordcloud(chartCard(c, "Themen-Wolke", "häufigste Wörter deiner Gesprächstitel — Klick öffnet die Suche im Chat-Reader", true), {
      words: g.titleWords,
      aria: "Wortwolke: häufigste Wörter deiner Gesprächstitel",
      onClick: (word) => {
        $("convSearch").value = word;
        showView("reader");
        renderConvList();
        reader.listStale = false;
      },
    });
  }

  function renderMedia(S) {
    const m = S.media;
    const cards = [
      { num: m.imgUser.count, lbl: "Bilder hochgeladen", sub: fmtBytes(m.imgUser.bytes), accent: "blue" },
      { num: m.userVoiceTurns, lbl: "Deine Voice-Beiträge", sub: `${fmtInt(m.spokenWordsUser)} gesprochene Wörter`, accent: "pink" },
      { num: m.aiVoiceTurns, lbl: "KI-Voice-Antworten", sub: `${fmtInt(m.spokenWordsAi)} Wörter als Audio`, accent: "purple" },
      { num: m.attCount, lbl: "Datei-Anhänge", sub: fmtBytes(m.attBytes) + " gesamt", accent: "orange" },
      { val: esc(m.largestAtt.name.length > 22 ? m.largestAtt.name.slice(0, 20) + "…" : m.largestAtt.name), lbl: "Größter Anhang", sub: fmtBytes(m.largestAtt.size), accent: "teal" },
      { num: m.codeBlocksTotal, lbl: "Code-Blöcke", sub: `in ${fmtInt(m.codeMsgs)} Antworten · ${fmtInt(m.convsWithCode)} Gesprächen`, accent: "green" },
    ];
    if (m.imgAi.count) cards.splice(1, 0, { num: m.imgAi.count, lbl: "Bilder von der KI", sub: fmtBytes(m.imgAi.bytes), accent: "indigo" });
    if (m.assetLib) {
      if (m.assetLib.genImages) cards.push({
        num: m.assetLib.genImages, lbl: "KI-Bilder gespeichert",
        sub: "laut Dateinamen im Export", accent: "purple",
      });
      cards.push({
        num: m.assetLib.total, lbl: "Dateien im Export-ZIP",
        sub: "aus conversation_asset_file_names.json", accent: "yellow",
      });
    }
    const lib = m.library;
    if (lib) {
      cards.push({
        num: lib.total, lbl: "Dateien in deiner Bibliothek",
        sub: fmtBytes(lib.totalBytes) + " · aus library_files.json", accent: "indigo",
      });
      if (lib.artifacts) cards.push({
        num: lib.artifacts, lbl: "Davon KI-erstellte Dateien",
        sub: "als Artefakt gespeichert · " + fmtInt(lib.uploads) + " eigene Uploads", accent: "purple",
      });
      cards.push({
        val: esc(lib.largest.name.length > 22 ? lib.largest.name.slice(0, 20) + "…" : lib.largest.name),
        lbl: "Größte Bibliotheks-Datei", sub: fmtBytes(lib.largest.sizeBytes), accent: "pink",
      });
    }
    if (m.manifest) cards.push({
      val: fmtBytes(m.manifest.totalBytes), lbl: "Export-Größe gesamt",
      sub: `${fmtInt(m.manifest.totalFiles)} Dateien im ZIP · davon ${fmtInt(m.manifest.mediaFiles)} Medien (${fmtBytes(m.manifest.mediaBytes)})`,
      accent: "yellow", wide: true,
    });
    fillGrid("grid-medien", cards);

    const c = "charts-medien";
    if (m.attTypes.length) {
      Charts.donut(chartCard(c, "Anhang-Typen", "Dateiformate deiner Uploads"), {
        items: m.attTypes.map(t => ({ label: t.key, value: t.value })),
        centerLabel: "Dateien",
        aria: "Ringdiagramm: Dateiformate deiner Anhänge",
      });
    }
    if (m.voices.length) {
      Charts.hbars(chartCard(c, "ChatGPT-Stimmen",
        "Live-Voice-Gespräche je Stimme — Diktat im Textchat speichert der Export als normalen Text, es ist nicht als Audio erkennbar"), {
        items: m.voices.map(v => ({ label: cap(v.key), value: v.value })),
        palette: true,
        aria: "Ranking: genutzte ChatGPT-Stimmen in Voice-Gesprächen",
      });
    }
    if (lib && lib.types.length) {
      Charts.donut(chartCard(c, "Bibliothek nach Dateityp", "echte MIME-Typen aus library_files.json"), {
        items: lib.types.map(t => ({ label: t.key, value: t.value })),
        centerLabel: "Dateien",
        aria: "Ringdiagramm: Bibliotheks-Dateien nach Typ" +
          (lib.types[0] ? `, am häufigsten ${lib.types[0].key}` : ""),
      });
    } else if (m.assetLib) {
      // Fallback ohne library_files.json: Kategorien aus den Dateinamen raten
      Charts.donut(chartCard(c, "Deine Datei-Bibliothek", "Original-Dateinamen aus dem Export-ZIP, nach Typ"), {
        items: m.assetLib.categories.map(t => ({ label: t.key, value: t.value })),
        centerLabel: "Dateien",
        aria: "Ringdiagramm: Dateien im Export nach Typ" +
          (m.assetLib.categories[0] ? `, am häufigsten ${m.assetLib.categories[0].key}` : ""),
      });
    }
    if (lib && lib.perMonth.length > 1) {
      Charts.bars(chartCard(c, "Bibliothek über Zeit", "gespeicherte Dateien pro Monat", true), {
        labels: lib.perMonth.map(e => fmtMonthKey(e.key)),
        values: lib.perMonth.map(e => e.count),
        color: Charts.PALETTE[3], height: 210, unit: "Dateien",
        tipLabel: (i) => fmtMonthKey(lib.perMonth[i].key) + " · " + fmtBytes(lib.perMonth[i].bytes),
        aria: "Balkendiagramm: in der Bibliothek gespeicherte Dateien pro Monat",
      });
    }
  }

  function renderWeb(S) {
    const w = S.web;
    fillGrid("grid-websuche", [
      { num: w.answersWithSearch, lbl: "Antworten mit Websuche", sub: fmtPct(w.searchSharePct) + " aller KI-Antworten", accent: "blue" },
      { num: w.searchOperations, lbl: "Einzelne Suchschritte", sub: "mehrere pro Antwort möglich", accent: "teal" },
      { num: w.totalCitations, lbl: "Zitierte Quellen", accent: "indigo" },
      { num: w.uniqueDomains, lbl: "Verschiedene Domains", accent: "purple" },
      { val: w.topDomains[0] ? esc(w.topDomains[0].key) : "—", lbl: "Top-Quelle", sub: w.topDomains[0] ? fmtInt(w.topDomains[0].value) + " Zitate" : "", accent: "pink" },
    ]);

    const c = "charts-websuche";
    Charts.hbars(chartCard(c, "Top-Domains", "die am häufigsten zitierten Quellen", true), {
      items: w.topDomains.map(d => ({ label: d.key, value: d.value })),
      color: Charts.PALETTE[0],
      aria: "Ranking: am häufigsten zitierte Quellen-Domains" + (w.topDomains[0] ? `, Spitzenreiter ${w.topDomains[0].key}` : ""),
    });

    const REF_LABELS = {
      grouped_webpages: "Webseiten (gruppiert)", sources_footnote: "Quellen-Fußnoten",
      entity: "Entitäten", file: "Datei-Verweise", url: "Direkte URLs",
      image_group: "Bildgruppen", webpage_extended: "Webseiten (erweitert)",
      hidden: "Versteckte Verweise", alt_text: "Alt-Texte", product_entity: "Produkte",
      products: "Produktlisten", client_defined_widget: "Widgets", map: "Karten",
      nav_list: "Navigationslisten", explore_more: "Mehr entdecken",
      followup_a: "Follow-up-Vorschläge", image_v2: "Bilder", dil: "Inline-Definitionen",
    };
    Charts.hbars(chartCard(c, "Verweis-Typen", "womit die KI ihre Antworten anreichert", true), {
      items: w.refTypes.map(r => ({ label: REF_LABELS[r.key] || r.key, value: r.value })),
      palette: true,
      aria: "Ranking: Verweis-Typen in KI-Antworten",
    });
  }

  function renderTexts(S) {
    const t = S.texts;
    fillGrid("grid-texte", [
      { num: t.medianPromptWords, lbl: "Median Prompt-Länge", sub: "Wörter pro Frage", accent: "blue" },
      { num: t.longestUser.words, lbl: "Längster Prompt", sub: "in „" + esc(t.longestUser.title) + "“", accent: "purple" },
      { num: t.longestAi.words, lbl: "Längste KI-Antwort", sub: "in „" + esc(t.longestAi.title) + "“", accent: "pink" },
      { num: t.questionPct, fmt: fmtPct, lbl: "Fragen-Quote", sub: "deiner Nachrichten enthalten ein „?“", accent: "orange" },
      { num: t.thanksCount, lbl: "Mal „Danke“ gesagt", accent: "green" },
      { num: t.pleaseCount, lbl: "Mal „Bitte“ geschrieben", accent: "teal" },
    ]);

    Charts.hbars(chartCard("charts-texte", "Deine Top-Wörter", "häufigste Wörter in deinen Prompts (ohne Füllwörter)", true), {
      items: t.topWords.map(w => ({ label: w.key, value: w.value })),
      color: Charts.PALETTE[2],
      aria: "Ranking: häufigste Wörter in deinen Prompts" + (t.topWords[0] ? `, Platz 1: ${t.topWords[0].key}` : ""),
    });

    renderFunFacts(S);
  }

  function renderFunFacts(S) {
    const o = S.overview, a = S.activity, r = S.reasoning, t = S.texts, m = S.media, f = S.fun;
    const readingHours = o.aiWords / 220 / 60;
    const nightTime = f.latestNight.t
      ? new Date(f.latestNight.t * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : null;

    const facts = [
      { e: "📚", h: `Die KI hat dir <strong>≈ ${fmtInt(o.aiWords / 300)} Buchseiten</strong> geschrieben — das ist ${fmt1(o.aiWords / 76944)}× „Harry Potter und der Stein der Weisen“.` },
      { e: "🍿", h: `Alles zu lesen dauert <strong>≈ ${fmt1(readingHours)} Stunden</strong> — so lange wie ${fmt1(readingHours / 2)} Kinofilme.` },
      { e: "⌨️", h: `Du hast <strong>≈ ${fmt1(o.userWords / 40 / 60)} Stunden</strong> getippt (bei 40 Wörtern/Minute).` },
      { e: "🧠", h: `Die Modelle haben insgesamt <strong>${fmtDur(r.totalThinkSec)}</strong> über deine Fragen nachgedacht.` },
      { e: "🔥", h: `Deine längste Serie: <strong>${fmtInt(a.longestStreak)} Tage</strong> ChatGPT am Stück.` },
      { e: "🌙", h: `<strong>${fmtPct(a.nightPct)}</strong> deiner Nachrichten entstanden zwischen 0 und 6 Uhr.` },
    ];
    // Nur zeigen, wenn aussagekräftig: der Export stempelt KI-Antworten oft
    // fast zeitgleich zur Frage — ein Median von 1–2 s wäre irreführend.
    if (f.medianReplyLatency >= 5) facts.splice(4, 0, {
      e: "⚡", h: `Die KI antwortet dir im Median nach <strong>${fmtDur(f.medianReplyLatency)}</strong>.`,
    });
    if (f.longestSession.msgs > 1) facts.push({
      e: "🚀", h: `Deine längste Session: <strong>${fmtInt(f.longestSession.msgs)} Nachrichten in ${fmtDur(f.longestSession.durationSec)}</strong> am ${fmtDate(f.longestSession.t)}.`,
    });
    if (nightTime) facts.push({
      e: "🌃", h: `Deine nächtlichste Nachricht: <strong>${nightTime} Uhr</strong> am ${fmtDate(f.latestNight.t)}.`,
    });
    facts.push(f.longestBreak.days > 0
      ? { e: "🏝️", h: `Deine längste ChatGPT-Pause: <strong>${fmtInt(f.longestBreak.days)} Tag${f.longestBreak.days === 1 ? "" : "e"}</strong> (ab ${fmtDateKey(f.longestBreak.from, true)}).` }
      : { e: "🏝️", h: `Zwischen erstem und letztem aktiven Tag gab es <strong>keinen einzigen Tag Pause</strong>.` });
    if (f.busiestWeek) facts.push({
      e: "📅", h: `<strong>${esc(f.busiestWeek.key)}</strong> war deine aktivste Woche — ${fmtInt(f.busiestWeek.value)} Nachrichten.`,
    });
    if (f.emojiCount) facts.push({
      e: "😀", h: f.emojiCount === 1
        ? `Du hast genau <strong>1 Emoji</strong> getippt: ${f.topEmoji.key} — Understatement pur.`
        : `Du hast <strong>${fmtInt(f.emojiCount)} Emojis</strong> getippt — am liebsten ${f.topEmoji.key} (${fmtInt(f.topEmoji.value)}×).`,
    });
    if (m.spokenWordsUser || m.spokenWordsAi) facts.push({
      e: "🎙️", h: `Im Voice-Modus hast du <strong>${fmtInt(m.spokenWordsUser)} Wörter</strong> gesprochen — die KI antwortete mit ${fmtInt(m.spokenWordsAi)}.`,
    });
    if (t.thanksCount) facts.push({
      e: "🙏", h: `Du hast dich <strong>${fmtInt(t.thanksCount)}-mal</strong> bedankt. Die KI merkt sich das bestimmt.`,
    });

    const ff = $("funfacts");
    ff.innerHTML = facts.map(x =>
      `<div class="funfact"><span class="ff-emoji">${x.e}</span><span class="ff-text">${x.h}</span></div>`
    ).join("");
  }

  function renderImpact(S) {
    const I = S.impact;

    const resourceCards = [
      { num: I.waterMl, fmt: fmtWater, lbl: "ChatGPT-Ø-Wasserbenchmark", sub: "Antworten × 0,000085 gal · keine Messung dieses Exports", accent: "teal" },
      { val: fmtWater(I.waterMlLow) + "–" + fmtWater(I.waterMlHigh), lbl: "Standort-Wasserszenario", sub: "1,8–12 L/kWh · kein Mittelwert", accent: "blue" },
      { num: I.energyWh, fmt: fmtEnergy, lbl: "Energie-Benchmark-Szenario", sub: "Antworten × 0,34 Wh + separate Bild-Benchmarks", accent: "green" },
      { num: I.co2g, fmt: fmtCo2, lbl: "CO₂ beim globalen Strommix 2024", sub: "wenn mit 445 g CO₂/kWh betrieben · DE 2025: " + fmtCo2(I.co2gGermany), accent: "blue" },
      { num: I.co2gLifecycle, fmt: fmtCo2, lbl: "Externer Mistral-LCA-Benchmark", sub: "sichtbare Antwort-Tokens × 2,85 g/1.000 · nicht ChatGPT", accent: "purple" },
      { num: I.visibleTextTokens, fmt: fmtInt, lbl: "≈ sichtbare Text-Tokens", sub: "Zeichen ÷ 4 · System, Tools, Kontext und Reasoning unbekannt", accent: "indigo" },
    ];
    if (I.imageGenWh > 0) resourceCards.push(
      { num: I.imageGenWh, fmt: fmtEnergy, lbl: "SDXL-Bild-Benchmark", sub: fmtPct(I.imageGenPct) + " des kombinierten Szenarios · nicht DALL·E/GPT Image", accent: "orange" }
    );
    fillGrid("grid-oeko", resourceCards);

    fillGrid("grid-oeko-vergleiche", [
      { num: I.streamingHours, fmt: fmt1, lbl: "Std. Video-Streaming", sub: withFootprint(I, "IEA: ca. 0,077 kWh/h für Gerät, Netz & Rechenzentren"), accent: "pink" },
      { num: I.ledHours, fmt: fmt1, lbl: "Std. LED-Lampe (10 W)", sub: withFootprint(I, "mit dieser Energie"), accent: "yellow" },
      { num: I.phoneCharges, fmt: fmtCompare, lbl: "Handy-Ladungen", sub: withFootprint(I, "grob 12 Wh pro Ladung"), accent: "green" },
      { num: I.avgQueryEquiv, fmt: fmtCompare, lbl: "Ø ChatGPT-Queries", sub: withFootprint(I, "Energie-Äquivalent nach 0,34 Wh/Query"), accent: "purple" },
      { num: I.geminiQueryEquiv, fmt: fmtCompare, lbl: "Median-Gemini-Prompts", sub: withFootprint(I, "Google 2025: 0,24 Wh je Prompt"), accent: "indigo" },
      { num: I.evKm, fmt: fmt1, lbl: "km im E-Auto", sub: withFootprint(I, "mit dieser Energie"), accent: "teal" },
    ]);

    fillGrid("grid-oeko-wasser", [
      { num: I.showerMinutes, fmt: fmtCompare, lbl: "Dusch-Minuten", sub: withFootprint(I, "EPA: Standarddusche ≈ 9,5 L/min"), accent: "teal" },
      { num: I.toiletFlushes, fmt: fmtCompare, lbl: "Toilettenspülungen", sub: withFootprint(I, "EPA WaterSense: ≈ 4,85 L/Spülung"), accent: "blue" },
    ]);

    fillGrid("grid-oeko-mobilitaet", [
      { num: I.carKm, fmt: fmtCompare, lbl: "Pkw-km", sub: withFootprint(I, "UBA 2024: 164 g CO₂e/Pkm"), accent: "blue" },
      { num: I.trainKm, fmt: fmtCompare, lbl: "Bahn-km Fernverkehr", sub: withFootprint(I, "UBA 2024: 26 g CO₂e/Pkm"), accent: "green" },
      { num: I.flightKm, fmt: fmtCompare, lbl: "Inlandsflug-km", sub: withFootprint(I, "UBA 2024: 290 g CO₂e/Pkm"), accent: "purple" },
      { num: I.pedelecKm, fmt: fmtCompare, lbl: "Pedelec-km", sub: withFootprint(I, "UBA 2024: 3 g CO₂e/Pkm"), accent: "yellow" },
      { num: I.treeDays, fmt: fmtCompare, lbl: "Buchen-Tage", sub: withFootprint(I, "so lange bindet eine Buche das CO₂ (≈ 12,5 kg/Jahr)"), accent: "teal" },
    ]);

    fillGrid("grid-oeko-food", [
      { val: fmtFoodAmount(I.steaks) + " Steaks", lbl: "Rindersteak-Wasser", sub: withFootprint(I, "1 Steak (200 g) ≈ 3.080 L Wasser"), accent: "orange" },
      { val: fmtFoodAmount(I.avocados) + " Avocados", lbl: "Avocado-Wasser", sub: withFootprint(I, "1 Avocado ≈ 320 L Wasser"), accent: "green" },
      { val: fmtFoodAmount(I.coffeeCups) + " Tassen", lbl: "Kaffee-Wasser & CO₂", sub: withFootprint(I, "Äquiv.: Wasser " + fmtFoodAmount(I.coffeeCupsWater) + " · CO₂ " + fmtFoodAmount(I.coffeeCupsCo2) + " Tassen"), accent: "yellow" },
    ]);

    Charts.hbars(
      chartCard("charts-oeko", "Benchmark-Energie nach Modell", "Antwortzahl × 0,34 Wh; Bilder separat als SDXL-Benchmark", true),
      {
        items: I.energyByModel.map(m => ({ label: m.label, value: m.wh })),
        palette: true,
        valueFmt: fmtEnergy,
        aria: "Ranking: Energie-Benchmark-Szenario je Modell" + (I.energyByModel[0] ? `, Platz 1: ${I.energyByModel[0].label}` : ""),
      }
    );
  }

  /* ── Chat-Reader ──────────────────────────────────────── */

  let MODEL = null;
  let FULL_STATS = null; // Stats über den gesamten Export (für Wrapped-Monatsvergleiche)
  const reader = { sort: "date", selected: null, listStale: true, convModels: new Map() };

  /* Modell-Filter mit den im Export gefundenen Modellen befüllen */
  function populateModelFilter(dist) {
    const sel = $("convModelFilter");
    sel.innerHTML = '<option value="">Alle Modelle</option>';
    for (const d of dist) {
      const opt = document.createElement("option");
      opt.value = d.slug;
      opt.textContent = d.label;
      sel.appendChild(opt);
    }
  }

  function showView(view) {
    const stats = view === "stats";
    $("dashboard").hidden = !stats;
    $("reader").hidden = stats;
    $("navLinks").hidden = !stats;
    $("viewStatsBtn").classList.toggle("active", stats);
    $("viewReaderBtn").classList.toggle("active", !stats);
    if (!stats && reader.listStale) { renderConvList(); reader.listStale = false; }
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  const visCount = (c) => c.msgs.reduce((n, m) => n + (m.isVisible ? 1 : 0), 0);

  function renderConvList() {
    if (!MODEL) return;
    const q = $("convSearch").value.trim().toLowerCase();
    const modelFilter = $("convModelFilter").value;
    let list = MODEL.conversations;
    if (modelFilter) {
      list = list.filter(c => {
        const set = reader.convModels.get(c.id);
        return set && set.has(modelFilter);
      });
    }
    if (q) {
      list = list.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.msgs.some(m => m.text && m.text.toLowerCase().includes(q)));
    }
    const total = MODEL.conversations.length;
    $("convCount").textContent = (q || modelFilter)
      ? `${fmtInt(list.length)} von ${fmtInt(total)} Gesprächen`
      : `${fmtInt(total)} ${gespraeche(total)}`;
    list = [...list];
    if (reader.sort === "date") list.sort((a, b) => (b.updateTime || b.createTime || 0) - (a.updateTime || a.createTime || 0));
    else if (reader.sort === "len") list.sort((a, b) => visCount(b) - visCount(a));
    else list.sort((a, b) => a.title.localeCompare(b.title, "de"));

    const el = $("convList");
    el.innerHTML = "";
    for (const c of list) {
      const item = document.createElement("div");
      item.className = "c-item" + (reader.selected === c.id ? " active" : "");
      item.dataset.id = c.id;
      item.innerHTML =
        `<div class="c-title">${c.voice ? "🎙️ " : ""}${esc(c.title)}</div>` +
        `<div class="c-meta"><span>${c.createTime ? fmtDate(c.createTime) : ""}</span><span>${fmtInt(visCount(c))} Nachrichten</span></div>`;
      item.addEventListener("click", () => openConversation(c.id));
      el.appendChild(item);
    }
    if (!list.length) el.innerHTML = '<div class="r-empty"><p>Keine Treffer.</p></div>';
  }

  function openConversation(id) {
    const c = MODEL.conversations.find(x => x.id === id);
    if (!c) return;
    reader.selected = id;
    document.querySelectorAll(".c-item").forEach(i => i.classList.toggle("active", i.dataset.id === id));
    $("convTitle").textContent = c.title;
    renderMessages(c);
    const item = [...document.querySelectorAll(".c-item")].find(i => i.dataset.id === id);
    if (item) item.scrollIntoView({ block: "nearest" });
  }

  function renderMessages(c) {
    const showThink = $("showThinking").checked;
    let html = "";
    for (const m of c.msgs) {
      if (m.ct === "thoughts") {
        if (showThink && m.thoughtsText) {
          html += msgHtml("thinking", "Gedanken", m, Markdown.render(m.thoughtsText), []);
        }
        continue;
      }
      if (m.ct === "reasoning_recap") {
        if (showThink && m.recapText) html += `<div class="r-recap">🧠 ${esc(m.recapText)}</div>`;
        continue;
      }
      if (!m.isVisible) continue;

      const chips = [];
      for (const a of m.attachments) chips.push("📎 " + esc(a.name));
      if (m.images.length) chips.push("🖼️ " + (m.images.length === 1 ? "1 Bild" : m.images.length + " Bilder"));
      if (m.audioCount) chips.push("🎙️ Sprachnachricht");
      if (!m.text.trim() && !chips.length) continue;

      const who = m.role === "user" ? "Du" : "ChatGPT";
      html += msgHtml(m.role, who, m, Markdown.render(m.text), chips);
    }
    const body = $("convBody");
    body.innerHTML = html || '<div class="r-empty"><p>Dieses Gespräch enthält keine lesbaren Nachrichten.</p></div>';
    highlightSearch(body);
    body.scrollTop = 0;
  }

  /* Aktive Suchtreffer in den Bubbles markieren (nur Textknoten,
     daher kein Risiko, das gerenderte HTML zu beschädigen) */
  function highlightSearch(container) {
    const q = $("convSearch").value.trim();
    if (q.length < 2) return;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const qLower = q.toLowerCase();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      // kein re.test() hier: /g-Flag + test() verschiebt lastIndex
      acceptNode: (n) => n.nodeValue.toLowerCase().includes(qLower)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      let last = 0;
      node.nodeValue.replace(re, (match, idx) => {
        frag.appendChild(document.createTextNode(node.nodeValue.slice(last, idx)));
        const mark = document.createElement("mark");
        mark.textContent = match;
        frag.appendChild(mark);
        last = idx + match.length;
      });
      frag.appendChild(document.createTextNode(node.nodeValue.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  }

  function msgHtml(cls, who, m, rendered, chips) {
    const badge = cls === "assistant" && m.model
      ? `<span class="m-model">${esc(Stats.prettyModel(m.model))}</span>` : "";
    const time = m.t ? `<span class="m-time">${fmtDateTime(m.t)}</span>` : "";
    const chipHtml = chips.length
      ? `<div class="m-chips">${chips.map(c => `<span class="m-chip">${c}</span>`).join("")}</div>` : "";
    return `<div class="msg ${cls}"><div class="m-who">${who} ${badge} ${time}</div>` +
           `<div class="bubble">${rendered}${chipHtml}</div></div>`;
  }

  function initReader() {
    $("viewStatsBtn").addEventListener("click", () => showView("stats"));
    $("viewReaderBtn").addEventListener("click", () => showView("reader"));
    let searchTimer;
    $("convSearch").addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        renderConvList();
        if (reader.selected) openConversation(reader.selected);
      }, 200);
    });
    $("convModelFilter").addEventListener("change", renderConvList);
    document.querySelectorAll("#convSort button").forEach(b => b.addEventListener("click", () => {
      document.querySelectorAll("#convSort button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      reader.sort = b.dataset.sort;
      renderConvList();
    }));
    $("showThinking").addEventListener("change", () => {
      if (reader.selected) openConversation(reader.selected);
    });
  }

  /* ── Scroll-Reveal ────────────────────────────────────── */

  function setupReveal() {
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); }
      }
    }, { threshold: 0.08 });
    document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
  }

  /* ── Theme ────────────────────────────────────────────── */

  function initTheme() {
    // Standard: Light — Dark nur, wenn der Nutzer es per Toggle gewählt hat
    const saved = localStorage.getItem("cgs-theme");
    document.documentElement.dataset.theme = saved || "light";

    $("themeToggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("cgs-theme", next);
      Charts.rerenderAll();
    });
  }

  /* ── Daten laden ──────────────────────────────────────── */

  const collected = [];         // gesammelte {name, data} Payloads (nur bis zur Auswertung)
  let stagedIds = new Set();    // bereits gesehene Konversations-IDs für Chips & Button

  function addFileChip(name, ok, info) {
    const li = document.createElement("li");
    li.className = ok ? "ok" : "err";
    li.textContent = `${name} — ${info}`;
    $("fileList").appendChild(li);
  }

  async function handleFiles(fileList) {
    $("loadError").hidden = true;
    if (!fileList || !fileList.length) return;

    const { payloads, errors, skipped } = await Parser.readFiles(fileList);
    for (const e of errors) addFileChip(e.name, false, e.error);
    if (skipped) addFileChip(`${skipped} Datei(en)`, false, "keine .json — übersprungen");

    // Billige Vorschau für Chips & Button — die teure Normalisierung
    // (buildModel) läuft erst einmalig beim Auswerten
    const { report, ids } = Parser.preview(payloads, stagedIds);
    for (const rep of report) addFileChip(rep.name, rep.ok, rep.info);
    stagedIds = ids;

    collected.push(...payloads);
    if (stagedIds.size > 0) {
      const btn = $("analyzeBtn");
      btn.hidden = false;
      btn.textContent = `${nf.format(stagedIds.size)} ${gespraeche(stagedIds.size)} auswerten →`;
    } else if (payloads.length) {
      showError("Keine Konversationen gefunden — bitte die conversations-*.json Dateien des ChatGPT-Exports wählen.");
    }
  }

  function showError(msg) {
    const e = $("loadError");
    e.textContent = msg;
    e.hidden = false;
  }

  function analyze() {
    const model = Parser.buildModel(collected);
    if (!model.conversations.length) { showError("Keine Konversationen gefunden."); return; }
    const hasVisibleMessages = model.conversations.some(c => c.msgs.some(m => m.isVisible && m.t));
    if (!hasVisibleMessages) { showError("Keine sichtbaren Nachrichten mit Zeitstempel gefunden."); return; }

    const S = Stats.compute(model);
    MODEL = model;
    FULL_STATS = S;
    reader.listStale = true;
    reader.selected = null;
    reader.convModels = new Map(model.conversations.map(c =>
      [c.id, new Set(c.msgs.filter(m => m.model).map(m => m.model))]));
    populateModelFilter(S.models.dist);

    $("landing").hidden = true;
    $("dashboard").hidden = false;
    $("navLinks").hidden = false;
    $("resetBtn").hidden = false;
    $("wrappedBtn").hidden = false;
    $("viewSwitch").hidden = false;
    window.scrollTo({ top: 0, behavior: "instant" });

    // Nach dem Einblenden ist das Layout synchron verfügbar (clientWidth
    // erzwingt Reflow) — kein rAF, das in Hintergrund-Tabs nie feuert.
    renderAll(S);
    setupReveal();

    // Roh-JSON freigeben: nach der Auswertung nimmt die UI keine Dateien
    // mehr an, das normalisierte MODEL reicht — halbiert den RAM-Bedarf
    collected.length = 0;
    stagedIds = new Set();
  }

  /* Programmatischer Einstieg (z. B. für Tests/Automatisierung):
     window.ChatStats.ingestParsed([{name, data}])
     Hinweis: nach einer erfolgreichen Auswertung startet jeder weitere
     Aufruf frisch — die Roh-Payloads der vorigen Runde sind freigegeben. */
  window.ChatStats = {
    ingestParsed(payloads) {
      collected.push(...payloads);
      analyze();
    },
  };

  /* ── Events ───────────────────────────────────────────── */

  function initDropzone() {
    const dz = $("dropzone");
    const input = $("fileInput");

    dz.addEventListener("click", () => input.click());
    dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
    input.addEventListener("change", () => { handleFiles(input.files); input.value = ""; });

    // Drag & Drop auf der ganzen Seite erlauben
    for (const evt of ["dragover", "dragenter"]) {
      document.addEventListener(evt, (e) => {
        e.preventDefault();
        if (!$("landing").hidden) dz.classList.add("dragover");
      });
    }
    document.addEventListener("dragleave", (e) => {
      if (!e.relatedTarget) dz.classList.remove("dragover");
    });
    document.addEventListener("drop", (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
      if (!$("landing").hidden) handleFiles(e.dataTransfer.files);
    });

    $("analyzeBtn").addEventListener("click", analyze);
    $("resetBtn").addEventListener("click", () => location.reload());
    $("wrappedBtn").addEventListener("click", () => Wrapped.openPicker(MODEL, FULL_STATS));

    // Demo-Modus: synthetischer Export durchläuft die normale Pipeline
    $("demoBtn").addEventListener("click", () => {
      collected.length = 0;
      stagedIds = new Set();
      $("demoBadge").hidden = false;
      window.ChatStats.ingestParsed([
        { name: "demo-daten", data: Demo.generate() },
        { name: "demo-bibliothek", data: Demo.generateLibrary() },
      ]);
    });
  }

  initTheme();
  initDropzone();
  initReader();
})();
