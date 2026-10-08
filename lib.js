/* Hàm thuần dùng chung (không đụng tới giao diện) — tách riêng để kiểm thử được bằng Node */
(function (root) {
  "use strict";

  const PREPS = /^(of|to|on|in|for|with|at)$/i;

  /**
   * Các cách viết được chấp nhận của một mục từ.
   *  "analyse, analyze"      → analyse, analyze
   *  "approve (of)"          → approve, approve of
   *  "arrive (at, in)"       → arrive, arrive at, arrive in
   *  "cope (+ with)"         → cope, cope with
   *  "born (be born)"        → born, be born
   *  "mobile phone (mobile)" → mobile phone, mobile
   *  "July (abbr Jul)"       → July (bỏ qua phần viết tắt)
   * Phần tử đầu tiên là cách viết chính (dùng để hiển thị, đọc, tạo gợi ý).
   */
  function variantsOf(word) {
    const extras = (word.match(/\(([^)]*)\)/g) || []).map((ex) => ex.slice(1, -1).trim());
    const base = word.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const out = [];
    for (const part of base.split(",")) {
      const p = part.trim();
      if (!p) continue;
      out.push(p);
      for (const ex of extras) {
        if (/^abbr\b/i.test(ex)) continue;
        for (let t of ex.split(",")) {
          t = t.replace(/^\+\s*/, "").trim();
          if (!t) continue;
          out.push(PREPS.test(t) ? `${p} ${t}` : t);
        }
      }
    }
    return out.length ? [...new Set(out)] : [word];
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

  /** Bỏ luôn dấu nháy, dấu chấm, gạch nối, khoảng trắng: "o'clock" = "oclock", "e.g." = "eg" */
  const compactAnswer = (s) => normAnswer(s).replace(/['\- ]/g, "");

  /** Câu trả lời có khớp một trong các cách viết không */
  function answerMatches(variants, text) {
    const t = normAnswer(text);
    if (!t) return false;
    const c = compactAnswer(text);
    return variants.some((v) => normAnswer(v) === t || (c.length >= 2 && compactAnswer(v) === c));
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

  root.VocabLib = { variantsOf, normAnswer, compactAnswer, answerMatches, fold };
})(typeof window !== "undefined" ? window : globalThis);
