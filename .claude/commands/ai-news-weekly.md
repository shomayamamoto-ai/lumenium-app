---
description: Generate the weekly AI news trend report and post it to Notion
allowed-tools: Bash(node scripts/ai-news/weekly-summary.mjs)
---

Generate the weekly Notion trend report:

```bash
node scripts/ai-news/weekly-summary.mjs
```

Required env:

- `ANTHROPIC_API_KEY`, `NOTION_TOKEN`, `NOTION_AI_NEWS_DB_ID`
- `NOTION_WEEKLY_PARENT_PAGE_ID`

Pulls the last 7 days from the DB and creates a child page under the parent
with themes, top releases, and watch-items. Skips creation silently on empty
weeks. Report the returned Notion page URL.
