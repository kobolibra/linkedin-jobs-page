#!/usr/bin/env python3
"""Deterministic, conservative JD preprocessing for JEV v2.3.

This module intentionally removes only high-confidence boilerplate and keeps the
original text available for audit. It produces structured evidence; it does not
classify the job.
"""
from __future__ import annotations

import html
import re
from dataclasses import asdict, dataclass
from typing import Any

BOILERPLATE_HEADINGS = re.compile(
    r"(?im)^\s*(?:about\s+(?:us|the\s+company|standard\s+chartered|hsbc)|what\s+we\s+offer|what\s+we\s+offer\s+you|our\s+values|our\s+purpose|recruitment\s+assessments?|equal\s+opportunit|diversity|inclusion|benefits?|福利|公司介绍|关于我们|招聘流程)\s*:?\s*$"
)
SECTION_HEADINGS = re.compile(
    r"(?im)^\s*(?P<h>role\s+summary|summary|about\s+the\s+role|the\s+role|responsibilit(?:y|ies)|what\s+you(?:'ll|\s+will)\s+do|your\s+responsibilit(?:y|ies)|key\s+accountabilit(?:y|ies)|requirements?|qualifications?|what\s+you(?:'ll|\s+will)\s+bring|skills?|experience|教育背景|任职要求|岗位职责|职位描述|工作职责)\s*:?[ \t]*$"
)
FOOTER_MARKERS = re.compile(
    r"(?is)\b(?:equal\s+opportunity|reasonable\s+accommodation|privacy\s+notice|recruitment\s+assessments?|medical\s+and\s+life\s+insurance|flexible\s+working\s+options|visit\s+our\s+careers|we\s+are\s+an\s+equal)\b.*$"
)
PLACEHOLDER_RE = re.compile(
    r"(?:\[(?:tbd|todo|insert|placeholder|location|company|date|title|name|xxx)[^\]]*\]"
    r"|\{(?:tbd|todo|insert|placeholder|location|company|date|title|name|xxx)[^}]*\})",
    re.IGNORECASE,
)

@dataclass(frozen=True)
class TitleSignals:
    title_level_market: str = "unknown"
    title_level_employer_normalized: str = "unknown"
    convention_tags: tuple[str, ...] = ()
    raw_markers: tuple[str, ...] = ()

@dataclass(frozen=True)
class JEVInput:
    role_summary: str
    responsibilities: str
    requirements: str
    employer_metadata: str
    language: str
    evidence_level: str
    evidence_flags: tuple[str, ...]
    title_signals: dict[str, Any]
    original_characters: int
    core_characters: int


def clean_text(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]+>", "\n", value)
    value = value.replace("\u00a0", " ").replace("\u200b", "")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def detect_language(text: str) -> str:
    zh = len(re.findall(r"[\u3400-\u9fff]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if zh and latin and zh >= 80 and latin >= 80:
        return "bilingual"
    if zh >= max(40, latin * 1.5):
        return "zh"
    return "en_or_mixed"


def _dedupe_lines(text: str) -> str:
    lines = [re.sub(r"\s+", " ", x).strip() for x in text.splitlines()]
    out: list[str] = []
    seen: set[str] = set()
    for line in lines:
        if not line:
            continue
        key = re.sub(r"[^a-z0-9\u3400-\u9fff]", "", line.lower())
        if len(key) >= 45 and key in seen:
            continue
        if len(key) >= 45:
            seen.add(key)
        out.append(line)
    return "\n".join(out)


def split_sections(text: str) -> dict[str, str]:
    lines = text.splitlines()
    sections = {"role_summary": [], "responsibilities": [], "requirements": [], "employer_metadata": []}
    current = "role_summary"
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if BOILERPLATE_HEADINGS.match(stripped):
            current = "employer_metadata"
            continue
        m = SECTION_HEADINGS.match(stripped)
        if m:
            h = m.group("h").lower()
            current = "requirements" if any(x in h for x in ("require", "qualification", "skill", "experience", "任职", "教育")) else "responsibilities" if any(x in h for x in ("respons", "account", "what you", "岗位职责", "工作职责")) else "role_summary"
            continue
        if current == "employer_metadata" and FOOTER_MARKERS.search(stripped):
            continue
        sections[current].append(stripped)
    # Conservative fallback: if headings are absent, keep the text as core rather than guessing.
    if not any(sections["responsibilities"]):
        sections["responsibilities"] = sections["role_summary"][:]
    return {k: _dedupe_lines("\n".join(v)) for k, v in sections.items()}


def title_signals(title: str, company: str) -> TitleSignals:
    t = (title or "").strip()
    low = t.lower()
    tags: list[str] = []
    raw: list[str] = []
    if re.search(r"\b(associate\s+director|director\s*/\s*vp|associate\s*/\s*vp|vp\s*/\s*director)\b", low):
        tags.append("range_title"); raw.append("range")
    if re.search(r"\b(product\s+owner|scrum\s+master)\b", low):
        tags.append("role_name_not_level")
    if re.search(r"\b(fellow|distinguished\s+engineer|staff\s+engineer|principal\s+engineer)\b", low):
        tags.append("technical_ladder")
    if re.search(r"\b(relationship|business\s+development|sales|premier|wealth\s+manager)\b", low):
        tags.append("client_facing_title")
    if re.search(r"\b(consultant\s+specialist|senior\s+consultant\s+specialist)\b", low):
        tags.append("opaque_generic_title")
    c = (company or "").lower()
    if "hsbc" in c and re.search(r"\b(associate\s+director|director)\b", low) and any(x in low for x in ("software", "engineering", "technology", "data")):
        tags.append("employer_band_convention")
    if "hsbc" in c and "premier relationship director" in low:
        return TitleSignals("director_or_head", "professional", tuple(dict.fromkeys(tags + ["client_facing_title"])), tuple(raw))
    if "standard chartered" in c and "business development executive" in low:
        return TitleSignals("executive", "professional", tuple(dict.fromkeys(tags + ["client_facing_title"])), tuple(raw))
    if re.search(r"\b(intern|graduate|trainee|assistant)\b|实习|管培", low):
        market = "entry"
    elif re.search(r"\b(chief|cso|cto|cfo|ceo|country head|business head|managing director)\b|董事总经理|首席|国家负责人", low):
        market = "executive"
    elif re.search(r"\b(director|head|executive director|ed)\b|总监|董事", low):
        market = "director_or_head"
    elif re.search(r"\b(vp|svp|avp|vice president|associate director)\b|副总裁", low):
        market = "manager_or_lead"
    elif re.search(r"\b(manager|lead|principal|staff|senior)\b|经理|主管|高级", low):
        market = "manager_or_lead" if re.search(r"\b(manager|lead)\b|经理|主管", low) else "senior_individual_contributor"
    elif re.search(r"\b(analyst|associate|consultant|specialist|officer|executive)\b|分析师|专员|主任", low):
        market = "professional"
    else:
        market = "unknown"
    normalized = "unknown" if "role_name_not_level" in tags else market
    return TitleSignals(market, normalized, tuple(dict.fromkeys(tags)), tuple(raw))


def preprocess(title: str, company: str, description: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = clean_text(description)
    sections = split_sections(raw)
    combined_core = "\n\n".join(x for x in (sections["role_summary"], sections["responsibilities"]) if x)
    combined_core = PLACEHOLDER_RE.sub(" ", combined_core)
    flags: list[str] = []
    if len(combined_core) < 300:
        flags.append("insufficient_role_evidence")
    elif len(combined_core) < 800:
        flags.append("thin_role_evidence")
    if PLACEHOLDER_RE.search(raw):
        flags.append("template_placeholder_text")
    if detect_language(raw) == "bilingual":
        flags.append("bilingual_content")
    if re.search(r"\b(contract(or)?|outsourc|派遣|外包|第三方)\b", raw, re.I):
        flags.append("vendor_or_outsourced_ambiguity")
    if re.search(r"\b(and|/|及|兼任)\b", title, re.I) and len(re.findall(r"\b(head|director|manager|lead|负责人|总监|经理)\b", title, re.I)) >= 2:
        flags.append("multiple_roles_in_one_jd")
    if len(sections["requirements"]) > max(1, len(sections["responsibilities"]) * 2):
        flags.append("requirements_dominate_over_responsibilities")
    if re.search(r"medical and life insurance|equal opportunity|our values|what we offer", raw, re.I):
        flags.append("responsibilities_generic_or_template")
    evidence = "insufficient" if "insufficient_role_evidence" in flags else "thin" if "thin_role_evidence" in flags else "adequate"
    return asdict(JEVInput(
        role_summary=sections["role_summary"], responsibilities=sections["responsibilities"], requirements=sections["requirements"],
        employer_metadata="\n".join([str((metadata or {}).get(k) or "") for k in ("business", "jobFamily", "entity", "group") if (metadata or {}).get(k)]),
        language=detect_language(raw), evidence_level=evidence, evidence_flags=tuple(dict.fromkeys(flags)),
        title_signals=asdict(title_signals(title, company)), original_characters=len(raw), core_characters=len(combined_core),
    ))

__all__ = ["preprocess", "title_signals", "clean_text"]
