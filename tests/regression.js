const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
assert.ok(stats.impact.waterMlLow < stats.impact.waterMl);
assert.ok(stats.impact.waterMl < stats.impact.waterMlHigh);
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

assertJsonEqual(Parser.parseRecapSeconds("Nachgedacht fuer 2 Minuten"), { sec: 120, estimated: false });
assertJsonEqual(Parser.parseRecapSeconds("Thought for 2 minutes"), { sec: 120, estimated: false });
assertJsonEqual(Parser.parseRecapSeconds("Nachgedacht fuer 1m 30s"), { sec: 90, estimated: false });
assertJsonEqual(Parser.parseRecapSeconds("Thought for 1 hour 2 minutes 3 seconds"), { sec: 3723, estimated: false });

console.log("Regression tests passed");
