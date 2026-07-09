/* ═══════════════════════════════════════════════════════════
   stats.js — Alle Kennzahlen aus dem normalisierten Datenmodell.
   Reine Berechnung, keine DOM-Zugriffe.
   ═══════════════════════════════════════════════════════════ */

const Stats = (() => {
  "use strict";

  /* ── Stoppwörter (DE + EN) für Top-Wörter & Wortwolke ── */
  const STOPWORDS = new Set((
    "der die das und oder aber ich du er sie es wir ihr nicht ein eine einen einem einer eines " +
    "ist sind war waren sein seine seinem seinen seiner bin bist habe hast hat hatte hatten haben " +
    "mit für von auf aus bei nach über unter vor zwischen durch gegen ohne um an in im am zum zur " +
    "den dem des was wer wie wo wann warum wieso weshalb welche welcher welches dass daß wenn dann " +
    "noch nur auch schon so sehr mehr kann kannst können könnte könnten muss musst müssen soll " +
    "sollte sollten will willst wollen wollte würde würden wird werden werde mal mir mich dir dich " +
    "ihm ihn ihnen uns euch man ja nein doch hier da dort jetzt heute morgen gestern immer nie oft " +
    "gibt geht gehen machen macht gemacht mache gut beste besten mein meine meinen meinem meiner " +
    "dein deine deinen deinem deiner sich ob als aber alle allem allen aller alles andere anderen " +
    "etwas nichts viel viele vielen wieder dazu dabei damit dafür davon darauf darüber deshalb " +
    "denn weil bis seit beim vom ins ans aufs zwei drei etc usw bzw ca zb sowie bzw. z.b. " +
    "the a an and or but if then else for of to in on at by with from as is are was were be been " +
    "being have has had do does did will would can could should shall may might must i you he she " +
    "it we they me him her us them my your his its our their this that these those there here what " +
    "which who whom when where why how not no yes all any some none one two also just than too " +
    "very s t don dont im ive about into over under again further once because while during before " +
    "after above below between out off up down more most other such own same each few both new " +
    "use using get got make made like need want really thing things"
  ).split(/\s+/));

  const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  function dateKey(t) {
    const d = new Date(t * 1000);
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function dateKeyNoonMs(key) {
    return new Date(key + "T12:00:00").getTime();
  }

  function calendarSpanDays(firstT, lastT) {
    if (firstT === null || lastT === null) return 0;
    const first = dateKeyNoonMs(dateKey(firstT));
    const last = dateKeyNoonMs(dateKey(lastT));
    return Math.max(1, Math.round((last - first) / 86400e3) + 1);
  }

  function isoWeekLabel(t) {
    const d = new Date(t * 1000);
    const th = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    th.setDate(th.getDate() + 3 - ((d.getDay() + 6) % 7));
    const isoYear = th.getFullYear();
    const jan4 = new Date(isoYear, 0, 4);
    const week1Thu = new Date(jan4);
    week1Thu.setDate(jan4.getDate() + 3 - ((jan4.getDay() + 6) % 7));
    const week = 1 + Math.round((th - week1Thu) / 7 / 86400e3);
    return "KW " + week + "/" + isoYear;
  }

  // JS getDay(): 0 = So → Mo-basierter Index (0 = Mo)
  const mondayIdx = (t) => (new Date(t * 1000).getDay() + 6) % 7;

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // Math.min(...arr) sprengt bei sehr großen Exporten den Call-Stack
  function arrMin(arr) { let m = Infinity; for (const v of arr) if (v < m) m = v; return m; }
  function arrMax(arr) { let m = -Infinity; for (const v of arr) if (v > m) m = v; return m; }

  function topEntries(map, n) {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([key, value]) => ({ key, value }));
  }

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  /* Modell-Slug → hübscher Name (gpt-5-5-thinking → GPT-5.5 Thinking) */
  function prettyModel(slug) {
    if (!slug) return "Unbekannt";
    if (slug === "auto") return "Auto";
    let s = slug.replace(/^gpt-(\d+)-(\d+)/, "GPT-$1.$2");
    s = s.replace(/-thinking/, " Thinking").replace(/-instant/, " Instant")
         .replace(/-mini/, " Mini").replace(/-auto/, " Auto").replace(/-nano/, " Nano");
    if (/^o\d/.test(s)) s = "OpenAI " + s;
    return s;
  }

  const isThinkingModel = (slug) =>
    !!slug && (/thinking/.test(slug) || /^o\d/.test(slug));

  function countTopWords(texts, n, extraStop) {
    const freq = new Map();
    for (const text of texts) {
      const words = text.toLowerCase().match(/[a-zA-Zäöüß][a-zA-Zäöüß\-]{2,}/g);
      if (!words) continue;
      for (const w of words) {
        if (STOPWORDS.has(w) || (extraStop && extraStop.has(w))) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
    return topEntries(freq, n);
  }

  /* Original-Dateinamen aus conversation_asset_file_names.json kategorisieren.
     Die Namen verraten Dinge, die sonst nirgends im Export stehen —
     z. B. gespeicherte KI-generierte Bilder ("ChatGPT Image …"). */
  function classifyAssets(assetNames) {
    const names = assetNames ? Object.values(assetNames) : [];
    if (!names.length) return null;
    const cats = new Map();
    let genImages = 0;
    const add = (label) => cats.set(label, (cats.get(label) || 0) + 1);
    for (const n of names) {
      if (/^[0-9a-f-]{36}\/audio\//i.test(n)) add("Voice-Aufnahmen");
      else if (/^ChatGPT Image/.test(n)) { genImages++; add("KI-generierte Bilder"); }
      else if (/screenshot|bildschirm/i.test(n)) add("Screenshots");
      else if (/\.(pdf|docx?|pptx?|xlsx?|md|txt|csv)$/i.test(n)) add("Dokumente");
      else if (/\.(jpe?g|png|webp|gif|svg|heic)$/i.test(n)) add("Fotos & Bilder");
      else add("Sonstiges");
    }
    return { total: names.length, genImages, categories: topEntries(cats, 8) };
  }

  /* ═════════════ Hauptberechnung ═════════════ */
  function compute(model) {
    const convs = model.conversations;
    const all = [];
    for (const c of convs) for (const m of c.msgs) all.push({ m, c });

    const visible = all.filter(x => x.m.isVisible && x.m.t);
    const userMsgs = visible.filter(x => x.m.role === "user");
    const aiMsgs = visible.filter(x => x.m.role === "assistant");

    /* ── Überblick ─────────────────────────────────────── */
    const userWords = userMsgs.reduce((s, x) => s + x.m.words, 0);
    const aiWords = aiMsgs.reduce((s, x) => s + x.m.words, 0);
    const totalChars = visible.reduce((s, x) => s + x.m.chars, 0);

    const times = visible.map(x => x.m.t);
    const firstT = times.length ? arrMin(times) : null;
    const lastT = times.length ? arrMax(times) : null;

    // Allererste & allerletzte eigene Nachricht (inkl. Voice-Transkripte)
    let firstUser = null, lastUser = null;
    for (const x of userMsgs) {
      if (!firstUser || x.m.t < firstUser.m.t) firstUser = x;
      if (!lastUser || x.m.t > lastUser.m.t) lastUser = x;
    }
    const msgInfo = (x) => x ? { t: x.m.t, text: x.m.text, title: x.c.title } : null;

    const activeDaySet = new Set(visible.map(x => dateKey(x.m.t)));
    const spanDays = calendarSpanDays(firstT, lastT);

    const overview = {
      convCount: convs.length,
      msgCount: visible.length,
      userCount: userMsgs.length,
      aiCount: aiMsgs.length,
      userWords, aiWords,
      totalWords: userWords + aiWords,
      estTokens: Math.round(totalChars / 4),
      firstT, lastT, spanDays,
      activeDays: activeDaySet.size,
      avgMsgsPerActiveDay: visible.length / Math.max(1, activeDaySet.size),
      avgConvsPerActiveDay: convs.length / Math.max(1, activeDaySet.size),
      avgMsgsPerConv: visible.length / Math.max(1, convs.length),
      reasoningEntries: all.filter(x => x.m.ct === "thoughts").length,
      firstMsg: msgInfo(firstUser),
      lastMsg: msgInfo(lastUser),
    };

    /* ── Aktivität ─────────────────────────────────────── */
    const perDayMap = new Map();      // dateKey → {msgs, convs}
    for (const x of visible) {
      const k = dateKey(x.m.t);
      if (!perDayMap.has(k)) perDayMap.set(k, { msgs: 0, convs: 0 });
      perDayMap.get(k).msgs++;
    }
    for (const c of convs) {
      if (!c.createTime) continue;
      const k = dateKey(c.createTime);
      if (!perDayMap.has(k)) perDayMap.set(k, { msgs: 0, convs: 0 });
      perDayMap.get(k).convs++;
    }
    // Lückenlose Tagesreihe von first bis last
    const perDay = [];
    if (firstT !== null && lastT !== null) {
      for (let d = new Date(firstT * 1000); ; d.setDate(d.getDate() + 1)) {
        const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
                  String(d.getDate()).padStart(2, "0");
        const e = perDayMap.get(k) || { msgs: 0, convs: 0 };
        perDay.push({ date: k, msgs: e.msgs, convs: e.convs });
        if (k === dateKey(lastT)) break;
        if (perDay.length > 5000) break; // Sicherheitsnetz
      }
    }

    const perHour = new Array(24).fill(0);
    const perWeekday = new Array(7).fill(0);
    const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const hourMap = new Map();   // "dateKey|hour" → Nachrichten in dieser Stunde
    for (const x of visible) {
      const d = new Date(x.m.t * 1000);
      perHour[d.getHours()]++;
      const wd = mondayIdx(x.m.t);
      perWeekday[wd]++;
      heat[wd][d.getHours()]++;
      const hk = dateKey(x.m.t) + "|" + d.getHours();
      hourMap.set(hk, (hourMap.get(hk) || 0) + 1);
    }

    // Rekord-Stunde: die meisten Nachrichten innerhalb einer Uhr-Stunde
    let recordHour = { date: null, hour: 0, count: 0 };
    for (const [k, v] of hourMap) {
      if (v > recordHour.count) {
        const sep = k.lastIndexOf("|");
        recordHour = { date: k.slice(0, sep), hour: +k.slice(sep + 1), count: v };
      }
    }
    // Rekord-Tag für neu gestartete Gespräche
    let recordConvsDay = { date: null, count: 0 };
    for (const [k, e] of perDayMap) {
      if (e.convs > recordConvsDay.count) recordConvsDay = { date: k, count: e.convs };
    }

    let busiestDay = perDay[0] || { date: null, msgs: 0, convs: 0 };
    for (const d of perDay) if (d.msgs > busiestDay.msgs) busiestDay = d;

    // Streaks über aktive Tage
    const sortedDays = [...activeDaySet].sort();
    let longestStreak = 0, curStreak = 0, streakEnd = null, run = 0, prev = null;
    for (const k of sortedDays) {
      const t = new Date(k + "T12:00:00").getTime();
      run = (prev !== null && t - prev === 86400e3) ? run + 1 : 1;
      if (run > longestStreak) { longestStreak = run; streakEnd = k; }
      prev = t;
    }
    // Streak bis zum letzten aktiven Tag
    {
      let r = 1;
      for (let i = sortedDays.length - 1; i > 0; i--) {
        const a = new Date(sortedDays[i] + "T12:00:00").getTime();
        const b = new Date(sortedDays[i - 1] + "T12:00:00").getTime();
        if (a - b === 86400e3) r++; else break;
      }
      curStreak = sortedDays.length ? r : 0;
    }

    const nightMsgs = visible.filter(x => new Date(x.m.t * 1000).getHours() < 6).length;
    const weekendMsgs = visible.filter(x => mondayIdx(x.m.t) >= 5).length;

    // Ø erste/letzte Nachricht des Tages (Uhrzeit in Minuten)
    const firstOfDay = new Map(), lastOfDay = new Map();
    for (const x of visible) {
      const k = dateKey(x.m.t);
      const d = new Date(x.m.t * 1000);
      const mins = d.getHours() * 60 + d.getMinutes();
      if (!firstOfDay.has(k) || mins < firstOfDay.get(k)) firstOfDay.set(k, mins);
      if (!lastOfDay.has(k) || mins > lastOfDay.get(k)) lastOfDay.set(k, mins);
    }
    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);
    const avgFirstMins = avg([...firstOfDay.values()]);
    const avgLastMins = avg([...lastOfDay.values()]);

    const activity = {
      perDay, perHour, perWeekday, heat,
      weekdayLabels: WEEKDAYS,
      busiestDay, longestStreak, streakEnd, curStreak,
      recordHour, recordConvsDay,
      nightPct: nightMsgs / Math.max(1, visible.length) * 100,
      weekendPct: weekendMsgs / Math.max(1, visible.length) * 100,
      avgFirstMins, avgLastMins,
      peakHour: perHour.indexOf(arrMax(perHour)),
      peakWeekday: WEEKDAYS[perWeekday.indexOf(arrMax(perWeekday))],
    };

    /* ── Modelle ───────────────────────────────────────── */
    const modelMap = new Map();
    let thinkingMsgs = 0;
    for (const x of aiMsgs) {
      if (!x.m.model) continue;
      modelMap.set(x.m.model, (modelMap.get(x.m.model) || 0) + 1);
      if (isThinkingModel(x.m.model)) thinkingMsgs++;
    }
    const modelDist = topEntries(modelMap, 12)
      .map(e => ({ slug: e.key, label: prettyModel(e.key), count: e.value }));

    const defaultMap = new Map();
    for (const c of convs) {
      const k = c.defaultModel || "unbekannt";
      defaultMap.set(k, (defaultMap.get(k) || 0) + 1);
    }
    const defaultDist = topEntries(defaultMap, 8)
      .map(e => ({ slug: e.key, label: prettyModel(e.key), count: e.value }));

    // Modell-Familien pro Tag (Top 3 + Andere) für gestapelte Balken
    const topSlugs = modelDist.slice(0, 3).map(d => d.slug);
    const famPerDay = new Map(); // dateKey → [n0, n1, n2, other]
    for (const x of aiMsgs) {
      if (!x.m.model) continue;
      const k = dateKey(x.m.t);
      if (!famPerDay.has(k)) famPerDay.set(k, new Array(topSlugs.length + 1).fill(0));
      const idx = topSlugs.indexOf(x.m.model);
      famPerDay.get(k)[idx >= 0 ? idx : topSlugs.length]++;
    }
    const modelPerDay = perDay.map(d => ({
      date: d.date,
      values: famPerDay.get(d.date) || new Array(topSlugs.length + 1).fill(0),
    }));

    const models = {
      dist: modelDist,
      withModel: aiMsgs.filter(x => x.m.model).length,
      thinkingPct: thinkingMsgs / Math.max(1, aiMsgs.filter(x => x.m.model).length) * 100,
      defaultDist,
      perDaySeries: { labels: [...topSlugs.map(prettyModel), "Andere"], data: modelPerDay },
      distinctCount: modelMap.size,
      autoStartPct: convs.filter(c => c.defaultModel === "auto").length / Math.max(1, convs.length) * 100,
    };

    /* ── Reasoning ─────────────────────────────────────── */
    const recaps = all.filter(x => x.m.recap);
    const recapSecs = recaps.map(x => x.m.recap.sec);
    const totalThinkSec = recapSecs.reduce((s, v) => s + v, 0);
    let maxThink = { sec: 0, title: "—" };
    for (const x of recaps) {
      if (x.m.recap.sec > maxThink.sec) maxThink = { sec: x.m.recap.sec, title: x.c.title };
    }
    const buckets = [
      { label: "≤ 2s", min: 0, max: 2 }, { label: "3–5s", min: 3, max: 5 },
      { label: "6–10s", min: 6, max: 10 }, { label: "11–30s", min: 11, max: 30 },
      { label: "31–60s", min: 31, max: 60 }, { label: "> 60s", min: 61, max: Infinity },
    ].map(b => ({ ...b, count: recapSecs.filter(s => s >= b.min && s <= b.max).length }));

    const thoughtsMsgs = all.filter(x => x.m.ct === "thoughts");

    const reasoning = {
      recapCount: recaps.length,
      totalThinkSec,
      avgThinkSec: totalThinkSec / Math.max(1, recaps.length),
      medianThinkSec: median(recapSecs),
      maxThink,
      buckets,
      thoughtsMsgCount: thoughtsMsgs.length,
      thoughtsWords: thoughtsMsgs.reduce((s, x) => s + x.m.thoughtsWords, 0),
      sharePct: recaps.length / Math.max(1, aiMsgs.length) * 100,
    };

    /* ── Gespräche ─────────────────────────────────────── */
    const convStats = convs.map(c => {
      const vis = c.msgs.filter(m => m.isVisible);
      return {
        id: c.id, title: c.title,
        msgs: vis.length,
        words: vis.reduce((s, m) => s + m.words, 0),
        durationDays: c.updateTime && c.createTime ? (c.updateTime - c.createTime) / 86400 : 0,
        userMsgs: vis.filter(m => m.role === "user").length,
      };
    });

    const topByMsgs = [...convStats].sort((a, b) => b.msgs - a.msgs).slice(0, 10);
    let longestDur = convStats[0] || { title: "—", durationDays: 0 };
    for (const c of convStats) if (c.durationDays > longestDur.durationDays) longestDur = c;

    const titleWords = countTopWords(convs.map(c => c.title), 40,
      new Set(["ohne", "titel", "chat", "neue", "neuer", "frage", "fragen"]));

    const conversations = {
      topByMsgs,
      medianMsgs: median(convStats.map(c => c.msgs)),
      longestDur,
      revisited: convStats.filter(c => c.durationDays > 1).length,
      gizmoCount: convs.filter(c => c.templateId).length,
      voiceConvCount: convs.filter(c => c.voice).length,
      archivedCount: convs.filter(c => c.isArchived).length,
      starredCount: convs.filter(c => c.isStarred).length,
      oneShot: convStats.filter(c => c.userMsgs <= 1).length,
      titleWords,
      avgAiWordsPerReply: aiWords / Math.max(1, aiMsgs.length),
      avgUserWordsPerMsg: userWords / Math.max(1, userMsgs.length),
    };

    /* ── Medien & Tools ────────────────────────────────── */
    let imgUser = { count: 0, bytes: 0 }, imgAi = { count: 0, bytes: 0 };
    let audioTotal = 0, rtTotal = 0, transcriptWords = 0;
    let userVoiceTurns = 0, aiVoiceTurns = 0, spokenWordsUser = 0, spokenWordsAi = 0;
    const attList = [];
    let codeMsgs = 0, codeBlocksTotal = 0;
    const convsWithCode = new Set();

    for (const x of all) {
      const tgt = x.m.role === "user" ? imgUser : imgAi;
      for (const img of x.m.images) { tgt.count++; tgt.bytes += img.bytes; }
      audioTotal += x.m.audioCount;
      rtTotal += x.m.rtCount;
      transcriptWords += x.m.transcriptWords;
      // Live-Voice-Split: Realtime-Pointer = deine Beiträge,
      // Audio-Pointer = KI-Antworten (Diktat taucht im Export nicht als Audio auf)
      if (x.m.rtCount > 0) userVoiceTurns++;
      if (x.m.audioCount > 0) aiVoiceTurns++;
      if (x.m.role === "user") spokenWordsUser += x.m.transcriptWords;
      else spokenWordsAi += x.m.transcriptWords;
      for (const a of x.m.attachments) attList.push(a);
      if (x.m.codeBlocks > 0) { codeMsgs++; codeBlocksTotal += x.m.codeBlocks; convsWithCode.add(x.c.id); }
    }

    const attTypes = new Map();
    let largestAtt = { name: "—", size: 0 };
    for (const a of attList) {
      attTypes.set(a.mimeLabel, (attTypes.get(a.mimeLabel) || 0) + 1);
      if (a.size > largestAtt.size) largestAtt = a;
    }

    const voiceMap = new Map();
    for (const c of convs) if (c.voice) voiceMap.set(c.voice, (voiceMap.get(c.voice) || 0) + 1);

    const media = {
      imgUser, imgAi,
      audioTotal, rtTotal, transcriptWords,
      userVoiceTurns, aiVoiceTurns, spokenWordsUser, spokenWordsAi,
      voices: topEntries(voiceMap, 8),
      attCount: attList.length,
      attBytes: attList.reduce((s, a) => s + a.size, 0),
      attTypes: topEntries(attTypes, 8),
      largestAtt,
      codeMsgs, codeBlocksTotal,
      convsWithCode: convsWithCode.size,
      assetLib: classifyAssets(model.assetNames),
    };

    /* ── Websuche ──────────────────────────────────────── */
    const domainMap = new Map();
    let searchMsgs = 0, totalCitations = 0;
    const refTypeMap = new Map();
    for (const x of all) {
      if (x.m.searchGroups) {
        searchMsgs++;
        for (const g of x.m.searchGroups) {
          domainMap.set(g.domain, (domainMap.get(g.domain) || 0) + Math.max(1, g.entries));
          totalCitations += g.entries;
        }
      }
      for (const t of x.m.refTypes) refTypeMap.set(t, (refTypeMap.get(t) || 0) + 1);
    }

    const web = {
      searchMsgs,
      searchSharePct: searchMsgs / Math.max(1, aiMsgs.length) * 100,
      totalCitations,
      uniqueDomains: domainMap.size,
      topDomains: topEntries(domainMap, 15),
      refTypes: topEntries(refTypeMap, 10),
    };

    /* ── Text-Insights ─────────────────────────────────── */
    const topWords = countTopWords(userMsgs.map(x => x.m.text), 20);

    let longestUser = { words: 0, title: "—" }, longestAi = { words: 0, title: "—" };
    for (const x of userMsgs) if (x.m.words > longestUser.words) longestUser = { words: x.m.words, title: x.c.title };
    for (const x of aiMsgs) if (x.m.words > longestAi.words) longestAi = { words: x.m.words, title: x.c.title };

    const countMatches = (msgs, re) => msgs.filter(x => re.test(x.m.text)).length;

    const texts = {
      topWords,
      medianPromptWords: median(userMsgs.map(x => x.m.words)),
      longestUser, longestAi,
      questionPct: countMatches(userMsgs, /\?/) / Math.max(1, userMsgs.length) * 100,
      thanksCount: countMatches(userMsgs, /\b(danke|thanks|thank you|thx|merci)\b/i),
      pleaseCount: countMatches(userMsgs, /\bbitte\b|\bplease\b/i),
    };

    /* ── Fun-Facts ─────────────────────────────────────── */

    // Emojis in deinen Nachrichten
    let emojiCount = 0;
    const emojiMap = new Map();
    for (const x of userMsgs) {
      const found = x.m.text.match(/\p{Extended_Pictographic}/gu);
      if (!found) continue;
      emojiCount += found.length;
      for (const e of found) emojiMap.set(e, (emojiMap.get(e) || 0) + 1);
    }
    const topEmoji = topEntries(emojiMap, 1)[0] || null;

    // Antwort-Latenz: deine Nachricht → direkt folgende KI-Antwort (< 1 h)
    const latencies = [];
    for (const c of convs) {
      const vis = c.msgs.filter(m => m.isVisible && m.t);
      for (let i = 0; i < vis.length - 1; i++) {
        if (vis[i].role === "user" && vis[i + 1].role === "assistant") {
          const dt = vis[i + 1].t - vis[i].t;
          if (dt > 0 && dt < 3600) latencies.push(dt);
        }
      }
    }

    // Längste Session: Nachrichtenkette ohne Pause > 30 min
    const sortedT = times.slice().sort((a, b) => a - b);
    let longestSession = { durationSec: 0, msgs: 0, t: null };
    let sessStart = 0;
    for (let i = 0; i <= sortedT.length; i++) {
      const gap = i === sortedT.length || (i > 0 && sortedT[i] - sortedT[i - 1] > 1800);
      if (gap) {
        const dur = sortedT[i - 1] - sortedT[sessStart];
        if (dur > longestSession.durationSec) {
          longestSession = { durationSec: dur, msgs: i - sessStart, t: sortedT[sessStart] };
        }
        sessStart = i;
      }
    }

    // Nachricht am tiefsten in der Nacht (nächste an 3:30 Uhr)
    let latestNight = { t: null, dist: Infinity };
    for (const x of visible) {
      const d = new Date(x.m.t * 1000);
      const h = d.getHours() + d.getMinutes() / 60;
      const dist = Math.min(Math.abs(h - 3.5), 24 - Math.abs(h - 3.5));
      if (dist < latestNight.dist) latestNight = { t: x.m.t, dist };
    }

    // Längste Pause zwischen zwei aktiven Tagen
    let longestBreak = { days: 0, from: null, to: null };
    for (let i = 1; i < sortedDays.length; i++) {
      const a = new Date(sortedDays[i - 1] + "T12:00:00").getTime();
      const b = new Date(sortedDays[i] + "T12:00:00").getTime();
      const free = Math.round((b - a) / 86400e3) - 1;
      if (free > longestBreak.days) longestBreak = { days: free, from: sortedDays[i - 1], to: sortedDays[i] };
    }

    // Aktivste Kalenderwoche
    const weekMap = new Map();
    for (const x of visible) {
      const key = isoWeekLabel(x.m.t);
      weekMap.set(key, (weekMap.get(key) || 0) + 1);
    }
    const busiestWeek = topEntries(weekMap, 1)[0] || null;

    const fun = {
      emojiCount, topEmoji,
      medianReplyLatency: median(latencies),
      longestSession, latestNight, longestBreak, busiestWeek,
    };

    /* ── Ökobilanz (Umwelt-Fußabdruck) ─────────────────────
       Der ChatGPT-Export enthält KEINE echten Token-/Energiewerte.
       Wir schätzen daher über die Kette: geschätzte Tokens →
       Energie → (Wasser & CO₂). Alle Faktoren sind belegt und hier
       zentral als anpassbare Konstanten definiert.                */
    const IMPACT = {
      // Ø-Query ≈ 0,34 Wh (Altman 2025). Bei ~485 sichtbaren Tokens
      // ergibt das als grobe Text-Inferenz-Schätzung ~0,7 Wh je 1000 Tokens.
      ENERGY_WH_PER_1K_TOKENS: 0.7,
      // Wiederverwendeter Gesprächskontext ist nicht im Export messbar.
      // Wir zählen ihn klein gewichtet mit, statt ihn komplett zu ignorieren.
      CONTEXT_REUSE_WEIGHT: 0.1,
      CONTEXT_TOKEN_CAP: 16000,
      // Reasoning-Modelle (o3, *-thinking) verbrauchen ein Vielfaches.
      // Ohne echte Tokenwerte nutzen wir Denkzeit nur als begrenzten Proxy.
      REASONING_DEFAULT_MULTIPLIER: 8,
      REASONING_MIN_MULTIPLIER: 4,
      REASONING_MAX_MULTIPLIER: 24,
      // Kühlung on-site + Wasser der Stromerzeugung (UC Riverside 2023
      // „Making AI Less Thirsty"; S. Goedecke). ~20 ml je Wh.
      WATER_ML_PER_WH: 20,
      // Ø Netz-Kohlenstoffintensität ~450 g CO₂/kWh.
      CO2_G_PER_WH: 0.45,
      // Virtuelles Wasser von Lebensmitteln (Water Footprint Network,
      // Mekonnen & Hoekstra 2012), in Litern:
      WATER_L_STEAK: 3080,      // 200 g Rind à 15.400 L/kg
      WATER_L_AVOCADO: 320,     // 170 g à ~1.980 L/kg
      WATER_L_COFFEE_CUP: 132,  // pro Tasse
      CO2_G_COFFEE_CUP: 258,    // CDP: 12 oz schwarzer Kaffee ≈ 0,258 kg CO₂e
      AVG_CHATGPT_QUERY_WH: 0.34,
      STREAMING_VIDEO_WH_PER_HOUR: 77, // IEA: ~0,077 kWh je Stunde Streaming
      SHOWER_L_PER_MIN: 9.46,    // EPA: Standard-Duschkopf 2,5 gal/min
      TOILET_L_PER_FLUSH: 4.85,  // EPA WaterSense: 1,28 gal/Spülung
      CO2_G_PER_PKM_CAR: 164,    // UBA 2024, Pkw gesamt
      CO2_G_PER_PKM_TRAIN: 26,   // UBA 2024, Eisenbahn Fernverkehr
      CO2_G_PER_PKM_FLIGHT: 290, // UBA 2024, Inlandflug inkl. Nicht-CO₂-Effekte
      CO2_G_PER_PKM_PEDELEC: 3,  // UBA 2024, Pedelec
    };

    const energyMap = new Map();
    let energyWh = 0, reasoningEnergyWh = 0;
    let promptTokens = 0, outputTokens = 0, contextTokens = 0, weightedTokens = 0, measuredReplies = 0;
    const tokenEstimate = (chars) => chars / 4;
    const reasoningMultiplier = (sec) => {
      if (sec === null || sec === undefined) return IMPACT.REASONING_DEFAULT_MULTIPLIER;
      return clamp(
        IMPACT.REASONING_MIN_MULTIPLIER + Math.sqrt(Math.max(0, sec)) * 1.6,
        IMPACT.REASONING_MIN_MULTIPLIER,
        IMPACT.REASONING_MAX_MULTIPLIER
      );
    };

    for (const c of convs) {
      let pendingPromptTokens = 0;
      let visibleContextTokens = 0;
      let lastRecapSec = null;
      for (const m of c.msgs) {
        if (m.ct === "reasoning_recap" && m.recap) {
          lastRecapSec = m.recap.sec;
          continue;
        }
        if (!m.isVisible || !m.t) continue;

        const msgTokens = tokenEstimate(m.chars);
        if (m.role === "user") {
          pendingPromptTokens += msgTokens;
          visibleContextTokens += msgTokens;
          continue;
        }
        if (m.role !== "assistant") {
          visibleContextTokens += msgTokens;
          continue;
        }

        const outTokens = msgTokens;
        const priorContextTokens = Math.max(0, visibleContextTokens - pendingPromptTokens);
        const contextEstimate = Math.min(priorContextTokens, IMPACT.CONTEXT_TOKEN_CAP) * IMPACT.CONTEXT_REUSE_WEIGHT;
        const thinking = isThinkingModel(m.model);
        const multiplier = thinking ? reasoningMultiplier(lastRecapSec) : 1;
        const countedTokens = pendingPromptTokens + outTokens + contextEstimate;
        const wh = (countedTokens / 1000) * IMPACT.ENERGY_WH_PER_1K_TOKENS * multiplier;

        energyWh += wh;
        if (thinking) reasoningEnergyWh += wh;
        promptTokens += pendingPromptTokens;
        outputTokens += outTokens;
        contextTokens += contextEstimate;
        weightedTokens += countedTokens * multiplier;
        measuredReplies++;

        const slug = m.model || "unbekannt";
        energyMap.set(slug, (energyMap.get(slug) || 0) + wh);
        visibleContextTokens += outTokens;
        pendingPromptTokens = 0;
        lastRecapSec = null;
      }
    }
    const energyByModel = topEntries(energyMap, 10)
      .map(e => ({ label: prettyModel(e.key), wh: e.value }));

    const waterMl = energyWh * IMPACT.WATER_ML_PER_WH;
    const co2g = energyWh * IMPACT.CO2_G_PER_WH;
    const waterL = waterMl / 1000;
    const coffeeCupsWater = waterL / IMPACT.WATER_L_COFFEE_CUP;
    const coffeeCupsCo2 = co2g / IMPACT.CO2_G_COFFEE_CUP;

    const impact = {
      energyWh, waterMl, co2g,
      promptTokens, outputTokens, contextTokens, weightedTokens, measuredReplies,
      energyByModel,
      reasoningEnergyPct: energyWh > 0 ? reasoningEnergyWh / energyWh * 100 : 0,
      // greifbare Vergleiche
      bottles: waterMl / 500,                        // 0,5-L-Flaschen
      steaks: waterL / IMPACT.WATER_L_STEAK,
      avocados: waterL / IMPACT.WATER_L_AVOCADO,
      coffeeCups: Math.max(coffeeCupsWater, coffeeCupsCo2),
      coffeeCupsWater,
      coffeeCupsCo2,
      phoneCharges: energyWh / 12,                   // ~12 Wh je Smartphone-Ladung
      ledHours: energyWh / 10,                       // 10-W-LED-Lampe
      streamingHours: energyWh / IMPACT.STREAMING_VIDEO_WH_PER_HOUR,
      avgQueryEquiv: energyWh / IMPACT.AVG_CHATGPT_QUERY_WH,
      avgWhPerReply: energyWh / Math.max(1, measuredReplies),
      evKm: energyWh / 160,                          // ~160 Wh/km E-Auto
      showerMinutes: waterL / IMPACT.SHOWER_L_PER_MIN,
      toiletFlushes: waterL / IMPACT.TOILET_L_PER_FLUSH,
      carKm: co2g / IMPACT.CO2_G_PER_PKM_CAR,
      trainKm: co2g / IMPACT.CO2_G_PER_PKM_TRAIN,
      flightKm: co2g / IMPACT.CO2_G_PER_PKM_FLIGHT,
      pedelecKm: co2g / IMPACT.CO2_G_PER_PKM_PEDELEC,
    };

    return { overview, activity, models, reasoning, conversations, media, web, texts, fun, impact };
  }

  return { compute, prettyModel, dateKey };
})();
