const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

process.env.TZ = "Europe/Berlin";

const ROOT = path.resolve(__dirname, "..");

function loadGlobal(file, name) {
  const code = fs.readFileSync(path.join(ROOT, file), "utf8");
  return vm.runInNewContext(code + "; " + name, { console });
}

const Parser = loadGlobal("js/parser.js", "Parser");
const Stats = loadGlobal("js/stats.js", "Stats");

function assertJsonEqual(actual, expected) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
}

function msg(role, t, text, metadata = {}) {
  return {
    author: { role },
    create_time: t,
    content: { content_type: "text", parts: [text] },
    metadata,
  };
}

function conversationFromMessages(id, messages, extra = {}) {
  const mapping = { root: { id: "root", parent: null, children: messages.length ? ["m0"] : [], message: null } };
  messages.forEach((message, i) => {
    const nodeId = `m${i}`;
    mapping[nodeId] = {
      id: nodeId,
      parent: i ? `m${i - 1}` : "root",
      children: i + 1 < messages.length ? [`m${i + 1}`] : [],
      message,
    };
  });
  return {
    conversation_id: id,
    title: id,
    create_time: extra.create_time || (messages[0] && messages[0].create_time) || 1,
    update_time: extra.update_time || (messages[messages.length - 1] && messages[messages.length - 1].create_time) || 1,
    current_node: messages.length ? `m${messages.length - 1}` : "root",
    mapping,
    ...extra,
  };
}

const branchedConversation = {
  conversation_id: "branch-test",
  title: "Branch test",
  create_time: 1000,
  update_time: 1003,
  current_node: "a2",
  mapping: {
    root: { id: "root", parent: null, children: ["u1"], message: null },
    u1: { id: "u1", parent: "root", children: ["a1", "a2"], message: msg("user", 1003, "hi") },
    a1: {
      id: "a1",
      parent: "u1",
      children: [],
      message: msg("assistant", 1002, "old answer should not count", { model_slug: "gpt-4o" }),
    },
    a2: {
      id: "a2",
      parent: "u1",
      children: [],
      message: msg("assistant", 1001, "new answer", { model_slug: "gpt-4o" }),
    },
  },
};

const model = Parser.buildModel([{ name: "branch.json", data: [branchedConversation] }]);
assertJsonEqual(model.conversations[0].msgs.map(m => m.text).filter(Boolean), ["hi", "new answer"]);
assert.strictEqual(model.conversations[0].skippedAltMsgs, 1);

const stats = Stats.compute(model);
assert.strictEqual(stats.overview.msgCount, 2);
assert.strictEqual(stats.overview.aiWords, 2);
assert.ok(stats.impact.waterMl >= 0, "ChatGPT-Wasserbenchmark ist nicht negativ");
assert.ok(stats.impact.waterMlLow <= stats.impact.waterMlHigh, "Standort-Szenariogrenzen sind konsistent");
assert.ok(stats.impact.co2gGermany < stats.impact.co2g);

const rootCurrentConversation = {
  conversation_id: "root-current",
  title: "Root current fallback",
  create_time: 1000,
  update_time: 1001,
  current_node: "root",
  mapping: {
    root: { id: "root", parent: null, children: ["u1"], message: null },
    u1: { id: "u1", parent: "root", children: [], message: msg("user", 1001, "fallback text") },
  },
};
assertJsonEqual(
  Parser.buildModel([{ name: "root.json", data: [rootCurrentConversation] }]).conversations[0].msgs.map(m => m.text).filter(Boolean),
  ["fallback text"]
);

/* ── Ökobilanz: Bildgenerierung, Monats-Aggregation, neue Kennzahlen ── */

function imgMsg(role, t) {
  return {
    author: { role },
    create_time: t,
    content: {
      content_type: "multimodal_text",
      parts: [{ content_type: "image_asset_pointer", size_bytes: 1000, width: 512, height: 512 }],
    },
    metadata: {},
  };
}

// Zeitstempel mittags Mitte Januar/Februar 2024 — zeitzonensicher für die Monats-Keys
const T_JAN = 1705320000, T_FEB = 1707998400;

const impactConversation = {
  conversation_id: "impact-test",
  title: "Impact test",
  create_time: T_JAN,
  update_time: T_FEB + 2,
  current_node: "a2",
  mapping: {
    root: { id: "root", parent: null, children: ["u1"], message: null },
    u1: { id: "u1", parent: "root", children: ["t1"], message: msg("user", T_JAN, "draw me a cat") },
    // DALL·E-Bilder stehen im Export als "tool"-Nachricht
    t1: { id: "t1", parent: "u1", children: ["a1"], message: imgMsg("tool", T_JAN + 1) },
    a1: { id: "a1", parent: "t1", children: ["u2"], message: msg("assistant", T_JAN + 2, "here is your cat", { model_slug: "gpt-4o" }) },
    u2: { id: "u2", parent: "a1", children: ["a2"], message: msg("user", T_FEB, "thanks, one more question") },
    a2: { id: "a2", parent: "u2", children: [], message: msg("assistant", T_FEB + 2, "sure, here you go", { model_slug: "gpt-4o" }) },
  },
};

const impact = Stats.compute(Parser.buildModel([{ name: "impact.json", data: [impactConversation] }])).impact;
assert.ok(Math.abs(impact.imageGenWh - 2.9) < 1e-9, "ein generiertes Bild = 2,9 Wh");
assert.ok(impact.imageGenWh < impact.energyWh, "Bildenergie ist Teil der Gesamtenergie");
assert.ok(impact.imageGenPct > 0 && impact.imageGenPct < 100);
assert.strictEqual(impact.byMonth.length, 2);
assert.ok(impact.byMonth[0].key < impact.byMonth[1].key, "byMonth ist chronologisch sortiert");
const byMonthSum = impact.byMonth.reduce((s, e) => s + e.wh, 0);
assert.ok(Math.abs(byMonthSum - impact.energyWh) < 1e-9, "Monatssummen ergeben die Gesamtenergie");
assert.ok(impact.byMonth[0].wh > impact.byMonth[1].wh, "Januar (mit Bild) verbraucht mehr als Februar");
assert.ok(impact.byMonth[0].co2g > 0 && impact.byMonth[0].waterMl > 0);
assert.ok(impact.treeDays > 0);
assert.ok(impact.geminiQueryEquiv > impact.avgQueryEquiv, "0,24 Wh je Gemini-Prompt < 0,34 Wh je Ø-Query");
assert.ok(impact.co2gLifecycle > 0);

/* ── Kaputte Zeitstempel: Antwort liegt Wochen VOR der Frage ── */

// Muster aus echten Exporten: Gespräch Ende Mai, aber eine assistant-Antwort
// trägt einen create_time von Ende April — einen Monat vor der Frage.
const T_MAY_27 = Date.parse("2026-05-27T20:10:44") / 1000;
const T_APR_28 = Date.parse("2026-04-28T22:41:35") / 1000;

const brokenTsConversation = {
  conversation_id: "broken-ts",
  title: "Broken timestamp",
  create_time: T_MAY_27 - 5,
  update_time: T_MAY_27 + 60,
  current_node: "a1",
  mapping: {
    root: { id: "root", parent: null, children: ["u1"], message: null },
    u1: { id: "u1", parent: "root", children: ["a1"], message: msg("user", T_MAY_27, "was ist ein spf record?") },
    a1: { id: "a1", parent: "u1", children: [], message: msg("assistant", T_APR_28, "Ein SPF Record ist …", { model_slug: "gpt-4o" }) },
  },
};

const brokenModel = Parser.buildModel([{ name: "broken.json", data: [brokenTsConversation] }]);
const brokenConv = brokenModel.conversations[0];
assert.strictEqual(brokenConv.repairedTimestamps, 1, "ein Zeitstempel repariert");
assertJsonEqual(brokenConv.msgs.map(m => m.t), [T_MAY_27, T_MAY_27], "Antwort auf Fragezeit angehoben");
assert.strictEqual(Stats.compute(brokenModel).overview.firstT, T_MAY_27, "Zeitspanne beginnt bei der echten ersten Nachricht");
assert.ok(brokenModel.report[0].info.includes("1 fehlerhafte Zeitstempel repariert"));

// Leicht rückdatierte Alternativen (Sekunden) bleiben unangetastet …
assert.strictEqual(model.conversations[0].repairedTimestamps, 0);
// … und der Chip erwähnt dann auch keine Reparatur
assert.ok(!Parser.buildModel([{ name: "b.json", data: [branchedConversation] }]).report[0].info.includes("repariert"));

/* ── Bibliothek (library_files.json) & Export-Manifest ── */

const libraryPayload = [
  {
    id: { id: "libfile_a" }, file_id: "file_a", file_name: "ChatGPT Image Katze.png",
    mime_type: "image/png", file_size_bytes: 500000,
    created_at: "2024-01-15T12:00:00+00:00",
    library_file_category: "image", library_artifact_type: "image",
    origination_thread_id: "branch-test", trashed_at: null, deleted_at: null,
  },
  {
    id: { id: "libfile_b" }, file_id: "file_b", file_name: "Bericht.pdf",
    mime_type: "application/pdf", file_size_bytes: 100000,
    created_at: "2024-02-15T12:00:00+00:00",
    library_file_category: "pdf", library_artifact_type: null,
    origination_thread_id: null, trashed_at: null, deleted_at: null,
  },
  { // gelöschte Einträge werden übersprungen
    id: { id: "libfile_c" }, file_id: "file_c", file_name: "alt.png",
    mime_type: "image/png", file_size_bytes: 999,
    created_at: "2024-02-16T12:00:00+00:00",
    library_file_category: "image", library_artifact_type: null,
    origination_thread_id: null, trashed_at: "2024-03-01T12:00:00+00:00", deleted_at: null,
  },
];

const manifestPayload = {
  export_files: [
    { path: "conversations-000.json", size_bytes: 1000 },
    { path: "file_aaaa.dat", size_bytes: 4000 },
    { path: "file_bbbb.dat", size_bytes: 6000 },
  ],
  logical_files: {},
  manifest_file: "export_manifest.json",
  version: 1,
};

const libModel = Parser.buildModel([
  { name: "branch.json", data: [branchedConversation] },
  { name: "library_files.json", data: libraryPayload },
  { name: "library_files.json", data: libraryPayload }, // Duplikat wird dedupliziert
  { name: "export_manifest.json", data: manifestPayload },
]);
assert.strictEqual(libModel.libraryFiles.length, 2, "trashed raus, Duplikate dedupliziert");
assertJsonEqual(libModel.manifest, { totalFiles: 3, totalBytes: 11000, mediaFiles: 2, mediaBytes: 10000 });
assert.ok(libModel.report.every(r => r.ok), "alle Dateien werden erkannt");

const libMedia = Stats.compute(libModel).media;
assert.strictEqual(libMedia.library.total, 2);
assert.strictEqual(libMedia.library.totalBytes, 600000);
assert.strictEqual(libMedia.library.artifacts, 1);
assert.strictEqual(libMedia.library.uploads, 1);
assert.strictEqual(libMedia.library.withConv, 1);
assert.strictEqual(libMedia.library.largest.name, "ChatGPT Image Katze.png");
assertJsonEqual(libMedia.library.perMonth.map(e => [e.key, e.count]), [["2024-01", 1], ["2024-02", 1]]);
assertJsonEqual(libMedia.library.types.map(t => t.key).sort(), ["PDF", "PNG"]);
assertJsonEqual(libMedia.manifest, { totalFiles: 3, totalBytes: 11000, mediaFiles: 2, mediaBytes: 10000 });

// Ohne Bibliothek/Manifest bleiben die Felder leer (keine Pflichtdateien)
assert.strictEqual(stats.media.library, null);
assert.strictEqual(stats.media.manifest, null);

assertJsonEqual(Parser.parseRecapSeconds("Nachgedacht fuer 2 Minuten"), { sec: 120, estimated: false });
assertJsonEqual(Parser.parseRecapSeconds("Thought for 2 minutes"), { sec: 120, estimated: false });
assertJsonEqual(Parser.parseRecapSeconds("Nachgedacht fuer 1m 30s"), { sec: 90, estimated: false });
assertJsonEqual(Parser.parseRecapSeconds("Thought for 1 hour 2 minutes 3 seconds"), { sec: 3723, estimated: false });

/* ── Versteckte/interne Nachrichten & robuste Parts ─────── */

const hiddenMeta = { is_visually_hidden_from_conversation: true };
const hiddenConversation = conversationFromMessages("hidden", [
  msg("user", T_MAY_27, "sichtbar"),
  msg("tool", T_MAY_27 + 1, "VERSTECKT ".repeat(100), hiddenMeta),
  msg("assistant", T_MAY_27 + 2, "Antwort", { model_slug: "gpt-4o" }),
]);
const hiddenModel = Parser.buildModel([{ name: "hidden.json", data: [hiddenConversation] }]);
assert.strictEqual(hiddenModel.conversations[0].msgs[1].isHidden, true);
assert.strictEqual(hiddenModel.conversations[0].msgs[1].isVisible, false);
const hiddenStats = Stats.compute(hiddenModel);
assert.strictEqual(hiddenStats.overview.msgCount, 2, "versteckte Tool-Nachricht zählt nicht");
assert.strictEqual(hiddenStats.overview.estTokens, Math.round((8 + 7) / 4));
assert.strictEqual(hiddenStats.quality.hiddenMessagesExcluded, 1);

const malformed = msg("user", T_MAY_27, "ignored");
malformed.content.parts = { not: "an array" };
const malformedModel = Parser.buildModel([{ name: "malformed.json", data: [conversationFromMessages("malformed", [malformed])] }]);
assert.strictEqual(malformedModel.conversations[0].msgs[0].isVisible, false, "ungültige parts werfen nicht und bleiben unsichtbar");

/* ── Sommer-/Winterzeit: Kalendertage statt Millisekunden ─ */

function twoDayStreak(id, first, second) {
  return Stats.compute(Parser.buildModel([{ name: id + ".json", data: [conversationFromMessages(id, [
    msg("user", Date.parse(first) / 1000, "Tag eins"),
    msg("assistant", Date.parse(first) / 1000 + 1, "Antwort", { model_slug: "gpt-4o" }),
    msg("user", Date.parse(second) / 1000, "Tag zwei"),
    msg("assistant", Date.parse(second) / 1000 + 1, "Antwort", { model_slug: "gpt-4o" }),
  ])] }])).activity;
}

const springStreak = twoDayStreak("spring-dst", "2026-03-28T12:00:00+01:00", "2026-03-29T12:00:00+02:00");
const fallStreak = twoDayStreak("fall-dst", "2026-10-24T12:00:00+02:00", "2026-10-25T12:00:00+01:00");
assert.strictEqual(springStreak.longestStreak, 2);
assert.strictEqual(springStreak.curStreak, 2);
assert.strictEqual(fallStreak.longestStreak, 2);
assert.strictEqual(fallStreak.curStreak, 2);

/* ── Websuche: Operationen und Antworten getrennt ───────── */

const searchMeta = (domain) => ({ search_result_groups: [{ domain, entries: [{ url: `https://${domain}/x` }] }] });
const webConversation = conversationFromMessages("web-multi", [
  msg("user", T_MAY_27, "suche"),
  msg("tool", T_MAY_27 + 1, "search one", searchMeta("one.example")),
  msg("tool", T_MAY_27 + 2, "search two", searchMeta("two.example")),
  msg("assistant", T_MAY_27 + 3, "Ergebnis", { model_slug: "gpt-4o" }),
]);
const webStats = Stats.compute(Parser.buildModel([{ name: "web.json", data: [webConversation] }])).web;
assert.strictEqual(webStats.searchOperations, 2);
assert.strictEqual(webStats.answersWithSearch, 1);
assert.strictEqual(webStats.searchSharePct, 100);

/* ── Nutzeraktivität & zyklische Uhrzeiten ──────────────── */

const midnightSplit = conversationFromMessages("midnight-split", [
  msg("user", Date.parse("2026-01-01T23:59:00+01:00") / 1000, "spät"),
  msg("assistant", Date.parse("2026-01-02T00:01:00+01:00") / 1000, "Antwort", { model_slug: "gpt-4o" }),
]);
const splitStats = Stats.compute(Parser.buildModel([{ name: "split.json", data: [midnightSplit] }]));
assert.strictEqual(splitStats.overview.activeDays, 1, "KI-Antwort nach Mitternacht erzeugt keinen Nutzertag");
assert.strictEqual(splitStats.activity.perDay.length, 1);
assert.strictEqual(splitStats.activity.peakHour, 23);
assert.strictEqual(splitStats.activity.nightPct, 0);

const clockConversation = conversationFromMessages("clock", [
  msg("user", Date.parse("2026-01-01T23:59:00+01:00") / 1000, "spät"),
  msg("user", Date.parse("2026-01-02T00:01:00+01:00") / 1000, "früh"),
]);
const clockMean = Stats.compute(Parser.buildModel([{ name: "clock.json", data: [clockConversation] }])).activity.avgFirstMins;
assert.ok(Math.min(clockMean, 1440 - clockMean) < 1.1, "23:59 und 00:01 mitteln sich zyklisch zu Mitternacht");

/* ── Modellabdeckung, Gesprächsspanne und One-Shots ─────── */

const manyModels = [];
for (let i = 0; i < 8; i++) manyModels.push(conversationFromMessages(`model-${i}`, [
  msg("user", T_MAY_27 + i * 10, "Frage"),
  msg("assistant", T_MAY_27 + i * 10 + 1, "Antwort", { model_slug: `gpt-${i}-test` }),
]));
manyModels.push(conversationFromMessages("model-unknown", [
  msg("user", T_MAY_27 + 100, "Frage"), msg("assistant", T_MAY_27 + 101, "Antwort"),
]));
const modelStats = Stats.compute(Parser.buildModel([{ name: "models.json", data: manyModels }]));
assert.strictEqual(modelStats.models.dist.reduce((s, d) => s + d.count, 0), modelStats.overview.aiCount);
assert.ok(modelStats.models.dist.some(d => d.label === "Andere"));
assert.ok(modelStats.models.dist.some(d => d.label === "Unbekannt"));
assert.ok(modelStats.models.coveragePct > 0 && modelStats.models.coveragePct < 100);

const shortSpan = conversationFromMessages("short-span", [
  msg("user", T_MAY_27, "Frage"), msg("assistant", T_MAY_27 + 60, "Antwort", { model_slug: "gpt-4o" }),
], { create_time: T_MAY_27 - 86400, update_time: T_MAY_27 + 86400 * 30 });
const zeroUser = conversationFromMessages("zero-user", [msg("assistant", T_MAY_27 + 120, "Nur KI", { model_slug: "gpt-4o" })]);
const convStats = Stats.compute(Parser.buildModel([{ name: "duration.json", data: [shortSpan, zeroUser] }])).conversations;
assert.ok(Math.abs(convStats.longestDur.durationDays - 60 / 86400) < 1e-12, "Dauer folgt sichtbaren Nachrichten, nicht update_time");
assert.strictEqual(convStats.oneShot, 1, "null Nutzerfragen sind kein One-Shot");

/* ── Tokenheuristik, lange Texte und Nutzer-/KI-Bilder ──── */

const shortText = conversationFromMessages("short-text", [
  msg("user", T_JAN, "kurz"), msg("assistant", T_JAN + 1, "kurz", { model_slug: "gpt-4o" }),
]);
const longText = conversationFromMessages("long-text", [
  msg("user", T_JAN, "äöü漢字".repeat(10000)), msg("assistant", T_JAN + 1, "lang".repeat(10000), { model_slug: "gpt-4o" }),
]);
const shortImpact = Stats.compute(Parser.buildModel([{ name: "short.json", data: [shortText] }])).impact;
const longImpact = Stats.compute(Parser.buildModel([{ name: "long.json", data: [longText] }])).impact;
assert.ok(longImpact.visibleTextTokens > shortImpact.visibleTextTokens, "sichtbare Textheuristik bildet längeren Text ab");
assert.strictEqual(longImpact.energyWh, shortImpact.energyWh, "unbeobachtbarer Kontext/Reasoning wird nicht aus Textlänge erfunden");

const userImageConversation = conversationFromMessages("user-image", [
  imgMsg("user", T_JAN), msg("assistant", T_JAN + 1, "gesehen", { model_slug: "gpt-4o" }),
]);
const userImageImpact = Stats.compute(Parser.buildModel([{ name: "user-image.json", data: [userImageConversation] }])).impact;
assert.strictEqual(userImageImpact.imageGenWh, 0, "Nutzerbild ist keine Bildgenerierung");
assert.ok(impact.imageGenWh > 0, "Tool-Bild bleibt als externer SDXL-Benchmark erfasst");

const missingTimestamp = msg("assistant", null, "ohne Zeit", {});
const missingStats = Stats.compute(Parser.buildModel([{ name: "missing.json", data: [conversationFromMessages("missing", [
  msg("user", T_JAN, "Frage"), missingTimestamp,
])] }]));
assert.strictEqual(missingStats.quality.missingTimestamps, 1);

for (const [name, value] of Object.entries(impact)) {
  if (typeof value === "number") assert.ok(Number.isFinite(value) && value >= 0, `${name} ist endlich und nicht negativ`);
}
for (const pct of [impact.imageGenPct, webStats.searchSharePct, modelStats.models.coveragePct, modelStats.models.thinkingPct]) {
  assert.ok(pct >= 0 && pct <= 100, "Prozentsatz liegt zwischen 0 und 100");
}

console.log("Regression tests passed");
