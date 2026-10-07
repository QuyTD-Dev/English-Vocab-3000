/* 3000 từ vựng tiếng Anh — nhiều cách học (giao diện kế thừa từ web ôn tập FE) */
(() => {
  "use strict";

  /** Đổi mỗi lần cập nhật dữ liệu để trình duyệt không dùng JSON cũ */
  const DATA_VER = "20261007_v1";
  const LESSON_SIZE = 30;
  const DAY = 86400000;
  /** Khoảng ôn (ngày) theo hộp Leitner 0..7 */
  const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60];
  const MAX_BOX = INTERVALS.length - 1;
  /** Từ ở hộp ≥ 4 (ôn sau ≥ 7 ngày) được tính là "đã thuộc" */
  const MASTER_BOX = 4;
  const MATCH_SIZE = 6;
  const LIST_PAGE = 100;

  const KEY = {
    progress: "vocab3000_progress_v1",
    daily: "vocab3000_daily_v1",
    settings: "vocab3000_settings_v1",
    ui: "vocab3000_ui_v1",
    theme: "vocab3000_theme_v1",
  };

  const MODES = [
    { id: "flash", icon: "🃏", label: "Flashcard" },
    { id: "en2vi", icon: "🔤", label: "Anh → Việt" },
    { id: "vi2en", icon: "💬", label: "Việt → Anh" },
    { id: "listen", icon: "🎧", label: "Nghe chọn từ" },
    { id: "spell", icon: "✍️", label: "Gõ từ" },
    { id: "dictation", icon: "📝", label: "Nghe – viết" },
    { id: "fill2", icon: "🔀", label: "Chính tả 2 chọn 1" },
    { id: "tf", icon: "⚡", label: "Đúng / Sai nhanh" },
    { id: "match", icon: "🧩", label: "Ghép cặp" },
    { id: "speak", icon: "🎙", label: "Luyện phát âm" },
    { id: "list", icon: "📖", label: "Danh sách" },
    { id: "stats", icon: "📊", label: "Thống kê" },
  ];
  const MODE_TITLE = {
    flash: "Flashcard – lặp lại ngắt quãng",
    en2vi: "Trắc nghiệm Anh → Việt",
    vi2en: "Trắc nghiệm Việt → Anh",
    listen: "Nghe và chọn từ",
    spell: "Gõ từ theo nghĩa",
    dictation: "Nghe – viết chính tả",
    fill2: "Điền khuyết: chọn chính tả đúng",
    tf: "Đúng hay Sai?",
    match: "Ghép từ với nghĩa",
    speak: "Luyện phát âm",
  };
  const SCOPES = [
    ["today", "📅 Hôm nay (ôn + từ mới)"],
    ["lesson", "📚 Theo bài (30 từ)"],
    ["all", "🌐 Tất cả các từ"],
    ["new", "🆕 Chưa học"],
    ["learning", "🌱 Đang học"],
    ["due", "⏰ Cần ôn"],
    ["hard", "❗ Hay sai"],
    ["star", "★ Đánh dấu"],
    ["mastered", "✅ Đã thuộc"],
  ];
  const POS_VI = {
    n: "danh từ", v: "động từ", adj: "tính từ", adv: "trạng từ", prep: "giới từ",
    pron: "đại từ", det: "từ hạn định", conj: "liên từ", exclam: "thán từ",
    modal: "động từ khuyết thiếu", aux: "trợ động từ", number: "số từ",
    article: "mạo từ", prefix: "tiền tố", abbr: "viết tắt",
  };
  const MAIN_POS = new Set(["n", "v", "adj", "adv"]);

  const $ = (id) => document.getElementById(id);
  const els = {
    view: $("view"),
    statLine: $("statLine"),
    brandSub: $("brandSub"),
    scopeSel: $("scopeSel"),
    lessonPick: $("lessonPick"),
    lessonSel: $("lessonSel"),
    posSel: $("posSel"),
    modeBar: $("modeBar"),
    lessonMap: $("lessonMap"),
    mapCount: $("mapCount"),
  };

  // ---------------------------------------------------------------- storage
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* hết bộ nhớ / chế độ riêng tư */
    }
  }

  /** progress[id] = { b: hộp, d: hạn ôn (ms), s: số lần học, ok, bad, t: lần cuối, star } */
  let progress = load(KEY.progress, {});
  /** daily["YYYY-MM-DD"] = { n: lượt, ok, bad, nw: từ mới, extra: từ mới thêm } */
  let daily = load(KEY.daily, {});
  let settings = Object.assign(
    { accent: "en-US", voice: "", rate: 0.9, goal: 20, autoSpeak: true, autoNext: true },
    load(KEY.settings, {})
  );
  let ui = Object.assign(
    { mode: "flash", scope: "today", lesson: 1, pos: "all", reverse: false },
    load(KEY.ui, {})
  );

  const saveProgress = () => save(KEY.progress, progress);
  const saveUi = () => save(KEY.ui, ui);
  const saveSettings = () => save(KEY.settings, settings);

  // ---------------------------------------------------------------- data
  /** @type {{id:number, word:string, main:string, variants:string[], type:string, pos:string[], ipa:string, meaning:string, short:string, lesson:number}[]} */
  let words = [];
  let lessonCount = 0;
  let spellingSet = new Set();

  function variantsOf(word) {
    const extras = word.match(/\(([^)]*)\)/g) || [];
    const base = word.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const out = [];
    for (const part of base.split(",")) {
      const p = part.trim();
      if (!p) continue;
      out.push(p);
      for (const ex of extras) {
        const inner = ex.slice(1, -1).trim();
        if (/^(of|to|on|in|for|with|at)$/i.test(inner)) out.push(`${p} ${inner}`);
      }
    }
    return out.length ? [...new Set(out)] : [word];
  }

  function shortMeaning(m) {
    let s = (m.split(/;|\.\s/)[0] || m).trim();
    if (s.length > 72) s = s.slice(0, 70).replace(/[,\s][^,\s]*$/, "") + "…";
    return s || m;
  }

  function prepare(raw) {
    words = raw.map(([word, type, ipa, meaning], i) => {
      const variants = variantsOf(word);
      return {
        id: i + 1,
        word,
        main: variants[0],
        variants,
        type,
        pos: type.split(",").map((t) => t.trim()).filter(Boolean),
        ipa,
        meaning,
        short: shortMeaning(meaning),
        lesson: Math.floor(i / LESSON_SIZE) + 1,
      };
    });
    lessonCount = Math.ceil(words.length / LESSON_SIZE);
    spellingSet = new Set(words.flatMap((w) => w.variants.map((v) => v.toLowerCase())));
  }

  // ---------------------------------------------------------------- helpers
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Bỏ dấu tiếng Việt + chữ thường, dùng cho tìm kiếm */
  function fold(s) {
    return String(s || "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  /** Chuẩn hóa câu trả lời gõ tay / nhận dạng giọng nói */
  function normAnswer(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[’‘`´]/g, "'")
      .replace(/[.,!?;:"()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchesWord(w, text) {
    const t = normAnswer(text);
    return !!t && w.variants.some((v) => normAnswer(v) === t);
  }

  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function posLabel(w) {
    return w.pos.map((p) => POS_VI[p] || p).join(", ");
  }

  function fmtDays(d) {
    if (d < 1) return "< 1 phút";
    if (d < 30) return `${d} ngày`;
    return `${Math.round(d / 30)} tháng`;
  }

  // ---------------------------------------------------------------- speech
  const canSpeak = "speechSynthesis" in window;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  function englishVoices() {
    if (!canSpeak) return [];
    return speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang) || v.lang === "en");
  }

  function pickVoice() {
    const vs = englishVoices();
    if (settings.voice) {
      const v = vs.find((x) => x.name === settings.voice);
      if (v) return v;
    }
    const want = settings.accent.toLowerCase();
    return (
      vs.find((v) => v.lang.replace("_", "-").toLowerCase() === want && v.localService) ||
      vs.find((v) => v.lang.replace("_", "-").toLowerCase() === want) ||
      vs[0] ||
      null
    );
  }

  function spokenText(w) {
    return w.main.replace(/\bsth\b/g, "something").replace(/\bsb\b/g, "somebody").replace(/-$/, "");
  }

  function speak(text, rate) {
    if (!canSpeak || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v ? v.lang : settings.accent;
    u.rate = rate || settings.rate;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  const speakWord = (w, rate) => speak(spokenText(w), rate);

  // ---------------------------------------------------------------- spaced repetition
  function rec(w) {
    return progress[w.id] || null;
  }

  function status(w) {
    const r = rec(w);
    if (!r || !r.s) return "new";
    return r.b >= MASTER_BOX ? "mastered" : "learning";
  }

  function isDue(w, now = Date.now()) {
    const r = rec(w);
    return !!(r && r.s && r.d <= now);
  }

  function dayLog() {
    const k = todayKey();
    if (!daily[k]) daily[k] = { n: 0, ok: 0, bad: 0, nw: 0, extra: 0 };
    return daily[k];
  }

  function logDay(ok, wasNew) {
    const d = dayLog();
    d.n++;
    if (ok) d.ok++;
    else d.bad++;
    if (wasNew) d.nw++;
    save(KEY.daily, daily);
  }

  /** q: 0 = quên/sai, 1 = khó, 2 = nhớ, 3 = dễ */
  function nextBox(r, q) {
    const b = r ? r.b : 0;
    if (q === 0) return 0;
    if (q === 1) return Math.max(1, b);
    if (q === 2) return Math.min(MAX_BOX, b + 1);
    return Math.min(MAX_BOX, b + 2);
  }

  function grade(w, q) {
    const now = Date.now();
    const r = progress[w.id] || { b: 0, d: 0, s: 0, ok: 0, bad: 0 };
    const wasNew = !r.s;
    r.b = nextBox(r, q);
    r.d = q === 0 ? now + 60000 : now + INTERVALS[r.b] * DAY;
    if (q === 0) r.bad++;
    else r.ok++;
    r.s++;
    r.t = now;
    progress[w.id] = r;
    logDay(q > 0, wasNew);
    saveProgress();
  }

  /** Kết quả từ các chế độ trắc nghiệm: đúng thì lên hộp (nếu đến hạn/từ mới), sai thì về hộp 0 */
  function recordQuiz(w, correct) {
    const r = rec(w);
    if (!correct) return grade(w, 0);
    if (!r || !r.s || r.d <= Date.now()) return grade(w, 2);
    r.ok++;
    r.t = Date.now();
    logDay(true, false);
    saveProgress();
  }

  function toggleStar(w) {
    const r = progress[w.id] || { b: 0, d: 0, s: 0, ok: 0, bad: 0 };
    r.star = !r.star;
    progress[w.id] = r;
    saveProgress();
  }

  function streak() {
    const d = new Date();
    if (!daily[todayKey(d)]?.n) d.setDate(d.getDate() - 1);
    let n = 0;
    while (daily[todayKey(d)]?.n) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  // ---------------------------------------------------------------- scope & queue
  function posOk(w) {
    if (ui.pos === "all") return true;
    if (ui.pos === "other") return !w.pos.some((p) => MAIN_POS.has(p));
    return w.pos.includes(ui.pos);
  }

  function newAllowanceToday() {
    const d = daily[todayKey()] || {};
    return Math.max(0, settings.goal + (d.extra || 0) - (d.nw || 0));
  }

  function scopeWords() {
    const now = Date.now();
    const list = words.filter(posOk);
    switch (ui.scope) {
      case "lesson":
        return list.filter((w) => w.lesson === ui.lesson);
      case "new":
        return list.filter((w) => status(w) === "new");
      case "learning":
        return list.filter((w) => status(w) === "learning");
      case "due":
        return list.filter((w) => isDue(w, now));
      case "hard":
        return list
          .filter((w) => (rec(w)?.bad || 0) > 0)
          .sort((a, b) => rec(b).bad - rec(b).ok / 2 - (rec(a).bad - rec(a).ok / 2));
      case "star":
        return list.filter((w) => rec(w)?.star);
      case "mastered":
        return list.filter((w) => status(w) === "mastered");
      case "today": {
        const due = list.filter((w) => isDue(w, now));
        const fresh = list.filter((w) => status(w) === "new").slice(0, newAllowanceToday());
        return [...due, ...fresh];
      }
      default:
        return list;
    }
  }

  let queue = [];
  let qpos = 0;
  let cur = null;
  let session = { ok: 0, bad: 0, wrong: new Map() };
  let advanceTimer = 0;

  function buildQueue(list) {
    clearTimeout(advanceTimer);
    let q = list || scopeWords();
    if (!list) {
      if (ui.scope === "today") {
        const due = shuffle(q.filter((w) => status(w) !== "new"));
        q = [...due, ...q.filter((w) => status(w) === "new")];
      } else if (!(ui.scope === "lesson" && ui.mode === "flash")) {
        q = shuffle(q.slice());
      }
    }
    queue = q;
    qpos = 0;
    cur = null;
    match = null;
    session = { ok: 0, bad: 0, wrong: new Map() };
  }

  function next() {
    clearTimeout(advanceTimer);
    if (qpos < queue.length) qpos++;
    cur = null;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function noteResult(w, correct) {
    if (correct) session.ok++;
    else {
      session.bad++;
      session.wrong.set(w.id, w);
    }
  }

  // ---------------------------------------------------------------- question builders
  function distractors(w, n, similar = false) {
    const pool = words.filter(
      (x) => x.id !== w.id && x.short !== w.short && x.main.toLowerCase() !== w.main.toLowerCase()
    );
    let cands = similar
      ? pool.filter(
          (x) =>
            x.main[0]?.toLowerCase() === w.main[0]?.toLowerCase() &&
            Math.abs(x.main.length - w.main.length) <= 2
        )
      : pool.filter((x) => x.pos[0] === w.pos[0]);
    if (cands.length < n * 3) cands = pool;
    const out = [];
    const tried = new Set();
    while (out.length < n && tried.size < cands.length) {
      const x = cands[Math.floor(Math.random() * cands.length)];
      if (tried.has(x.id)) continue;
      tried.add(x.id);
      if (out.some((o) => o.short === x.short || o.main === x.main)) continue;
      out.push(x);
    }
    return out;
  }

  /** Tạo một cách viết sai trông hợp lý (dùng cho chế độ chính tả 2 lựa chọn) */
  function misspell(word) {
    const w = word.toLowerCase();
    if (!/^[a-z]{4,}$/.test(w)) return null;
    const ops = [
      (s) => s.replace(/([bcdfgklmnprstz])\1/, "$1"),
      (s) => s.replace(/([aeiou])([bcdfglmnprt])([aeiou])/, "$1$2$2$3"),
      (s) => s.replace(/ie/, "ei"),
      (s) => s.replace(/ei/, "ie"),
      (s) => s.replace(/tion$/, "sion"),
      (s) => s.replace(/sion$/, "tion"),
      (s) => s.replace(/able$/, "ible"),
      (s) => s.replace(/ible$/, "able"),
      (s) => s.replace(/ance$/, "ence"),
      (s) => s.replace(/ence$/, "ance"),
      (s) => s.replace(/ant$/, "ent"),
      (s) => s.replace(/ent$/, "ant"),
      (s) => s.replace(/ph/, "f"),
      (s) => s.replace(/c(?=[eiy])/, "s"),
      (s) => s.replace(/ou/, "o"),
      (s) => s.replace(/ea/, "ee"),
      (s) => s.replace(/y$/, "ie"),
      (s) => s.replace(/ly$/, "ley"),
      (s) => s.replace(/er$/, "ar"),
      (s) => s.replace(/or$/, "er"),
      (s) => {
        const i = 1 + Math.floor(Math.random() * (s.length - 3));
        return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
      },
      (s) => {
        const m = [...s.matchAll(/[aeiou]/g)].filter((x) => x.index > 0 && x.index < s.length - 1);
        if (!m.length) return s;
        const i = m[Math.floor(Math.random() * m.length)].index;
        return s.slice(0, i) + s.slice(i + 1);
      },
    ];
    for (const op of shuffle(ops)) {
      const out = op(w);
      if (out && out !== w && !spellingSet.has(out)) {
        return word[0] === word[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
      }
    }
    return null;
  }

  function makeQuestion(w) {
    const q = { mode: ui.mode, w, answered: false, correct: null };
    switch (ui.mode) {
      case "flash":
        q.flipped = false;
        q.reverse = ui.reverse;
        break;
      case "en2vi":
      case "vi2en":
      case "listen": {
        const opts = shuffle([w, ...distractors(w, 3, ui.mode === "listen")]);
        q.options = opts.map((x) => (ui.mode === "en2vi" ? x.short : x.main));
        q.answer = opts.indexOf(w);
        break;
      }
      case "fill2": {
        let wrong = misspell(w.main);
        if (!wrong) wrong = distractors(w, 1, true)[0]?.main || "—";
        q.options = shuffle([w.main, wrong]);
        q.answer = q.options.indexOf(w.main);
        break;
      }
      case "tf": {
        q.truth = Math.random() < 0.5;
        q.shown = q.truth ? w : distractors(w, 1)[0] || w;
        if (q.shown === w) q.truth = true;
        break;
      }
      case "spell":
      case "dictation":
        q.hints = 0;
        q.typed = "";
        break;
      case "speak":
        q.heard = [];
        q.listening = false;
        break;
    }
    return q;
  }

  // ---------------------------------------------------------------- answering
  function finish(correct) {
    if (!cur || cur.answered) return;
    cur.answered = true;
    cur.correct = correct;
    recordQuiz(cur.w, correct);
    noteResult(cur.w, correct);
    if (settings.autoSpeak && ["vi2en", "spell", "fill2", "tf"].includes(ui.mode)) speakWord(cur.w);
    render();
    if (correct && settings.autoNext && ui.mode !== "speak") {
      const token = cur;
      advanceTimer = setTimeout(() => {
        if (cur === token) next();
      }, 1100);
    }
  }

  function choose(i) {
    if (!cur || cur.answered || !cur.options || i < 0 || i >= cur.options.length) return;
    cur.chosen = i;
    finish(i === cur.answer);
  }

  function gradeFlash(q) {
    if (!cur || !cur.flipped || cur.answered) return;
    cur.answered = true;
    grade(cur.w, q);
    noteResult(cur.w, q > 0);
    if (q === 0) {
      // Quên: cho từ quay lại sau vài thẻ trong cùng phiên
      queue.splice(Math.min(queue.length, qpos + 4), 0, cur.w);
    }
    next();
  }

  function flip() {
    if (!cur || cur.mode !== "flash" || cur.flipped) return;
    cur.flipped = true;
    if (cur.reverse && settings.autoSpeak) speakWord(cur.w);
    render();
  }

  function submitTyped(text) {
    if (!cur || cur.answered) return;
    cur.typed = text.trim();
    if (!cur.typed) return;
    finish(matchesWord(cur.w, cur.typed));
  }

  function dontKnow() {
    if (!cur || cur.answered) return;
    if (cur.mode === "flash") {
      if (!cur.flipped) flip();
      return;
    }
    cur.chosen = -1;
    finish(false);
  }

  // ---------------------------------------------------------------- rendering: shared parts
  function speakBtn(label = "🔊", extra = "") {
    return canSpeak
      ? `<button type="button" class="btn speak-btn ${extra}" data-act="speak" title="Nghe phát âm (R)">${label}</button>`
      : "";
  }

  function dictLinks(w) {
    const q = encodeURIComponent(w.main.toLowerCase());
    return `<div class="dict-links">
      <a href="https://dictionary.cambridge.org/dictionary/english-vietnamese/${q}" target="_blank" rel="noopener">Cambridge</a>
      <a href="https://www.oxfordlearnersdictionaries.com/search/english/?q=${q}" target="_blank" rel="noopener">Oxford</a>
      <a href="https://youglish.com/pronounce/${q}/english" target="_blank" rel="noopener">YouGlish (nghe trong video)</a>
    </div>`;
  }

  function wordInfo(w) {
    const r = rec(w);
    const st = status(w);
    const stText = { new: "Chưa học", learning: "Đang học", mastered: "Đã thuộc" }[st];
    const due = r && r.s ? (r.d <= Date.now() ? "cần ôn ngay" : `ôn lại sau ${fmtDays(Math.round((r.d - Date.now()) / DAY))}`) : "";
    return `<div class="word-info">
      <div class="wi-head">
        <span class="wi-word">${escapeHtml(w.word)}</span>
        ${speakBtn("🔊", "small")}
        ${w.ipa ? `<span class="wi-ipa">/${escapeHtml(w.ipa)}/</span>` : ""}
      </div>
      ${w.type ? `<div class="wi-pos"><span class="pos-tag">${escapeHtml(w.type)}</span> ${escapeHtml(posLabel(w))}</div>` : ""}
      <div class="wi-meaning">${escapeHtml(w.meaning)}</div>
      <div class="wi-meta"><span class="badge st-${st}">${stText}</span>${due ? ` · ${due}` : ""}${r?.s ? ` · đúng ${r.ok}/sai ${r.bad}` : ""} · Bài ${w.lesson}</div>
      ${dictLinks(w)}
    </div>`;
  }

  function cardShell({ code, hint, body, nav, after = "" }) {
    const w = cur?.w;
    const starred = w && rec(w)?.star;
    const posText = queue.length ? `${Math.min(qpos + 1, queue.length)}/${queue.length}` : "";
    const pct = queue.length ? Math.round((qpos / queue.length) * 100) : 0;
    return `<article class="exam-card vocab-card">
      <div class="card-header">
        <span class="card-code">${escapeHtml(code)}</span>
        <span class="card-sep">|</span>
        <span class="card-qnum">${w ? `Từ #${w.id} · Bài ${w.lesson}` : ""}</span>
        <span class="card-pos">${posText}</span>
      </div>
      <div class="session-bar"><div style="width:${pct}%"></div></div>
      ${hint ? `<p class="card-choose">${hint}</p>` : ""}
      ${body}
      <div class="card-nav">
        ${w ? `<button type="button" class="btn ${starred ? "starred" : ""}" id="btnStar" data-act="star" title="Đánh dấu từ">${starred ? "★" : "☆"}</button>` : ""}
        ${nav}
      </div>
      ${after}
    </article>`;
  }

  function feedbackHtml(text) {
    if (!cur?.answered) return "";
    const ok = cur.correct;
    return `<div class="card-feedback ${ok ? "ok" : "bad"}">${ok ? "✓ Chính xác!" : "✗ Chưa đúng."} ${text || ""}</div>
      <div class="card-explain ${ok ? "" : "explain-wrong"}"><strong>Thông tin từ</strong>${wordInfo(cur.w)}</div>`;
  }

  function navNext(labelBefore = "Bỏ qua") {
    const answered = cur?.answered;
    return `${answered ? "" : `<button type="button" class="btn" data-act="dontknow">Không biết</button>`}
      <button type="button" class="btn primary" id="btnNext" data-act="next">${answered ? "Tiếp →" : labelBefore + " →"}</button>`;
  }

  function optionsHtml(texts, { big = false } = {}) {
    const letters = "ABCD";
    return `<div class="card-options ${big ? "opts-big" : ""} ${texts.length === 2 ? "opts-two" : ""}">
      ${texts
        .map((t, i) => {
          let cls = "opt";
          if (cur.answered) {
            if (i === cur.answer) cls += " correct";
            else if (i === cur.chosen) cls += " wrong";
          }
          return `<button type="button" class="${cls}" data-act="opt" data-i="${i}" ${cur.answered ? "disabled" : ""}>
            <span class="opt-letter">${letters[i]}.</span><span class="opt-text">${escapeHtml(t)}</span></button>`;
        })
        .join("")}
    </div>`;
  }

  // ---------------------------------------------------------------- rendering: modes
  function renderFlash() {
    const w = cur.w;
    const front = cur.reverse
      ? `<div class="flash-face">
          <div class="vocab-meaning-big">${escapeHtml(w.meaning)}</div>
          ${w.type ? `<div class="wi-pos"><span class="pos-tag">${escapeHtml(w.type)}</span> ${escapeHtml(posLabel(w))}</div>` : ""}
        </div>`
      : `<div class="flash-face">
          <div class="vocab-word">${escapeHtml(w.word)}</div>
          ${w.ipa ? `<div class="vocab-ipa">/${escapeHtml(w.ipa)}/</div>` : ""}
          ${speakBtn("🔊 Nghe")}
        </div>`;
    const body = cur.flipped
      ? `<div class="flash-card flipped">${front}<div class="flash-back">${wordInfo(w)}</div></div>`
      : `<div class="flash-card" role="button" tabindex="0" data-act="flip" aria-label="Lật thẻ">${front}
          <span class="flash-tip">Nhớ lại ${cur.reverse ? "từ tiếng Anh" : "nghĩa"} trong đầu, rồi bấm để lật (Space)</span></div>`;
    const r = rec(w);
    const labels = ["Quên", "Khó", "Nhớ", "Dễ"];
    const nav = cur.flipped
      ? `<div class="grade-row">${labels
          .map(
            (l, q) => `<button type="button" class="btn grade g${q}" data-act="grade" data-q="${q}">
              <b>${l}</b><small>${q === 0 ? "< 1 phút" : fmtDays(INTERVALS[nextBox(r, q)])}</small><kbd>${q + 1}</kbd></button>`
          )
          .join("")}</div>`
      : `<button type="button" class="btn" data-act="reverse" title="Đổi mặt trước của thẻ">${cur.reverse ? "Mặt trước: Tiếng Việt" : "Mặt trước: Tiếng Anh"} ⇄</button>
         <button type="button" class="btn primary" id="btnNext" data-act="flip">Lật thẻ</button>`;
    return cardShell({
      code: "FLASHCARD",
      hint: status(w) === "new" ? "🆕 Từ mới – hãy đọc to và đoán nghĩa trước khi lật" : "⏰ Ôn tập – bạn còn nhớ từ này không?",
      body,
      nav,
    });
  }

  function renderChoice() {
    const w = cur.w;
    let prompt = "";
    let hint = "";
    if (ui.mode === "en2vi") {
      hint = "Chọn nghĩa đúng của từ (phím 1–4)";
      prompt = `<div class="vocab-prompt"><div class="vocab-word">${escapeHtml(w.word)}</div>
        ${w.ipa ? `<div class="vocab-ipa">/${escapeHtml(w.ipa)}/ ${speakBtn("🔊", "small")}</div>` : speakBtn("🔊", "small")}
        ${w.type ? `<div class="wi-pos"><span class="pos-tag">${escapeHtml(w.type)}</span></div>` : ""}</div>`;
    } else if (ui.mode === "vi2en") {
      hint = "Chọn từ tiếng Anh đúng (phím 1–4)";
      prompt = `<div class="vocab-prompt"><div class="vocab-meaning-big">${escapeHtml(w.meaning)}</div>
        ${w.type ? `<div class="wi-pos"><span class="pos-tag">${escapeHtml(w.type)}</span> ${escapeHtml(posLabel(w))}</div>` : ""}</div>`;
    } else if (ui.mode === "listen") {
      hint = "Nghe và chọn từ bạn nghe được (R: nghe lại)";
      prompt = `<div class="vocab-prompt listen-prompt">
        ${speakBtn("🔊 Nghe lại", "big")}
        ${canSpeak ? `<button type="button" class="btn speak-btn" data-act="slow">🐢 Đọc chậm</button>` : `<p class="warn">Trình duyệt không hỗ trợ giọng đọc.</p>`}
      </div>`;
    } else if (ui.mode === "fill2") {
      hint = "Điền khuyết – chọn cách viết đúng (phím 1–2)";
      prompt = `<div class="vocab-prompt"><div class="fill-sentence">“${escapeHtml(w.short)}” trong tiếng Anh là <span class="blank">${cur.answered ? escapeHtml(w.main) : "_____"}</span></div>
        ${w.ipa ? `<div class="vocab-ipa">/${escapeHtml(w.ipa)}/</div>` : ""}</div>`;
    }
    const extra = ui.mode === "en2vi" ? `Đáp án: ${escapeHtml(w.short)}` : `Đáp án: ${escapeHtml(w.main)}`;
    return cardShell({
      code: MODE_TITLE[ui.mode].toUpperCase(),
      hint,
      body: prompt + optionsHtml(cur.options, { big: ui.mode !== "en2vi" }),
      nav: navNext(),
      after: feedbackHtml(cur.answered && !cur.correct ? extra : ""),
    });
  }

  function hintPattern(w, n) {
    const t = w.main;
    let shown = 0;
    return t
      .split("")
      .map((ch) => {
        if (!/[a-z]/i.test(ch)) return ch === " " ? "&nbsp;&nbsp;" : escapeHtml(ch);
        shown++;
        return shown <= n ? escapeHtml(ch) : "_";
      })
      .join(" ");
  }

  function renderTyped() {
    const w = cur.w;
    const dict = ui.mode === "dictation";
    const prompt = dict
      ? `<div class="vocab-prompt listen-prompt">
          ${speakBtn("🔊 Nghe lại", "big")}
          ${canSpeak ? `<button type="button" class="btn speak-btn" data-act="slow">🐢 Đọc chậm</button>` : `<p class="warn">Trình duyệt không hỗ trợ giọng đọc.</p>`}
        </div>`
      : `<div class="vocab-prompt"><div class="vocab-meaning-big">${escapeHtml(w.meaning)}</div>
          ${w.type ? `<div class="wi-pos"><span class="pos-tag">${escapeHtml(w.type)}</span> ${escapeHtml(posLabel(w))}</div>` : ""}
          ${w.ipa ? `<div class="vocab-ipa">/${escapeHtml(w.ipa)}/</div>` : ""}</div>`;
    const pattern =
      cur.hints > 0 || cur.answered
        ? `<div class="hint-pattern">${cur.answered ? hintPattern(w, 999) : hintPattern(w, cur.hints - 1)}</div>`
        : "";
    const form = `<form class="fill-wrap" data-form="typed" autocomplete="off">
        <input type="text" class="fill-input ${cur.answered ? (cur.correct ? "correct" : "wrong") : ""}" name="ans"
          placeholder="Gõ từ tiếng Anh…" autocapitalize="off" autocorrect="off" spellcheck="false"
          value="${escapeHtml(cur.typed)}" ${cur.answered ? "disabled" : ""} />
        <button type="submit" class="btn primary" ${cur.answered ? "disabled" : ""}>Kiểm tra</button>
      </form>`;
    const nav = `${cur.answered ? "" : `<button type="button" class="btn" data-act="hint">💡 Gợi ý</button>`}${navNext()}`;
    return cardShell({
      code: MODE_TITLE[ui.mode].toUpperCase(),
      hint: dict ? "Nghe rồi gõ lại từ (Enter để kiểm tra)" : "Gõ từ tiếng Anh có nghĩa sau (Enter để kiểm tra)",
      body: prompt + pattern + form,
      nav,
      after: feedbackHtml(cur.answered && !cur.correct ? `Bạn gõ “${escapeHtml(cur.typed || "—")}”, đáp án: <b>${escapeHtml(w.main)}</b>` : ""),
    });
  }

  function renderTf() {
    const s = cur.shown;
    const body = `<div class="vocab-prompt tf-prompt">
        <div class="vocab-word">${escapeHtml(cur.w.word)} ${speakBtn("🔊", "small")}</div>
        <div class="tf-eq">có nghĩa là</div>
        <div class="vocab-meaning-big">${escapeHtml(s.short)}</div>
      </div>
      <div class="tf-row">
        <button type="button" class="btn tf-btn tf-yes ${cur.answered && cur.truth ? "is-answer" : ""}" data-act="tf" data-v="1" ${cur.answered ? "disabled" : ""}>✓ Đúng <kbd>D</kbd></button>
        <button type="button" class="btn tf-btn tf-no ${cur.answered && !cur.truth ? "is-answer" : ""}" data-act="tf" data-v="0" ${cur.answered ? "disabled" : ""}>✗ Sai <kbd>S</kbd></button>
      </div>
      <p class="combo">Chuỗi đúng liên tiếp: <b>${tfCombo}</b></p>`;
    return cardShell({
      code: "ĐÚNG / SAI NHANH",
      hint: "Phản xạ nhanh: cặp từ – nghĩa này đúng hay sai?",
      body,
      nav: navNext("Bỏ qua").replace(/<button[^>]*data-act="dontknow"[^>]*>[^<]*<\/button>/, ""),
      after: feedbackHtml(cur.answered && !cur.truth ? `Nghĩa đúng của “${escapeHtml(cur.w.main)}” là: ${escapeHtml(cur.w.short)}` : ""),
    });
  }
  let tfCombo = 0;

  function renderSpeak() {
    const w = cur.w;
    let micArea;
    if (!Recognition) {
      micArea = `<p class="warn">Trình duyệt này chưa hỗ trợ nhận dạng giọng nói. Hãy mở bằng Chrome hoặc Edge trên máy tính / Android.
        Bạn vẫn có thể nghe mẫu, đọc theo rồi tự chấm.</p>
        <div class="tf-row">
          <button type="button" class="btn tf-btn tf-yes" data-act="selfgrade" data-v="1" ${cur.answered ? "disabled" : ""}>Tôi đọc đúng</button>
          <button type="button" class="btn tf-btn tf-no" data-act="selfgrade" data-v="0" ${cur.answered ? "disabled" : ""}>Chưa chuẩn</button>
        </div>`;
    } else {
      micArea = `<button type="button" class="btn mic-btn ${cur.listening ? "is-on" : ""}" data-act="mic">
          ${cur.listening ? "🎙 Đang nghe… hãy nói" : "🎙 Bấm và đọc từ này"}</button>
        ${cur.heard.length ? `<p class="heard">Máy nghe được: <b>${escapeHtml(cur.heard[0])}</b>${cur.heard.length > 1 ? ` <span class="muted">(hoặc: ${cur.heard.slice(1, 3).map(escapeHtml).join(", ")})</span>` : ""}</p>` : ""}`;
    }
    const body = `<div class="vocab-prompt">
        <div class="vocab-word">${escapeHtml(w.word)}</div>
        ${w.ipa ? `<div class="vocab-ipa">/${escapeHtml(w.ipa)}/</div>` : ""}
        <div class="wi-meaning center">${escapeHtml(w.short)}</div>
        <div class="listen-prompt">${speakBtn("🔊 Nghe mẫu")}${canSpeak ? `<button type="button" class="btn speak-btn" data-act="slow">🐢 Chậm</button>` : ""}</div>
      </div>
      <div class="mic-area">${micArea}</div>`;
    return cardShell({
      code: "LUYỆN PHÁT ÂM",
      hint: "Nghe mẫu → đọc to → máy kiểm tra (nói lại bao nhiêu lần cũng được)",
      body,
      nav: navNext("Bỏ qua").replace(/<button[^>]*data-act="dontknow"[^>]*>[^<]*<\/button>/, ""),
      after: cur.answered
        ? `<div class="card-feedback ${cur.correct ? "ok" : "bad"}">${cur.correct ? "✓ Phát âm được nhận diện chính xác!" : "✗ Máy chưa nhận ra đúng từ – nghe mẫu và thử lại nhé."}</div>`
        : "",
    });
  }

  // ---- Ghép cặp
  let match = null;

  function newMatch() {
    const chunk = queue.slice(qpos, qpos + MATCH_SIZE);
    if (chunk.length < 2) {
      match = null;
      return;
    }
    match = {
      words: chunk,
      left: shuffle(chunk.slice()),
      right: shuffle(chunk.slice()),
      sel: null,
      done: new Set(),
      errors: new Map(),
      flash: null,
      start: Date.now(),
      end: 0,
    };
  }

  function renderMatch() {
    if (!match) newMatch();
    if (!match) return renderSummary();
    const m = match;
    const item = (w, side) => {
      const id = `${side}${w.id}`;
      let cls = "match-item";
      if (m.done.has(w.id)) cls += " done";
      if (m.sel === id) cls += " sel";
      if (m.flash && m.flash.includes(id)) cls += " wrong";
      const text = side === "L" ? w.main : w.short;
      return `<button type="button" class="${cls}" data-act="match" data-k="${id}" ${m.done.has(w.id) ? "disabled" : ""}>${escapeHtml(text)}</button>`;
    };
    const finished = m.done.size === m.words.length;
    const errs = [...m.errors.values()].reduce((a, b) => a + b, 0);
    const body = `<div class="match-grid">
        <div class="match-col">${m.left.map((w) => item(w, "L")).join("")}</div>
        <div class="match-col">${m.right.map((w) => item(w, "R")).join("")}</div>
      </div>
      ${finished ? `<div class="card-feedback ${errs ? "bad" : "ok"}">🎉 Xong ván trong ${Math.round((m.end - m.start) / 1000)} giây, ${errs} lần ghép nhầm.</div>` : ""}`;
    const posText = `${Math.min(qpos + m.words.length, queue.length)}/${queue.length}`;
    return `<article class="exam-card vocab-card">
      <div class="card-header"><span class="card-code">GHÉP CẶP</span><span class="card-sep">|</span>
        <span class="card-qnum">${m.words.length} cặp</span><span class="card-pos">${posText}</span></div>
      <div class="session-bar"><div style="width:${Math.round((qpos / queue.length) * 100)}%"></div></div>
      <p class="card-choose">Bấm một từ bên trái rồi bấm nghĩa tương ứng bên phải</p>
      ${body}
      <div class="card-nav">
        <button type="button" class="btn" data-act="match-reset">↺ Xáo lại</button>
        <button type="button" class="btn primary" id="btnNext" data-act="match-next">${finished ? "Ván tiếp →" : "Bỏ qua ván →"}</button>
      </div>
    </article>`;
  }

  function clickMatch(k) {
    const m = match;
    if (!m) return;
    const side = k[0];
    const id = Number(k.slice(1));
    if (m.done.has(id)) return;
    if (!m.sel || m.sel[0] === side) {
      m.sel = m.sel === k ? null : k;
      if (side === "L") speakWord(words[id - 1]);
      render();
      return;
    }
    const otherId = Number(m.sel.slice(1));
    if (otherId === id) {
      m.done.add(id);
      m.sel = null;
      if (m.done.size === m.words.length) {
        m.end = Date.now();
        for (const w of m.words) {
          const ok = !m.errors.get(w.id);
          recordQuiz(w, ok);
          noteResult(w, ok);
        }
      }
    } else {
      // tính lỗi cho từ (cột trái) bị ghép nhầm
      const leftId = side === "L" ? id : otherId;
      m.errors.set(leftId, (m.errors.get(leftId) || 0) + 1);
      m.flash = [m.sel, k];
      m.sel = null;
      setTimeout(() => {
        if (match === m) {
          m.flash = null;
          render();
        }
      }, 450);
    }
    render();
  }

  // ---- Màn hình trống / tổng kết
  function renderEmpty() {
    const today = ui.scope === "today";
    return `<article class="exam-card vocab-card empty-card">
      <div class="big-emoji">${today ? "🎉" : "📭"}</div>
      <h2>${today ? "Bạn đã xong mục tiêu hôm nay!" : "Không có từ nào trong phạm vi này"}</h2>
      <p class="muted">${today ? "Không còn từ đến hạn ôn và đã đủ số từ mới. Học thêm hoặc chọn phạm vi khác." : "Thử chọn phạm vi hoặc từ loại khác ở thanh phía trên."}</p>
      <div class="sync-actions center">
        ${today ? `<button type="button" class="btn primary" data-act="more-new">+ Học thêm 10 từ mới</button>` : ""}
        <button type="button" class="btn" data-act="scope" data-v="lesson">📚 Học theo bài</button>
        <button type="button" class="btn" data-act="scope" data-v="all">🌐 Tất cả các từ</button>
      </div>
    </article>`;
  }

  function renderSummary() {
    const total = session.ok + session.bad;
    const pct = total ? Math.round((session.ok / total) * 100) : 0;
    const wrong = [...session.wrong.values()];
    return `<article class="exam-card vocab-card empty-card">
      <div class="big-emoji">${pct >= 80 ? "🏆" : pct >= 50 ? "💪" : "📘"}</div>
      <h2>Hoàn thành phiên học!</h2>
      <p class="summary-line"><span class="ok">✓ ${session.ok} đúng</span> · <span class="bad">✗ ${session.bad} sai</span> · ${pct}% chính xác</p>
      ${
        wrong.length
          ? `<div class="wrong-list"><strong>Các từ cần chú ý</strong>${wrong
              .map(
                (w) => `<div class="wrong-item"><button type="button" class="btn small" data-act="speak-id" data-id="${w.id}">🔊</button>
                  <b>${escapeHtml(w.word)}</b> <span class="muted">/${escapeHtml(w.ipa)}/</span> – ${escapeHtml(w.short)}</div>`
              )
              .join("")}</div>`
          : ""
      }
      <div class="sync-actions center">
        ${wrong.length ? `<button type="button" class="btn primary" data-act="retry-wrong">🔁 Ôn lại ${wrong.length} từ sai</button>` : ""}
        <button type="button" class="btn ${wrong.length ? "" : "primary"}" data-act="restart">▶ Phiên mới</button>
        <button type="button" class="btn" data-act="mode" data-v="${ui.mode === "flash" ? "en2vi" : "flash"}">Đổi sang ${ui.mode === "flash" ? "🔤 Anh → Việt" : "🃏 Flashcard"}</button>
      </div>
    </article>`;
  }

  // ---- Danh sách / tra cứu
  let listQuery = "";
  let listLimit = LIST_PAGE;

  function listMatches() {
    const q = fold(listQuery.trim());
    const base = q ? words.filter(posOk) : scopeWords();
    if (!q) return base;
    return base.filter((w) => fold(w.word).includes(q) || fold(w.meaning).includes(q));
  }

  function renderList() {
    const all = listMatches();
    const rows = all.slice(0, listLimit);
    const stText = { new: "Chưa học", learning: "Đang học", mastered: "Đã thuộc" };
    return `<article class="exam-card vocab-card">
      <div class="card-header"><span class="card-code">DANH SÁCH TỪ</span><span class="card-sep">|</span>
        <span class="card-qnum">${all.length} từ ${listQuery ? "khớp tìm kiếm (mọi bài)" : "trong phạm vi"}</span></div>
      <div class="search-input-wrap list-search">
        <span class="search-icon">🔍</span>
        <input type="search" id="listSearch" placeholder="Tìm từ tiếng Anh hoặc nghĩa tiếng Việt (gõ không dấu cũng được)…" value="${escapeHtml(listQuery)}" autocomplete="off" spellcheck="false" />
      </div>
      <div class="vocab-table" role="table">
        ${rows
          .map((w) => {
            const st = status(w);
            const star = rec(w)?.star;
            return `<div class="vrow" role="row">
              <span class="vno">${w.id}</span>
              <button type="button" class="btn small" data-act="speak-id" data-id="${w.id}" aria-label="Nghe ${escapeHtml(w.main)}">🔊</button>
              <span class="vword"><b>${escapeHtml(w.word)}</b> ${w.type ? `<span class="pos-tag">${escapeHtml(w.type)}</span>` : ""}<br><span class="muted">${w.ipa ? `/${escapeHtml(w.ipa)}/` : ""}</span></span>
              <span class="vmean">${escapeHtml(w.meaning)}</span>
              <span class="badge st-${st}">${stText[st]}</span>
              <button type="button" class="btn small star-btn ${star ? "starred" : ""}" data-act="star-id" data-id="${w.id}" aria-label="Đánh dấu">${star ? "★" : "☆"}</button>
            </div>`;
          })
          .join("")}
        ${rows.length ? "" : `<p class="q-map-empty">Không tìm thấy từ nào.</p>`}
      </div>
      ${all.length > rows.length ? `<div class="sync-actions center"><button type="button" class="btn" data-act="list-more">Xem thêm (${all.length - rows.length} từ)</button></div>` : ""}
    </article>`;
  }

  // ---- Thống kê
  function renderStats() {
    let nNew = 0, nLearn = 0, nMaster = 0, nDue = 0, ok = 0, bad = 0;
    const boxes = new Array(MAX_BOX + 1).fill(0);
    const now = Date.now();
    for (const w of words) {
      const st = status(w);
      if (st === "new") nNew++;
      else {
        if (st === "mastered") nMaster++;
        else nLearn++;
        boxes[rec(w).b]++;
        if (isDue(w, now)) nDue++;
      }
      const r = rec(w);
      if (r) {
        ok += r.ok || 0;
        bad += r.bad || 0;
      }
    }
    const acc = ok + bad ? Math.round((ok / (ok + bad)) * 100) : 0;
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = todayKey(d);
      days.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, n: daily[k]?.n || 0, nw: daily[k]?.nw || 0 });
    }
    const maxN = Math.max(1, ...days.map((d) => d.n));
    const hardest = words
      .filter((w) => (rec(w)?.bad || 0) > 0)
      .sort((a, b) => rec(b).bad - rec(a).bad)
      .slice(0, 12);
    const maxBox = Math.max(1, ...boxes);
    const tile = (num, label, cls = "") => `<div class="stat-tile ${cls}"><b>${num}</b><span>${label}</span></div>`;
    return `<article class="exam-card vocab-card">
      <div class="card-header"><span class="card-code">THỐNG KÊ HỌC TẬP</span></div>
      <div class="stat-grid">
        ${tile(words.length - nNew, "từ đã học")}
        ${tile(nMaster, "từ đã thuộc", "ok")}
        ${tile(nLearn, "đang học")}
        ${tile(nDue, "cần ôn hôm nay", nDue ? "bad" : "")}
        ${tile(`${acc}%`, "độ chính xác")}
        ${tile(`🔥 ${streak()}`, "ngày liên tiếp")}
      </div>
      <h3 class="stat-h">Hoạt động 14 ngày gần đây</h3>
      <div class="bars">${days
        .map(
          (d) => `<div class="bar" title="${d.label}: ${d.n} lượt, ${d.nw} từ mới">
            <span class="bar-fill" style="height:${Math.round((d.n / maxN) * 100)}%"></span><small>${d.label}</small></div>`
        )
        .join("")}</div>
      <h3 class="stat-h">Độ nhớ theo hộp ôn tập (Leitner)</h3>
      <div class="box-rows">${boxes
        .map(
          (n, b) => `<div class="box-row"><span>Hộp ${b} · ${b === 0 ? "vừa sai" : `ôn sau ${fmtDays(INTERVALS[b])}`}</span>
            <span class="box-track"><span style="width:${Math.round((n / maxBox) * 100)}%"></span></span><b>${n}</b></div>`
        )
        .join("")}</div>
      <h3 class="stat-h">Từ hay sai nhất</h3>
      ${
        hardest.length
          ? `<div class="wrong-list">${hardest
              .map(
                (w) => `<div class="wrong-item"><button type="button" class="btn small" data-act="speak-id" data-id="${w.id}">🔊</button>
                  <b>${escapeHtml(w.word)}</b> – ${escapeHtml(w.short)} <span class="muted">(sai ${rec(w).bad} lần)</span></div>`
              )
              .join("")}</div>
             <div class="sync-actions"><button type="button" class="btn primary" data-act="scope" data-v="hard">Luyện các từ hay sai</button></div>`
          : `<p class="muted">Chưa có từ nào bị sai. Tuyệt vời!</p>`
      }
    </article>`;
  }

  // ---------------------------------------------------------------- chrome (thanh trên, bản đồ bài)
  function renderStatLine() {
    let learned = 0, mastered = 0, due = 0;
    const now = Date.now();
    for (const w of words) {
      const r = rec(w);
      if (!r || !r.s) continue;
      learned++;
      if (r.b >= MASTER_BOX) mastered++;
      if (r.d <= now) due++;
    }
    const d = daily[todayKey()] || {};
    const pct = words.length ? Math.round((mastered / words.length) * 100) : 0;
    els.statLine.innerHTML = `
      <span><b>${learned}</b> đã học</span>
      <span class="ok"><b>${mastered}</b> thuộc</span>
      <span class="bad"><b>${due}</b> cần ôn</span>
      <span>🔥 <b>${streak()}</b> ngày</span>
      <span title="Từ mới hôm nay / mục tiêu">Hôm nay <b>${d.nw || 0}</b>/${settings.goal} từ mới · <b>${d.n || 0}</b> lượt</span>
      <div class="progress-wrap" title="${pct}% số từ đã thuộc"><div class="progress-bar" style="width:${pct}%"></div></div>`;
    els.brandSub.textContent = `${words.length} từ · ${lessonCount} bài · đã thuộc ${pct}%`;
  }

  function renderModeBar() {
    els.modeBar.innerHTML =
      `<span class="source-label">Cách học</span>` +
      MODES.map(
        (m) => `<button type="button" class="chip ${ui.mode === m.id ? "active" : ""}" data-mode="${m.id}">${m.icon} ${m.label}</button>`
      ).join("");
  }

  function renderToolbar() {
    if (!els.scopeSel.options.length) {
      els.scopeSel.innerHTML = SCOPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
    }
    if (els.lessonSel.options.length !== lessonCount) {
      let html = "";
      for (let i = 1; i <= lessonCount; i++) {
        const a = words[(i - 1) * LESSON_SIZE];
        const b = words[Math.min(words.length, i * LESSON_SIZE) - 1];
        html += `<option value="${i}">Bài ${i}: ${escapeHtml(a.main)} → ${escapeHtml(b.main)}</option>`;
      }
      els.lessonSel.innerHTML = html;
    }
    els.scopeSel.value = ui.scope;
    els.lessonSel.value = String(ui.lesson);
    els.posSel.value = ui.pos;
    els.lessonPick.hidden = ui.scope !== "lesson";
    const noScope = ui.mode === "stats";
    els.scopeSel.disabled = noScope;
    els.posSel.disabled = noScope;
  }

  function renderLessonMap() {
    els.mapCount.textContent = lessonCount;
    const stats = new Array(lessonCount + 1).fill(null).map(() => ({ seen: 0, master: 0, size: 0 }));
    for (const w of words) {
      const s = stats[w.lesson];
      s.size++;
      const st = status(w);
      if (st !== "new") s.seen++;
      if (st === "mastered") s.master++;
    }
    let html = "";
    for (let i = 1; i <= lessonCount; i++) {
      const s = stats[i];
      const m = s.master / s.size;
      let cls = "q-cell lesson-cell";
      if (m >= 0.8) cls += " is-ok";
      else if (s.seen) cls += m >= 0.4 ? " lv2" : " lv1";
      if (ui.scope === "lesson" && ui.lesson === i) cls += " is-current";
      html += `<button type="button" class="${cls}" data-lesson="${i}" title="Bài ${i}: đã học ${s.seen}/${s.size}, thuộc ${s.master}">${i}</button>`;
    }
    els.lessonMap.innerHTML = html;
  }

  function render() {
    renderStatLine();
    renderModeBar();
    renderToolbar();
    renderLessonMap();
    if (!words.length) {
      els.view.innerHTML = `<article class="exam-card"><p>Đang tải dữ liệu…</p></article>`;
      return;
    }
    let html;
    if (ui.mode === "list") html = renderList();
    else if (ui.mode === "stats") html = renderStats();
    else if (!queue.length) html = renderEmpty();
    else if (ui.mode === "match") html = qpos >= queue.length ? renderSummary() : renderMatch();
    else if (qpos >= queue.length) html = renderSummary();
    else {
      const w = queue[qpos];
      const fresh = !cur || cur.w !== w || cur.mode !== ui.mode;
      if (fresh) cur = makeQuestion(w);
      html = renderCurrent();
      if (fresh) afterShow();
    }
    els.view.innerHTML = html;
    const input = els.view.querySelector(".fill-input:not([disabled])");
    if (input && document.activeElement?.id !== "listSearch") input.focus({ preventScroll: true });
  }

  function renderCurrent() {
    switch (cur.mode) {
      case "flash":
        return renderFlash();
      case "en2vi":
      case "vi2en":
      case "listen":
      case "fill2":
        return renderChoice();
      case "spell":
      case "dictation":
        return renderTyped();
      case "tf":
        return renderTf();
      case "speak":
        return renderSpeak();
    }
    return "";
  }

  /** Tự đọc từ khi câu hỏi mới hiện ra (những chế độ cần nghe) */
  function afterShow() {
    const m = cur.mode;
    const token = cur;
    const say = () => {
      if (cur === token) speakWord(token.w);
    };
    if (m === "listen" || m === "dictation") {
      setTimeout(say, 250);
      return;
    }
    if (!settings.autoSpeak) return;
    if ((m === "flash" && !cur.reverse) || m === "en2vi" || m === "tf" || m === "speak") {
      setTimeout(say, 250);
    }
  }

  // ---------------------------------------------------------------- events
  function setMode(mode) {
    if (!MODES.some((m) => m.id === mode)) return;
    ui.mode = mode;
    saveUi();
    listLimit = LIST_PAGE;
    if (mode !== "list" && mode !== "stats") buildQueue();
    render();
  }

  function setScope(scope) {
    ui.scope = scope;
    saveUi();
    listLimit = LIST_PAGE;
    if (ui.mode === "stats") ui.mode = "flash";
    if (ui.mode !== "list") buildQueue();
    render();
  }

  function setLesson(n) {
    ui.lesson = Math.min(lessonCount, Math.max(1, n));
    setScope("lesson");
  }

  els.modeBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (b) setMode(b.dataset.mode);
  });
  els.scopeSel.addEventListener("change", () => setScope(els.scopeSel.value));
  els.lessonSel.addEventListener("change", () => setLesson(Number(els.lessonSel.value)));
  $("lessonPrev").addEventListener("click", () => setLesson(ui.lesson - 1));
  $("lessonNext").addEventListener("click", () => setLesson(ui.lesson + 1));
  els.posSel.addEventListener("change", () => {
    ui.pos = els.posSel.value;
    saveUi();
    if (ui.mode !== "list" && ui.mode !== "stats") buildQueue();
    render();
  });
  els.lessonMap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lesson]");
    if (b) setLesson(Number(b.dataset.lesson));
  });

  els.view.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const act = t.dataset.act;
    switch (act) {
      case "opt":
        return choose(Number(t.dataset.i));
      case "flip":
        return flip();
      case "grade":
        return gradeFlash(Number(t.dataset.q));
      case "reverse":
        ui.reverse = !ui.reverse;
        saveUi();
        cur = null;
        return render();
      case "next":
        return next();
      case "dontknow":
        return dontKnow();
      case "speak":
        return cur ? speakWord(cur.w) : undefined;
      case "slow":
        return cur ? speakWord(cur.w, 0.55) : undefined;
      case "speak-id":
        return speakWord(words[Number(t.dataset.id) - 1]);
      case "star":
        if (cur) toggleStar(cur.w);
        return render();
      case "star-id":
        toggleStar(words[Number(t.dataset.id) - 1]);
        return render();
      case "hint":
        if (cur && !cur.answered) {
          cur.hints = Math.min(cur.hints + 1, cur.w.main.length + 1);
          cur.typed = els.view.querySelector(".fill-input")?.value || "";
          render();
        }
        return;
      case "tf":
        if (!cur || cur.answered) return;
        tfCombo = (t.dataset.v === "1") === cur.truth ? tfCombo + 1 : 0;
        return finish((t.dataset.v === "1") === cur.truth);
      case "selfgrade":
        return finish(t.dataset.v === "1");
      case "mic":
        return listen();
      case "match":
        return clickMatch(t.dataset.k);
      case "match-reset":
        match = null;
        return render();
      case "match-next":
        if (match && match.done.size < match.words.length) {
          for (const w of match.words) if (!match.done.has(w.id)) noteResult(w, false);
        }
        qpos += match ? match.words.length : MATCH_SIZE;
        match = null;
        return render();
      case "more-new":
        dayLog().extra = (dayLog().extra || 0) + 10;
        save(KEY.daily, daily);
        buildQueue();
        return render();
      case "scope":
        return setScope(t.dataset.v);
      case "mode":
        return setMode(t.dataset.v);
      case "restart":
        buildQueue();
        return render();
      case "retry-wrong": {
        const list = shuffle([...session.wrong.values()]);
        buildQueue(list);
        return render();
      }
      case "list-more":
        listLimit += LIST_PAGE * 2;
        return render();
    }
  });

  els.view.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-form='typed']");
    if (!f) return;
    e.preventDefault();
    submitTyped(f.elements.ans.value);
  });

  els.view.addEventListener("input", (e) => {
    if (e.target.id !== "listSearch") return;
    listQuery = e.target.value;
    listLimit = LIST_PAGE;
    const pos = e.target.selectionStart;
    render();
    const inp = $("listSearch");
    if (inp) {
      inp.focus();
      inp.setSelectionRange(pos, pos);
    }
  });

  // ---- nhận dạng giọng nói
  let recog = null;
  function listen() {
    if (!Recognition || !cur || cur.mode !== "speak") return;
    if (cur.listening && recog) {
      recog.abort();
      return;
    }
    const token = cur;
    recog = new Recognition();
    recog.lang = settings.accent;
    recog.maxAlternatives = 5;
    recog.interimResults = false;
    recog.onresult = (ev) => {
      if (cur !== token) return;
      const alts = [...ev.results[0]].map((a) => a.transcript.trim());
      token.heard = alts;
      const ok = alts.some((a) => matchesWord(token.w, a) || normAnswer(a).split(" ").some((x) => matchesWord(token.w, x)));
      if (!token.answered) finish(ok);
      else if (ok) token.correct = true;
      render();
    };
    recog.onend = () => {
      token.listening = false;
      if (cur === token) render();
    };
    recog.onerror = (ev) => {
      token.listening = false;
      if (ev.error === "not-allowed") token.heard = ["(bạn chưa cho phép dùng micro)"];
      if (cur === token) render();
    };
    token.listening = true;
    render();
    recog.start();
  }

  // ---- bàn phím
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearch();
      return;
    }
    const openModal = document.querySelector(".modal-backdrop:not([hidden])");
    if (openModal) {
      if (e.key === "Escape") openModal.hidden = true;
      return;
    }
    if (e.target.matches("input, textarea, select")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (ui.mode === "list" || ui.mode === "stats" || !cur) {
      if (k === "enter" && qpos >= queue.length && queue.length) {
        buildQueue();
        render();
      }
      return;
    }
    if (k === "r") {
      speakWord(cur.w);
      return;
    }
    if (cur.mode === "flash") {
      if (k === " " && !cur.flipped) {
        e.preventDefault();
        flip();
      } else if (cur.flipped && "1234".includes(k)) gradeFlash(Number(k) - 1);
      return;
    }
    if (cur.mode === "tf" && !cur.answered && (k === "d" || k === "s")) {
      const v = k === "d";
      tfCombo = v === cur.truth ? tfCombo + 1 : 0;
      finish(v === cur.truth);
      return;
    }
    if (cur.options && !cur.answered) {
      const i = "1234".indexOf(k) >= 0 ? "1234".indexOf(k) : "abcd".indexOf(k);
      if (i >= 0) {
        choose(i);
        return;
      }
    }
    if ((k === "enter" || k === "arrowright") && cur.answered) {
      e.preventDefault();
      next();
    }
  });

  // ---------------------------------------------------------------- modals
  function openModal(id) {
    $(id).hidden = false;
  }
  document.querySelectorAll(".modal-backdrop").forEach((m) => {
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-close]")) m.hidden = true;
    });
  });

  function openSearch() {
    if (ui.mode !== "list") setMode("list");
    const inp = $("listSearch");
    if (inp) {
      inp.focus();
      inp.select();
    }
  }
  $("btnSearch").addEventListener("click", openSearch);
  $("btnHelp").addEventListener("click", () => openModal("helpModal"));
  $("btnBackup").addEventListener("click", () => {
    $("backupStatus").hidden = true;
    openModal("backupModal");
  });

  // ---- cài đặt
  function fillVoices() {
    const sel = $("setVoice");
    const vs = englishVoices();
    sel.innerHTML =
      `<option value="">Tự động (${settings.accent === "en-GB" ? "UK" : "US"})</option>` +
      vs.map((v) => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`).join("");
    sel.value = vs.some((v) => v.name === settings.voice) ? settings.voice : "";
    $("voiceNote").textContent = canSpeak
      ? vs.length
        ? `Có ${vs.length} giọng tiếng Anh trên thiết bị này.`
        : "Chưa tìm thấy giọng tiếng Anh. Trên Windows có thể cài thêm trong Settings → Time & language → Speech."
      : "Trình duyệt không hỗ trợ đọc văn bản.";
  }
  if (canSpeak) speechSynthesis.addEventListener?.("voiceschanged", fillVoices);

  $("btnSettings").addEventListener("click", () => {
    $("setAccent").value = settings.accent;
    $("setRate").value = settings.rate;
    $("setRateVal").textContent = settings.rate;
    $("setGoal").value = settings.goal;
    $("setAutoSpeak").checked = settings.autoSpeak;
    $("setAutoNext").checked = settings.autoNext;
    fillVoices();
    openModal("settingsModal");
  });
  $("setAccent").addEventListener("change", (e) => {
    settings.accent = e.target.value;
    settings.voice = "";
    saveSettings();
    fillVoices();
  });
  $("setVoice").addEventListener("change", (e) => {
    settings.voice = e.target.value;
    saveSettings();
  });
  $("setRate").addEventListener("input", (e) => {
    settings.rate = Number(e.target.value);
    $("setRateVal").textContent = settings.rate;
    saveSettings();
  });
  $("setGoal").addEventListener("change", (e) => {
    settings.goal = Math.min(200, Math.max(5, Number(e.target.value) || 20));
    e.target.value = settings.goal;
    saveSettings();
    if (ui.scope === "today" && ui.mode !== "list" && ui.mode !== "stats") buildQueue();
    render();
  });
  $("setAutoSpeak").addEventListener("change", (e) => {
    settings.autoSpeak = e.target.checked;
    saveSettings();
  });
  $("setAutoNext").addEventListener("change", (e) => {
    settings.autoNext = e.target.checked;
    saveSettings();
  });
  $("btnTestVoice").addEventListener("click", () => speak("Hello! Let's learn three thousand English words together."));

  // ---- sao lưu
  function backupStatus(text, cls) {
    const el = $("backupStatus");
    el.hidden = false;
    el.className = `sync-status ${cls || ""}`;
    el.textContent = text;
  }
  $("btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "vocab3000", v: 1, at: new Date().toISOString(), progress, daily, settings }, null, 1)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tien-do-3000-tu-vung-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    backupStatus("Đã xuất file tiến độ.", "ok");
  });
  $("btnImport").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== "vocab3000" || typeof d.progress !== "object") throw new Error("Không phải file tiến độ của web này");
      progress = d.progress || {};
      daily = d.daily || {};
      if (d.settings) settings = Object.assign(settings, d.settings);
      saveProgress();
      save(KEY.daily, daily);
      saveSettings();
      buildQueue();
      render();
      backupStatus(`Đã nhập tiến độ (${Object.keys(progress).length} từ).`, "ok");
    } catch (err) {
      backupStatus("Không đọc được file: " + err.message, "err");
    }
  });
  $("btnResetProgress").addEventListener("click", () => {
    if (!confirm("Xóa toàn bộ tiến độ học trên trình duyệt này? Không thể hoàn tác.")) return;
    progress = {};
    daily = {};
    saveProgress();
    save(KEY.daily, daily);
    buildQueue();
    render();
    backupStatus("Đã xóa tiến độ.", "ok");
  });

  // ---- theme (giữ cách làm của web cũ)
  function applyTheme(t) {
    document.documentElement.classList.toggle("dark", t === "dark");
    $("btnTheme").textContent = t === "dark" ? "☀️" : "🌙";
  }
  $("btnTheme").addEventListener("click", () => {
    const t = document.documentElement.classList.contains("dark") ? "light" : "dark";
    try {
      localStorage.setItem(KEY.theme, t);
    } catch {
      /* ignore */
    }
    applyTheme(t);
  });
  applyTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");

  // ---------------------------------------------------------------- init
  (async function init() {
    render();
    try {
      const res = await fetch(`data/vocab.json?v=${DATA_VER}`, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      prepare(data.words || []);
    } catch (err) {
      console.error(err);
      els.view.innerHTML = `<article class="exam-card"><p>Không tải được dữ liệu từ vựng. Hãy mở trang qua một web server (không mở trực tiếp file).</p></article>`;
      return;
    }
    if (!MODES.some((m) => m.id === ui.mode)) ui.mode = "flash";
    if (!SCOPES.some(([v]) => v === ui.scope)) ui.scope = "today";
    ui.lesson = Math.min(lessonCount, Math.max(1, ui.lesson || 1));
    if (ui.mode !== "list" && ui.mode !== "stats") buildQueue();
    render();
  })();
})();
