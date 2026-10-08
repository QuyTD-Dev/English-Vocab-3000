/* 3000 từ vựng tiếng Anh — nhiều cách học, lịch ôn FSRS, nhóm từ (giao diện kế thừa từ web ôn tập FE) */
(() => {
  "use strict";

  /** Đổi mỗi lần cập nhật dữ liệu để trình duyệt không dùng JSON cũ */
  const DATA_VER = "20261008_v2";
  const SRS = window.SRS;
  const { variantsOf, normAnswer, answerMatches, fold } = window.VocabLib;
  const LESSON_SIZE = 30;
  const DAY = 86400000;
  /** Từ có khoảng ôn ≥ 21 ngày được tính là "đã thuộc" (như thẻ "mature" của Anki) */
  const MATURE_IVL = 21;
  /** Quên ≥ 4 lần: "từ cứng đầu" (leech) */
  const LEECH = 4;
  /** Trả lời trắc nghiệm đúng nhưng quá chậm (ms) thì tính là "Khó" */
  const SLOW_MS = 15000;
  /** Từ đang ở bước học ngắn (phút) được coi như đến hạn nếu còn ≤ 20 phút (như "learn ahead" của Anki) */
  const LEARN_AHEAD = 20 * 60000;
  const MATCH_SIZE = 6;
  const LIST_PAGE = 100;
  const LOG_CAP = 30000;

  const KEY = {
    cards: "vocab3000_v2_cards",
    meta: "vocab3000_v2_meta",
    lists: "vocab3000_v2_lists",
    log: "vocab3000_v2_log",
    snapshot: "vocab3000_v2_snapshot",
    migrated: "vocab3000_v2_migrated",
    daily: "vocab3000_daily_v1",
    settings: "vocab3000_settings_v1",
    ui: "vocab3000_ui_v1",
    theme: "vocab3000_theme_v1",
    v1progress: "vocab3000_progress_v1",
  };

  const MODES = [
    { id: "flash", icon: "🃏", label: "Flashcard" },
    { id: "mix", icon: "🎲", label: "Trộn ngẫu nhiên" },
    { id: "en2vi", icon: "🔤", label: "Anh → Việt" },
    { id: "vi2en", icon: "💬", label: "Việt → Anh" },
    { id: "listen", icon: "🎧", label: "Nghe chọn từ" },
    { id: "spell", icon: "✍️", label: "Gõ từ" },
    { id: "dictation", icon: "📝", label: "Nghe – viết" },
    { id: "fill2", icon: "🔀", label: "Chính tả 2 chọn 1" },
    { id: "wordform", icon: "🧬", label: "Dạng từ" },
    { id: "cloze", icon: "📄", label: "Điền vào câu" },
    { id: "tf", icon: "⚡", label: "Đúng / Sai nhanh" },
    { id: "match", icon: "🧩", label: "Ghép cặp" },
    { id: "speak", icon: "🎙", label: "Luyện phát âm" },
    { id: "groups", icon: "📂", label: "Nhóm từ" },
    { id: "list", icon: "📖", label: "Danh sách" },
    { id: "stats", icon: "📊", label: "Thống kê" },
  ];
  /** Mã chế độ trong nhật ký ôn tập (giữ nguyên thứ tự để log cũ vẫn đúng) */
  const MODE_CODES = ["flash", "en2vi", "vi2en", "listen", "spell", "dictation", "fill2", "tf", "match", "speak", "wordform", "cloze"];
  const MODE_TITLE = {
    flash: "Flashcard",
    en2vi: "Anh → Việt",
    vi2en: "Việt → Anh",
    listen: "Nghe chọn từ",
    spell: "Gõ từ",
    dictation: "Nghe – viết",
    fill2: "Chính tả 2 chọn 1",
    wordform: "Dạng từ (word form)",
    cloze: "Điền từ vào câu",
    tf: "Đúng / Sai nhanh",
    match: "Ghép cặp",
    speak: "Luyện phát âm",
  };
  const VIEW_MODES = new Set(["groups", "list", "stats"]);
  /** Chế độ bắt phải tự nhớ ra từ (bằng chứng ghi nhớ mạnh hơn trắc nghiệm) */
  const RECALL_MODES = new Set(["spell", "dictation"]);

  const SCOPES = [
    ["today", "📅 Hôm nay (ôn + từ mới)"],
    ["lesson", "📚 Theo bài (30 từ)"],
    ["group", "📂 Theo nhóm từ"],
    ["all", "🌐 Tất cả các từ"],
    ["new", "🆕 Chưa học"],
    ["learning", "🌱 Đang học"],
    ["due", "⏰ Đến hạn ôn"],
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
  const STATUS_TEXT = { new: "Chưa học", learning: "Đang học", young: "Đang ghi nhớ", mastered: "Đã thuộc" };

  const $ = (id) => document.getElementById(id);
  const els = {
    view: $("view"),
    statLine: $("statLine"),
    brandSub: $("brandSub"),
    scopeSel: $("scopeSel"),
    lessonPick: $("lessonPick"),
    lessonSel: $("lessonSel"),
    groupSel: $("groupSel"),
    posSel: $("posSel"),
    modeBar: $("modeBar"),
    lessonMap: $("lessonMap"),
    mapCount: $("mapCount"),
    mapTitle: $("mapTitle"),
    mapLegend: $("mapLegend"),
  };

  // ================================================================ lưu trữ
  let storageWarned = false;

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
      return true;
    } catch (err) {
      if (!storageWarned) {
        storageWarned = true;
        toast("⚠️ Không lưu được tiến độ (bộ nhớ trình duyệt đầy hoặc bị chặn). Hãy xuất file sao lưu trong ☁.", 8000);
      }
      console.error(err);
      return false;
    }
  }

  /** cards[key] = trạng thái FSRS + đếm đúng/sai của từ */
  let cards = load(KEY.cards, {});
  /** meta[key] = { star, note } */
  let meta = load(KEY.meta, {});
  /** Bộ từ tự tạo: [{ id, name, keys: [] }] */
  let lists = load(KEY.lists, []);
  /** Nhật ký: [giây, key, mã chế độ, đúng(1/0), điểm FSRS (0 = chỉ ghi nhận), trạng thái trước, ms trả lời] */
  let log = load(KEY.log, []);
  /** daily["YYYY-MM-DD"] = { n, ok, bad, nw (từ mới), rv (lượt ôn đến hạn), ms, extra } */
  let daily = load(KEY.daily, {});
  let settings = Object.assign(
    {
      accent: "en-US", voice: "", rate: 0.9, goal: 20, maxReviews: 200, retention: 0.9,
      newOrder: "alpha", dayStartHour: 4, autoSpeak: true, autoNext: true, autoDict: true, fontScale: 1,
    },
    load(KEY.settings, {})
  );
  let ui = Object.assign(
    { mode: "flash", scope: "today", lesson: 1, group: "topic:food", pos: "all", reverse: false, mapView: "lessons", groupTab: "topics", welcomed: false },
    load(KEY.ui, {})
  );

  const dirty = new Set();
  let saveTimer = 0;
  function markDirty(...names) {
    names.forEach((n) => dirty.add(n));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 300);
  }
  function flush() {
    clearTimeout(saveTimer);
    const map = { cards, meta, lists, log, daily, settings, ui };
    for (const n of dirty) save(KEY[n], map[n]);
    dirty.clear();
  }
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  const saveUi = () => markDirty("ui");
  const saveSettings = () => markDirty("settings");

  // ================================================================ thời gian
  /** Một "ngày học" bắt đầu lúc dayStartHour giờ sáng (mặc định 4h) */
  function dayStart(ts) {
    const h = settings.dayStartHour;
    const d = new Date(ts - h * 3600000);
    d.setHours(0, 0, 0, 0);
    return d.getTime() + h * 3600000;
  }
  function dayKey(ts = Date.now()) {
    const d = new Date(ts - settings.dayStartHour * 3600000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const srsOpts = () => ({ retention: settings.retention, dayStart, maxInterval: 3650 });

  function fmtDur(ms) {
    if (ms < 3600000) return `${Math.max(1, Math.round(ms / 60000))} phút`;
    if (ms < DAY * 0.9) return `${Math.round(ms / 3600000)} giờ`;
    const d = ms / DAY;
    if (d < 30) return `${Math.max(1, Math.round(d))} ngày`;
    if (d < 365) return `${Math.round(d / 30)} tháng`;
    return `${(d / 365).toFixed(1)} năm`;
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }
  function fmtMinutes(ms) {
    const m = Math.round(ms / 60000);
    return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
  }

  // ================================================================ dữ liệu từ
  /** @type {{idx:number,key:string,word:string,main:string,variants:string[],type:string,pos:string[],ipa:string,meaning:string,short:string,lesson:number,topic:number}[]} */
  let words = [];
  let byKey = new Map();
  let topics = [];
  /** Các chủ đề có ít nhất một từ (để hiển thị) */
  let shownTopics = [];
  let families = [];
  let familyOf = [];
  let lessonCount = 0;
  let spellingSet = new Set();

  function shortMeaning(m) {
    let s = (m.split(/;|\.\s/)[0] || m).trim();
    if (s.length > 72) s = s.slice(0, 70).replace(/[,\s][^,\s]*$/, "") + "…";
    return s || m;
  }

  function prepare(data) {
    topics = (data.topics || []).map((t, i) => ({ ...t, idx: i }));
    words = data.words.map(([word, type, ipa, meaning, topic], i) => {
      const variants = variantsOf(word);
      return {
        idx: i,
        key: word,
        word,
        main: variants[0],
        variants,
        type,
        pos: type.split(",").map((t) => t.trim()).filter(Boolean),
        ipa,
        meaning,
        short: shortMeaning(meaning),
        lesson: Math.floor(i / LESSON_SIZE) + 1,
        topic: topic ?? topics.length - 1,
      };
    });
    byKey = new Map(words.map((w) => [w.key, w]));
    for (const w of words) if (topics[w.topic]) topics[w.topic].count = (topics[w.topic].count || 0) + 1;
    shownTopics = topics.filter((t) => t.count > 0);
    families = data.families || [];
    familyOf = new Array(words.length).fill(-1);
    families.forEach((f, fi) => f.forEach((i) => (familyOf[i] = fi)));
    lessonCount = Math.ceil(words.length / LESSON_SIZE);
    spellingSet = new Set(words.flatMap((w) => w.variants.map((v) => v.toLowerCase())));
  }

  // ================================================================ tiện ích
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shuffle(arr, rand = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Bộ sinh số ngẫu nhiên có hạt giống (để thứ tự từ mới cố định trong ngày) */
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }

  const matchesWord = (w, text) => answerMatches(w.variants, text);

  const posLabel = (w) => w.pos.map((p) => POS_VI[p] || p).join(", ");
  const topicOf = (w) => topics[w.topic] || { icon: "📦", name: "Khác", id: "other" };

  let toastTimer = 0;
  function toast(text, ms = 3200) {
    let el = $("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  // ================================================================ giọng đọc
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

  // ================================================================ câu ví dụ & giọng người thật
  /**
   * Câu ví dụ / định nghĩa tiếng Anh: Wiktionary REST API (ổn định, cho phép gọi từ trình duyệt).
   * Giọng đọc thu âm: Free Dictionary API (không ổn định → chỉ thử trong 5 giây, lỗi thì bỏ qua).
   * Chỉ gửi đi chính từ tiếng Anh cần tra.
   */
  const WIKT_API = "https://en.wiktionary.org/api/rest_v1/page/definition/";
  const DICT_API = "https://api.dictionaryapi.dev/api/v2/entries/en/";
  const dictPromises = new Map();
  /** key từ → { audio, examples, defs } hoặc { error: true } */
  const dictData = new Map();

  function dictQuery(w) {
    const q = w.main.toLowerCase().replace(/\b(sth|sb)\b/g, "").replace(/\s+/g, " ").trim();
    return /^[a-z][a-z' -]*[a-z]$/.test(q) ? q : null;
  }

  function fetchWithTimeout(url, ms) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ms);
    return fetch(url, { signal: ac.signal }).finally(() => clearTimeout(timer));
  }

  const htmlText = (html) => new DOMParser().parseFromString(String(html || ""), "text/html").body.textContent.replace(/\s+/g, " ").trim();

  async function fetchWiktionary(q) {
    const res = await fetchWithTimeout(WIKT_API + encodeURIComponent(q.replace(/ /g, "_")), 6000);
    if (res.status === 404) return { examples: [], defs: [] };
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    const out = { examples: [], defs: [] };
    for (const e of json.en || []) {
      const pos = (e.partOfSpeech || "").toLowerCase();
      for (const d of e.definitions || []) {
        const def = htmlText(d.definition);
        if (def && out.defs.length < 3) out.defs.push({ pos, text: def });
        const exs = [...(d.parsedExamples || []).map((x) => x.example), ...(d.examples || [])];
        for (const raw of exs) {
          const text = htmlText(raw);
          if (text && text.length <= 200 && out.examples.length < 4 && !out.examples.some((x) => x.text === text)) {
            out.examples.push({ pos, text });
          }
        }
      }
    }
    return out;
  }

  async function fetchAudio(q) {
    try {
      const res = await fetchWithTimeout(DICT_API + encodeURIComponent(q), 5000);
      if (!res.ok) return {};
      const audio = {};
      for (const e of (await res.json()) || []) {
        for (const p of e.phonetics || []) {
          if (!p.audio) continue;
          const acc = /-uk\.mp3$/.test(p.audio) ? "uk" : /-us\.mp3$/.test(p.audio) ? "us" : /-au\.mp3$/.test(p.audio) ? "au" : "other";
          if (!audio[acc]) audio[acc] = p.audio;
        }
      }
      return audio;
    } catch {
      return {};
    }
  }

  function loadDict(w) {
    const q = dictQuery(w);
    if (!q || !navigator.onLine) return Promise.resolve(null);
    if (!dictPromises.has(w.key)) {
      const p = Promise.allSettled([fetchWiktionary(q), fetchAudio(q)]).then(([wk, au]) => {
        const audio = au.status === "fulfilled" ? au.value : {};
        const res =
          wk.status === "fulfilled"
            ? { audio, examples: wk.value.examples, defs: wk.value.defs }
            : Object.keys(audio).length
              ? { audio, examples: [], defs: [] }
              : { error: true };
        dictData.set(w.key, res);
        if (res.error) dictPromises.delete(w.key); // cho phép thử lại
        fillDict(w);
        return res;
      });
      dictPromises.set(w.key, p);
    }
    return dictPromises.get(w.key);
  }

  /** Biểu thức tìm từ (kể cả dạng chia đơn giản) trong câu ví dụ */
  function wordRegex(w, flags) {
    // chỉ giữ cách viết gồm chữ cái, dấu nháy, dấu cách, gạch nối → không cần thoát ký tự regex
    const forms = w.variants.map((v) => v.toLowerCase()).filter((v) => /^[a-z' -]+$/.test(v));
    return forms.length ? new RegExp(`\\b(${forms.join("|")})(s|es|ed|d|ing|ly)?\\b`, flags) : null;
  }

  /** Câu ví dụ có chứa từ → { before, word, after } để làm bài điền khuyết */
  function clozeFrom(w) {
    const d = dictData.get(w.key);
    const re = wordRegex(w, "i");
    if (!d || d.error || !d.examples?.length || !re) return null;
    for (const ex of d.examples) {
      const m = ex.text.match(re);
      if (m && ex.text.length >= 25) {
        return { before: ex.text.slice(0, m.index), word: m[0], after: ex.text.slice(m.index + m[0].length) };
      }
    }
    return null;
  }

  /** Tải sẵn câu ví dụ cho vài từ sắp tới trong hàng đợi */
  function prefetchDict(n = 4) {
    if (!settings.autoDict || !navigator.onLine) return;
    for (const w of queue.slice(qpos + 1, qpos + 1 + n)) if (!dictData.has(w.key) && dictQuery(w)) loadDict(w);
  }

  function highlightWord(sentence, w) {
    const safe = escapeHtml(sentence);
    const re = wordRegex(w, "gi");
    return re ? safe.replace(re, "<mark>$&</mark>") : safe;
  }

  function dictHtml(w) {
    if (!dictQuery(w)) return "";
    if (!dictData.has(w.key)) {
      return settings.autoDict && navigator.onLine
        ? `<p class="muted dict-loading">Đang tải câu ví dụ…</p>`
        : `<button type="button" class="btn small" data-act="dict-load" data-key="${escapeHtml(w.key)}">📚 Xem câu ví dụ & giọng người thật</button>`;
    }
    const d = dictData.get(w.key);
    if (!d || d.error) {
      return `<p class="muted dict-loading">Không tải được câu ví dụ (mạng chập chờn).
        <button type="button" class="btn small" data-act="dict-load" data-key="${escapeHtml(w.key)}">↻ Thử lại</button></p>`;
    }
    if (!d.examples.length && !d.defs.length && !Object.keys(d.audio).length) return `<p class="muted dict-loading">Chưa có câu ví dụ cho từ này.</p>`;
    const accName = { us: "Mỹ", uk: "Anh", au: "Úc", other: "người thật" };
    const audio = Object.entries(d.audio)
      .map(([acc, src]) => `<button type="button" class="btn small" data-act="dict-audio" data-src="${escapeHtml(src)}" title="Giọng đọc thu âm">🔈 ${accName[acc]}</button>`)
      .join("");
    const ex = d.examples.length
      ? `<ul class="dict-ex" lang="en">${d.examples.map((e) => `<li><span class="pos-tag">${escapeHtml(e.pos)}</span> ${highlightWord(e.text, w)}</li>`).join("")}</ul>`
      : "";
    const defs = !d.examples.length && d.defs.length
      ? `<ul class="dict-ex" lang="en">${d.defs.map((e) => `<li><span class="pos-tag">${escapeHtml(e.pos)}</span> ${escapeHtml(e.text)}</li>`).join("")}</ul>`
      : "";
    return `${audio ? `<div class="dict-audio">${audio}</div>` : ""}${ex}${defs}
      <p class="dict-src">${d.examples.length || d.defs.length ? "Ví dụ: Wiktionary (CC BY-SA)" : ""}${Object.keys(d.audio).length ? `${d.examples.length || d.defs.length ? " · " : ""}giọng thu âm: Free Dictionary API` : ""}</p>`;
  }

  function fillDict(w) {
    document.querySelectorAll(`.wi-dict[data-key="${CSS.escape(w.key)}"]`).forEach((el) => {
      el.innerHTML = dictHtml(w);
    });
  }

  let dictAudio = null;
  function playAudio(src) {
    try {
      dictAudio?.pause();
      dictAudio = new Audio(src);
      dictAudio.play().catch(() => toast("Không phát được âm thanh."));
    } catch {
      toast("Không phát được âm thanh.");
    }
  }

  // ================================================================ trạng thái ghi nhớ
  const cardOf = (w) => cards[w.key] || null;
  const metaOf = (w) => meta[w.key] || (meta[w.key] = {});

  function status(w) {
    const c = cardOf(w);
    if (!c || !c.st) return "new";
    if (c.st !== SRS.State.Review) return "learning";
    return c.ivl >= MATURE_IVL ? "mastered" : "young";
  }
  /** Đến hạn để chấm điểm: đã quá hạn, hoặc đang ở bước học ngắn và sắp tới hạn */
  function dueForStudy(c, now = Date.now()) {
    if (!c || !c.st) return true;
    if (c.due <= now) return true;
    return c.st !== SRS.State.Review && c.due - now <= LEARN_AHEAD;
  }
  const isDue = (w, now = Date.now()) => {
    const c = cardOf(w);
    return !!(c && c.st && c.due <= now);
  };
  const isLeech = (w) => (cardOf(w)?.lapses || 0) >= LEECH;
  const isStarred = (w) => !!meta[w.key]?.star;
  /** Từ người học chủ động ẩn (không đưa vào các phiên học) */
  const isSkipped = (w) => !!meta[w.key]?.skip;

  function dayLog(k = dayKey()) {
    if (!daily[k]) daily[k] = { n: 0, ok: 0, bad: 0, nw: 0, rv: 0, ms: 0, extra: 0 };
    return daily[k];
  }

  function streak() {
    let ts = Date.now();
    if (!daily[dayKey(ts)]?.n) ts -= DAY;
    let n = 0;
    while (daily[dayKey(ts)]?.n) {
      n++;
      ts -= DAY;
    }
    return n;
  }

  // ---- hoàn tác
  let undoStack = [];
  function pushUndo(w) {
    const k = dayKey();
    undoStack.push({
      key: w.key,
      card: cards[w.key] ? { ...cards[w.key] } : null,
      dayKey: k,
      day: daily[k] ? { ...daily[k] } : null,
      logLen: log.length,
      queue: queue.slice(),
      qpos,
      session: { ...session, wrong: new Map(session.wrong) },
      tfCombo,
    });
    if (undoStack.length > 40) undoStack.shift();
  }
  function undo() {
    const u = undoStack.pop();
    if (!u) return;
    clearTimeout(advanceTimer);
    if (u.card) cards[u.key] = u.card;
    else delete cards[u.key];
    if (u.day) daily[u.dayKey] = u.day;
    else delete daily[u.dayKey];
    log.length = Math.min(log.length, u.logLen);
    queue = u.queue;
    qpos = u.qpos;
    session = u.session;
    tfCombo = u.tfCombo;
    cur = null;
    match = null;
    markDirty("cards", "daily", "log");
    render();
    toast("↶ Đã hoàn tác lượt trả lời gần nhất");
  }

  function logEvent(w, mode, ok, g, prevState, ms, flags) {
    const now = Date.now();
    log.push([Math.round(now / 1000), w.key, Math.max(0, MODE_CODES.indexOf(mode)), ok ? 1 : 0, g, prevState, Math.round(ms || 0)]);
    if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
    const d = dayLog();
    d.n++;
    if (ok) d.ok++;
    else d.bad++;
    if (flags.isNew) d.nw++;
    if (flags.review) d.rv = (d.rv || 0) + 1;
    d.ms = (d.ms || 0) + Math.min(ms || 0, 60000);
    markDirty("log", "daily");
  }

  /** Chấm điểm FSRS (1 Quên · 2 Khó · 3 Nhớ · 4 Dễ) và ghi nhật ký */
  function applyGrade(w, g, mode, ms) {
    pushUndo(w);
    const now = Date.now();
    const prev = cardOf(w);
    const prevState = prev ? prev.st : 0;
    const wasDue = !!(prev && prev.st && prev.due <= now);
    const { card } = SRS.schedule(prev, g, now, srsOpts());
    card.ok = (prev?.ok || 0) + (g > 1 ? 1 : 0);
    card.bad = (prev?.bad || 0) + (g === 1 ? 1 : 0);
    cards[w.key] = card;
    logEvent(w, mode, g > 1, g, prevState, ms, { isNew: prevState === 0, review: prevState === SRS.State.Review && wasDue });
    markDirty("cards");
    if (prevState === SRS.State.Review && g === 1 && card.lapses === LEECH) {
      toast(`🐛 “${w.main}” đã quên ${LEECH} lần – thử viết ghi chú / mẹo nhớ cho từ này.`, 6000);
    }
    return card;
  }

  /** Chỉ ghi nhận (không đổi lịch ôn), dùng khi ôn trước hạn hoặc luyện phát âm */
  function logOnly(w, mode, ok, ms) {
    pushUndo(w);
    const c = cardOf(w);
    if (c) {
      if (ok) c.ok = (c.ok || 0) + 1;
      else c.bad = (c.bad || 0) + 1;
      markDirty("cards");
    }
    logEvent(w, mode, ok, 0, c ? c.st : 0, ms, {});
    return c;
  }

  /**
   * Kết quả từ các chế độ luyện tập → điểm FSRS:
   *  - sai → Quên (từ quay lại học ngay)
   *  - đúng khi từ mới / đến hạn → Nhớ (chậm > 15 giây hoặc có dùng gợi ý → Khó)
   *  - đúng khi chưa đến hạn → chỉ ghi nhận, không đẩy lịch ôn (tránh "học vẹt" làm sai lịch)
   *  - phát âm: lỗi nhận dạng giọng nói không bị tính là quên
   */
  function recordAnswer(w, correct, mode, { hints = 0, ms = 0 } = {}) {
    const c = cardOf(w);
    const due = dueForStudy(c);
    if (mode === "speak") return correct && due ? applyGrade(w, 3, mode, ms) : logOnly(w, mode, correct, ms);
    if (!correct) return applyGrade(w, 1, mode, ms);
    if (!due) return logOnly(w, mode, true, ms);
    const hard = hints > 0 || (!RECALL_MODES.has(mode) && ms > SLOW_MS);
    return applyGrade(w, hard ? 2 : 3, mode, ms);
  }

  function toggleStar(w) {
    const m = metaOf(w);
    if (m.star) delete m.star;
    else m.star = 1;
    markDirty("meta");
  }

  // ================================================================ nhóm từ
  function groupWords(gid) {
    const i = gid.indexOf(":");
    const type = i < 0 ? gid : gid.slice(0, i);
    const val = i < 0 ? "" : gid.slice(i + 1);
    switch (type) {
      case "topic":
        return words.filter((w) => topicOf(w).id === val);
      case "family":
        return (families[Number(val)] || []).map((x) => words[x]);
      case "families":
        return families.flat().map((x) => words[x]);
      case "list": {
        const l = lists.find((x) => x.id === val);
        return l ? l.keys.map((k) => byKey.get(k)).filter(Boolean) : [];
      }
      case "leech":
        return words.filter(isLeech);
      case "star":
        return words.filter(isStarred);
      case "skipped":
        return words.filter(isSkipped);
      default:
        return [];
    }
  }

  function familyName(fi) {
    const f = families[fi] || [];
    const base = f.map((x) => words[x]).sort((a, b) => a.main.length - b.main.length)[0];
    return base ? base.main : "?";
  }

  function groupLabel(gid) {
    const i = gid.indexOf(":");
    const type = i < 0 ? gid : gid.slice(0, i);
    const val = i < 0 ? "" : gid.slice(i + 1);
    if (type === "topic") {
      const t = topics.find((x) => x.id === val);
      return t ? `${t.icon} ${t.name}` : "Chủ đề";
    }
    if (type === "family") return `🧬 Họ từ “${familyName(Number(val))}”`;
    if (type === "families") return "🧬 Tất cả họ từ (học theo họ)";
    if (type === "list") return `🗂 ${lists.find((x) => x.id === val)?.name || "Bộ từ"}`;
    if (type === "leech") return "🐛 Từ cứng đầu";
    if (type === "star") return "★ Đánh dấu";
    if (type === "skipped") return "🚫 Từ đã ẩn";
    return gid;
  }

  function groupStats(list) {
    let seen = 0, master = 0, due = 0;
    const now = Date.now();
    for (const w of list) {
      const st = status(w);
      if (st !== "new") seen++;
      if (st === "mastered") master++;
      if (isDue(w, now)) due++;
    }
    return { total: list.length, seen, master, due };
  }

  function wordformDistractors(w) {
    const fi = familyOf[w.idx];
    const target = w.pos[0];
    if (fi < 0 || !target || !/^[a-z]+$/i.test(w.main)) return [];
    return families[fi]
      .map((x) => words[x])
      .filter((m) => m !== w && m.pos.length && !m.pos.includes(target) && /^[a-z]+$/i.test(m.main));
  }
  const canWordform = (w) => wordformDistractors(w).length > 0;

  // ================================================================ phạm vi & hàng đợi
  function posOk(w) {
    if (ui.pos === "all") return true;
    if (ui.pos === "other") return !w.pos.some((p) => MAIN_POS.has(p));
    return w.pos.includes(ui.pos);
  }

  function newAllowanceToday() {
    const d = daily[dayKey()] || {};
    return Math.max(0, settings.goal + (d.extra || 0) - (d.nw || 0));
  }

  function orderNew(list) {
    if (settings.newOrder === "random") return shuffle(list.slice(), seeded(dayKey()));
    if (settings.newOrder === "topic") return list.slice().sort((a, b) => a.topic - b.topic || a.idx - b.idx);
    return list;
  }

  function scopeWords() {
    const now = Date.now();
    const base = (ui.scope === "group" ? groupWords(ui.group) : words).filter(
      (w) => !isSkipped(w) || (ui.scope === "group" && ui.group === "skipped")
    );
    const list = base.filter(posOk);
    switch (ui.scope) {
      case "lesson":
        return list.filter((w) => w.lesson === ui.lesson);
      case "new":
        return list.filter((w) => status(w) === "new");
      case "learning":
        return list.filter((w) => status(w) === "learning" || status(w) === "young");
      case "due":
        return list.filter((w) => isDue(w, now)).sort((a, b) => cardOf(a).due - cardOf(b).due);
      case "hard":
        return list
          .filter((w) => (cardOf(w)?.bad || 0) > 0)
          .sort((a, b) => cardOf(b).bad - cardOf(b).ok / 2 - (cardOf(a).bad - cardOf(a).ok / 2));
      case "star":
        return list.filter(isStarred);
      case "mastered":
        return list.filter((w) => status(w) === "mastered");
      case "today": {
        const due = list.filter((w) => isDue(w, now)).sort((a, b) => cardOf(a).due - cardOf(b).due);
        const learning = due.filter((w) => cardOf(w).st !== SRS.State.Review);
        const reviewsLeft = Math.max(0, settings.maxReviews - (daily[dayKey()]?.rv || 0));
        const reviews = due.filter((w) => cardOf(w).st === SRS.State.Review).slice(0, reviewsLeft);
        const fresh = orderNew(list.filter((w) => status(w) === "new")).slice(0, newAllowanceToday());
        return [...learning, ...reviews, ...fresh];
      }
      default:
        return list;
    }
  }

  let queue = [];
  let qpos = 0;
  let cur = null;
  let session = { ok: 0, bad: 0, wrong: new Map(), start: Date.now() };
  let advanceTimer = 0;
  let tfCombo = 0;

  function buildQueue(list) {
    clearTimeout(advanceTimer);
    let q = list || scopeWords();
    if (!list) {
      if (ui.mode === "wordform") q = q.filter(canWordform);
      if (ui.mode === "cloze") q = q.filter((w) => dictQuery(w));
      const keepOrder =
        ui.mode === "flash" && (ui.scope === "lesson" || (ui.scope === "group" && /^famil/.test(ui.group)));
      if (ui.scope === "today") {
        const fresh = q.filter((w) => status(w) === "new");
        const old = shuffle(q.filter((w) => status(w) !== "new"));
        q = [...old, ...fresh];
      } else if (!keepOrder) {
        q = shuffle(q.slice());
      }
    }
    queue = q;
    qpos = 0;
    cur = null;
    match = null;
    session = { ok: 0, bad: 0, wrong: new Map(), start: Date.now() };
    undoStack = [];
  }

  /** Từ đang ở bước học ngắn (vài phút) được đưa lại vào phiên để gặp lại */
  function requeueIfLearning(w, card) {
    if (!card || card.st === SRS.State.Review || card.st === SRS.State.New) return;
    if (card.due - Date.now() > 30 * 60000) return;
    const at = Math.min(queue.length, qpos + 1 + Math.max(3, Math.round((card.due - Date.now()) / 60000 / 2)));
    queue.splice(at, 0, w);
  }

  function next() {
    clearTimeout(advanceTimer);
    if (qpos < queue.length) qpos++;
    cur = null;
    render();
    keepCardInView();
  }

  /** Giữ nguyên vị trí cuộn; chỉ căn lại khi đầu thẻ câu hỏi đã trôi lên khỏi màn hình */
  function keepCardInView() {
    const card = els.view.querySelector(".exam-card");
    if (!card) return;
    const top = card.getBoundingClientRect().top;
    if (top < 0) window.scrollTo({ top: Math.max(0, window.scrollY + top - 8), behavior: "auto" });
  }

  function noteResult(w, correct) {
    if (correct) session.ok++;
    else {
      session.bad++;
      session.wrong.set(w.key, w);
    }
  }

  // ================================================================ tạo câu hỏi
  function distractors(w, n, similar = false) {
    const pool = words.filter(
      (x) => x !== w && x.short !== w.short && x.main.toLowerCase() !== w.main.toLowerCase()
    );
    let cands = similar
      ? pool.filter(
          (x) =>
            x.main[0]?.toLowerCase() === w.main[0]?.toLowerCase() &&
            Math.abs(x.main.length - w.main.length) <= 2
        )
      : pool.filter((x) => x.pos[0] === w.pos[0] && x.topic === w.topic);
    if (cands.length < n * 3) cands = similar ? cands : pool.filter((x) => x.pos[0] === w.pos[0]);
    if (cands.length < n * 3) cands = pool;
    const out = [];
    const tried = new Set();
    while (out.length < n && tried.size < cands.length) {
      const x = cands[Math.floor(Math.random() * cands.length)];
      if (tried.has(x.idx)) continue;
      tried.add(x.idx);
      if (out.some((o) => o.short === x.short || o.main === x.main)) continue;
      out.push(x);
    }
    return out;
  }

  /** Cách viết sai trông hợp lý (cho chế độ chính tả 2 lựa chọn) */
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

  /** Chế độ Trộn: chọn dạng bài theo mức độ nhớ (từ mới → nhận diện; từ đã quen → tự nhớ lại) */
  function pickMixMode(w) {
    const st = status(w);
    let pool;
    if (st === "new") pool = ["en2vi", "en2vi", "listen", "tf", "fill2"];
    else if (st === "learning") pool = ["en2vi", "vi2en", "vi2en", "listen", "fill2", "wordform", "tf"];
    else if (st === "young") pool = ["vi2en", "spell", "spell", "dictation", "wordform", "listen", "fill2"];
    else pool = ["spell", "dictation", "vi2en", "wordform"];
    if (st !== "new" && clozeFrom(w)) pool.push("cloze", "cloze");
    pool = pool.filter((m) => (canSpeak || (m !== "listen" && m !== "dictation")) && (m !== "wordform" || canWordform(w)));
    return pool[Math.floor(Math.random() * pool.length)] || "en2vi";
  }

  function makeQuestion(w) {
    let mode = ui.mode === "mix" ? pickMixMode(w) : ui.mode;
    const q = { src: ui.mode, mode, w, answered: false, correct: null, shownAt: Date.now() };
    if (mode === "cloze") {
      const cz = clozeFrom(w);
      if (cz) {
        const opts = shuffle([w, ...distractors(w, 3)]);
        q.cloze = cz;
        q.options = opts.map((x) => x.main);
        q.answer = opts.indexOf(w);
        return q;
      }
      if (!dictData.has(w.key) && dictQuery(w) && navigator.onLine) {
        // đang tải câu ví dụ → hiện chờ, tải xong dựng lại câu hỏi
        q.pending = true;
        loadDict(w).then(() => {
          if (cur === q) {
            cur = null;
            render();
          }
        });
        return q;
      }
      // không có câu ví dụ (hoặc offline) → dùng dạng Việt → Anh cho từ này
      mode = q.mode = "vi2en";
      q.fallback = true;
    }
    if (mode === "wordform") {
      const ds = shuffle(wordformDistractors(w)).slice(0, 3);
      if (!ds.length) {
        mode = q.mode = "en2vi";
      } else {
        const fam = families[familyOf[w.idx]].map((x) => words[x]);
        q.base = fam.filter((m) => m !== w).sort((a, b) => a.main.length - b.main.length)[0];
        const opts = shuffle([w, ...ds]);
        q.options = opts.map((x) => x.main);
        q.optionWords = opts;
        q.answer = opts.indexOf(w);
        return q;
      }
    }
    switch (mode) {
      case "flash":
        q.flipped = false;
        q.reverse = ui.reverse;
        break;
      case "en2vi":
      case "vi2en":
      case "listen": {
        const opts = shuffle([w, ...distractors(w, 3, mode === "listen")]);
        q.options = opts.map((x) => (mode === "en2vi" ? x.short : x.main));
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

  // ================================================================ trả lời
  function finish(correct) {
    if (!cur || cur.answered) return;
    cur.answered = true;
    cur.correct = correct;
    const ms = Date.now() - cur.shownAt;
    const card = recordAnswer(cur.w, correct, cur.mode, { hints: cur.hints || 0, ms });
    noteResult(cur.w, correct);
    requeueIfLearning(cur.w, card);
    if (settings.autoSpeak && ["vi2en", "spell", "fill2", "tf", "wordform"].includes(cur.mode)) speakWord(cur.w);
    render();
    if (correct && settings.autoNext && cur.mode !== "speak") {
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

  function gradeFlash(g) {
    if (!cur || cur.mode !== "flash" || !cur.flipped || cur.answered) return;
    cur.answered = true;
    const card = applyGrade(cur.w, g, "flash", Date.now() - cur.shownAt);
    noteResult(cur.w, g > 1);
    requeueIfLearning(cur.w, card);
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

  // ================================================================ hiển thị: phần dùng chung
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

  function memoryLine(w) {
    const c = cardOf(w);
    if (!c || !c.st) return "Chưa học lần nào";
    const now = Date.now();
    const r = SRS.recall(c, now);
    const parts = [];
    if (r !== null) parts.push(`khả năng nhớ hiện tại <b>${Math.round(r * 100)}%</b>`);
    parts.push(c.due <= now ? "<b>đến hạn ôn</b>" : `ôn lại ${fmtDate(c.due)} (sau ${fmtDur(c.due - now)})`);
    parts.push(`độ bền ${c.s < 1 ? "< 1" : Math.round(c.s)} ngày · độ khó ${c.d.toFixed(1)}/10`);
    parts.push(`đúng ${c.ok || 0} · sai ${c.bad || 0}${c.lapses ? ` · quên ${c.lapses} lần` : ""}`);
    return parts.join(" · ");
  }

  function familyChips(w) {
    const fi = familyOf[w.idx];
    if (fi < 0) return "";
    const others = families[fi].map((x) => words[x]).filter((m) => m !== w);
    return `<div class="wi-family"><span class="muted">🧬 Cùng họ:</span> ${others
      .map(
        (m) => `<button type="button" class="chip chip-sm" data-act="speak-key" data-key="${escapeHtml(m.key)}" data-tip="1" title="${escapeHtml(m.short)}">
          ${escapeHtml(m.main)} <i>${escapeHtml(m.pos.join(","))}</i></button>`
      )
      .join("")}
      <button type="button" class="chip chip-sm chip-link" data-act="goto-group" data-g="family:${fi}">Học cả họ →</button></div>`;
  }

  function listControls(w) {
    const mine = lists.filter((l) => l.keys.includes(w.key));
    return `<div class="wi-lists">
      ${mine
        .map(
          (l) => `<span class="chip chip-sm chip-on">🗂 ${escapeHtml(l.name)}
            <button type="button" class="x" data-act="list-remove" data-list="${l.id}" data-key="${escapeHtml(w.key)}" aria-label="Bỏ khỏi bộ">✕</button></span>`
        )
        .join("")}
      <select class="sel sel-sm" data-change="list-add" data-key="${escapeHtml(w.key)}" aria-label="Thêm vào bộ từ">
        <option value="">＋ Thêm vào bộ từ…</option>
        ${lists
          .filter((l) => !l.keys.includes(w.key))
          .map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`)
          .join("")}
        <option value="__new">＋ Tạo bộ từ mới…</option>
      </select>
    </div>`;
  }

  function wordInfo(w) {
    const st = status(w);
    const t = topicOf(w);
    const note = meta[w.key]?.note || "";
    return `<div class="word-info">
      <div class="wi-head">
        <span class="wi-word" lang="en">${escapeHtml(w.word)}</span>
        ${canSpeak ? `<button type="button" class="btn speak-btn small" data-act="speak-key" data-key="${escapeHtml(w.key)}" title="Nghe">🔊</button>` : ""}
        ${w.ipa ? `<span class="wi-ipa">/${escapeHtml(w.ipa)}/</span>` : ""}
      </div>
      ${w.type ? `<div class="wi-pos"><span class="pos-tag">${escapeHtml(w.type)}</span> ${escapeHtml(posLabel(w))}</div>` : ""}
      <div class="wi-meaning">${escapeHtml(w.meaning)}</div>
      <div class="wi-tags">
        <span class="badge st-${st}">${STATUS_TEXT[st]}</span>
        <button type="button" class="chip chip-sm" data-act="goto-group" data-g="topic:${escapeHtml(t.id)}">${t.icon} ${escapeHtml(t.name)}</button>
        <span class="chip chip-sm chip-static">Bài ${w.lesson}</span>
        ${isLeech(w) ? `<span class="badge st-leech" title="Quên từ ${LEECH} lần trở lên">🐛 Từ cứng đầu</span>` : ""}
        <button type="button" class="chip chip-sm" data-act="skip-key" data-key="${escapeHtml(w.key)}" title="Ẩn: không đưa từ này vào các phiên học">${isSkipped(w) ? "↺ Hiện lại từ này" : "🚫 Ẩn từ này"}</button>
      </div>
      <div class="wi-meta">${memoryLine(w)}</div>
      ${familyChips(w)}
      <label class="wi-note">📝 Ghi chú / câu ví dụ / mẹo nhớ của bạn
        <textarea data-note="${escapeHtml(w.key)}" rows="2" placeholder="Tự đặt một câu với từ này, hoặc ghi mẹo nhớ…">${escapeHtml(note)}</textarea>
      </label>
      <div class="wi-dict" data-key="${escapeHtml(w.key)}">${dictHtml(w)}</div>
      ${listControls(w)}
      ${dictLinks(w)}
    </div>`;
  }

  function cardShell({ code, hint, body, nav, after = "" }) {
    const w = cur?.w;
    const starred = w && isStarred(w);
    const posText = queue.length ? `${Math.min(qpos + 1, queue.length)}/${queue.length}` : "";
    const pct = queue.length ? Math.round((qpos / queue.length) * 100) : 0;
    const mixTag = cur?.src === "mix" ? `<span class="mix-tag">🎲 ${escapeHtml(MODE_TITLE[cur.mode])}</span>` : "";
    return `<article class="exam-card vocab-card" tabindex="-1" aria-label="Thẻ câu hỏi">
      <div class="card-header">
        <span class="card-code">${escapeHtml(code)}</span>
        <span class="card-sep">|</span>
        <span class="card-qnum">${w ? `Từ #${w.idx + 1} · ${topicOf(w).icon} ${escapeHtml(topicOf(w).name)}` : ""}</span>
        ${mixTag}
        <span class="card-pos">${posText}</span>
      </div>
      <div class="session-bar"><div style="width:${pct}%"></div></div>
      ${hint ? `<p class="card-choose">${hint}</p>` : ""}
      ${body}
      <div class="card-nav">
        ${undoStack.length ? `<button type="button" class="btn" data-act="undo" title="Hoàn tác (Ctrl+Z)">↶</button>` : ""}
        ${w ? `<button type="button" class="btn ${starred ? "starred" : ""}" id="btnStar" data-act="star" title="Đánh dấu từ">${starred ? "★" : "☆"}</button>` : ""}
        ${nav}
      </div>
      ${after}
    </article>`;
  }

  function feedbackHtml(text) {
    if (!cur?.answered) return "";
    const ok = cur.correct;
    return `<div class="card-feedback ${ok ? "ok" : "bad"}" role="status">${ok ? "✓ Chính xác!" : "✗ Chưa đúng."} ${text || ""}</div>
      <div class="card-explain ${ok ? "" : "explain-wrong"}"><strong>Thông tin từ</strong>${wordInfo(cur.w)}</div>`;
  }

  function navNext(withDontKnow = true) {
    const answered = cur?.answered;
    return `${answered || !withDontKnow ? "" : `<button type="button" class="btn" data-act="dontknow">Không biết</button>`}
      <button type="button" class="btn primary" id="btnNext" data-act="next">${answered ? "Tiếp →" : "Bỏ qua →"}</button>`;
  }

  function optionsHtml(texts, { big = false, lang = "" } = {}) {
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
            <span class="opt-letter">${letters[i]}.</span><span class="opt-text"${lang ? ` lang="${lang}"` : ""}>${escapeHtml(t)}</span></button>`;
        })
        .join("")}
    </div>`;
  }

  // ================================================================ hiển thị: từng chế độ
  function renderFlash() {
    const w = cur.w;
    const front = cur.reverse
      ? `<div class="flash-face">
          <div class="vocab-meaning-big">${escapeHtml(w.meaning)}</div>
          ${w.type ? `<div class="wi-pos"><span class="pos-tag">${escapeHtml(w.type)}</span> ${escapeHtml(posLabel(w))}</div>` : ""}
        </div>`
      : `<div class="flash-face">
          <div class="vocab-word" lang="en">${escapeHtml(w.word)}</div>
          ${w.ipa ? `<div class="vocab-ipa">/${escapeHtml(w.ipa)}/</div>` : ""}
          ${speakBtn("🔊 Nghe")}
        </div>`;
    const body = cur.flipped
      ? `<div class="flash-card flipped">${front}<div class="flash-back">${wordInfo(w)}</div></div>`
      : `<div class="flash-card" role="button" tabindex="0" data-act="flip" aria-label="Lật thẻ">${front}
          <span class="flash-tip">Nhớ lại ${cur.reverse ? "từ tiếng Anh" : "nghĩa"} trong đầu, rồi bấm để lật<span class="kb"> (Space)</span></span></div>`;
    const labels = ["Quên", "Khó", "Nhớ", "Dễ"];
    const pv = cur.flipped ? SRS.preview(cardOf(w), Date.now(), srsOpts()) : [];
    const nav = cur.flipped
      ? `<div class="grade-row">${labels
          .map(
            (l, i) => `<button type="button" class="btn grade g${i}" data-act="grade" data-g="${i + 1}">
              <b>${l}</b><small>${fmtDur(pv[i])}</small><kbd>${i + 1}</kbd></button>`
          )
          .join("")}</div>`
      : `<button type="button" class="btn" data-act="reverse" title="Đổi mặt trước của thẻ">${cur.reverse ? "Mặt trước: Tiếng Việt" : "Mặt trước: Tiếng Anh"} ⇄</button>
         ${status(w) === "new" ? `<button type="button" class="btn" data-act="known" title="Đã biết từ này: hẹn kiểm tra lại sau khoảng 2 tuần thay vì học từ đầu">✓ Biết rồi</button>` : ""}
         <button type="button" class="btn primary" id="btnNext" data-act="flip">Lật thẻ</button>`;
    const st = status(w);
    const hint =
      st === "new"
        ? "🆕 Từ mới – đọc to, đoán nghĩa rồi lật thẻ"
        : dueForStudy(cardOf(w))
          ? `⏰ Đến hạn ôn – ${memoryLine(w).split(" · ")[0]}`
          : "🔁 Ôn thêm (chưa đến hạn) – ôn sớm hầu như không làm giãn lịch ôn, FSRS chỉ tăng độ bền khi bạn nhớ được sau một thời gian";
    return cardShell({ code: "FLASHCARD", hint, body, nav });
  }

  function renderChoice() {
    const w = cur.w;
    const mode = cur.mode;
    let prompt = "";
    let hint = "";
    if (mode === "en2vi") {
      hint = `Chọn nghĩa đúng của từ<span class="kb"> (phím 1–4)</span>`;
      prompt = `<div class="vocab-prompt"><div class="vocab-word" lang="en">${escapeHtml(w.word)}</div>
        ${w.ipa ? `<div class="vocab-ipa">/${escapeHtml(w.ipa)}/ ${speakBtn("🔊", "small")}</div>` : speakBtn("🔊", "small")}
        ${w.type ? `<div class="wi-pos"><span class="pos-tag">${escapeHtml(w.type)}</span></div>` : ""}</div>`;
    } else if (mode === "vi2en") {
      hint = `${cur.fallback ? "Từ này chưa có câu ví dụ nên làm dạng Việt → Anh. " : ""}Chọn từ tiếng Anh đúng<span class="kb"> (phím 1–4)</span>`;
      prompt = `<div class="vocab-prompt"><div class="vocab-meaning-big">${escapeHtml(w.meaning)}</div>
        ${w.type ? `<div class="wi-pos"><span class="pos-tag">${escapeHtml(w.type)}</span> ${escapeHtml(posLabel(w))}</div>` : ""}</div>`;
    } else if (mode === "listen") {
      hint = `Nghe và chọn từ bạn nghe được<span class="kb"> (R: nghe lại)</span>`;
      prompt = `<div class="vocab-prompt listen-prompt">
        ${speakBtn("🔊 Nghe lại", "big")}
        ${canSpeak ? `<button type="button" class="btn speak-btn" data-act="slow">🐢 Đọc chậm</button>` : `<p class="warn">Trình duyệt không hỗ trợ giọng đọc.</p>`}
      </div>`;
    } else if (mode === "fill2") {
      hint = `Điền khuyết – chọn cách viết đúng<span class="kb"> (phím 1–2)</span>`;
      prompt = `<div class="vocab-prompt"><div class="fill-sentence">“${escapeHtml(w.short)}” trong tiếng Anh là <span class="blank">${cur.answered ? escapeHtml(w.main) : "_____"}</span></div>
        ${w.ipa ? `<div class="vocab-ipa">/${escapeHtml(w.ipa)}/</div>` : ""}</div>`;
    } else if (mode === "cloze") {
      const cz = cur.cloze;
      hint = `Chọn từ điền vào chỗ trống – từ trong câu có thể ở dạng chia khác (vd thêm -s, -ed)<span class="kb"> (phím 1–4)</span>`;
      prompt = `<div class="vocab-prompt"><div class="cloze-sentence" lang="en">${escapeHtml(cz.before)}<span class="blank">${
        cur.answered ? escapeHtml(cz.word) : "_____"
      }</span>${escapeHtml(cz.after)}</div></div>`;
    } else if (mode === "wordform") {
      const target = w.pos[0];
      hint = `Biến đổi từ – chọn đúng dạng từ loại được hỏi<span class="kb"> (phím 1–4)</span>`;
      prompt = `<div class="vocab-prompt">
        <div class="wf-base">Họ từ của <b>${escapeHtml(cur.base.main)}</b> <span class="pos-tag">${escapeHtml(cur.base.type)}</span>
          <span class="muted">– ${escapeHtml(cur.base.short)}</span></div>
        <div class="vocab-meaning-big">Dạng <span class="blank">${escapeHtml((POS_VI[target] || target).toUpperCase())}</span> (${escapeHtml(target)}) là?</div>
      </div>`;
    }
    const extra =
      mode === "en2vi"
        ? `Đáp án: ${escapeHtml(w.short)}`
        : mode === "cloze"
          ? `Đáp án: ${escapeHtml(w.main)} – ${escapeHtml(w.short)}`
          : mode === "wordform"
          ? `${escapeHtml(w.main)} là ${escapeHtml(posLabel(w))}; ${cur.optionWords
              .filter((x) => x !== w)
              .map((x) => `${escapeHtml(x.main)} là ${escapeHtml(posLabel(x))}`)
              .join("; ")}.`
          : `Đáp án: ${escapeHtml(w.main)}`;
    return cardShell({
      code: MODE_TITLE[mode].toUpperCase(),
      hint,
      body: prompt + optionsHtml(cur.options, { big: mode !== "en2vi", lang: mode === "en2vi" ? "" : "en" }),
      nav: navNext(),
      after: feedbackHtml(cur.answered && (!cur.correct || mode === "wordform") ? extra : ""),
    });
  }

  function renderPending() {
    return cardShell({
      code: MODE_TITLE.cloze.toUpperCase(),
      hint: "",
      body: `<div class="vocab-prompt"><p class="muted dict-loading">Đang tải câu ví dụ cho từ tiếp theo…</p></div>`,
      nav: `<button type="button" class="btn primary" id="btnNext" data-act="next">Bỏ qua →</button>`,
    });
  }

  function hintPattern(w, n) {
    let shown = 0;
    return w.main
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
    const dict = cur.mode === "dictation";
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
    const nav = `${cur.answered ? "" : `<button type="button" class="btn" data-act="hint" title="Dùng gợi ý sẽ được tính là “Khó”">💡 Gợi ý</button>`}${navNext()}`;
    return cardShell({
      code: MODE_TITLE[cur.mode].toUpperCase(),
      hint: dict ? "Nghe rồi gõ lại từ (Enter để kiểm tra)" : "Gõ từ tiếng Anh có nghĩa sau (Enter để kiểm tra)",
      body: prompt + pattern + form,
      nav,
      after: feedbackHtml(cur.answered && !cur.correct ? `Bạn gõ “${escapeHtml(cur.typed || "—")}”, đáp án: <b>${escapeHtml(w.main)}</b>` : ""),
    });
  }

  function renderTf() {
    const s = cur.shown;
    const body = `<div class="vocab-prompt tf-prompt">
        <div class="vocab-word" lang="en">${escapeHtml(cur.w.word)} ${speakBtn("🔊", "small")}</div>
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
      nav: navNext(false),
      after: feedbackHtml(cur.answered && !cur.truth ? `Nghĩa đúng của “${escapeHtml(cur.w.main)}” là: ${escapeHtml(cur.w.short)}` : ""),
    });
  }

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
        <div class="vocab-word" lang="en">${escapeHtml(w.word)}</div>
        ${w.ipa ? `<div class="vocab-ipa">/${escapeHtml(w.ipa)}/</div>` : ""}
        <div class="wi-meaning center">${escapeHtml(w.short)}</div>
        <div class="listen-prompt">${speakBtn("🔊 Nghe mẫu")}${canSpeak ? `<button type="button" class="btn speak-btn" data-act="slow">🐢 Chậm</button>` : ""}</div>
      </div>
      <div class="mic-area">${micArea}</div>`;
    return cardShell({
      code: "LUYỆN PHÁT ÂM",
      hint: "Nghe mẫu → đọc to → máy kiểm tra (nói lại bao nhiêu lần cũng được)",
      body,
      nav: navNext(false),
      after: cur.answered
        ? `<div class="card-feedback ${cur.correct ? "ok" : "bad"}">${cur.correct ? "✓ Phát âm được nhận diện chính xác!" : "✗ Máy chưa nhận ra đúng từ – nghe mẫu và thử lại nhé (không tính là quên từ)."}</div>`
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
      const id = `${side}${w.idx}`;
      let cls = "match-item";
      if (m.done.has(w.idx)) cls += " done";
      if (m.sel === id) cls += " sel";
      if (m.flash && m.flash.includes(id)) cls += " wrong";
      const text = side === "L" ? w.main : w.short;
      return `<button type="button" class="${cls}" data-act="match" data-k="${id}" ${side === "L" ? 'lang="en"' : ""} ${m.done.has(w.idx) ? "disabled" : ""}>${escapeHtml(text)}</button>`;
    };
    const finished = m.done.size === m.words.length;
    const errs = [...m.errors.values()].reduce((a, b) => a + b, 0);
    const posText = `${Math.min(qpos + m.words.length, queue.length)}/${queue.length}`;
    return `<article class="exam-card vocab-card">
      <div class="card-header"><span class="card-code">GHÉP CẶP</span><span class="card-sep">|</span>
        <span class="card-qnum">${m.words.length} cặp</span><span class="card-pos">${posText}</span></div>
      <div class="session-bar"><div style="width:${Math.round((qpos / queue.length) * 100)}%"></div></div>
      <p class="card-choose">Bấm một từ bên trái rồi bấm nghĩa tương ứng bên phải</p>
      <div class="match-grid">
        <div class="match-col">${m.left.map((w) => item(w, "L")).join("")}</div>
        <div class="match-col">${m.right.map((w) => item(w, "R")).join("")}</div>
      </div>
      ${finished ? `<div class="card-feedback ${errs ? "bad" : "ok"}">🎉 Xong ván trong ${Math.round((m.end - m.start) / 1000)} giây, ${errs} lần ghép nhầm.</div>` : ""}
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
    const idx = Number(k.slice(1));
    if (m.done.has(idx)) return;
    if (!m.sel || m.sel[0] === side) {
      m.sel = m.sel === k ? null : k;
      if (side === "L") speakWord(words[idx]);
      render();
      return;
    }
    const otherIdx = Number(m.sel.slice(1));
    if (otherIdx === idx) {
      m.done.add(idx);
      m.sel = null;
      if (m.done.size === m.words.length) {
        m.end = Date.now();
        const per = (m.end - m.start) / m.words.length;
        for (const w of m.words) {
          const ok = !m.errors.get(w.idx);
          recordAnswer(w, ok, "match", { ms: per });
          noteResult(w, ok);
        }
      }
    } else {
      const leftIdx = side === "L" ? idx : otherIdx;
      m.errors.set(leftIdx, (m.errors.get(leftIdx) || 0) + 1);
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

  // ---- Trống / tổng kết
  function renderEmpty() {
    const today = ui.scope === "today";
    const wf = ui.mode === "wordform";
    return `<article class="exam-card vocab-card empty-card">
      <div class="big-emoji">${today && !wf ? "🎉" : "📭"}</div>
      <h2>${wf ? "Không có từ nào làm được bài “dạng từ” trong phạm vi này" : today ? "Bạn đã xong mục tiêu hôm nay!" : "Không có từ nào trong phạm vi này"}</h2>
      <p class="muted">${
        wf
          ? "Bài dạng từ cần các từ cùng họ (vd: accident – accidental – accidentally). Chọn nhóm “Tất cả họ từ”."
          : today
            ? "Không còn từ đến hạn ôn và đã đủ số từ mới. Ôn đúng hạn quan trọng hơn học dồn – hẹn bạn ngày mai!"
            : "Thử chọn phạm vi hoặc từ loại khác ở thanh phía trên."
      }</p>
      <div class="sync-actions center">
        ${today && !wf ? `<button type="button" class="btn primary" data-act="more-new">+ Học thêm 10 từ mới</button>` : ""}
        ${wf ? `<button type="button" class="btn primary" data-act="group-study" data-g="families" data-m="wordform">🧬 Tất cả họ từ</button>` : ""}
        <button type="button" class="btn" data-act="mode" data-v="groups">📂 Chọn nhóm từ</button>
        <button type="button" class="btn" data-act="scope" data-v="all">🌐 Tất cả các từ</button>
      </div>
    </article>`;
  }

  function renderSummary() {
    const total = session.ok + session.bad;
    const pct = total ? Math.round((session.ok / total) * 100) : 0;
    const wrong = [...session.wrong.values()];
    const mins = fmtMinutes(Date.now() - session.start);
    return `<article class="exam-card vocab-card empty-card">
      <div class="big-emoji">${pct >= 80 ? "🏆" : pct >= 50 ? "💪" : "📘"}</div>
      <h2>Hoàn thành phiên học!</h2>
      <p class="summary-line"><span class="ok">✓ ${session.ok} đúng</span> · <span class="bad">✗ ${session.bad} sai</span> · ${pct}% chính xác · ${mins}</p>
      ${
        wrong.length
          ? `<div class="wrong-list"><strong>Các từ cần chú ý</strong>${wrong
              .map(
                (w) => `<div class="wrong-item"><button type="button" class="btn small" data-act="speak-key" data-key="${escapeHtml(w.key)}">🔊</button>
                  <b lang="en">${escapeHtml(w.word)}</b> <span class="muted">/${escapeHtml(w.ipa)}/</span> – ${escapeHtml(w.short)}</div>`
              )
              .join("")}</div>`
          : ""
      }
      <div class="sync-actions center">
        ${wrong.length ? `<button type="button" class="btn primary" data-act="retry-wrong">🔁 Ôn lại ${wrong.length} từ sai</button>` : ""}
        <button type="button" class="btn ${wrong.length ? "" : "primary"}" data-act="restart">▶ Phiên mới</button>
        <button type="button" class="btn" data-act="mode" data-v="${ui.mode === "mix" ? "flash" : "mix"}">Đổi sang ${ui.mode === "mix" ? "🃏 Flashcard" : "🎲 Trộn ngẫu nhiên"}</button>
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
    return base.filter((w) => fold(w.word).includes(q) || fold(w.meaning).includes(q) || fold(meta[w.key]?.note).includes(q));
  }

  /** Lần đầu mở web (chưa học từ nào): hướng dẫn 3 bước bắt đầu */
  function welcomeHtml() {
    if (ui.welcomed || Object.keys(cards).length || log.length) return "";
    return `<section class="welcome" aria-label="Hướng dẫn bắt đầu">
      <h2>👋 Chào bạn! Bắt đầu học 3000 từ vựng</h2>
      <ol>
        <li><b>Mỗi ngày</b> chọn phạm vi <i>📅 Hôm nay</i>: web gom từ cần ôn + ${settings.goal} từ mới.</li>
        <li><b>Học từ mới bằng 🃏 Flashcard</b>: đoán nghĩa → lật thẻ → tự chấm Quên / Khó / Nhớ / Dễ.</li>
        <li><b>Luyện thêm</b> bằng 🎲 Trộn ngẫu nhiên, 📄 Điền vào câu, ✍️ Gõ từ… Web tự hẹn ngày ôn cho từng từ.</li>
      </ol>
      <div class="sync-actions">
        <button type="button" class="btn primary" data-act="welcome-start">▶ Bắt đầu học hôm nay</button>
        <button type="button" class="btn" data-act="welcome-topics">📂 Chọn theo chủ đề</button>
        <button type="button" class="btn" data-act="welcome-help">💡 Cách học hiệu quả</button>
        <button type="button" class="btn ghost" data-act="welcome-close" aria-label="Ẩn hướng dẫn">✕</button>
      </div>
    </section>`;
  }

  /** Xuất danh sách đang xem ra CSV (mở bằng Excel / nhập vào Anki) */
  function exportCsv(list, name) {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["word", "type", "ipa", "meaning_vi", "topic", "status", "note"];
    const rows = list.map((w) =>
      [w.word, w.type, w.ipa ? `/${w.ipa}/` : "", w.meaning, topicOf(w).name, STATUS_TEXT[status(w)], meta[w.key]?.note || ""].map(cell).join(",")
    );
    const blob = new Blob(["\ufeff" + [head.join(","), ...rows].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tu-vung-${fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "danh-sach"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`⬇ Đã xuất ${list.length} từ ra file CSV`);
  }

  function renderList() {
    const all = listMatches();
    const rows = all.slice(0, listLimit);
    const scopeName = ui.scope === "group" ? groupLabel(ui.group) : SCOPES.find(([v]) => v === ui.scope)?.[1] || "";
    return `<article class="exam-card vocab-card">
      <div class="card-header"><span class="card-code">DANH SÁCH TỪ</span><span class="card-sep">|</span>
        <span class="card-qnum">${all.length} từ ${listQuery ? "khớp tìm kiếm (mọi bài)" : `· ${escapeHtml(scopeName)}`}</span>
        <span class="card-pos"><button type="button" class="btn small" data-act="export-csv" ${all.length ? "" : "disabled"} title="Xuất danh sách đang xem ra file CSV (Excel, Anki)">⬇ CSV</button></span></div>
      <div class="search-input-wrap list-search">
        <span class="search-icon">🔍</span>
        <input type="search" id="listSearch" placeholder="Tìm từ, nghĩa tiếng Việt (gõ không dấu được) hoặc ghi chú của bạn…" value="${escapeHtml(listQuery)}" autocomplete="off" spellcheck="false" />
      </div>
      <div class="vocab-table" role="table">
        ${rows
          .map((w) => {
            const st = status(w);
            const star = isStarred(w);
            const note = meta[w.key]?.note;
            return `<div class="vrow" role="row">
              <span class="vno">${w.idx + 1}</span>
              <button type="button" class="btn small" data-act="speak-key" data-key="${escapeHtml(w.key)}" aria-label="Nghe ${escapeHtml(w.main)}">🔊</button>
              <span class="vword"><b lang="en">${escapeHtml(w.word)}</b> ${w.type ? `<span class="pos-tag">${escapeHtml(w.type)}</span>` : ""}<br><span class="muted">${w.ipa ? `/${escapeHtml(w.ipa)}/` : ""}</span></span>
              <span class="vmean">${escapeHtml(w.meaning)}${note ? `<br><span class="vnote">📝 ${escapeHtml(note)}</span>` : ""}</span>
              ${isSkipped(w)
                ? `<button type="button" class="badge st-skip" data-act="skip-key" data-key="${escapeHtml(w.key)}" title="Bấm để hiện lại từ này">🚫 Đã ẩn ↺</button>`
                : `<span class="badge st-${st}" title="${escapeHtml(memoryLine(w).replace(/<[^>]+>/g, ""))}">${STATUS_TEXT[st]}</span>`}
              <button type="button" class="btn small star-btn ${star ? "starred" : ""}" data-act="star-key" data-key="${escapeHtml(w.key)}" aria-label="Đánh dấu">${star ? "★" : "☆"}</button>
            </div>`;
          })
          .join("")}
        ${rows.length ? "" : `<p class="q-map-empty">Không tìm thấy từ nào.</p>`}
      </div>
      ${all.length > rows.length ? `<div class="sync-actions center"><button type="button" class="btn" data-act="list-more">Xem thêm (${all.length - rows.length} từ)</button></div>` : ""}
    </article>`;
  }

  // ---- Nhóm từ
  let famQuery = "";
  let famMin = 3;
  let famLimit = 60;

  function progressBar(s) {
    const m = s.total ? Math.round((s.master / s.total) * 100) : 0;
    const l = s.total ? Math.round((s.seen / s.total) * 100) : 0;
    return `<div class="gbar" title="Đã học ${s.seen}/${s.total} · đã thuộc ${s.master}">
      <span class="gbar-seen" style="width:${l}%"></span><span class="gbar-master" style="width:${m}%"></span></div>`;
  }

  function groupCard(gid, title, sub, list, extra = "") {
    const s = groupStats(list);
    return `<div class="gcard">
      <div class="gcard-head"><b>${title}</b><span class="muted">${s.total} từ</span></div>
      ${sub ? `<div class="gcard-sub">${sub}</div>` : ""}
      ${progressBar(s)}
      <div class="gcard-meta">đã học ${s.seen} · thuộc ${s.master}${s.due ? ` · <span class="bad">${s.due} cần ôn</span>` : ""}</div>
      <div class="gcard-actions">
        <button type="button" class="btn small primary" data-act="group-study" data-g="${escapeHtml(gid)}" data-m="flash" ${s.total ? "" : "disabled"}>🃏 Học</button>
        <button type="button" class="btn small" data-act="group-study" data-g="${escapeHtml(gid)}" data-m="mix" ${s.total ? "" : "disabled"}>🎲 Luyện</button>
        <button type="button" class="btn small" data-act="group-study" data-g="${escapeHtml(gid)}" data-m="list" ${s.total ? "" : "disabled"}>📖 Xem</button>
        ${extra}
      </div>
    </div>`;
  }

  function renderGroups() {
    const tab = ui.groupTab;
    const tabs = [
      ["topics", `🗂 Chủ đề (${shownTopics.length})`],
      ["families", `🧬 Họ từ (${families.length})`],
      ["lists", `⭐ Bộ từ của tôi (${lists.length})`],
    ];
    let body = "";
    if (tab === "topics") {
      body = `<p class="muted gintro">Học theo chủ đề giúp nhớ lâu hơn vì các từ liên quan được gợi nhớ cùng nhau. Mỗi từ thuộc một chủ đề chính.</p>
        <div class="ggrid">${shownTopics
          .map((t) => groupCard(`topic:${t.id}`, `${t.icon} ${escapeHtml(t.name)}`, "", groupWords(`topic:${t.id}`)))
          .join("")}</div>`;
    } else if (tab === "families") {
      const q = fold(famQuery.trim());
      const matches = families
        .map((f, fi) => ({ fi, ws: f.map((x) => words[x]) }))
        .filter((x) => x.ws.length >= famMin && (!q || x.ws.some((w) => fold(w.word).includes(q) || fold(w.meaning).includes(q))));
      const shown = matches.slice(0, famLimit);
      body = `<p class="muted gintro">Họ từ (word family) gom các từ cùng gốc: <i>success → successful → successfully → unsuccessful</i>.
          Học cả họ giúp đoán nghĩa từ mới và làm tốt bài biến đổi từ (🧬 Dạng từ).</p>
        <div class="gtools">
          <div class="search-input-wrap"><span class="search-icon">🔍</span>
            <input type="search" id="famSearch" placeholder="Tìm họ từ…" value="${escapeHtml(famQuery)}" autocomplete="off" spellcheck="false" /></div>
          <select class="sel" id="famMin" aria-label="Số từ tối thiểu">
            ${[2, 3, 4].map((n) => `<option value="${n}" ${famMin === n ? "selected" : ""}>Từ ${n} từ trở lên</option>`).join("")}
          </select>
          <button type="button" class="btn primary" data-act="group-study" data-g="families" data-m="wordform">🧬 Luyện dạng từ</button>
          <button type="button" class="btn" data-act="group-study" data-g="families" data-m="flash">🃏 Học tất cả họ</button>
        </div>
        <div class="fam-list">${shown
          .map((x) => {
            const s = groupStats(x.ws);
            return `<div class="fam-row">
              <div class="fam-words">${x.ws
                .map((w) => `<button type="button" class="fam-w st-${status(w)}" lang="en" data-act="speak-key" data-key="${escapeHtml(w.key)}" data-tip="1" title="${escapeHtml(w.short)}">${escapeHtml(w.main)} <i>${escapeHtml(w.pos.join(","))}</i></button>`)
                .join("")}</div>
              ${progressBar(s)}
              <div class="gcard-actions">
                <button type="button" class="btn small primary" data-act="group-study" data-g="family:${x.fi}" data-m="flash">🃏 Học</button>
                <button type="button" class="btn small" data-act="group-study" data-g="family:${x.fi}" data-m="wordform">🧬 Dạng từ</button>
              </div>
            </div>`;
          })
          .join("")}
          ${shown.length ? "" : `<p class="q-map-empty">Không tìm thấy họ từ nào.</p>`}
        </div>
        ${matches.length > shown.length ? `<div class="sync-actions center"><button type="button" class="btn" data-act="fam-more">Xem thêm (${matches.length - shown.length} họ)</button></div>` : ""}`;
    } else {
      body = `<p class="muted gintro">Tự tạo bộ từ theo mục tiêu riêng (vd: “Từ đi làm”, “Từ hay quên”). Thêm từ bằng ô “＋ Thêm vào bộ từ” ở phần thông tin từ sau mỗi câu.</p>
        <div class="sync-actions"><button type="button" class="btn primary" data-act="list-create">＋ Tạo bộ từ mới</button></div>
        <div class="ggrid">
          ${groupCard("star", "★ Đánh dấu", "Các từ bạn đã bấm ☆", groupWords("star"))}
          ${groupCard("leech", "🐛 Từ cứng đầu", `Đã quên ≥ ${LEECH} lần – nên viết ghi chú/mẹo nhớ`, groupWords("leech"))}
          ${groupCard("skipped", "🚫 Từ đã ẩn", "Không xuất hiện khi học. Bấm 📖 Xem rồi ↺ để hiện lại", groupWords("skipped"))}
          ${lists
            .map((l) =>
              groupCard(
                `list:${l.id}`,
                `🗂 ${escapeHtml(l.name)}`,
                "",
                groupWords(`list:${l.id}`),
                `<button type="button" class="btn small" data-act="list-rename" data-list="${l.id}" title="Đổi tên">✏️</button>
                 <button type="button" class="btn small" data-act="list-delete" data-list="${l.id}" title="Xóa bộ">🗑</button>`
              )
            )
            .join("")}
        </div>`;
    }
    return `<article class="exam-card vocab-card">
      <div class="card-header"><span class="card-code">NHÓM TỪ</span><span class="card-sep">|</span>
        <span class="card-qnum">Chọn một nhóm để học riêng</span></div>
      <div class="gtabs">${tabs
        .map(([id, label]) => `<button type="button" class="chip ${tab === id ? "active" : ""}" data-act="group-tab" data-v="${id}">${label}</button>`)
        .join("")}</div>
      ${body}
    </article>`;
  }

  // ---- Thống kê
  function renderStats() {
    const now = Date.now();
    const counts = { new: 0, learning: 0, young: 0, mastered: 0 };
    let due = 0, rSum = 0, rN = 0, leeches = 0;
    const forecast = new Array(30).fill(0);
    const today0 = dayStart(now);
    const ivlBuckets = [0, 0, 0, 0, 0];
    for (const w of words) {
      const st = status(w);
      counts[st]++;
      const c = cardOf(w);
      if (!c || !c.st) continue;
      if (c.due <= now) due++;
      if (isLeech(w)) leeches++;
      if (c.st === SRS.State.Review) {
        const r = SRS.recall(c, now);
        if (r !== null) {
          rSum += r;
          rN++;
        }
        const iv = c.ivl;
        ivlBuckets[iv < 7 ? 0 : iv < 21 ? 1 : iv < 60 ? 2 : iv < 180 ? 3 : 4]++;
      }
      const di = Math.max(0, Math.floor((dayStart(c.due) - today0) / DAY));
      if (di < 30) forecast[di]++;
    }
    // Tỉ lệ nhớ thực tế 30 ngày: các lượt chấm điểm khi từ đang ở trạng thái ôn tập
    const since = now / 1000 - 30 * 86400;
    let rvOk = 0, rvN = 0;
    const perMode = {};
    let totalMs = 0;
    for (const [t, , m, ok, g, prev, ms] of log) {
      const name = MODE_CODES[m] || "flash";
      const pm = perMode[name] || (perMode[name] = { n: 0, ok: 0, ms: 0 });
      pm.n++;
      pm.ok += ok;
      pm.ms += Math.min(ms, 60000);
      totalMs += Math.min(ms, 60000);
      if (t >= since && g > 0 && prev === SRS.State.Review) {
        rvN++;
        rvOk += g > 1 ? 1 : 0;
      }
    }
    const retention = rvN ? `${Math.round((rvOk / rvN) * 100)}%` : "—";
    const avgR = rN ? `${Math.round((rSum / rN) * 100)}%` : "—";
    const d0 = daily[dayKey()] || {};

    // Lịch hoạt động 26 tuần (cột = tuần, hàng = thứ Hai → Chủ nhật)
    const weeks = 26;
    const weekday = (new Date(today0).getDay() + 6) % 7;
    const startTs = today0 - ((weeks - 1) * 7 + weekday) * DAY;
    let heat = "";
    for (let ts = startTs; ts <= today0 + 1000; ts += DAY) {
      const n = daily[dayKey(ts + 3600000)]?.n || 0;
      const lv = n === 0 ? 0 : n < 10 ? 1 : n < 30 ? 2 : n < 60 ? 3 : 4;
      heat += `<span class="hm lv${lv}" title="${fmtDate(ts)}: ${n} lượt"></span>`;
    }
    const maxF = Math.max(1, ...forecast);
    const maxB = Math.max(1, ...ivlBuckets);
    const bucketNames = ["< 1 tuần", "1–3 tuần", "3 tuần – 2 tháng", "2–6 tháng", "> 6 tháng"];
    const tile = (num, label, cls = "", title = "") =>
      `<div class="stat-tile ${cls}" ${title ? `title="${escapeHtml(title)}"` : ""}><b>${num}</b><span>${label}</span></div>`;
    const hardest = words
      .filter((w) => (cardOf(w)?.lapses || 0) > 0 || (cardOf(w)?.bad || 0) > 1)
      .sort((a, b) => (cardOf(b).lapses || 0) - (cardOf(a).lapses || 0) || cardOf(b).bad - cardOf(a).bad)
      .slice(0, 12);
    return `<article class="exam-card vocab-card">
      <div class="card-header"><span class="card-code">THỐNG KÊ HỌC TẬP</span><span class="card-sep">|</span>
        <span class="card-qnum">Lịch ôn FSRS · mục tiêu ghi nhớ ${Math.round(settings.retention * 100)}%</span></div>
      <div class="stat-grid">
        ${tile(words.length - counts.new, "từ đã học")}
        ${tile(counts.mastered, "đã thuộc (ôn ≥ 21 ngày)", "ok")}
        ${tile(counts.young, "đang ghi nhớ")}
        ${tile(counts.learning, "đang học")}
        ${tile(due, "cần ôn ngay", due ? "bad" : "")}
        ${tile(retention, "tỉ lệ nhớ thực tế (30 ngày)", "", "Trong các lượt ôn từ đang theo lịch ôn, bao nhiêu lần bạn còn nhớ")}
        ${tile(avgR, "khả năng nhớ trung bình hiện tại", "", "Dự đoán của FSRS cho các từ đang ôn tập")}
        ${tile(`🔥 ${streak()}`, "ngày học liên tiếp")}
        ${tile(fmtMinutes(d0.ms || 0), "thời gian học hôm nay")}
        ${tile(fmtMinutes(totalMs), "tổng thời gian đã học")}
        ${tile(leeches, "từ cứng đầu", leeches ? "bad" : "")}
        ${tile(log.length, "lượt trả lời đã ghi")}
      </div>
      <h3 class="stat-h">Dự báo số từ cần ôn 30 ngày tới</h3>
      <div class="bars bars-30">${forecast
        .map((n, i) => `<div class="bar" title="${i === 0 ? "Hôm nay (gồm cả quá hạn)" : fmtDate(today0 + i * DAY)}: ${n} từ">
          <span class="bar-fill alt" style="height:${Math.round((n / maxF) * 100)}%"></span><small>${i === 0 ? "nay" : i % 5 === 0 ? `+${i}` : ""}</small></div>`)
        .join("")}</div>
      <h3 class="stat-h">Lịch học 26 tuần gần đây</h3>
      <div class="heatmap">${heat}</div>
      <div class="hm-legend">ít <span class="hm lv0"></span><span class="hm lv1"></span><span class="hm lv2"></span><span class="hm lv3"></span><span class="hm lv4"></span> nhiều</div>
      <h3 class="stat-h">Độ bền trí nhớ (khoảng ôn hiện tại)</h3>
      <div class="box-rows">${ivlBuckets
        .map(
          (n, b) => `<div class="box-row"><span>${bucketNames[b]}</span>
            <span class="box-track"><span style="width:${Math.round((n / maxB) * 100)}%"></span></span><b>${n}</b></div>`
        )
        .join("")}</div>
      <h3 class="stat-h">Hiệu quả theo cách học</h3>
      <div class="mode-table">${
        Object.keys(perMode).length
          ? Object.entries(perMode)
              .sort((a, b) => b[1].n - a[1].n)
              .map(
                ([name, s]) => `<div class="mode-row"><span>${MODES.find((m) => m.id === name)?.icon || ""} ${escapeHtml(MODE_TITLE[name] || name)}</span>
                  <span>${s.n} lượt</span><span>${Math.round((s.ok / s.n) * 100)}% đúng</span><span>${(s.ms / s.n / 1000).toFixed(1)} giây/câu</span></div>`
              )
              .join("")
          : `<p class="muted">Chưa có dữ liệu.</p>`
      }</div>
      <h3 class="stat-h">Từ hay quên nhất</h3>
      ${
        hardest.length
          ? `<div class="wrong-list">${hardest
              .map(
                (w) => `<div class="wrong-item"><button type="button" class="btn small" data-act="speak-key" data-key="${escapeHtml(w.key)}">🔊</button>
                  <b lang="en">${escapeHtml(w.word)}</b> – ${escapeHtml(w.short)} <span class="muted">(quên ${cardOf(w).lapses || 0} lần, sai ${cardOf(w).bad} lần)</span></div>`
              )
              .join("")}</div>
             <div class="sync-actions"><button type="button" class="btn primary" data-act="scope" data-v="hard">Luyện các từ hay sai</button></div>`
          : `<p class="muted">Chưa có từ nào bị quên. Tuyệt vời!</p>`
      }
    </article>`;
  }

  // ================================================================ thanh trên & bản đồ
  function renderStatLine() {
    let learned = 0, mastered = 0, due = 0;
    const now = Date.now();
    for (const w of words) {
      const c = cardOf(w);
      if (!c || !c.st) continue;
      learned++;
      if (c.st === SRS.State.Review && c.ivl >= MATURE_IVL) mastered++;
      if (c.due <= now) due++;
    }
    const d = daily[dayKey()] || {};
    const pct = words.length ? Math.round((mastered / words.length) * 100) : 0;
    els.statLine.innerHTML = `
      <span><b>${learned}</b> đã học</span>
      <span class="ok"><b>${mastered}</b> thuộc</span>
      <span class="bad"><b>${due}</b> cần ôn</span>
      <span>🔥 <b>${streak()}</b> ngày</span>
      <span title="Từ mới hôm nay / mục tiêu">Hôm nay <b>${d.nw || 0}</b>/${settings.goal} từ mới · <b>${d.n || 0}</b> lượt</span>
      <div class="progress-wrap" title="${pct}% số từ đã thuộc"><div class="progress-bar" style="width:${pct}%"></div></div>`;
    els.brandSub.textContent = `${words.length} từ · ${shownTopics.length} chủ đề · đã thuộc ${pct}%`;
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
    els.groupSel.innerHTML = `<optgroup label="Chủ đề">${shownTopics
      .map((t) => `<option value="topic:${t.id}">${t.icon} ${escapeHtml(t.name)}</option>`)
      .join("")}</optgroup>
      <optgroup label="Họ từ"><option value="families">🧬 Tất cả họ từ (học theo họ)</option>
      ${ui.group.startsWith("family:") ? `<option value="${ui.group}">${escapeHtml(groupLabel(ui.group))}</option>` : ""}</optgroup>
      <optgroup label="Bộ từ"><option value="star">★ Đánh dấu</option><option value="leech">🐛 Từ cứng đầu</option><option value="skipped">🚫 Từ đã ẩn</option>
      ${lists.map((l) => `<option value="list:${l.id}">🗂 ${escapeHtml(l.name)}</option>`).join("")}</optgroup>`;
    els.scopeSel.value = ui.scope;
    els.lessonSel.value = String(ui.lesson);
    els.groupSel.value = ui.group;
    els.posSel.value = ui.pos;
    els.lessonPick.hidden = ui.scope !== "lesson";
    els.groupSel.hidden = ui.scope !== "group";
    const noScope = ui.mode === "stats" || ui.mode === "groups";
    els.scopeSel.disabled = noScope;
    els.posSel.disabled = noScope;
    els.groupSel.disabled = noScope;
  }

  function renderLessonMap() {
    document.querySelectorAll("[data-map]").forEach((b) => b.classList.toggle("active", b.dataset.map === ui.mapView));
    if (ui.mapView === "topics") {
      els.mapTitle.textContent = "Chủ đề";
      els.mapCount.textContent = shownTopics.length;
      els.mapLegend.hidden = true;
      els.lessonMap.className = "topic-map";
      els.lessonMap.innerHTML = shownTopics
        .map((t) => {
          const gid = `topic:${t.id}`;
          const s = groupStats(groupWords(gid));
          const on = ui.scope === "group" && ui.group === gid;
          return `<button type="button" class="topic-row ${on ? "is-current" : ""}" data-group="${gid}" title="${escapeHtml(t.name)}: đã học ${s.seen}/${s.total}, thuộc ${s.master}">
            <span class="tr-name">${t.icon} ${escapeHtml(t.name)}</span>
            <span class="tr-count">${s.seen}/${s.total}</span>
            ${progressBar(s)}
          </button>`;
        })
        .join("");
      return;
    }
    els.mapTitle.textContent = "Bài học";
    els.mapCount.textContent = lessonCount;
    els.mapLegend.hidden = false;
    els.lessonMap.className = "q-map lesson-map";
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
      else if (s.seen) cls += s.seen / s.size >= 0.6 ? " lv2" : " lv1";
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
    const welcome = welcomeHtml();
    if (ui.mode === "list") html = renderList();
    else if (ui.mode === "stats") html = renderStats();
    else if (ui.mode === "groups") html = renderGroups();
    else if (!queue.length) html = renderEmpty();
    else if (ui.mode === "match") html = qpos >= queue.length ? renderSummary() : renderMatch();
    else if (qpos >= queue.length) html = renderSummary();
    else {
      const w = queue[qpos];
      const fresh = !cur || cur.w !== w || cur.src !== ui.mode;
      if (fresh) cur = makeQuestion(w);
      html = renderCurrent();
      if (fresh) afterShow();
    }
    const active = document.activeElement;
    const keepFocusId = active && (active.id === "listSearch" || active.id === "famSearch") ? active.id : null;
    els.view.innerHTML = welcome + html;
    if (settings.autoDict) {
      els.view.querySelectorAll(".wi-dict").forEach((el) => {
        const w = byKey.get(el.dataset.key);
        if (w && !dictData.has(w.key)) loadDict(w);
      });
    }
    if (keepFocusId) {
      const inp = $(keepFocusId);
      if (inp) {
        inp.focus({ preventScroll: true });
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    } else {
      const input = els.view.querySelector(".fill-input:not([disabled])");
      if (input) input.focus({ preventScroll: true });
      else if (!document.activeElement || document.activeElement === document.body) {
        // nút vừa bấm đã bị vẽ lại → đưa focus về thẻ câu hỏi để Tab tiếp tục được
        els.view.querySelector(".exam-card")?.focus({ preventScroll: true });
      }
    }
  }

  function renderCurrent() {
    switch (cur.mode) {
      case "flash":
        return renderFlash();
      case "en2vi":
      case "vi2en":
      case "listen":
      case "fill2":
      case "wordform":
        return renderChoice();
      case "cloze":
        return cur.pending ? renderPending() : renderChoice();
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

  function afterShow() {
    if (ui.mode === "cloze" || ui.mode === "mix") prefetchDict();
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
    if ((m === "flash" && !cur.reverse) || m === "en2vi" || m === "tf" || m === "speak") setTimeout(say, 250);
  }

  // ================================================================ điều hướng
  function setMode(mode) {
    if (!MODES.some((m) => m.id === mode)) return;
    ui.mode = mode;
    saveUi();
    listLimit = LIST_PAGE;
    if (!VIEW_MODES.has(mode)) buildQueue();
    render();
  }

  function setScope(scope) {
    ui.scope = scope;
    saveUi();
    listLimit = LIST_PAGE;
    if (ui.mode === "stats" || ui.mode === "groups") ui.mode = "flash";
    if (ui.mode !== "list") buildQueue();
    render();
  }

  function setGroup(gid, mode) {
    ui.group = gid;
    if (mode) ui.mode = mode;
    else if (ui.mode === "stats" || ui.mode === "groups") ui.mode = "flash";
    setScope("group");
  }

  function setLesson(n) {
    ui.lesson = Math.min(lessonCount, Math.max(1, n));
    setScope("lesson");
  }

  function createList(name) {
    const n = (name || "").trim().slice(0, 40);
    if (!n) return null;
    const l = { id: Date.now().toString(36), name: n, keys: [] };
    lists.push(l);
    markDirty("lists");
    return l;
  }

  els.modeBar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (b) setMode(b.dataset.mode);
  });
  els.scopeSel.addEventListener("change", () => setScope(els.scopeSel.value));
  els.lessonSel.addEventListener("change", () => setLesson(Number(els.lessonSel.value)));
  els.groupSel.addEventListener("change", () => setGroup(els.groupSel.value));
  $("lessonPrev").addEventListener("click", () => setLesson(ui.lesson - 1));
  $("lessonNext").addEventListener("click", () => setLesson(ui.lesson + 1));
  els.posSel.addEventListener("change", () => {
    ui.pos = els.posSel.value;
    saveUi();
    if (!VIEW_MODES.has(ui.mode)) buildQueue();
    render();
  });
  els.lessonMap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lesson]");
    if (b) return setLesson(Number(b.dataset.lesson));
    const g = e.target.closest("[data-group]");
    if (g) setGroup(g.dataset.group);
  });
  document.querySelectorAll("[data-map]").forEach((b) =>
    b.addEventListener("click", () => {
      ui.mapView = b.dataset.map;
      saveUi();
      renderLessonMap();
    })
  );

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
        return gradeFlash(Number(t.dataset.g));
      case "reverse":
        ui.reverse = !ui.reverse;
        saveUi();
        cur = null;
        return render();
      case "next":
        return next();
      case "undo":
        return undo();
      case "dontknow":
        return dontKnow();
      case "speak":
        return cur ? speakWord(cur.w) : undefined;
      case "slow":
        return cur ? speakWord(cur.w, 0.55) : undefined;
      case "dict-load": {
        const w = byKey.get(t.dataset.key);
        if (w) {
          if (!navigator.onLine) return toast("Cần có mạng để tải câu ví dụ.");
          dictData.delete(w.key);
          t.closest(".wi-dict").innerHTML = `<p class="muted dict-loading">Đang tải câu ví dụ…</p>`;
          loadDict(w);
        }
        return;
      }
      case "dict-audio":
        return playAudio(t.dataset.src);
      case "speak-key": {
        const w = byKey.get(t.dataset.key);
        if (!w) return;
        speakWord(w);
        // điện thoại không có tooltip khi rê chuột → hiện nghĩa bằng thông báo nhỏ
        if (t.dataset.tip) toast(`${w.main} (${w.type || "—"}): ${w.short}`);
        return;
      }
      case "star":
        if (cur) toggleStar(cur.w);
        return render();
      case "known": {
        if (!cur || cur.mode !== "flash" || cur.answered) return;
        cur.answered = true;
        const card = applyGrade(cur.w, 4, "flash", Date.now() - cur.shownAt);
        noteResult(cur.w, true);
        toast(`✓ “${cur.w.main}”: hẹn kiểm tra lại sau ${fmtDur(card.due - Date.now())}`);
        return next();
      }
      case "skip-key": {
        const w = byKey.get(t.dataset.key);
        if (!w) return;
        const m = metaOf(w);
        if (m.skip) {
          delete m.skip;
          toast(`↺ Đã hiện lại “${w.main}”`);
        } else {
          m.skip = 1;
          toast(`🚫 Đã ẩn “${w.main}” – khôi phục trong 📂 Nhóm từ → Bộ từ của tôi`);
        }
        markDirty("meta");
        if (m.skip && cur && cur.w === w && !VIEW_MODES.has(ui.mode)) {
          // từ đang học vừa bị ẩn → bỏ khỏi phiên và sang từ tiếp theo
          queue = queue.filter((x, i) => i <= qpos || x !== w);
          return next();
        }
        return render();
      }
      case "star-key": {
        const w = byKey.get(t.dataset.key);
        if (w) toggleStar(w);
        return render();
      }
      case "hint":
        if (cur && !cur.answered) {
          cur.hints = Math.min((cur.hints || 0) + 1, cur.w.main.length + 1);
          cur.typed = els.view.querySelector(".fill-input")?.value || "";
          render();
        }
        return;
      case "tf": {
        if (!cur || cur.answered) return;
        const right = (t.dataset.v === "1") === cur.truth;
        tfCombo = right ? tfCombo + 1 : 0;
        return finish(right);
      }
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
          for (const w of match.words) if (!match.done.has(w.idx)) noteResult(w, false);
        }
        qpos += match ? match.words.length : MATCH_SIZE;
        match = null;
        return render();
      case "more-new":
        dayLog().extra = (dayLog().extra || 0) + 10;
        markDirty("daily");
        buildQueue();
        return render();
      case "scope":
        return setScope(t.dataset.v);
      case "mode":
        return setMode(t.dataset.v);
      case "restart":
        buildQueue();
        return render();
      case "retry-wrong":
        buildQueue(shuffle([...session.wrong.values()]));
        return render();
      case "export-csv": {
        const name = listQuery ? `tim-${listQuery}` : ui.scope === "group" ? groupLabel(ui.group) : ui.scope === "lesson" ? `bai-${ui.lesson}` : ui.scope;
        return exportCsv(listMatches(), name);
      }
      case "welcome-start":
        ui.welcomed = true;
        ui.scope = "today";
        return setMode("flash");
      case "welcome-topics":
        ui.welcomed = true;
        ui.groupTab = "topics";
        return setMode("groups");
      case "welcome-help":
        return openModal("helpModal");
      case "welcome-close":
        ui.welcomed = true;
        saveUi();
        return render();
      case "list-more":
        listLimit += LIST_PAGE * 2;
        return render();
      case "goto-group":
        return setGroup(t.dataset.g);
      case "group-study":
        return setGroup(t.dataset.g, t.dataset.m);
      case "group-tab":
        ui.groupTab = t.dataset.v;
        saveUi();
        return render();
      case "fam-more":
        famLimit += 60;
        return render();
      case "list-create": {
        const l = createList(prompt("Tên bộ từ mới:", ""));
        if (l) toast(`Đã tạo bộ “${l.name}”. Thêm từ bằng ô “＋ Thêm vào bộ từ” sau mỗi câu.`);
        return render();
      }
      case "list-rename": {
        const l = lists.find((x) => x.id === t.dataset.list);
        const name = l && prompt("Tên mới:", l.name);
        if (l && name && name.trim()) {
          l.name = name.trim().slice(0, 40);
          markDirty("lists");
        }
        return render();
      }
      case "list-delete": {
        const l = lists.find((x) => x.id === t.dataset.list);
        if (l && confirm(`Xóa bộ từ “${l.name}”? (Tiến độ học của các từ vẫn giữ nguyên.)`)) {
          lists = lists.filter((x) => x !== l);
          if (ui.group === `list:${l.id}`) ui.group = "star";
          markDirty("lists", "ui");
        }
        return render();
      }
      case "list-remove": {
        const l = lists.find((x) => x.id === t.dataset.list);
        if (l) {
          l.keys = l.keys.filter((k) => k !== t.dataset.key);
          markDirty("lists");
        }
        return render();
      }
    }
  });

  els.view.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-change='list-add']");
    if (sel) {
      const key = sel.dataset.key;
      let l = null;
      if (sel.value === "__new") l = createList(prompt("Tên bộ từ mới:", ""));
      else l = lists.find((x) => x.id === sel.value);
      if (l && !l.keys.includes(key)) {
        l.keys.push(key);
        markDirty("lists");
        toast(`Đã thêm “${byKey.get(key)?.main || key}” vào bộ “${l.name}”`);
      }
      return render();
    }
    if (e.target.id === "famMin") {
      famMin = Number(e.target.value);
      famLimit = 60;
      render();
    }
  });

  els.view.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-form='typed']");
    if (!f) return;
    e.preventDefault();
    submitTyped(f.elements.ans.value);
  });

  let noteTimer = 0;
  els.view.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.note !== undefined) {
      const w = byKey.get(t.dataset.note);
      if (!w) return;
      const v = t.value.slice(0, 500);
      if (v.trim()) metaOf(w).note = v;
      else if (meta[w.key]) delete meta[w.key].note;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => markDirty("meta"), 400);
      return;
    }
    if (t.id === "listSearch") {
      listQuery = t.value;
      listLimit = LIST_PAGE;
      render();
    } else if (t.id === "famSearch") {
      famQuery = t.value;
      famLimit = 60;
      render();
    }
  });
  // Đang gõ ghi chú / chọn bộ từ thì không tự chuyển câu
  els.view.addEventListener("focusin", (e) => {
    if (e.target.matches("textarea, select")) clearTimeout(advanceTimer);
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
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
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (VIEW_MODES.has(ui.mode) || !cur) {
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
      if ((k === " " || (k === "enter" && e.target.closest?.(".flash-card"))) && !cur.flipped) {
        e.preventDefault();
        flip();
      } else if (cur.flipped && "1234".includes(k)) gradeFlash(Number(k));
      return;
    }
    if (cur.mode === "tf" && !cur.answered && (k === "d" || k === "s")) {
      const right = (k === "d") === cur.truth;
      tfCombo = right ? tfCombo + 1 : 0;
      finish(right);
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

  // ================================================================ hộp thoại
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
  $("btnBackup").addEventListener("click", async () => {
    $("backupStatus").hidden = true;
    await renderStorageInfo();
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

  function retentionNote() {
    const r = settings.retention;
    const ivl = SRS.intervalDays(10, { retention: r });
    $("setRetentionVal").textContent = `${Math.round(r * 100)}%`;
    $("retentionNote").textContent = `Ví dụ: từ có độ bền 10 ngày sẽ được ôn lại sau ${ivl} ngày. Mục tiêu cao → ôn dày hơn, nhớ chắc hơn; thấp → ôn ít hơn nhưng dễ quên hơn. 90% là mức cân bằng được khuyên dùng.`;
  }

  $("btnSettings").addEventListener("click", () => {
    $("setAccent").value = settings.accent;
    $("setRate").value = settings.rate;
    $("setRateVal").textContent = settings.rate;
    $("setGoal").value = settings.goal;
    $("setMaxReviews").value = settings.maxReviews;
    $("setRetention").value = settings.retention;
    $("setNewOrder").value = settings.newOrder;
    $("setDayStart").value = String(settings.dayStartHour);
    $("setAutoSpeak").checked = settings.autoSpeak;
    $("setAutoNext").checked = settings.autoNext;
    $("setAutoDict").checked = settings.autoDict;
    $("setFontScale").value = String(settings.fontScale || 1);
    retentionNote();
    fillVoices();
    openModal("settingsModal");
  });
  const onSetting = (id, ev, fn) =>
    $(id).addEventListener(ev, (e) => {
      fn(e.target);
      saveSettings();
    });
  const rebuildToday = () => {
    if (ui.scope === "today" && !VIEW_MODES.has(ui.mode)) buildQueue();
    render();
  };
  onSetting("setAccent", "change", (t) => {
    settings.accent = t.value;
    settings.voice = "";
    fillVoices();
  });
  onSetting("setVoice", "change", (t) => (settings.voice = t.value));
  onSetting("setRate", "input", (t) => {
    settings.rate = Number(t.value);
    $("setRateVal").textContent = settings.rate;
  });
  onSetting("setGoal", "change", (t) => {
    settings.goal = Math.min(200, Math.max(0, Number(t.value) || 0));
    t.value = settings.goal;
    rebuildToday();
  });
  onSetting("setMaxReviews", "change", (t) => {
    settings.maxReviews = Math.min(9999, Math.max(10, Number(t.value) || 200));
    t.value = settings.maxReviews;
    rebuildToday();
  });
  onSetting("setRetention", "input", (t) => {
    settings.retention = Math.min(0.97, Math.max(0.8, Number(t.value) || 0.9));
    retentionNote();
  });
  onSetting("setNewOrder", "change", (t) => {
    settings.newOrder = t.value;
    rebuildToday();
  });
  onSetting("setDayStart", "change", (t) => {
    settings.dayStartHour = Number(t.value) || 0;
    rebuildToday();
  });
  onSetting("setAutoSpeak", "change", (t) => (settings.autoSpeak = t.checked));
  onSetting("setAutoNext", "change", (t) => (settings.autoNext = t.checked));
  onSetting("setAutoDict", "change", (t) => (settings.autoDict = t.checked));
  onSetting("setFontScale", "change", (t) => {
    settings.fontScale = Number(t.value) || 1;
    applyFontScale();
  });
  $("btnTestVoice").addEventListener("click", () => speak("Hello! Let's learn three thousand English words together."));

  // ---- sao lưu
  function backupStatus(text, cls) {
    const el = $("backupStatus");
    el.hidden = false;
    el.className = `sync-status ${cls || ""}`;
    el.textContent = text;
  }

  async function renderStorageInfo() {
    const el = $("storageInfo");
    let used = 0;
    try {
      for (const k of Object.values(KEY)) used += (localStorage.getItem(k) || "").length * 2;
    } catch {
      /* ignore */
    }
    let persisted = null;
    try {
      persisted = await navigator.storage?.persisted?.();
    } catch {
      /* ignore */
    }
    const snap = load(KEY.snapshot, null);
    el.innerHTML = `Đang lưu <b>${Object.keys(cards).length}</b> từ đã học, <b>${log.length}</b> lượt trong nhật ký
      (~${Math.max(1, Math.round(used / 1024))} KB).
      ${persisted === true ? "✅ Trình duyệt đã cho phép lưu bền vững (không tự xóa khi thiếu bộ nhớ)." : persisted === false ? "⚠️ Trình duyệt có thể tự xóa dữ liệu khi thiếu bộ nhớ – nên xuất file sao lưu định kỳ." : ""}
      ${snap ? `<br>Bản tự động gần nhất: <b>${escapeHtml(snap.day)}</b> (${Object.keys(snap.cards || {}).length} từ).` : ""}`;
    $("btnRestoreSnapshot").hidden = !snap;
  }

  function exportData() {
    flush();
    return { app: "vocab3000", schema: 2, at: new Date().toISOString(), cards, meta, lists, log, daily, settings };
  }

  async function legacyMap() {
    const res = await fetch(`data/legacy_v1.json?v=${DATA_VER}`, { cache: "no-store" });
    return (await res.json()).map;
  }

  /** Chuyển tiến độ bản 1 (hộp Leitner, khóa theo số thứ tự) sang thẻ FSRS khóa theo từ */
  function convertV1(old, map) {
    const IV = [0, 1, 2, 4, 7, 15, 30, 60];
    const outCards = {};
    const outMeta = {};
    for (const [id, r] of Object.entries(old || {})) {
      const w = words[map[Number(id) - 1]];
      if (!w || !r) continue;
      if (r.star) outMeta[w.key] = { star: 1 };
      if (!r.s) continue;
      const ivl = IV[r.b] || 0;
      outCards[w.key] = {
        st: r.b > 0 ? SRS.State.Review : SRS.State.Learning,
        s: Math.max(0.5, ivl || 0.5),
        d: Math.min(10, Math.max(1, 5 + (r.bad || 0) * 0.6 - (r.ok || 0) * 0.2)),
        due: r.d || Date.now(),
        last: r.t || Date.now(),
        step: 0,
        ivl,
        reps: r.s,
        lapses: r.bad || 0,
        ok: r.ok || 0,
        bad: r.bad || 0,
      };
    }
    return { cards: outCards, meta: outMeta };
  }

  /** Gộp dữ liệu nhập vào: mỗi từ giữ bản được ôn gần nhất */
  function mergeIn(d) {
    for (const [k, c] of Object.entries(d.cards || {})) {
      if (!byKey.has(k)) continue;
      if (!cards[k] || (c.last || 0) > (cards[k].last || 0)) cards[k] = c;
    }
    for (const [k, m] of Object.entries(d.meta || {})) {
      const local = meta[k] || {};
      const merged = { ...m, ...local, note: local.note || m.note, star: local.star || m.star };
      if (!merged.note) delete merged.note;
      if (!merged.star) delete merged.star;
      meta[k] = merged;
    }
    for (const l of d.lists || []) {
      const mine = lists.find((x) => x.id === l.id);
      if (mine) mine.keys = [...new Set([...mine.keys, ...l.keys])];
      else lists.push({ ...l, keys: [...l.keys] });
    }
    const seen = new Set(log.map((e) => `${e[0]}|${e[1]}`));
    for (const e of d.log || []) if (!seen.has(`${e[0]}|${e[1]}`)) log.push(e);
    log.sort((a, b) => a[0] - b[0]);
    if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
    for (const [k, v] of Object.entries(d.daily || {})) {
      const mine = daily[k];
      if (!mine) daily[k] = { ...v };
      else for (const f of Object.keys(v)) mine[f] = Math.max(mine[f] || 0, v[f] || 0);
    }
  }

  let importMode = "merge";
  $("btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportData())], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tien-do-3000-tu-vung-${dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    backupStatus("Đã xuất file tiến độ (gồm lịch ôn, nhật ký, ghi chú và bộ từ).", "ok");
  });
  $("btnImport").addEventListener("click", () => {
    importMode = "merge";
    $("importFile").click();
  });
  $("btnImportReplace").addEventListener("click", () => {
    importMode = "replace";
    $("importFile").click();
  });
  $("importFile").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      let d = JSON.parse(await f.text());
      if (d.app !== "vocab3000") throw new Error("Không phải file tiến độ của web này");
      if (d.schema !== 2) {
        // file của bản 1: { progress, daily, settings }
        const conv = convertV1(d.progress, await legacyMap());
        d = { cards: conv.cards, meta: conv.meta, daily: d.daily, lists: [], log: [], settings: d.settings };
      }
      if (importMode === "replace") {
        if (!confirm("Thay thế toàn bộ tiến độ hiện tại bằng file này?")) return;
        cards = {};
        meta = {};
        lists = [];
        log = [];
        daily = {};
      }
      mergeIn(d);
      if (d.settings && importMode === "replace") {
        settings = Object.assign(settings, d.settings);
        applyFontScale();
      }
      markDirty("cards", "meta", "lists", "log", "daily", "settings");
      flush();
      if (!VIEW_MODES.has(ui.mode)) buildQueue();
      render();
      await renderStorageInfo();
      backupStatus(`Đã ${importMode === "replace" ? "thay thế" : "gộp"} tiến độ: ${Object.keys(cards).length} từ đã học.`, "ok");
    } catch (err) {
      backupStatus("Không đọc được file: " + err.message, "err");
    }
  });
  $("btnRestoreSnapshot").addEventListener("click", async () => {
    const snap = load(KEY.snapshot, null);
    if (!snap || !confirm(`Khôi phục tiến độ về bản tự động ngày ${snap.day}? Các lượt học sau thời điểm đó sẽ mất.`)) return;
    cards = snap.cards || {};
    meta = snap.meta || {};
    lists = snap.lists || [];
    daily = snap.daily || {};
    markDirty("cards", "meta", "lists", "daily");
    flush();
    if (!VIEW_MODES.has(ui.mode)) buildQueue();
    render();
    await renderStorageInfo();
    backupStatus("Đã khôi phục bản tự động.", "ok");
  });
  $("btnResetProgress").addEventListener("click", async () => {
    if (!confirm("Xóa toàn bộ tiến độ học trên trình duyệt này? Không thể hoàn tác (trừ khi bạn đã xuất file).")) return;
    cards = {};
    meta = {};
    lists = [];
    log = [];
    daily = {};
    markDirty("cards", "meta", "lists", "log", "daily");
    flush();
    if (!VIEW_MODES.has(ui.mode)) buildQueue();
    render();
    await renderStorageInfo();
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

  function applyFontScale() {
    const sc = Math.min(1.3, Math.max(0.9, Number(settings.fontScale) || 1));
    document.documentElement.style.fontSize = sc === 1 ? "" : `${Math.round(sc * 100)}%`;
  }
  applyFontScale();

  // ================================================================ khởi động
  /** Mỗi ngày lưu một bản sao tiến độ (không gồm nhật ký) để khôi phục khi lỡ tay */
  function dailySnapshot() {
    const snap = load(KEY.snapshot, null);
    const today = dayKey();
    if (snap && snap.day === today) return;
    if (!Object.keys(cards).length) return;
    save(KEY.snapshot, { day: today, cards, meta, lists, daily });
  }

  async function migrateFromV1() {
    if (load(KEY.migrated, false)) return;
    const old = load(KEY.v1progress, null);
    if (!old || !Object.keys(old).length) {
      save(KEY.migrated, true);
      return;
    }
    try {
      const conv = convertV1(old, await legacyMap());
      mergeIn({ cards: conv.cards, meta: conv.meta });
      markDirty("cards", "meta");
      flush();
      save(KEY.migrated, true);
      const n = Object.keys(conv.cards).length;
      if (n) toast(`✅ Đã chuyển tiến độ cũ (${n} từ) sang lịch ôn FSRS mới.`, 6000);
    } catch (err) {
      console.error("Không chuyển được tiến độ cũ", err);
    }
  }

  (async function init() {
    render();
    try {
      const res = await fetch(`data/vocab.json?v=${DATA_VER}`, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      prepare(await res.json());
    } catch (err) {
      console.error(err);
      els.view.innerHTML = `<article class="exam-card"><p>Không tải được dữ liệu từ vựng. Hãy mở trang qua một web server (không mở trực tiếp file).</p></article>`;
      return;
    }
    await migrateFromV1();
    dailySnapshot();
    try {
      navigator.storage?.persist?.();
    } catch {
      /* ignore */
    }
    if (!MODES.some((m) => m.id === ui.mode)) ui.mode = "flash";
    if (!SCOPES.some(([v]) => v === ui.scope)) ui.scope = "today";
    if (!ui.group || (!groupWords(ui.group).length && !ui.group.startsWith("list:"))) ui.group = "topic:food";
    ui.lesson = Math.min(lessonCount, Math.max(1, ui.lesson || 1));
    if (!VIEW_MODES.has(ui.mode)) buildQueue();
    render();
    setupPwa();
  })();

  // ================================================================ cài app & offline (PWA)
  function setupPwa() {
    const okOrigin = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if ("serviceWorker" in navigator && okOrigin) {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker
        .register("sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          // lưu sẵn dữ liệu từ vựng để mở được khi không có mạng
          reg.active?.postMessage({
            type: "precache",
            urls: [`data/vocab.json?v=${DATA_VER}`, `data/legacy_v1.json?v=${DATA_VER}`],
          });
        })
        .catch((err) => console.warn("Không đăng ký được service worker", err));
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hadController) toast("🔄 Đã có phiên bản mới – tải lại trang để dùng bản mới nhất.", 6000);
      });
    }

    const btn = $("btnInstall");
    let deferred = null;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
    });
    btn.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => null);
      deferred = null;
      btn.hidden = true;
      if (choice?.outcome === "accepted") toast("📲 Đã cài app – mở từ màn hình chính để học cả khi offline.");
    });
    window.addEventListener("appinstalled", () => {
      btn.hidden = true;
    });

    window.addEventListener("offline", () => toast("📴 Đang offline – vẫn học bình thường, tiến độ lưu trên máy."));
    window.addEventListener("online", () => toast("🌐 Đã có mạng trở lại."));
  }
})();
