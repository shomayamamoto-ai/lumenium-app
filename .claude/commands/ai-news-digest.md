---
description: Send today's AI news morning digest email (Notion New → Gmail)
allowed-tools: Bash(node scripts/ai-news/morning-digest.mjs)
---

Send the morning digest email:

```bash
node scripts/ai-news/morning-digest.mjs
```

Required env:

- `ANTHROPIC_API_KEY`, `NOTION_TOKEN`, `NOTION_AI_NEWS_DB_ID`
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER`
- `DIGEST_TO`

Exits cleanly without sending when there are no `Status=New` rows. On success
it flips each delivered row to `Status=Digested`.
