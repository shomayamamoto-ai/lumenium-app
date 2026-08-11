---
description: Run the AI news collector — web_search → Notion DB (Status=New)
allowed-tools: Bash(node scripts/ai-news/collector.mjs)
---

Run the AI news collector locally:

```bash
node scripts/ai-news/collector.mjs
```

Required env (export before running, or source from `.env`):

- `ANTHROPIC_API_KEY`
- `NOTION_TOKEN`
- `NOTION_AI_NEWS_DB_ID`

Report `created=… skipped=… errors=…` counts from the collector's final log
line. If parsing fails, the raw Claude output is in the logs — rerun after
investigating.
