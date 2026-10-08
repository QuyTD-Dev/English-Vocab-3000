// Kiểm thử phần chấm đáp án (lib.js). Chạy: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("../lib.js");
const { variantsOf, answerMatches, fold } = globalThis.VocabLib;
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "vocab.json"), "utf8"));
const byWord = new Map(data.words.map(([word]) => [word, variantsOf(word)]));
const accepts = (word, typed) => answerMatches(byWord.get(word) || variantsOf(word), typed);

test("đọc đủ các cách viết trong ngoặc", () => {
  assert.deepEqual(variantsOf("approve (of)"), ["approve", "approve of"]);
  assert.deepEqual(variantsOf("arrive (at, in)"), ["arrive", "arrive at", "arrive in"]);
  assert.deepEqual(variantsOf("cope (+ with)"), ["cope", "cope with"]);
  assert.deepEqual(variantsOf("born (be born)"), ["born", "be born"]);
  assert.deepEqual(variantsOf("mobile phone (mobile)"), ["mobile phone", "mobile"]);
  assert.deepEqual(variantsOf("July (abbr Jul)"), ["July"]);
  assert.deepEqual(variantsOf("analyse, analyze"), ["analyse", "analyze"]);
});

test("chấp nhận đáp án đúng dù khác dấu câu, hoa thường, khoảng trắng", () => {
  const ok = [
    ["approve (of)", "approve"], ["approve (of)", "approve of"], ["analyse, analyze", "Analyze "],
    ["o'clock", "oclock"], ["o'clock", "o’clock"], ["e.g.", "eg"], ["p.m.", "pm"], ["well known", "well-known"],
    ["make-up", "makeup"], ["mobile phone (mobile)", "mobile"], ["arrive (at, in)", "arrive in"],
    ["television, TV", "tv"], ["nobody, no one", "no one"], ["OK, okay", "ok"], ["Mr", "mr."],
  ];
  for (const [word, typed] of ok) assert.ok(accepts(word, typed), `${typed} → ${word}`);
});

test("không chấp nhận đáp án sai hoặc rỗng", () => {
  const bad = [["approve (of)", "approval"], ["accept", "except"], ["dessert", "desert"], ["arrive (at, in)", "arrive on"], ["e.g.", ""], ["a", "an"]];
  for (const [word, typed] of bad) assert.ok(!accepts(word, typed), `${typed} ≠ ${word}`);
});

test("mọi cách viết của mọi từ trong dữ liệu đều được chấm đúng", () => {
  for (const [word, variants] of byWord) {
    assert.ok(variants.length && variants.every((v) => v.trim()), `cách viết rỗng: ${word}`);
    for (const v of variants) assert.ok(answerMatches(variants, v), `${v} → ${word}`);
  }
});

test("tìm kiếm không dấu", () => {
  assert.equal(fold("Đường phố"), "duong pho");
  assert.ok(fold("tai nạn, rủi ro").includes("tai nan"));
});
