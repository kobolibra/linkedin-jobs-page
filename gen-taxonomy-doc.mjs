import { writeFileSync } from 'node:fs';
import {
  TAXONOMY_VERSION, ROLE_ARCHETYPE_LABELS, ROLE_ARCHETYPES, ROLE_FAMILIES, ROLE_FAMILY,
  ROLE_GUIDANCE, ACTIVITY_LABELS, ACTIVITY_CRITERIA, ACTIVITY_GUIDANCE,
  BUSINESS_LINES, BUSINESS_LINE_CRITERIA, BUSINESS_LINE_GUIDANCE,
  LEADERSHIP_LABELS, LEADERSHIP_LEVELS, LEADERSHIP_GUIDANCE, RISK_FLAGS
} from './jev-taxonomy.mjs';

export function taxonomyMarkdown(){
  const lines=[`# JEV Taxonomy ${TAXONOMY_VERSION.replace('jev-taxonomy-','')}`, '',
    '> Generated from jev-taxonomy.mjs by node gen-taxonomy-doc.mjs. Do not edit by hand.', '',
    'Exactly five visible dimensions: Role Archetype (occupational mandate), Primary Activity (recurring output), Business Line (directly served business), Leadership Level (actual authority), and Role Risk (supported structural concerns). Each is judged independently.', '',
    '## Role Archetype', '', ROLE_GUIDANCE, '', '| Code | Label | Family | Boundary |', '|---|---|---|---|'];
  const cell=v=>String(v).replaceAll('|','\\|').replaceAll('\n',' ');
  for(const [code,label] of Object.entries(ROLE_ARCHETYPE_LABELS))lines.push(`| \`${code}\` | ${label} | ${ROLE_FAMILIES[ROLE_FAMILY[code]]||''} | ${cell(ROLE_ARCHETYPES[code])} |`);
  for(const [name,labels,criteria,guidance] of [
    ['Primary Activity',ACTIVITY_LABELS,ACTIVITY_CRITERIA,ACTIVITY_GUIDANCE],
    ['Business Line',BUSINESS_LINES,BUSINESS_LINE_CRITERIA,BUSINESS_LINE_GUIDANCE],
    ['Leadership Level',LEADERSHIP_LABELS,LEADERSHIP_LEVELS,LEADERSHIP_GUIDANCE]
  ]){
    lines.push('',`## ${name}`,'',guidance,'','| Code | Label | Criterion |','|---|---|---|');
    for(const [code,label] of Object.entries(labels))lines.push(`| \`${code}\` | ${label} | ${cell(criteria[code])} |`);
  }
  lines.push('','## Role Risk','','| Code | Label | Severity | Threshold | Evidence rule | Useful follow-up |','|---|---|---|---|---|---|');
  for(const [code,r] of Object.entries(RISK_FLAGS))lines.push(`| \`${code}\` | ${r.label} | ${r.severity} | ${r.threshold} | ${cell(r.rule)} | ${r.action} |`);
  lines.push('','## Runtime safeguards','',
    '- Each classification has a short label and, when supported, a source passage selected from the actual JD. Evidence selections use existing Choice primitives, not generated explanations. Source selection is itself a model judgement, not proof that a label is correct.',
    '- Business-line assignment requires explicit-context support >= 0.8 and a non-conflicting classification >= 0.5. Multi-line also requires independent support for multiple materially served lines; KYC/credit/portfolio objects do not establish multiple lines.',
    '- Evidence-selection confidence measures which passage to cite; it does not replace independent classification confidence. Several valid source passages can split the selection probabilities. Only a valid selected source ID with a finite positive confidence is used.',
    '- Missing/invalid answers and probabilities stay unknown; neither a missing answer nor a 0.5 noul is affirmative evidence.',
    '- No archetype-to-activity default. Weak activity answers below 0.35 abstain; other low-confidence/close alternatives remain visibly uncertain.',
    '- Explicit source resolution can retain a single literal business mandate in a role title or a corroborated own-institution corporate/control mandate when model output is unknown. Multiple named mandates remain ambiguous; resolved answers carry basis=explicit_source and no invented model confidence.',
    '- Leadership claims require a selected source passage plus explicit evidence nouls at least 0.8. Manager-of-managers also requires people-management support. Downgrades clear the rejected confidence.',
    '- No automatic IC inference from missing management answers. A real but underspecified vacancy uses Not Stated, not Not Applicable.',
    '- Employment and pooled-vacancy flags require both a supported judgement and a selected source passage. Keywords never promote risk to 100%.',
    '- Unknown risk assessment is distinct from no supported structural flags. Flags are questions to clarify, not conclusions about employer quality, actual workload or legal status.',
    '- Non-job content neutralises all dimensions and removes their evidence/candidates. Insufficient duties suppress profession/activity/leadership guesses; a directly evidenced business line can remain.',
    '- Thresholds are conservative engineering gates, not measured accuracy guarantees. Model quality must be evaluated separately on labelled real JDs.',
    '- v4.4.5 uses a new frontend cache namespace. Retired broad role codes are rejected instead of silently assigned a narrower meaning. Raw jobs, lifecycle values and scraping are unchanged.','');
  return lines.join('\n');
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])writeFileSync(`${TAXONOMY_VERSION}.md`,taxonomyMarkdown());
