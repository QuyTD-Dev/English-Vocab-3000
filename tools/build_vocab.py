# -*- coding: utf-8 -*-
"""Tạo data/vocab.json (bản 2) từ PDF "3000 từ vựng":

  1. Đọc PDF (tools/parse_pdf.py) ra danh sách bản 1.
  2. Làm sạch: gộp mục trùng, sửa mục lỗi do PDF.
  3. Phân loại chủ đề (tools/topics.py) và tìm họ từ (word family).
  4. Ghi data/vocab.json + data/legacy_v1.json (bảng đổi số thứ tự bản 1 -> từ bản 2,
     để web chuyển tiến độ cũ sang khóa mới).

Chạy: python tools/build_vocab.py "C:/duong/dan/3000.pdf"
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_pdf import extract_v1  # noqa: E402
from topics import FALLBACK_TOPICS, FUNCTION_POS, FUNCTION_TOPIC, FUNCTION_WORDS, OTHER_TOPIC, TOPICS  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

# --------------------------------------------------------------------------- làm sạch
# Gộp mục trùng: từ giữ lại <- các từ bị gộp vào; có thể đổi luôn các cột
MERGE = [
    ("apart from", ["apart from, aside from"], {"word": "apart from, aside from"}),
    ("behalf", ["behalf, on sb’s behalf"], {}),
    ("centimetre, centimeter", ["centimetre"], {}),
    ("disc, disk", ["disk"], {}),
    ("kilometre, kilometer (abbr k, km)", ["kilometre"],
     {"word": "kilometre, kilometer", "meaning": "ki-lô-mét (viết tắt km)"}),
    ("further", ["further, furthest"], {}),
    ("grey", ["grey, usually gray", "gray"], {"word": "grey, gray", "type": "adj, n"}),
    ("television (TV)", ["TV television"], {"word": "television, TV"}),
    ("until, till", ["till, until"], {}),
    ("gram, gramme (abbr g, gm)", ["gram"],
     {"word": "gram, gramme", "meaning": "gam (đơn vị khối lượng, viết tắt g)"}),
    ("swell", ["swollen swell"], {}),
    ("good", ["good, well"], {}),
    ("unfair", ["Unfair, unfairly"], {}),
    ("uncontrolled", ["uncontrolled, control"], {}),
    ("uncomfortable", [], {"ipa": "ʌn´kʌmfətəbl"}),
]
# Sửa từng mục: từ gốc -> các cột mới
EDIT = {
    "suf": {"word": "street", "type": "n", "ipa": "stri:t", "meaning": "phố, đường phố"},
    "seem linking": {"word": "seem"},
    "one number": {"word": "one", "type": "number, det, pron"},
    "o clock": {"word": "o'clock"},
    "well": {"type": "adv, adj, exclam", "ipa": "wel", "meaning": "tốt, giỏi; ôi, may quá!"},
    "e.g": {"word": "e.g."},
    "i.e": {"word": "i.e.", "type": "abbr"},
    "p.m": {"word": "p.m."},
    "Unusual": {"word": "unusual", "type": "adj"},
    "Unwilling": {"word": "unwilling", "type": "adj"},
    "anyone (anybod)": {"word": "anyone, anybody"},
    "nobody (noone)": {"word": "nobody, no one"},
    "pub, publicyhouse": {"word": "pub, public house"},
    "January (abbrJan)": {"word": "January (abbr Jan)"},
    "mathematics, also maths": {"word": "mathematics, maths"},
    "bicycle (bike)": {"word": "bicycle, bike"},
    "photograph (photo)": {"word": "photograph, photo"},
    "telephone (phone)": {"word": "telephone, phone"},
    "OK (okay)": {"word": "OK, okay"},
    "blonde (blond)": {"word": "blonde, blond"},
    "doctor (abbr Dr)": {"word": "doctor"},
}


def merge_meaning(a, b):
    if not b or b in a:
        return a
    if a in b:
        return b
    return f"{a}; {b}"


def clean_words(v1):
    """Trả về (danh sách bản 2, bảng v1_index -> v2_index)."""
    by_word = defaultdict(list)
    for i, w in enumerate(v1):
        by_word[w[0]].append(i)
    target_of = {}  # v1 index -> v1 index giữ lại
    overrides = {}
    # mục trùng y hệt (side, uncertain…): gộp vào mục đầu
    for word, idxs in by_word.items():
        for j in idxs[1:]:
            target_of[j] = idxs[0]
    for keep, others, ov in MERGE:
        assert keep in by_word, f"MERGE: không thấy '{keep}'"
        k = by_word[keep][0]
        for o in others:
            assert o in by_word, f"MERGE: không thấy '{o}'"
            for j in by_word[o]:
                target_of[j] = k
        overrides[k] = ov

    merged = {}
    for i, w in enumerate(v1):
        k = target_of.get(i, i)
        if k not in merged:
            merged[k] = list(v1[k])
        if k != i:
            m = merged[k]
            m[3] = merge_meaning(m[3], w[3])
            if not m[2]:
                m[2] = w[2]
            if not m[1]:
                m[1] = w[1]
    for k, ov in overrides.items():
        for field, val in ov.items():
            merged[k][["word", "type", "ipa", "meaning"].index(field)] = val
    for k, m in merged.items():
        if m[0] in EDIT:
            for field, val in EDIT[m[0]].items():
                m[["word", "type", "ipa", "meaning"].index(field)] = val

    order = sorted(merged)  # giữ thứ tự gốc (theo bảng chữ cái của PDF)
    pos_of = {k: n for n, k in enumerate(order)}
    words = [merged[k] for k in order]
    legacy = [pos_of[target_of.get(i, i)] for i in range(len(v1))]
    keys = Counter(w[0] for w in words)
    dup = [k for k, c in keys.items() if c > 1]
    assert not dup, f"Từ bị trùng khóa: {dup}"
    return words, legacy


# --------------------------------------------------------------------------- tiện ích
def variants(word):
    base = re.sub(r"\([^)]*\)", " ", word)
    out = [p.strip() for p in base.split(",") if p.strip()]
    return out or [word]


def pos_list(w):
    return [t.strip() for t in w[1].split(",") if t.strip()]


# --------------------------------------------------------------------------- họ từ
SUFFIXES = [
    "ically", "ally", "ily", "ly", "ness", "ment", "ation", "ition", "ion", "ity", "ive", "ial", "al", "ful",
    "less", "able", "ible", "ably", "ibly", "er", "or", "ist", "ing", "ed", "d", "ence", "ance", "ency", "ancy",
    "ous", "ious", "ic", "ical", "y", "ship", "ure", "ize", "ise", "th", "ty", "ness", "ess", "ee", "ant", "ent",
    "s", "es", "en", "ise",
]
PREFIXES = ["un", "in", "im", "il", "ir", "dis"]
# Các cặp trông giống nhau nhưng không cùng họ
BLACKLIST = {
    ("early", "ear"), ("letter", "let"), ("bitter", "bit"), ("rubber", "rub"), ("summer", "sum"),
    ("manner", "man"), ("only", "on"), ("flower", "flow"), ("shower", "show"), ("offer", "off"),
    ("evening", "even"), ("seed", "see"), ("feed", "fee"), ("news", "new"), ("means", "mean"),
    ("goods", "good"), ("busy", "bus"), ("ready", "read"), ("holy", "hole"), ("story", "store"),
    ("army", "arm"), ("party", "part"), ("county", "count"), ("inside", "side"), ("inform", "form"),
    ("intend", "tend"), ("import", "port"), ("impress", "press"), ("impose", "pose"), ("improve", "prove"),
    ("disappoint", "appoint"), ("discover", "cover"), ("discount", "count"), ("disease", "ease"),
    ("dismiss", "miss"), ("display", "play"), ("dissolve", "solve"), ("partner", "part"), ("tower", "tow"),
    ("corner", "corn"), ("hunger", "hung"), ("finger", "fin"), ("ginger", "gin"), ("carpet", "carp"),
    ("hardly", "hard"), ("lately", "late"), ("nearly", "near"), ("shortly", "short"), ("highly", "high"),
    ("barely", "bare"), ("mostly", "most"), ("pretty", "pret"), ("sorry", "sore"), ("butter", "butt"),
    ("planet", "plan"), ("plane", "plan"), ("planning", "plane"), ("rating", "rat"), ("spring", "spr"),
    ("being", "be"), ("wing", "win"), ("winning", "wine"), ("king", "kin"), ("bowl", "bow"),
    ("cousin", "cous"), ("present", "pres"), ("person", "pers"), ("reason", "reas"), ("season", "seas"),
    ("lesson", "less"), ("poison", "pois"), ("prison", "pris"), ("arms", "arm"), ("glasses", "glass"),
    ("customs", "custom"), ("remains", "remain"), ("thanks", "thank"), ("surroundings", "surrounding"),
    ("sometimes", "sometime"), ("mechanic", "mechan"), ("belly", "bell"), ("bully", "bull"), ("rely", "re"),
    ("apply", "app"), ("supply", "sup"), ("comply", "comp"), ("family", "famil"), ("homely", "home"),
    ("lovely", "love"), ("ugly", "ug"), ("ally", "all"), ("allied", "all"), ("allied", "ally"),
    ("bully", "bull"), ("costly", "cost"), ("silly", "sill"), ("timely", "time"), ("fly", "f"),
    ("ending", "end"), ("ceiling", "ceil"), ("darling", "darl"), ("needle", "need"), ("listen", "list"),
    ("hidden", "hid"), ("garden", "gard"), ("heaven", "heave"), ("often", "oft"), ("open", "ope"),
    ("woman", "wom"), ("human", "hum"), ("dozen", "doze"), ("citizen", "citiz"), ("kitchen", "kitch"),
    ("chicken", "chick"), ("seven", "seve"), ("eleven", "eleve"), ("golden", "gold"), ("sudden", "sudd"),
    ("sweater", "sweat"), ("powder", "pow"), ("ladder", "lad"), ("matter", "mat"), ("hammer", "ham"),
    ("dinner", "din"), ("banner", "ban"), ("pepper", "pep"), ("paper", "pap"), ("water", "wat"),
    ("cover", "cov"), ("over", "ov"), ("ever", "ev"), ("never", "nev"), ("silver", "silv"),
    ("liver", "live"), ("river", "rive"), ("fever", "fev"), ("clever", "clev"), ("lover", "love"),
    ("monitor", "monit"), ("motor", "mot"), ("mirror", "mirr"), ("error", "err"), ("horror", "horr"),
    ("doctor", "doct"), ("major", "maj"), ("minor", "min"), ("floor", "flo"), ("door", "do"),
    ("normal", "norm"), ("total", "tot"), ("capital", "capit"), ("hospital", "hospit"), ("general", "gener"),
    ("animal", "anim"), ("metal", "met"), ("royal", "roy"), ("equal", "equ"), ("local", "loc"),
    ("medal", "med"), ("pedal", "ped"), ("mental", "ment"), ("signal", "sign"), ("legal", "leg"),
    ("crystal", "cryst"), ("trial", "try"), ("rival", "riv"), ("oval", "ov"), ("final", "fin"),
    ("festival", "festive"), ("material", "materi"), ("journal", "journ"), ("arrival", "arriv"),
    ("deny", "den"), ("tidy", "tide"), ("lady", "lad"), ("body", "bod"), ("city", "cit"), ("duty", "dut"),
    ("copy", "cop"), ("diary", "dia"), ("fancy", "fanc"), ("honey", "hone"), ("money", "mone"),
    ("study", "stud"), ("sticky", "stick"), ("ugly", "ugl"), ("candy", "cand"), ("handy", "hand"),
    ("county", "coun"), ("plenty", "plent"), ("twenty", "twent"), ("sixty", "six"), ("forty", "fort"),
    ("worship", "wors"), ("worship", "worse"), ("hardship", "hard"), ("ship", "sh"), ("mature", "mat"),
    ("nature", "nat"), ("future", "fut"), ("picture", "pict"), ("culture", "cult"), ("measure", "meas"),
    ("pleasure", "pleas"), ("treasure", "treas"), ("figure", "fig"), ("feature", "feat"),
    ("temperature", "temper"), ("furniture", "furnit"), ("lecture", "lect"), ("mixture", "mix"),
    ("adventure", "advent"), ("structure", "struct"), ("pressure", "press"), ("exposure", "expose"),
    ("failure", "fail"), ("departure", "depart"), ("procedure", "proceed"), ("seizure", "seize"),
    ("closure", "close"), ("creature", "creat"), ("legislature", "legislat"), ("signature", "sign"),
    ("sculpture", "sculpt"), ("tent", "t"), ("parent", "par"), ("talent", "tal"), ("event", "ev"),
    ("comment", "comm"), ("moment", "mom"), ("cement", "cem"), ("element", "elem"), ("segment", "seg"),
    ("garment", "garm"), ("payment", "pay"), ("apartment", "apart"), ("department", "depart"),
    ("instrument", "instru"), ("document", "docu"), ("government", "govern"), ("argument", "argue"),
    ("judgement", "judge"), ("ornament", "orn"), ("regiment", "regim"), ("sentence", "sent"),
    ("silence", "sil"), ("science", "sci"), ("audience", "audi"), ("balance", "bal"), ("chance", "ch"),
    ("dance", "d"), ("distance", "dist"), ("finance", "fin"), ("instance", "inst"), ("romance", "rom"),
    ("substance", "subst"), ("ambulance", "ambul"), ("fence", "f"), ("license", "lic"), ("since", "s"),
    ("glance", "gl"), ("advance", "adv"), ("entrance", "entr"), ("insurance", "insur"),
    ("against", "again"), ("airport", "air"), ("forest", "for"), ("forever", "for"), ("mission", "miss"),
    ("passion", "pass"), ("onion", "on"), ("union", "un"), ("million", "mill"), ("opinion", "opin"),
    ("religion", "relig"), ("region", "reg"), ("version", "vers"), ("action", "act"), ("lotion", "lot"),
    ("station", "stat"), ("nation", "nat"), ("portion", "port"), ("mention", "ment"), ("motion", "mot"),
    ("ocean", "oce"), ("item", "it"), ("stem", "st"), ("system", "syst"), ("mess", "m"), ("princess", "prince"),
    ("actress", "act"), ("waitress", "wait"), ("waitress", "waiter"), ("address", "add"), ("dress", "dr"),
    ("press", "pr"), ("express", "expr"), ("progress", "progr"), ("congress", "congr"), ("access", "acc"),
    ("process", "proc"), ("success", "succ"), ("business", "busy"), ("witness", "wit"), ("harness", "harn"),
    ("employee", "employ"), ("committee", "commit"), ("coffee", "coff"), ("guarantee", "guarant"),
    ("agent", "age"), ("urgent", "urge"), ("present", "pres"), ("current", "curr"), ("parent", "pare"),
    ("patent", "pat"), ("content", "cont"), ("extent", "ext"), ("student", "stud"), ("accident", "accid"),
    ("giant", "gi"), ("plant", "pl"), ("want", "w"), ("pleasant", "please"), ("servant", "serve"),
    ("assistant", "assist"), ("constant", "const"), ("distant", "dist"), ("important", "import"),
    ("important", "impart"), ("elephant", "eleph"), ("instant", "inst"), ("restaurant", "restaur"),
    ("pants", "pant"), ("earnings", "earn"), ("physics", "physic"), ("politics", "politic"),
    ("species", "speci"), ("series", "seri"), ("sciences", "science"), ("always", "alway"),
    ("anyway", "any"), ("whereas", "where"), ("perhaps", "perhap"), ("towards", "toward"),
    ("afterwards", "afterward"), ("upwards", "upward"), ("downwards", "downward"), ("forwards", "forward"),
    ("backwards", "backward"), ("outdoors", "outdoor"), ("indoors", "indoor"), ("upstairs", "upstair"),
    ("downstairs", "downstair"), ("lots", "lot"), ("ones", "one"), ("others", "other"), ("odds", "odd"),
    ("its", "it"), ("this", "thi"), ("his", "hi"), ("hers", "her"), ("ours", "our"), ("yours", "your"),
    ("theirs", "their"), ("us", "u"), ("as", "a"), ("is", "i"), ("was", "wa"), ("yes", "ye"), ("bus", "bu"),
    ("dull", "du"), ("bill", "bil"), ("ill", "il"), ("still", "stil"), ("skill", "skil"), ("pill", "pil"),
    ("mill", "mil"), ("kill", "kil"), ("fill", "fil"), ("will", "wil"), ("well", "wel"), ("shell", "shel"),
    ("smell", "smel"), ("spell", "spel"), ("tell", "tel"), ("sell", "sel"), ("bell", "bel"), ("hell", "hel"),
    ("full", "ful"), ("pull", "pul"), ("hardware", "hard"), ("software", "soft"), ("warehouse", "ware"),
    ("useless", "use"), ("unless", "un"), ("bless", "bl"), ("careless", "care"),
    ("smooth", "smoo"), ("tooth", "too"), ("mouth", "mou"), ("south", "sou"), ("north", "nor"),
    ("cloth", "clo"), ("worth", "wor"), ("birth", "bir"), ("earth", "ear"), ("faith", "fai"),
    ("both", "bo"), ("path", "pa"), ("bath", "ba"), ("death", "dea"), ("breath", "brea"),
    ("width", "wid"), ("health", "heal"), ("wealth", "weal"), ("stealth", "steal"), ("warmth", "warm"),
    ("growth", "grow"), ("length", "leng"), ("strength", "streng"), ("depth", "dep"), ("truth", "tru"),
    ("youth", "you"), ("month", "mon"), ("fifth", "fif"), ("sixth", "six"), ("tenth", "ten"),
    ("beauty", "beau"), ("party", "par"), ("empty", "emp"), ("guilty", "guil"), ("thirty", "thir"),
    ("pretty", "pre"), ("dirty", "dir"), ("duty", "du"), ("city", "ci"), ("safety", "safe"),
    ("ability", "able"), ("anxiety", "anxi"), ("variety", "vari"), ("society", "soci"), ("piety", "pi"),
    ("heavy", "heav"), ("navy", "nav"), ("wavy", "wave"), ("ivy", "iv"), ("envy", "env"), ("every", "ever"),
    ("very", "ver"), ("any", "an"), ("many", "man"), ("company", "compan"), ("only", "onl"),
    ("cry", "cr"), ("dry", "dr"), ("try", "tr"), ("fry", "fr"), ("why", "wh"), ("sky", "sk"), ("shy", "sh"),
    ("spy", "sp"), ("deny", "de"), ("reply", "rep"), ("apply", "ap"), ("supply", "sup"), ("imply", "imp"),
    ("multiply", "multip"), ("ugly", "ugl"), ("jelly", "jell"), ("belly", "bel"),
    ("bored", "bore"), ("tired", "tire"), ("tired", "tir"), ("retired", "retire"), ("retired", "tire"),
    ("aged", "age"), ("used", "use"), ("used to", "use"), ("hundred", "hund"), ("sacred", "sac"),
    ("naked", "nake"), ("wicked", "wick"), ("indeed", "inde"), ("speed", "spee"), ("need", "nee"),
    ("bed", "b"), ("red", "r"), ("shed", "sh"), ("led", "l"), ("wed", "w"), ("fed", "f"), ("ted", "t"),
    ("proceed", "procee"), ("succeed", "succee"), ("exceed", "excee"), ("breed", "bree"),
    ("weed", "wee"), ("greed", "gree"), ("deed", "dee"), ("hatred", "hate"), ("kindred", "kind"),
    ("rented", "rent"), ("gifted", "gift"), ("wounded", "wound"), ("bound", "bou"), ("ground", "grou"),
    ("found", "fou"), ("round", "rou"), ("sound", "sou"), ("pound", "pou"), ("wound", "wou"),
    ("career", "care"), ("curious", "cure"), ("finance", "fine"), ("find", "fine"), ("final", "fine"),
    ("former", "form"), ("informal", "inform"), ("generous", "generate"), ("happen", "happy"),
    ("legally", "leg"), ("moral", "more"), ("mind", "mine"), ("minor", "mine"), ("organize", "organ"),
    ("political", "polite"), ("politically", "polite"), ("tradition", "trade"), ("wind", "win"),
    ("disappointment", "appointment"), ("disappointed", "appointed"), ("disappointing", "appointing"),
    ("image", "age"), ("anger", "angle"), ("apply", "apple"), ("arms", "army"), ("award", "aware"),
    ("band", "ban"), ("beard", "bear"), ("better", "bet"), ("bother", "both"), ("butter", "but"),
    ("capable", "cap"), ("card", "car"), ("carry", "car"), ("comment", "come"), ("copy", "cope"),
    ("creature", "create"), ("curly", "cure"), ("customer", "custom"), ("factor", "fact"),
    ("factory", "factor"), ("factory", "fact"), ("family", "fame"), ("fasten", "fast"), ("fund", "fun"),
    ("green", "grey"), ("heaven", "heavy"), ("hers", "here"), ("hold", "hole"), ("land", "lane"),
    ("layer", "lay"), ("mayor", "may"), ("mild", "mile"), ("offence", "off"), ("penny", "pen"),
    ("position", "pose"), ("policy", "police"), ("property", "proper"), ("rider", "rid"), ("riding", "rid"),
    ("send", "senate"), ("several", "severe"), ("shoulder", "should"), ("station", "state"),
    ("status", "statue"), ("striped", "strip"), ("tiny", "tin"), ("topic", "top"), ("unite", "unit"),
    ("united", "unit"), ("university", "universe"), ("wind", "wine"), ("classic", "class"),
    ("counter", "count"), ("authority", "author"), ("affection", "affect"), ("emergency", "emerge"),
    ("advise", "advance"), ("advise", "advanced"), ("salt", "sale"), ("salty", "sale"), ("fund", "fun"),
    ("mile", "mild"), ("lane", "land"), ("worship", "worse"), ("hole", "hold"),
    ("card", "care"), ("counter", "county"), ("hold", "holy"),
}
NO_FAMILY = {"a", "an", "the", "be", "do", "go", "no", "so", "to", "up", "us", "it", "is", "on", "in", "of",
             "at", "by", "or", "as", "if", "he", "me", "my", "we", "hi", "oh", "ok"}


def build_families(words):
    """Họ từ: nối các từ có quan hệ phái sinh rõ ràng (accident – accidental – accidentally…)."""
    idx_of = {}
    for i, w in enumerate(words):
        for v in variants(w[0]):
            v = v.lower()
            if re.fullmatch(r"[a-z]+", v) and v not in idx_of:
                idx_of[v] = i
    parent = list(range(len(words)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def link(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    def try_base(word, cand):
        if len(cand) < 3 or cand == word or cand in NO_FAMILY or word in NO_FAMILY:
            return False
        if (word, cand) in BLACKLIST or (cand, word) in BLACKLIST or cand not in idx_of:
            return False
        link(idx_of[word], idx_of[cand])
        return True

    suffixes = sorted(set(SUFFIXES), key=len, reverse=True)
    for word in list(idx_of):
        linked = False
        for suf in suffixes:
            if linked:
                break
            if not word.endswith(suf) or len(word) - len(suf) < 3:
                continue
            stem = word[: -len(suf)]
            cands = []
            if suf in ("ically", "ally"):
                cands += [word[:-2], stem + "ic", stem + "ical"]
            cands += [stem, stem + "e", stem + "y", stem + "le", stem + "ate", stem + "ize", stem + "ise"]
            if stem.endswith("i"):
                cands.append(stem[:-1] + "y")
            if len(stem) >= 4 and stem[-1] == stem[-2]:
                cands.append(stem[:-1])
            if suf in ("ably", "ibly"):
                cands.append(word[:-1] + "e")
            if suf == "ation":
                cands += [stem + "e", stem + "ate", stem + "ize"]
            for c in cands:
                if try_base(word, c):
                    linked = True
                    break
        for pre in PREFIXES:
            if word.startswith(pre):
                base = word[len(pre):]
                if base in idx_of:
                    pw = set(pos_list(words[idx_of[word]]))
                    pb = set(pos_list(words[idx_of[base]]))
                    if pw & pb:
                        try_base(word, base)

    groups = defaultdict(list)
    for i in range(len(words)):
        groups[find(i)].append(i)
    fams = [sorted(g) for g in groups.values() if len(g) >= 2]
    fams.sort(key=lambda g: words[g[0]][0].lower())
    return fams


# --------------------------------------------------------------------------- chủ đề
def assign_topics(words, families):
    topic_defs = [(tid, icon, name) for tid, icon, name, _ in TOPICS] + [FUNCTION_TOPIC]
    topic_defs += list(FALLBACK_TOPICS.values()) + [OTHER_TOPIC]
    tindex = {t[0]: n for n, t in enumerate(topic_defs)}
    lookup_ci = defaultdict(list)  # token thường -> chỉ số từ
    lookup_cs = defaultdict(list)
    for i, w in enumerate(words):
        for v in variants(w[0]) + [w[0]]:
            lookup_ci[v.lower()].append(i)
            lookup_cs[v].append(i)
    topic = [None] * len(words)
    missing = []
    for tid, _icon, _name, raw in TOPICS:
        for tok in [t.strip() for t in raw.replace("\n", " ").split(",")]:
            if not tok:
                continue
            hits = lookup_cs.get(tok, []) if any(ch.isupper() for ch in tok) else lookup_ci.get(tok, [])
            if not hits:
                missing.append(tok)
            for i in hits:
                if topic[i] is None:
                    topic[i] = tindex[tid]
    for tok in [t.strip() for t in FUNCTION_WORDS.replace("\n", " ").split(",")]:
        for i in lookup_ci.get(tok, []):
            if topic[i] is None:
                topic[i] = tindex["function"]
    for i, w in enumerate(words):
        ps = pos_list(w)
        if topic[i] is None and ps and (ps[0] in FUNCTION_POS or set(ps) & {"pron", "det", "prep", "conj"}):
            topic[i] = tindex["function"]
    for fam in families:  # từ chưa có chủ đề lấy chủ đề của từ cùng họ (ưu tiên từ ngắn nhất)
        known = sorted((len(words[i][0]), topic[i]) for i in fam if topic[i] is not None)
        if known:
            for i in fam:
                if topic[i] is None:
                    topic[i] = known[0][1]
    for i, w in enumerate(words):
        if topic[i] is not None:
            continue
        ps = pos_list(w)
        if " " in variants(w[0])[0]:
            key = "phrase"
        elif ps and ps[0] in ("adj", "adv"):
            key = "adj"
        elif ps and ps[0] in ("n", "v"):
            key = ps[0]
        else:
            topic[i] = tindex["other"]
            continue
        topic[i] = tindex[FALLBACK_TOPICS[key][0]]
    return topic_defs, topic, sorted(set(missing))


def main():
    if len(sys.argv) < 2:
        sys.exit("Cách dùng: python tools/build_vocab.py <file.pdf>")
    v1 = extract_v1(sys.argv[1])
    words, legacy = clean_words(v1)
    families = build_families(words)
    topic_defs, topic, missing = assign_topics(words, families)

    data = {
        "title": "3000 từ vựng tiếng Anh thông dụng nhất (Oxford 3000)",
        "source": "Oxford 3000 – bản dịch nghĩa tiếng Việt của Effortless English Club",
        "version": 2,
        "fields": ["word", "type", "ipa", "meaning", "topic"],
        "topics": [{"id": t[0], "icon": t[1], "name": t[2]} for t in topic_defs],
        "words": [w + [topic[i]] for i, w in enumerate(words)],
        "families": families,
    }
    with open(os.path.join(DATA, "vocab.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(DATA, "legacy_v1.json"), "w", encoding="utf-8") as f:
        json.dump({"note": "v1 index (0-based) -> v2 index", "map": legacy}, f, separators=(",", ":"))

    count = Counter(topic)
    print(f"{len(v1)} mục PDF -> {len(words)} từ sau khi làm sạch; {len(families)} họ từ")
    for n, t in enumerate(topic_defs):
        print(f"  {t[1]} {t[2]}: {count[n]}")
    print(f"Token chủ đề không khớp dữ liệu ({len(missing)}): {', '.join(missing[:60])}…")


if __name__ == "__main__":
    main()
