# -*- coding: utf-8 -*-
"""Đọc PDF "3000 từ vựng tiếng Anh thông dụng nhất" thành danh sách từ.

Cần: pip install pymupdf
Dùng qua: python tools/build_vocab.py "C:/duong/dan/3000.pdf"

PDF có hai kiểu bố cục (số thứ tự và từ trên cùng một dòng hoặc tách dòng),
nên parser đọc tuần tự theo số thứ tự 1, 2, 3… và tự nhận diện từ loại / phiên âm / nghĩa.
"""
import re
import sys

import pymupdf

HEADER = re.compile(
    r"^(`|Oxford 3000TM|Trang \d+|3000 TỪ VỰNG.*|https?://.*|No\.|Word|Type|Pronounce|Meaning|EEFC|"
    r"Effortless English Fanclub Community|www\..*)$"
)
VI = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.I)

# Token từ loại (kể cả các lỗi dính chữ trong PDF) -> dạng chuẩn
TOK = {
    "n": "n", "v": "v", "adj": "adj", "adv": "adv", "prep": "prep", "det": "det", "pron": "pron",
    "pro": "pron", "conj": "conj", "exclam": "exclam", "exclamation": "exclam", "number": "number",
    "modal": "modal", "auxiliary": "aux", "vauxiliary": "v", "aux": "aux", "article": "article",
    "prefix": "prefix", "abbr": "abbr", "detpron": "det,pron", "ndet": "n,det", "nv": "n,v",
    "adjv": "adj,v", "vconj": "v,conj", "nprep": "n,prep", "of": "@of", "to": "@to", "on": "@on", "infinitive": "", "marker": "",
    "indefinite": "", "definite": "", "ordinal": "",
}
ALT = "|".join(sorted(TOK, key=len, reverse=True))
TYPE = re.compile(r"^(?:(?:%s)[\s,./]*)+$" % ALT, re.I)
TYPE_THEN_IPA = re.compile(r"^((?:(?:%s)\s*,?\s*)+?)\s+(\S+)$" % ALT, re.I)
TYPE_AT_END = re.compile(r"^(.*?)\s+((?:n|v|adj|adv|prep|det|pron|conj|number)(?:\s*,\s*(?:n|v|adj|adv|prep|det|pron|conj))*)$")

# Sửa tay các dòng PDF bị lệch cột: số thứ tự -> (word, type, ipa, meaning)
FIX = {
    98: ("all right", "adj, adv, exclam", "ɔ:l'rait", "tốt, ổn, khỏe mạnh; được"),
    465: ("cent", "n", "sent", "đồng xu (bằng 1/100 đô la)"),
    467: ("centimetre, centimeter", "n", "'senti,mi:tə", "xen-ti-mét"),
    1048: ("etc., et cetera", "abbr", "et setərə", "vân vân"),
    1307: ("give birth (to)", "v", "", "sinh ra, sinh con"),
    1344: ("gray", "adj, n", "grei", "xám, hoa râm (tóc)"),
    1468: ("ice cream", "n", "ais kri:m", "kem"),
    1641: ("kilogram, kilogramme, kilo", "n", "´kilou¸græm", "ki-lô-gam (viết tắt kg)"),
    1845: ("mid-", "prefix", "", "tiền tố: giữa, một nửa"),
    1854: ("milligram, milligramme", "n", "´mili¸græm", "mi-li-gam (viết tắt mg)"),
    1855: ("millimetre, millimeter", "n", "´mili¸mi:tə", "mi-li-mét (viết tắt mm)"),
    1897: ("mouse", "n", "maus", "chuột"),
    1940: ("need", "v, modal, n", "ni:d", "cần, đòi hỏi; sự cần"),
    1988: ("number", "n", "´nʌmbə", "số (viết tắt No)"),
    2040: ("opposed to", "adj", "ə´pouzd", "chống lại, phản đối"),
    2076: ("p.m.", "abbr", "pi: 'em", "quá trưa, chiều, tối (viết tắt PM)"),
    2131: ("per cent, percent", "n, adj, adv", "pə'sent", "phần trăm"),
    2216: ("pop", "n, v", "pɒp", "tiếng nổ bốp; nhạc pop; nổ bốp"),
    2618: ("self-", "prefix", "", "tự bản thân mình, cái tôi"),
    3007: ("the", "article", "ði:, ðə", "cái, con, người, ấy, này…"),
    3049: ("till, until", "conj, prep", "til", "cho đến khi, tới lúc mà"),
    3143: ("unacceptable", "adj", "¸ʌnək´septəbl", "không thể chấp nhận"),
    3145: ("uncertain", "adj", "ʌn'sə:tn", "không chắc chắn, không biết rõ ràng"),
    3148: ("uncomfortable", "adj", "ʌn´kʌmfətəbl", "bất tiện, không thoải mái"),
    3150: ("unconscious", "adj", "ʌn'kɔnʃəs", "bất tỉnh, ngất đi"),
}
DROP = {942}  # trùng lặp "each other"


def norm_type(line):
    out, extra = [], []
    for t in re.split(r"[\s,./]+", line.strip().lower()):
        if not t:
            continue
        for x in TOK.get(t, t).split(","):
            if not x:
                continue
            if x.startswith("@"):
                extra.append(x[1:])
            elif x not in out:
                out.append(x)
    return ", ".join(out), " ".join(extra)


def read_lines(pdf_path):
    doc = pymupdf.open(pdf_path)
    lines = []
    for page in doc:
        for l in page.get_text().split("\n"):
            l = l.strip()
            if not l or HEADER.match(l):
                continue
            m = re.match(r"^(\d+) (.+)$", l)
            if m:
                lines += [m.group(1), m.group(2)]
            else:
                lines.append(l)
    return lines


def parse(lines):
    entries, i, expect = [], 0, 1
    while i < len(lines):
        if lines[i] != str(expect):
            i += 1
            continue
        word, j, typ = lines[i + 1], i + 2, ""
        while word.endswith(",") and j < len(lines) and not TYPE.match(lines[j]):
            word = word + " " + lines[j]
            j += 1
        if j < len(lines) and TYPE.match(lines[j]):
            typ, extra = norm_type(lines[j])
            j += 1
            if extra:
                word = f"{word} ({extra})"
        elif j < len(lines) and TYPE_THEN_IPA.match(lines[j]) and not VI.search(lines[j]):
            m = TYPE_THEN_IPA.match(lines[j])
            typ, _ = norm_type(m.group(1))
            lines[j] = m.group(2)
        else:
            m = TYPE_AT_END.match(word)
            if m:
                word, typ = m.group(1), norm_type(m.group(2))[0]
        nxt, ipa, meaning = str(expect + 1), "", []
        if j < len(lines) and lines[j] != nxt and not VI.search(lines[j]):
            ipa = lines[j]
            j += 1
        while j < len(lines) and lines[j] != nxt:
            meaning.append(lines[j])
            j += 1
        entries.append([expect, word, typ, ipa, " ".join(meaning)])
        expect += 1
        i = j
    return entries


def clean(s):
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([,;.)])", r"\1", s)
    s = re.sub(r"\(\s+", "(", s)
    return s.rstrip(".").strip()


def extract_v1(pdf_path):
    """Danh sách từ "phiên bản 1" (thứ tự giống bản web đầu tiên, dùng để chuyển tiến độ cũ)."""
    words = []
    for no, word, typ, ipa, meaning in parse(read_lines(pdf_path)):
        if no in DROP:
            continue
        if no in FIX:
            word, typ, ipa, meaning = FIX[no]
        words.append([clean(word), typ, clean(ipa).replace("ɳ", "ŋ"), clean(meaning)])
    return words


if __name__ == "__main__":
    sys.exit("Hãy chạy: python tools/build_vocab.py <file.pdf>")
