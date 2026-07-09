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

assertJsonEqual(Parser.parseRecapSeconds("Nachgedacht fuer 2 Minuten"), { sec: 120, estimated: false });
assertJsonEqual(Parser.parseRecapSeconds("Thought for 2 minutes"), { sec: 120, estimated: false });
assertJsonEqual(Parser.parseRecapSeconds("Nachgedacht fuer 1m 30s"), { sec: 90, estimated: false });
assertJsonEqual(Parser.parseRecapSeconds("Thought for 1 hour 2 minutes 3 seconds"), { sec: 3723, estimated: false });

console.log("Regression tests passed");
