// Kiểm thử dữ liệu từ vựng (data/*.json). Chạy: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", f), "utf8"));
const data = read("vocab.json");
const legacy = read("legacy_v1.json");
const words = data.words;
const POS = new Set(["n", "v", "adj", "adv", "prep", "pron", "det", "conj", "exclam", "modal", "aux", "number", "article", "prefix", "abbr"]);
const byWord = new Map(words.map((w, i) => [w[0], i]));

test("đủ khoảng 3000+ từ, mỗi từ có đủ cột", () => {
  assert.ok(words.length > 3300, `${words.length} từ`);
  for (const w of words) assert.equal(w.length, 5, JSON.stringify(w));
});

test("khóa (chính từ) không trùng – tiến độ lưu theo khóa này", () => {
  assert.equal(byWord.size, words.length);
});

test("mọi từ đều có nghĩa, từ loại hợp lệ, chủ đề hợp lệ", () => {
  for (const [word, type, , meaning, topic] of words) {
    assert.ok(meaning && meaning.trim(), `thiếu nghĩa: ${word}`);
    for (const t of type.split(",").map((x) => x.trim()).filter(Boolean)) assert.ok(POS.has(t), `từ loại lạ "${t}" ở ${word}`);
    assert.ok(Number.isInteger(topic) && topic >= 0 && topic < data.topics.length, `chủ đề lỗi: ${word}`);
  }
});

test("chủ đề có id duy nhất và đa số từ đã được xếp chủ đề cụ thể", () => {
  const ids = data.topics.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const other = ids.indexOf("other");
  const nOther = words.filter((w) => w[4] === other).length;
  assert.ok(nOther < words.length * 0.05, `${nOther} từ chưa có chủ đề`);
});

test("họ từ: chỉ số hợp lệ, mỗi họ ≥ 2 từ, không từ nào thuộc 2 họ", () => {
  const seen = new Set();
  for (const f of data.families) {
    assert.ok(f.length >= 2);
    for (const i of f) {
      assert.ok(i >= 0 && i < words.length);
      assert.ok(!seen.has(i), `từ ${words[i][0]} nằm trong 2 họ`);
      seen.add(i);
    }
  }
});

test("các cặp chỉ giống mặt chữ không bị nối thành một họ", () => {
  const famOf = new Map();
  data.families.forEach((f, fi) => f.forEach((i) => famOf.set(i, fi)));
  const pairs = [["car", "card"], ["should", "shoulder"], ["universe", "university"], ["state", "station"], ["fact", "factory"], ["win", "wind"], ["care", "career"]];
  for (const [a, b] of pairs) {
    const fa = famOf.get(byWord.get(a));
    const fb = famOf.get(byWord.get(b));
    assert.ok(fa === undefined || fa !== fb, `${a} và ${b} bị nối nhầm`);
  }
  const success = famOf.get(byWord.get("success"));
  for (const w of ["successful", "successfully", "unsuccessful"]) assert.equal(famOf.get(byWord.get(w)), success, w);
});

test("đã sửa các lỗi của PDF gốc", () => {
  assert.ok(byWord.has("street") && !byWord.has("suf"));
  assert.ok(byWord.has("seem") && !byWord.has("seem linking"));
  const gram = words[byWord.get("gram, gramme")];
  assert.match(gram[3], /gam/);
});

test("bảng chuyển tiến độ bản 1 → bản 2 đủ và hợp lệ", () => {
  assert.equal(legacy.map.length, 3395);
  for (const i of legacy.map) assert.ok(Number.isInteger(i) && i >= 0 && i < words.length);
  // mục 1 bản cũ là "a", mục 2 là "abandon"
  assert.equal(words[legacy.map[0]][0], "a");
  assert.equal(words[legacy.map[1]][0], "abandon");
});
