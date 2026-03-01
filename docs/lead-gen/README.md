# Lead Gen Pack (Apify + Claude)

Use this pack to collect, qualify, and message Shopify leads with clear evidence and consistent scoring.

## Workflow

1. Scrape public lead data with Apify.
2. Normalize into the CSV schema in `lead_schema.csv`.
3. Run Claude prompts from `claude_prompts.md` to score and enrich leads.
4. Export qualified leads to your CRM.

## Minimal Process Rules

- Keep one row per unique company domain.
- Store source URLs for every claim.
- Do not send outreach without a reason field.
- Keep outreach short, specific, and evidence-based.

## Files

- `lead_schema.csv`: standard lead columns
- `lead_record.schema.json`: strict JSON schema for automation
- `claude_prompts.md`: copy-paste prompts for qualification + outreach
