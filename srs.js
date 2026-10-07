/* Bộ lập lịch ôn tập FSRS 4.5 (Free Spaced Repetition Scheduler) — thuật toán Anki dùng từ bản 23.10.
 *
 * Mỗi thẻ nhớ có 2 đại lượng:
 *   S (stability, ngày): sau S ngày, xác suất còn nhớ giảm còn 90%.
 *   D (difficulty, 1–10): độ khó riêng của từ với bạn.
 * Xác suất nhớ sau t ngày: R(t) = (1 + F·t/S)^C. Lịch ôn được chọn để ôn đúng lúc R chạm
 * "tỉ lệ ghi nhớ mong muốn" (mặc định 90%).
 *
 * Trạng thái thẻ: 0 mới · 1 đang học (các bước phút) · 2 ôn tập (theo ngày) · 3 học lại sau khi quên.
 * Đánh giá: 1 Quên · 2 Khó · 3 Nhớ · 4 Dễ.
 */
(function (root) {
  "use strict";

  /** Tham số mặc định của FSRS-4.5 */
  const W = [
    0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793,
    0.3246, 1.587, 0.2272, 2.8755,
  ];
  const DECAY = -0.5;
  const FACTOR = 19 / 81; // để R(S) = 0.9
  const MIN_S = 0.1;
  const DAY = 86400000;
  const MIN = 60000;

  const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 };
  const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };

  const DEFAULTS = {
    retention: 0.9,
    maxInterval: 3650,
    learnSteps: [1, 10], // phút
    relearnSteps: [10], // phút
    fuzz: true,
    /** mốc đầu "ngày học" chứa thời điểm ts (mặc định 0h) */
    dayStart: (ts) => {
      const d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    },
    random: Math.random,
  };

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  function retrievability(elapsedDays, s) {
    return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / Math.max(MIN_S, s), DECAY);
  }
  const initStability = (g) => Math.max(MIN_S, W[g - 1]);
  const initDifficulty = (g) => clamp(W[4] - (g - 3) * W[5], 1, 10);
  function nextDifficulty(d, g) {
    const next = d - W[6] * (g - 3);
    return clamp(W[7] * initDifficulty(3) + (1 - W[7]) * next, 1, 10);
  }
  function recallStability(d, s, r, g) {
    const hard = g === Rating.Hard ? W[15] : 1;
    const easy = g === Rating.Easy ? W[16] : 1;
    return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy);
  }
  function forgetStability(d, s, r) {
    const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
    return Math.max(MIN_S, Math.min(s, sf));
  }
  function intervalDays(s, o) {
    const ivl = (s / FACTOR) * (Math.pow(o.retention, 1 / DECAY) - 1);
    return clamp(Math.round(ivl), 1, o.maxInterval);
  }
  function fuzzed(ivl, o) {
    if (!o.fuzz || ivl < 3) return ivl;
    const delta = Math.max(1, Math.round(ivl * 0.05));
    return clamp(ivl + Math.round((o.random() * 2 - 1) * delta), 2, o.maxInterval);
  }

  function blank() {
    return { st: State.New, s: 0, d: 0, due: 0, last: 0, step: 0, ivl: 0, reps: 0, lapses: 0 };
  }

  /** Xác suất còn nhớ thẻ tại thời điểm now (0–1); null nếu thẻ mới */
  function recall(card, now) {
    if (!card || !card.st || !card.last) return null;
    return retrievability((now - card.last) / DAY, card.s);
  }

  /**
   * Tính trạng thái mới của thẻ sau khi chấm điểm g.
   * @returns {{card:object, r:number|null, elapsed:number}}
   */
  function schedule(card, g, now, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const prev = Object.assign(blank(), card || {});
    const c = Object.assign({}, prev);
    const elapsed = prev.last ? (now - prev.last) / DAY : 0;
    const r = prev.st === State.Review || prev.st === State.Relearning ? retrievability(elapsed, prev.s) : null;

    const graduate = (bonus) => {
      c.st = State.Review;
      c.step = 0;
      c.ivl = fuzzed(Math.max(1, intervalDays(c.s, o) + (bonus || 0)), o);
      c.due = o.dayStart(now) + c.ivl * DAY;
    };
    const stepDue = (steps, i) => now + Math.round(steps[Math.min(i, steps.length - 1)] * MIN);

    if (prev.st === State.New) {
      c.s = initStability(g);
      c.d = initDifficulty(g);
      if (g === Rating.Easy) graduate(0);
      else {
        c.st = State.Learning;
        const steps = o.learnSteps;
        if (g === Rating.Again) {
          c.step = 0;
          c.due = stepDue(steps, 0);
        } else if (g === Rating.Hard) {
          c.step = 0;
          c.due = now + Math.round((steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[0] * 1.5) * MIN);
        } else {
          c.step = 1;
          if (c.step >= steps.length) graduate(0);
          else c.due = stepDue(steps, 1);
        }
      }
    } else if (prev.st === State.Learning || prev.st === State.Relearning) {
      const steps = prev.st === State.Learning ? o.learnSteps : o.relearnSteps;
      if (g === Rating.Again) {
        c.step = 0;
        c.due = stepDue(steps, 0);
        if (prev.st === State.Relearning) c.s = forgetStability(prev.d, prev.s, r ?? 1);
      } else if (g === Rating.Hard) {
        const cur = steps[Math.min(prev.step, steps.length - 1)];
        const nxt = steps[prev.step + 1];
        c.due = now + Math.round((nxt ? (cur + nxt) / 2 : cur * 1.5) * MIN);
      } else if (g === Rating.Good) {
        c.step = prev.step + 1;
        if (c.step >= steps.length) graduate(0);
        else c.due = stepDue(steps, c.step);
      } else {
        graduate(1);
      }
      if (g !== Rating.Again) c.d = nextDifficulty(prev.d, g);
    } else {
      // Review
      c.d = nextDifficulty(prev.d, g);
      if (g === Rating.Again) {
        c.s = forgetStability(prev.d, prev.s, r);
        c.lapses = prev.lapses + 1;
        c.st = State.Relearning;
        c.step = 0;
        c.ivl = 0;
        c.due = stepDue(o.relearnSteps, 0);
      } else {
        c.s = recallStability(prev.d, prev.s, r, g);
        graduate(0);
      }
    }
    c.reps = prev.reps + 1;
    c.last = now;
    return { card: c, r, elapsed };
  }

  /** Thời điểm đến hạn nếu chấm 1..4 (không ngẫu nhiên) — để hiện trên nút */
  function preview(card, now, opts) {
    const o = Object.assign({}, opts || {}, { fuzz: false });
    return [1, 2, 3, 4].map((g) => schedule(card, g, now, o).card.due - now);
  }

  root.SRS = {
    State,
    Rating,
    DEFAULTS,
    W,
    blank,
    recall,
    retrievability,
    schedule,
    preview,
    intervalDays: (s, opts) => intervalDays(s, Object.assign({}, DEFAULTS, opts || {})),
  };
})(typeof window !== "undefined" ? window : globalThis);
