# Claude Prompt Pack (Metric Mango Lead Qualification)

## 1) Lead Qualification Prompt (Batch)

```text
You are a B2B lead qualification analyst for Metric Mango (inventory analytics for Shopify stores).

Task:
Score each lead row from 0-100 and assign tier: high / medium / low / unqualified.
Return ONLY a CSV with these columns:
lead_id,qualification_score,qualification_tier,qualification_reason,outreach_angle,next_action

Scoring rubric (total 100):
- Shopify fit (0-25): clear Shopify store, active catalog, ecommerce focus
- Inventory pain evidence (0-30): stockout mentions, manual restock process, missed sales risk
- Business momentum (0-20): launches, ad traffic, frequent product drops, growth signals
- Buyer relevance (0-15): operations/founder/merchandising decision maker identified
- Data confidence (0-10): source quality + recency + evidence traceability

Tier thresholds:
- high: 75-100
- medium: 55-74
- low: 35-54
- unqualified: 0-34

Rules:
- Penalize hard if no ecommerce evidence or weak source confidence.
- Keep qualification_reason to <= 20 words, concrete and evidence-based.
- outreach_angle should be one short phrase about inventory/reorder risk.
- next_action should be one of: verify_email, find_decision_maker, send_intro, skip

Input CSV:
{{PASTE_LEAD_ROWS_HERE}}
```

## 2) First-Line Personalization Prompt

```text
You write first-line cold outreach for Metric Mango.

Objective:
Generate one personalized first line per lead. Keep each line under 22 words.

Rules:
- Mention one specific observed signal from the lead row.
- No hype, no buzzwords, no generic compliment.
- No claims you cannot infer from the source fields.
- Tone: concise, operator-to-operator.

Return ONLY CSV columns:
lead_id,first_line

Input CSV:
{{PASTE_QUALIFIED_LEADS_HERE}}
```

## 3) Subject + CTA Prompt

```text
You are writing concise outbound email metadata for qualified Metric Mango leads.

Return ONLY CSV columns:
lead_id,subject_line,cta

Rules:
- subject_line <= 6 words
- CTA <= 12 words
- Keep both plain and specific to inventory/reorder outcomes
- Avoid spammy words (free, urgent, guaranteed)

Input CSV:
{{PASTE_QUALIFIED_LEADS_HERE}}
```

## 4) CRM Normalization Prompt

```text
Normalize and clean this lead CSV.

Actions:
- Deduplicate by domain (keep highest qualification_score).
- Standardize country to ISO-2 when obvious.
- Standardize status values to schema.
- Fill missing next_action with best choice.
- Keep existing values unless clearly invalid.

Return ONLY cleaned CSV with original columns preserved.

Input CSV:
{{PASTE_CSV_HERE}}
```

## 5) Rejection Filter Prompt

```text
Classify each lead for compliance safety.
Return ONLY CSV: lead_id,compliance_flag,compliance_reason

compliance_flag must be one of:
- safe
- review
- do_not_contact

Set do_not_contact if:
- source suggests personal/non-business context
- no business relevance
- explicit outreach restriction found

Keep compliance_reason <= 16 words.

Input CSV:
{{PASTE_CSV_HERE}}
```
