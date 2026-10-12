#!/usr/bin/env python3
"""JEV v4.1 deterministic JD preprocessing.
The preprocessor removes high-confidence boilerplate without assuming section headings.
"""
from __future__ import annotations
import html, re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

SCHEMA = "jev-input-v4"
_CJK = re.compile(r"[\u3400-\u9fff]")
_INLINE_ENUM = re.compile(r"(?=(?:^|\s)(?:\(?\d{1,2}[.)]|[①②③④⑤⑥⑦⑧⑨⑩])\s+)")
_TAIL = re.compile(r"^(about us|what we offer|job family group|benefits|equal opportunity|privacy notice|recruitment assessments?)\b", re.I)
_RESUME = re.compile(r"^(about the team|the role|responsibilities|key responsibilities|what you(?:'ll| will) do|工作职责|岗位职责)\b", re.I)
_STATIC = re.compile(r"equal opportunit(y|ies)|affirmative action|reasonable accommodation|pay transparency|privacy (statement|notice|policy)|^some careers have more impact|^if you.?re looking for a career|^about standard chartered|^what we offer|^recruitment assessments|^job family group|^other responsibilities assigned under group|^embed here for good|^medical and life insurance|^flexible working options|^people & talent|^regulatory & business conduct|平等机会雇主|多元共融|隐私声明", re.I)
_META = re.compile(r"^(job family group|job family|business|division|department|entity|legal entity|group|time type|location)\s*:\s*(.{1,160})$", re.I)
_DUTY_HEADING = re.compile(r"^(role summary|summary|about the role|the role|responsibilit(?:y|ies)|what you(?:'ll| will) do|your responsibilit(?:y|ies)|key accountabilit(?:y|ies)|岗位职责|工作职责|职位描述)\s*:?[ \t]*$", re.I)
_REQ_HEADING = re.compile(r"^(requirements?|qualifications?|what you(?:'ll| will) bring|skills?|experience|任职要求|教育背景)\s*:?[ \t]*$", re.I)
_REQ_CUE = re.compile(r"\b(require|requirements?|qualification|qualifications?|experience|skills?|preferred|must have|degree|knowledge)\b|任职|要求|经验|技能|学历", re.I)
_DUTY_VERB = re.compile(r"^(own|lead|manage|build|develop|deliver|drive|provide|perform|execute|review|analyse|analyze|support|coordinate|partner|design|operate|monitor|assess|advise|负责|管理|建立|开发|交付|推动|提供|执行|审核|分析|支持|协调|设计|运营|监控|评估|开展)", re.I)
_LINE_CUE = re.compile(r"\b(business|division|department|team|banking|technology|risk|finance|marketing|operations|wealth|markets|insurance|group)\b|业务|部门|团队|科技|风险|金融|运营", re.I)


def html_to_blocks(source: str) -> list[str]:
    s = str(source or "")
    s = re.sub(r"<li\b[^>]*>", "\n- ", s, flags=re.I)
    s = re.sub(r"</?(?:p|div|li|ul|ol|h[1-6]|tr|br)\b[^>]*>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s).replace("\xa0", " ").replace("\u200b", "")
    blocks: list[str] = []
    for line in s.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        pieces = [p.strip() for p in _INLINE_ENUM.split(line) if p.strip()]
        blocks.extend(pieces or [line])
    return blocks


def signature(block: str) -> str:
    return re.sub(r"[^a-z0-9\u3400-\u9fff]", "", block.lower())[:240]


def build_boilerplate_table(jobs: Iterable[tuple[str, str]], min_share: float = .15, min_count: int = 12) -> dict[str, Any]:
    grouped: dict[str, list[list[str]]] = defaultdict(list)
    for company, source in jobs:
        grouped[str(company or "Unknown")].append(html_to_blocks(source))
    result: dict[str, Any] = {}
    for company, docs in grouped.items():
        counts = Counter(sig for doc in docs for sig in {signature(block) for block in doc if len(block) >= 30})
        threshold = max(min_count, int(len(docs) * min_share + .999))
        signatures = {sig: count for sig, count in counts.items() if count >= threshold}
        samples = {}
        for doc in docs:
            for block in doc:
                sig = signature(block)
                if sig in signatures and sig not in samples:
                    samples[sig] = block[:160]
        result[company] = {"total": len(docs), "signatures": signatures, "samples": samples}
    return result


def _looks_like_heading(block: str) -> bool:
    return len(block) <= 60 and (block.endswith(":") or not re.search(r"[.!?。！？]$", block))


def clean_blocks(blocks: list[str], company_sigs: dict[str, Any] | None = None) -> tuple[list[str], dict[str, str], dict[str, int]]:
    company_sigs = company_sigs or {}
    signatures = set(company_sigs.get("signatures", company_sigs if isinstance(company_sigs, dict) else {}))
    total = sum(len(x) for x in blocks) or 1
    chars = 0
    tail = False
    seen: set[str] = set()
    kept: list[str] = []
    metadata: dict[str, str] = {}
    removed = {"static": 0, "frequency": 0, "tail": 0, "duplicate": 0}
    for block in blocks:
        b = re.sub(r"\s+", " ", block).strip()
        meta = _META.match(b)
        if meta:
            metadata[meta.group(1).lower()] = meta.group(2).strip()
            continue
        if chars >= total * .4 and len(b) <= 120 and _TAIL.search(b):
            tail = True
        if _RESUME.search(b):
            tail = False
        if tail:
            removed["tail"] += len(b); continue
        if _STATIC.search(b):
            removed["static"] += len(b); continue
        sig = signature(b)
        if len(b) >= 30 and sig in signatures and not _looks_like_heading(b) and not (len(b) <= 600 and _LINE_CUE.search(b)):
            removed["frequency"] += len(b); continue
        if len(b) >= 30 and sig in seen:
            removed["duplicate"] += len(b); continue
        if len(sig) >= 30:
            seen.add(sig)
        kept.append(b); chars += len(b)
    return kept, metadata, removed


def detect_language(text: str) -> str:
    zh = len(_CJK.findall(text)); latin = len(re.findall(r"[A-Za-z]", text))
    if zh and latin and zh >= 80 and latin >= 80: return "mixed"
    if zh >= max(40, latin * 1.5): return "zh"
    return "en"


def evidence(blocks: list[str], text: str) -> tuple[str, list[str], dict[str, int]]:
    duty = requirements = 0; mode = "duty"
    for block in blocks:
        b = block.strip(); cjk = len(_CJK.findall(b)); words = len(re.findall(r"[A-Za-z]+", b))
        if len(b) <= 8 or (cjk < 8 and words < 6):
            if _REQ_HEADING.match(b): mode = "requirement"
            elif _DUTY_HEADING.match(b): mode = "duty"
            continue
        if _REQ_HEADING.match(b): mode = "requirement"; continue
        if _DUTY_HEADING.match(b): mode = "duty"; continue
        sentences = [x for x in re.split(r"[.!?。！？]+", b) if len(re.findall(r"[A-Za-z]+", x)) >= 5 or len(_CJK.findall(x)) >= 8]
        if mode == "requirement":
            if _DUTY_VERB.match(b): duty += max(1, min(4, len(sentences) or 1))
            else: requirements += 1
        else:
            duty += max(1, min(4, len(sentences) or 1))
    flags: list[str] = []
    if requirements > max(1, duty * 2): flags.append("requirements_dominate_over_responsibilities")
    if len(text) > 24000: flags.append("truncated")
    if detect_language(text) == "mixed": flags.append("bilingual_content")
    level = "insufficient" if duty <= 1 or (len(_CJK.findall(text)) < 80 and len(text) < 150) else "thin" if duty <= 3 else "adequate" if duty <= 8 else "rich"
    return level, flags, {"duty_blocks": duty, "requirement_blocks": requirements}


def preprocess(title: str, company: str, source: str, metadata: dict[str, Any] | None = None, boilerplate: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = html_to_blocks(source)
    company_sigs = (boilerplate or {}).get(str(company or ""), {})
    kept, extracted, removed = clean_blocks(raw, company_sigs)
    full_text = "\n".join(kept)
    jd_text = full_text[:24000]
    level, flags, stats = evidence(html_to_blocks(jd_text), jd_text)
    if len(full_text) > 24000:
        flags.append("truncated")
    if len(jd_text) < 40: level = "insufficient"
    if len(jd_text) < 300 and "insufficient_role_evidence" not in flags: flags.append("insufficient_role_evidence")
    metadata = metadata or {}
    employer = {**extracted}
    for key in ("business", "jobFamily", "entity", "group"):
        if metadata.get(key): employer[key] = str(metadata[key])[:160]
    out_stats = {"chars_in": len("\n".join(raw)), "chars_out": len(jd_text), "blocks_in": len(raw), "blocks_out": len(kept), "removed_chars": removed, **stats}
    return {"schema": SCHEMA, "jd_text": jd_text, "language": detect_language(jd_text), "evidence_level": level, "evidence_flags": sorted(set(flags)), "employer_metadata": "\n".join(f"{k}: {v}" for k,v in employer.items()), "stats": out_stats}


def self_test() -> None:
    docs = [("Acme", "<p>Common employer marketing phrase repeated across postings.</p><h3>Key Responsibilities</h3><p>Build data services.</p>") for _ in range(40)]
    table = build_boilerplate_table(docs)
    out = preprocess("Data Engineer", "Acme", docs[0][1], boilerplate=table)
    assert out["schema"] == SCHEMA and "Key Responsibilities" in out["jd_text"] and "Build data services" in out["jd_text"]
    assert out["stats"]["blocks_in"] >= out["stats"]["blocks_out"]
    print("jev_preprocess_v4_self_test_ok")


if __name__ == "__main__": self_test()
__all__ = ["SCHEMA", "preprocess", "build_boilerplate_table", "html_to_blocks", "signature", "clean_blocks", "detect_language", "evidence", "self_test"]
