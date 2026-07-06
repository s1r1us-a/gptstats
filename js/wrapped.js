/* ═══════════════════════════════════════════════════════════
   wrapped.js — Dein Jahr/Monat im Rückblick (Spotify-Wrapped-Stil).
   Vollbild-Story mit Slides; filtert das Datenmodell nach Zeitraum
   und rechnet mit Stats.compute auf dem gefilterten Modell.
   ═══════════════════════════════════════════════════════════ */

const Wrapped = (() => {
  "use strict";

  /* ── Lokale Format-Helfer (app.js-Pendants sind IIFE-privat) ── */

  const nf = new Intl.NumberFormat("de-DE");
  const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
  const fmtInt = (n) => nf.format(Math.round(n));
  const fmt1 = (n) => nf1.format(n);
  const fmtPct = (n) => nf1.format(n) + " %";

  function fmtDur(sec) {
    sec = Math.round(sec);
    if (sec >= 3600) return Math.floor(sec / 3600) + " h " + Math.round((sec % 3600) / 60) + " min";
    if (sec >= 60) return Math.floor(sec / 60) + " min " + (sec % 60) + " s";
    return sec + " s";
  }

  const fmtClock = (mins) =>
    String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(Math.round(mins % 60)).padStart(2, "0");

  const fmtDate = (ts) =>
    new Date(ts * 1000).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });

  const fmtDateKey = (key) =>
    new Date(key + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" });

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni",
                  "Juli", "August", "September", "Oktober", "November", "Dezember"];

  /* ── Zeitraum-Logik ───────────────────────────────────── */

  // range = { startT, endT } (endT exklusiv, Unix-Sekunden, lokale Zeit)
  function periodRange(year, month /* 0–11 | null */) {
    const s = month == null ? new Date(year, 0, 1) : new Date(year, month, 1);
    const e = month == null ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1);
    return { startT: s.getTime() / 1000, endT: e.getTime() / 1000 };
  }

  const inRange = (t, r) => t >= r.startT && t < r.endT;

  /* Welche Jahre/Monate haben Daten? → [{year, msgCount, months: Map<0-11, count>}] absteigend */
  function availablePeriods(model) {
    const years = new Map();
    for (const c of model.conversations) {
      for (const m of c.msgs) {
        if (!m.isVisible || !m.t) continue;
        const d = new Date(m.t * 1000);
        const y = d.getFullYear();
        if (!years.has(y)) years.set(y, { year: y, msgCount: 0, months: new Map() });
        const e = years.get(y);
        e.msgCount++;
        e.months.set(d.getMonth(), (e.months.get(d.getMonth()) || 0) + 1);
      }
    }
    return [...years.values()].sort((a, b) => b.year - a.year);
  }

  /* Modell auf Zeitraum filtern — shallow clone, das Original bleibt unberührt
     (der Chat-Reader arbeitet weiter mit dem vollen Modell) */
  function filterModel(model, range) {
    const conversations = [];
    for (const c of model.conversations) {
      const msgs = c.msgs.filter(m => m.t && inRange(m.t, range));
      if (msgs.some(m => m.isVisible)) conversations.push({ ...c, msgs });
    }
    return { conversations, assetNames: model.assetNames, report: [] };
  }

  /* Leichter Zähler für den Vorperioden-Vergleich (kein Voll-compute) */
  function periodTotals(model, range) {
    let msgs = 0;
    const days = new Set();
    for (const c of model.conversations) {
      for (const m of c.msgs) {
        if (!m.isVisible || !m.t || !inRange(m.t, range)) continue;
        msgs++;
        days.add(Stats.dateKey(m.t));
      }
    }
    return { msgs, activeDays: days.size };
  }

  /* ── Count-Up für [data-count]-Zahlen ─────────────────── */

  const FMTS = { int: fmtInt, f1: fmt1, pct: fmtPct, dur: fmtDur };
  const cnt = (v, fmt = "int") =>
    `<span data-count="${v}" data-fmt="${fmt}">${FMTS[fmt](v)}</span>`;

  function animateCounts(root, reduced) {
    root.querySelectorAll("[data-count]").forEach(el => {
      const target = parseFloat(el.dataset.count);
      const fmt = FMTS[el.dataset.fmt] || fmtInt;
      if (reduced || !isFinite(target)) { el.textContent = fmt(target || 0); return; }
      const dur = 1100, start = performance.now();
      const tick = (now) => {
        if (!el.isConnected) return;
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = fmt(target * eased);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ── Slide-Definitionen ───────────────────────────────── */

  const listRow = (emoji, html) =>
    `<div class="wr-row"><span class="wr-row-emoji">${emoji}</span><span>${html}</span></div>`;

  const SLIDES = [
    {
      id: "intro",
      when: () => true,
      html: (ctx) => `
        <p class="wr-kicker">Dein Rückblick</p>
        <h2 class="wr-huge">Dein<br>${esc(ctx.label)}.</h2>
        <p class="wr-text">${fmtInt(ctx.S.overview.msgCount)} Nachrichten warten darauf,
        erzählt zu werden.</p>
        <p class="wr-hint">Tippen, wischen oder Pfeiltasten →</p>`,
    },
    {
      id: "volumen",
      when: () => true,
      html: (ctx) => {
        const o = ctx.S.overview;
        return `
        <p class="wr-kicker">Ganz schön viel los</p>
        <div class="wr-big">${cnt(o.msgCount)}</div>
        <p class="wr-title">Nachrichten</p>
        <p class="wr-text">in ${fmtInt(o.convCount)} Gesprächen — ${fmtInt(ctx.newConvs)} davon hast
        du in diesem Zeitraum neu gestartet. Dabei sind insgesamt
        <strong>${fmtInt(o.totalWords)} Wörter</strong> zusammengekommen.</p>`;
      },
    },
    {
      id: "rhythmus",
      when: () => true,
      html: (ctx) => {
        const a = ctx.S.activity, o = ctx.S.overview;
        const streakLine = a.longestStreak >= 3 ? "" :
          `<p class="wr-text">Insgesamt warst du an ${fmtInt(o.activeDays)} von
           ${fmtInt(ctx.periodDays)} Tagen aktiv.</p>`;
        return `
        <p class="wr-kicker">Dein Rhythmus</p>
        <h2 class="wr-title">${esc(fmtDateKey(a.busiestDay.date))}</h2>
        <p class="wr-text">war dein aktivster Tag — <strong>${fmtInt(a.busiestDay.msgs)}
        Nachrichten</strong> an einem einzigen Tag.</p>
        <p class="wr-text">Deine Prime-Time: <strong>${esc(a.peakWeekday)},
        ${a.peakHour}–${a.peakHour + 1} Uhr</strong>.</p>${streakLine}`;
      },
    },
    {
      id: "streak",
      when: (ctx) => ctx.S.activity.longestStreak >= 3,
      html: (ctx) => `
        <p class="wr-kicker">Nicht aufzuhalten</p>
        <div class="wr-big">🔥 ${cnt(ctx.S.activity.longestStreak)}</div>
        <p class="wr-title">Tage am Stück</p>
        <p class="wr-text">Deine längste Serie: jeden Tag mindestens eine Nachricht —
        ohne einen einzigen Tag Pause.</p>`,
    },
    {
      id: "nachteule",
      when: (ctx) => ctx.S.activity.nightPct >= 10 || ctx.S.activity.avgFirstMins < 540,
      html: (ctx) => {
        const a = ctx.S.activity;
        if (a.nightPct >= 10) return `
          <p class="wr-kicker">Wenn andere schlafen</p>
          <div class="wr-big">🌙 ${cnt(a.nightPct, "pct")}</div>
          <p class="wr-text">deiner Nachrichten entstanden zwischen 0 und 6 Uhr.
          Offiziell bist du damit eine <strong>Nachteule</strong>.</p>`;
        return `
          <p class="wr-kicker">Der frühe Vogel</p>
          <div class="wr-big">☀️ ${fmtClock(a.avgFirstMins)}</div>
          <p class="wr-text">so früh startet dein ChatGPT-Tag im Schnitt.
          Offiziell bist du damit ein <strong>Frühstarter</strong>.</p>`;
      },
    },
    {
      id: "modell",
      when: (ctx) => ctx.S.models.withModel > 0 && ctx.S.models.dist[0],
      html: (ctx) => {
        const m = ctx.S.models;
        const share = m.dist[0].count / m.withModel * 100;
        const think = m.thinkingPct > 0
          ? `<p class="wr-text">${fmtPct(m.thinkingPct)} deiner Antworten kamen von
             Reasoning-Modellen — du magst es gründlich.</p>` : "";
        return `
        <p class="wr-kicker">Dein meistgenutztes Modell</p>
        <h2 class="wr-title wr-grad">${esc(m.dist[0].label)}</h2>
        <p class="wr-text">hat die Hauptarbeit gemacht —
        <strong>${fmtPct(share)}</strong> deiner KI-Antworten kamen von diesem Modell.</p>${think}`;
      },
    },
    {
      id: "denkzeit",
      when: (ctx) => ctx.S.reasoning.recapCount > 0,
      html: (ctx) => {
        const r = ctx.S.reasoning;
        return `
        <p class="wr-kicker">Kurz nachgedacht …</p>
        <div class="wr-big">🧠 ${cnt(r.totalThinkSec, "dur")}</div>
        <p class="wr-text">hat die KI insgesamt über deine Fragen gegrübelt.</p>
        <p class="wr-text">Rekord: <strong>${fmtDur(r.maxThink.sec)}</strong> am Stück
        in „${esc(r.maxThink.title)}“.</p>`;
      },
    },
    {
      id: "woerter",
      when: (ctx) => ctx.S.texts.topWords.length >= 3,
      html: (ctx) => {
        const words = ctx.S.texts.topWords.slice(0, 5);
        const f = ctx.S.fun;
        const emoji = f.topEmoji
          ? `<p class="wr-text">Dein Emoji: ${f.topEmoji.key} — ${fmtInt(f.topEmoji.value)}× getippt.</p>` : "";
        return `
        <p class="wr-kicker">Deine Wörter</p>
        <div class="wr-words">${words.map((w, i) =>
          `<div class="wr-word" style="animation-delay:${i * 140}ms">
             <span class="wr-word-rank">${i + 1}</span>
             <span class="wr-word-key">${esc(w.key)}</span>
             <span class="wr-word-val">${fmtInt(w.value)}×</span>
           </div>`).join("")}</div>${emoji}`;
      },
    },
    {
      id: "marathon",
      when: (ctx) => ctx.S.conversations.topByMsgs[0] && ctx.S.conversations.topByMsgs[0].msgs >= 5,
      html: (ctx) => {
        const top = ctx.S.conversations.topByMsgs[0];
        const s = ctx.S.fun.longestSession;
        const sess = s.msgs > 1 ? `<p class="wr-text">Und am ${fmtDate(s.t)} hast du
          <strong>${fmtInt(s.msgs)} Nachrichten in ${fmtDur(s.durationSec)}</strong>
          rausgehauen — deine intensivste Session.</p>` : "";
        return `
        <p class="wr-kicker">Der Marathon</p>
        <div class="wr-big">${cnt(top.msgs)}</div>
        <p class="wr-title">Nachrichten in einem Gespräch</p>
        <p class="wr-text">„${esc(top.title)}“ war dein längstes Gespräch —
        ${fmtInt(top.words)} Wörter.</p>${sess}`;
      },
    },
    {
      id: "medien",
      when: (ctx) => {
        const m = ctx.S.media;
        return m.imgUser.count > 0 || m.spokenWordsUser > 0 || m.codeBlocksTotal > 0 || m.attCount > 0;
      },
      html: (ctx) => {
        const m = ctx.S.media;
        const rows = [];
        if (m.imgUser.count) rows.push(listRow("🖼️", `<strong>${fmtInt(m.imgUser.count)} Bilder</strong> hochgeladen`));
        if (m.spokenWordsUser) rows.push(listRow("🎙️", `<strong>${fmtInt(m.spokenWordsUser)} Wörter</strong> gesprochen — die KI antwortete mit ${fmtInt(m.spokenWordsAi)}`));
        if (m.codeBlocksTotal) rows.push(listRow("💻", `<strong>${fmtInt(m.codeBlocksTotal)} Code-Blöcke</strong> erhalten`));
        if (m.attCount) rows.push(listRow("📎", `<strong>${fmtInt(m.attCount)} Dateien</strong> angehängt`));
        return `
        <p class="wr-kicker">Mehr als nur Text</p>
        <div class="wr-list">${rows.slice(0, 3).join("")}</div>`;
      },
    },
    {
      id: "vergleich",
      when: () => true,
      html: (ctx) => {
        const o = ctx.S.overview;
        const readingHours = o.aiWords / 220 / 60;
        return `
        <p class="wr-kicker">Zum Einordnen</p>
        <div class="wr-list">
          ${listRow("📚", `Die KI schrieb dir <strong>≈ ${fmtInt(o.aiWords / 300)} Buchseiten</strong>`)}
          ${listRow("🍿", `Alles zu lesen dauert <strong>≈ ${fmt1(readingHours)} Stunden</strong> — wie ${fmt1(readingHours / 2)} Kinofilme`)}
          ${listRow("⌨️", `Du hast <strong>≈ ${fmt1(o.userWords / 40 / 60)} Stunden</strong> getippt (bei 40 Wörtern/Minute)`)}
        </div>`;
      },
    },
    {
      id: "vorperiode",
      when: (ctx) => ctx.prev && ctx.prev.msgs > 0,
      html: (ctx) => {
        const cur = ctx.S.overview.msgCount, prev = ctx.prev.msgs;
        const pct = (cur - prev) / prev * 100;
        const up = pct >= 0;
        return `
        <p class="wr-kicker">Im Vergleich</p>
        <div class="wr-big">${up ? "📈 +" : "📉 −"}${cnt(Math.abs(pct), "pct")}</div>
        <p class="wr-text">${up ? "mehr" : "weniger"} Nachrichten als
        ${esc(ctx.prev.label)} (${fmtInt(prev)} → ${fmtInt(cur)}).</p>`;
      },
    },
    {
      id: "outro",
      when: () => true,
      html: (ctx) => {
        const o = ctx.S.overview;
        return `
        <p class="wr-kicker">Das war’s</p>
        <h2 class="wr-huge">Dein<br>${esc(ctx.label)}.</h2>
        <div class="wr-recap">
          <div><b>${fmtInt(o.msgCount)}</b><span>Nachrichten</span></div>
          <div><b>${fmtInt(o.convCount)}</b><span>Gespräche</span></div>
          <div><b>${fmtInt(o.totalWords)}</b><span>Wörter</span></div>
          <div><b>${fmtInt(o.activeDays)}</b><span>aktive Tage</span></div>
        </div>
        <button class="wr-outro-btn" id="wrOutroClose">Rückblick schließen</button>`;
      },
    },
  ];

  /* ── Overlay-Engine ───────────────────────────────────── */

  const state = { overlay: null, slides: [], i: 0, ctx: null, lastFocus: null, suppressClick: false };

  const reducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function open(model, { year, month = null }) {
    const range = periodRange(year, month);
    const filtered = filterModel(model, range);
    if (!filtered.conversations.length) return; // Guard: compute crasht auf leerem Modell

    const S = Stats.compute(filtered);
    const label = month == null ? String(year) : MONTHS[month] + " " + year;

    // Vorperiode (Vorjahr bzw. Vormonat) für den Vergleichs-Slide
    let prev = null;
    if (month == null) {
      prev = { ...periodTotals(model, periodRange(year - 1, null)), label: "" + (year - 1) };
    } else {
      const py = month === 0 ? year - 1 : year;
      const pm = month === 0 ? 11 : month - 1;
      prev = { ...periodTotals(model, periodRange(py, pm)), label: "im " + MONTHS[pm] + " " + py };
    }

    const now = Date.now() / 1000;
    const periodDays = Math.max(1, Math.round((Math.min(range.endT, now) - range.startT) / 86400));

    const newConvs = model.conversations
      .filter(c => c.createTime && inRange(c.createTime, range)).length;

    state.ctx = { S, label, year, month, prev, newConvs, periodDays, reduced: reducedMotion() };
    state.slides = SLIDES.filter(s => s.when(state.ctx));
    state.i = 0;
    state.lastFocus = document.activeElement;

    buildOverlay(label);
    document.documentElement.classList.add("wr-lock");
    renderSlide();
    state.overlay.focus();
  }

  function buildOverlay(label) {
    const ov = document.createElement("div");
    ov.className = "wrapped-overlay";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Wrapped " + label);
    ov.tabIndex = -1;
    ov.innerHTML =
      `<div class="wr-progress" aria-hidden="true">` +
        state.slides.map(() => `<span class="wr-seg"><i class="wr-seg-fill"></i></span>`).join("") +
      `</div>` +
      `<button class="wr-close" aria-label="Wrapped schließen">✕</button>` +
      `<div class="wr-stage"></div>` +
      `<div class="wr-tapzones">` +
        `<button class="wr-zone wr-zone-prev" aria-label="Vorherige Folie"></button>` +
        `<button class="wr-zone wr-zone-next" aria-label="Nächste Folie"></button>` +
      `</div>` +
      `<p class="visually-hidden" aria-live="polite" id="wrSlideStatus"></p>`;
    document.body.appendChild(ov);
    state.overlay = ov;

    ov.querySelector(".wr-close").addEventListener("click", close);
    ov.querySelector(".wr-zone-prev").addEventListener("click", () => { if (!state.suppressClick) prev(); });
    ov.querySelector(".wr-zone-next").addEventListener("click", () => { if (!state.suppressClick) next(); });

    // Swipe: links/rechts blättern, nach unten schließen
    let touchStart = null;
    ov.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    ov.addEventListener("touchend", (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
        swallowNextClick();
        if (dx < 0) next(); else prev();
      } else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) {
        swallowNextClick();
        close();
      }
    }, { passive: true });

    document.addEventListener("keydown", onKeydown);
  }

  /* Nach einem Swipe darf der zugehörige Click nicht zusätzlich blättern */
  function swallowNextClick() {
    state.suppressClick = true;
    setTimeout(() => { state.suppressClick = false; }, 400);
  }

  function onKeydown(e) {
    if (!state.overlay) return;
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowRight") { next(); return; }
    if (e.key === "ArrowLeft") { prev(); return; }
    // Enter/Space nur abfangen, wenn kein Button fokussiert ist
    // (sonst würde der Button-Click doppelt blättern)
    if ((e.key === " " || e.key === "Enter") && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      next();
      return;
    }
    if (e.key === "Tab") {
      // Mini-Fokus-Falle über die Buttons des Overlays
      const focusable = [...state.overlay.querySelectorAll("button")];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function renderSlide() {
    const slide = state.slides[state.i];
    const stage = state.overlay.querySelector(".wr-stage");
    stage.innerHTML =
      `<div class="wr-slide wr-g${state.i % 6}"><div class="wr-slide-inner">${slide.html(state.ctx)}</div></div>`;

    const outroBtn = stage.querySelector("#wrOutroClose");
    if (outroBtn) outroBtn.addEventListener("click", close);

    // Progress-Segmente: erledigt / aktiv
    state.overlay.querySelectorAll(".wr-seg").forEach((seg, idx) => {
      seg.classList.toggle("done", idx < state.i);
      seg.classList.toggle("active", idx === state.i);
    });

    animateCounts(stage, state.ctx.reduced);

    const el = stage.querySelector(".wr-slide");
    if (state.ctx.reduced) el.classList.add("in");
    else requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));

    const kicker = stage.querySelector(".wr-kicker");
    state.overlay.querySelector("#wrSlideStatus").textContent =
      `Folie ${state.i + 1} von ${state.slides.length}` + (kicker ? `: ${kicker.textContent}` : "");
  }

  function next() {
    if (state.i >= state.slides.length - 1) { close(); return; }
    state.i++;
    renderSlide();
  }

  function prev() {
    if (state.i === 0) return;
    state.i--;
    renderSlide();
  }

  function close() {
    if (!state.overlay) return;
    document.removeEventListener("keydown", onKeydown);
    state.overlay.remove();
    state.overlay = null;
    document.documentElement.classList.remove("wr-lock");
    if (state.lastFocus && state.lastFocus.isConnected) state.lastFocus.focus();
  }

  /* ── Zeitraum-Picker ──────────────────────────────────── */

  function openPicker(model) {
    if (!model) return;
    const periods = availablePeriods(model);
    if (!periods.length) return;

    const lastFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "wr-picker-backdrop";

    const yearsHtml = periods.map(p => {
      const months = [...p.months.entries()].sort((a, b) => a[0] - b[0]);
      return `<div class="wr-year">
        <button class="wr-year-btn" data-year="${p.year}">
          <span class="wr-year-num">${p.year}</span>
          <span class="wr-year-sub">${fmtInt(p.msgCount)} Nachrichten · ganzes Jahr ansehen</span>
        </button>
        <div class="wr-months">${months.map(([mo]) =>
          `<button class="wr-month-chip" data-year="${p.year}" data-month="${mo}">${MONTHS[mo]}</button>`
        ).join("")}</div>
      </div>`;
    }).join("");

    backdrop.innerHTML =
      `<div class="wr-picker glass" role="dialog" aria-modal="true" aria-label="Wrapped-Zeitraum wählen">
        <button class="wr-picker-close" aria-label="Schließen">✕</button>
        <h2 class="wr-picker-title">✨ Dein Rückblick</h2>
        <p class="wr-picker-sub">Wähle ein Jahr oder einen Monat — dein persönliches Wrapped.</p>
        <div class="wr-years">${yearsHtml}</div>
      </div>`;
    document.body.appendChild(backdrop);

    const closePicker = () => {
      document.removeEventListener("keydown", onEsc);
      backdrop.remove();
      if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    };
    const onEsc = (e) => { if (e.key === "Escape") closePicker(); };
    document.addEventListener("keydown", onEsc);

    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closePicker(); });
    backdrop.querySelector(".wr-picker-close").addEventListener("click", closePicker);
    backdrop.querySelectorAll(".wr-year-btn, .wr-month-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const year = +btn.dataset.year;
        const month = btn.dataset.month === undefined ? null : +btn.dataset.month;
        closePicker();
        open(model, { year, month });
      });
    });

    backdrop.querySelector(".wr-year-btn").focus();
  }

  return { openPicker, open, availablePeriods };
})();
