// Kiểm thử bộ lập lịch FSRS (srs.js). Chạy: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");

require("../srs.js");
const SRS = globalThis.SRS;
const { State, Rating } = SRS;
const DAY = 86400000;
const MIN = 60000;
const T0 = Date.UTC(2026, 9, 8, 9, 0, 0);
const noFuzz = { fuzz: false };

/** Đưa thẻ mới qua các bước học bằng "Nhớ" cho đến khi vào trạng thái ôn tập */
function graduate(now = T0) {
  let c = SRS.schedule(null, Rating.Good, now, noFuzz).card;
  while (c.st !== State.Review) c = SRS.schedule(c, Rating.Good, c.due, noFuzz).card;
  return c;
}

test("từ mới: Nhớ → bước 10 phút, Nhớ tiếp → vào lịch ôn theo ngày", () => {
  const a = SRS.schedule(null, Rating.Good, T0, noFuzz).card;
  assert.equal(a.st, State.Learning);
  assert.equal(a.due - T0, 10 * MIN);
  const b = SRS.schedule(a, Rating.Good, a.due, noFuzz).card;
  assert.equal(b.st, State.Review);
  assert.equal(b.ivl, Math.round(SRS.W[2])); // độ bền ban đầu khi "Nhớ" ≈ 3.7 ngày
  assert.equal(b.reps, 2);
});

test("từ mới: Quên → 1 phút, Dễ → vào lịch ôn ngay", () => {
  const again = SRS.schedule(null, Rating.Again, T0, noFuzz).card;
  assert.equal(again.st, State.Learning);
  assert.equal(again.due - T0, MIN);
  const easy = SRS.schedule(null, Rating.Easy, T0, noFuzz).card;
  assert.equal(easy.st, State.Review);
  assert.ok(easy.ivl >= 10);
});

test("thứ tự nút: Quên < Khó ≤ Nhớ < Dễ", () => {
  let c = graduate();
  for (let k = 0; k < 4; k++) {
    const now = c.due;
    const pv = SRS.preview(c, now, {});
    assert.ok(pv[0] < pv[1], `Quên < Khó (lần ${k})`);
    assert.ok(pv[1] <= pv[2], `Khó ≤ Nhớ (lần ${k})`);
    assert.ok(pv[2] < pv[3], `Nhớ < Dễ (lần ${k})`);
    c = SRS.schedule(c, Rating.Good, now, noFuzz).card;
  }
});

test("ôn đúng hạn: khoảng ôn tăng dần khi luôn nhớ", () => {
  let c = graduate();
  let prev = c.ivl;
  for (let k = 0; k < 5; k++) {
    c = SRS.schedule(c, Rating.Good, c.due, noFuzz).card;
    assert.ok(c.ivl > prev, `${c.ivl} > ${prev}`);
    prev = c.ivl;
  }
});

test("xác suất nhớ vào đúng ngày ôn ≈ mục tiêu ghi nhớ", () => {
  for (const retention of [0.85, 0.9, 0.95]) {
    let c = graduate();
    c = SRS.schedule(c, Rating.Good, c.due, { fuzz: false, retention }).card;
    const r = SRS.retrievability(c.ivl, c.s);
    assert.ok(Math.abs(r - retention) < 0.02, `retention ${retention}: R=${r.toFixed(3)}`);
  }
});

test("mục tiêu ghi nhớ cao hơn → khoảng ôn ngắn hơn", () => {
  const s = 20;
  assert.ok(SRS.intervalDays(s, { retention: 0.95 }) < SRS.intervalDays(s, { retention: 0.9 }));
  assert.ok(SRS.intervalDays(s, { retention: 0.9 }) < SRS.intervalDays(s, { retention: 0.8 }));
  assert.equal(SRS.intervalDays(s, { retention: 0.9 }), s); // R(S) = 90% theo định nghĩa
});

test("quên khi đang ôn: chuyển sang học lại, tăng số lần quên, độ bền giảm", () => {
  let c = graduate();
  c = SRS.schedule(c, Rating.Good, c.due, noFuzz).card;
  const before = c;
  const after = SRS.schedule(c, Rating.Again, c.due, noFuzz).card;
  assert.equal(after.st, State.Relearning);
  assert.equal(after.lapses, before.lapses + 1);
  assert.ok(after.s < before.s);
  assert.equal(after.due - c.due, 10 * MIN);
  assert.ok(after.d > before.d, "quên làm từ khó hơn");
  const back = SRS.schedule(after, Rating.Good, after.due, noFuzz).card;
  assert.equal(back.st, State.Review);
  assert.ok(back.ivl >= 1);
});

test("độ khó luôn trong khoảng 1–10", () => {
  let c = graduate();
  for (let k = 0; k < 30; k++) c = SRS.schedule(c, Rating.Again, c.due, noFuzz).card;
  assert.ok(c.d <= 10 && c.d >= 1, `d=${c.d}`);
  c = graduate();
  for (let k = 0; k < 30; k++) c = SRS.schedule(c, Rating.Easy, c.due, noFuzz).card;
  assert.ok(c.d <= 10 && c.d >= 1, `d=${c.d}`);
});

test("khoảng ôn không vượt quá giới hạn", () => {
  let c = graduate();
  for (let k = 0; k < 20; k++) c = SRS.schedule(c, Rating.Easy, c.due, { fuzz: false, maxInterval: 365 }).card;
  assert.ok(c.ivl <= 365, `ivl=${c.ivl}`);
});

test("độ lệch ngẫu nhiên (fuzz) nằm trong ±5% và không đổi nếu cùng hạt", () => {
  let c = graduate();
  for (let k = 0; k < 3; k++) c = SRS.schedule(c, Rating.Good, c.due, noFuzz).card;
  const base = SRS.schedule(c, Rating.Good, c.due, noFuzz).card.ivl;
  const delta = Math.max(1, Math.round(base * 0.05));
  for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
    const ivl = SRS.schedule(c, Rating.Good, c.due, { random: () => r }).card.ivl;
    assert.ok(Math.abs(ivl - base) <= delta, `base=${base} ivl=${ivl}`);
  }
});

test("ngày đến hạn được tính từ mốc đầu ngày học", () => {
  const dayStart = (ts) => {
    const d = new Date(ts - 4 * 3600000);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime() + 4 * 3600000;
  };
  const c = SRS.schedule(graduate(), Rating.Good, T0 + 20 * DAY, { fuzz: false, dayStart }).card;
  assert.equal((c.due - dayStart(T0 + 20 * DAY)) % DAY, 0);
});

test("recall(): null với thẻ mới, giảm dần theo thời gian", () => {
  assert.equal(SRS.recall(null, T0), null);
  const c = graduate();
  const r1 = SRS.recall(c, c.last + DAY);
  const r2 = SRS.recall(c, c.last + 10 * DAY);
  assert.ok(r1 > r2 && r2 > 0 && r1 <= 1);
});

test("không làm thay đổi thẻ đầu vào", () => {
  const c = graduate();
  const copy = JSON.stringify(c);
  SRS.schedule(c, Rating.Again, c.due, noFuzz);
  assert.equal(JSON.stringify(c), copy);
});
