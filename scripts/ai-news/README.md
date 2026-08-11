# AI News routine

Three GitHub Actions workflows that collect AI-industry news daily, email a
morning digest, and publish a weekly Notion trend report. Cloud reconstruction
of a routine that previously ran on MCP-connected tools (Notion / Gmail / Web
search); here everything goes through direct HTTP APIs plus Claude's
server-side `web_search` tool.

## Schedule

| Workflow | Cron (UTC) | Local (JST) | Depends on |
|---|---|---|---|
| `ai-news-collector` | `5 0 * * *` | daily 09:05 | — |
| `ai-news-morning-digest` | `25 0 * * *` | daily 09:25 | collector completing |
| `ai-news-weekly-summary` | `7 9 * * 5` | Fri 18:07 | — |

The morning digest has two triggers: its own cron (a 20-minute buffer after the
collector), and `workflow_run: completed` on the collector. The cron acts as a
fallback if the collector is delayed or fails silently on a given day.

## Data flow

```
collector.mjs         morning-digest.mjs         weekly-summary.mjs
  │                     │                          │
  ├─ Claude + web_search ├─ Notion (Status=New)    ├─ Notion (last 7 days)
  │                     │                          │
  └─► Notion rows       ├─ Claude (prose intro)    ├─ Claude (trend report)
      Status=New        ├─ Gmail send              └─► Notion child page
                        └─ Notion Status=Digested
```

## Notion database schema

The `NOTION_AI_NEWS_DB_ID` database must have these properties (names are
case-sensitive and referenced from `lib/notion.mjs`):

| Property | Type | Notes |
|---|---|---|
| Title | title | article headline |
| URL | url | canonical URL — also the dedup key |
| Source | rich_text | publisher or domain |
| Category | select | `Model`, `Research`, `Industry`, `Tool`, `Policy` |
| Importance | select | `High`, `Medium`, `Low` |
| Summary | rich_text | 2–3 sentence factual summary |
| Published | date | original publication date (optional) |
| Collected | date | when this routine ingested it |
| Status | select | `New`, `Digested`, `Archived` |

## Required GitHub Secrets

Collector:

- `ANTHROPIC_API_KEY` — for Claude API + web_search tool
- `NOTION_TOKEN` — Notion integration internal token
- `NOTION_AI_NEWS_DB_ID` — ID of the database above

Morning digest — everything above, plus:

- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` — Google OAuth 2.0 client
- `GMAIL_REFRESH_TOKEN` — refresh token with scope `gmail.send`
- `GMAIL_SENDER` — full From header, e.g. `AI News Bot <bot@example.com>`
- `DIGEST_TO` — comma-separated list of recipients

Weekly summary — the collector secrets, plus:

- `NOTION_WEEKLY_PARENT_PAGE_ID` — parent page for the weekly report children

## One-time setup

1. **Create the Notion database** with the schema above. Share it with your
   integration (page → … → Connections → add integration) and copy its ID.
2. **Register the secrets** in repo Settings → Secrets and variables → Actions.
3. **Obtain a Gmail refresh token** via the OAuth 2.0 Playground:
   - Set your own OAuth client credentials (gear icon)
   - Authorize the scope `https://www.googleapis.com/auth/gmail.send`
   - Exchange auth code for tokens; save the refresh token
4. **Test each workflow manually** via Actions → (workflow) → Run workflow.
   Start with the collector, verify rows appear in Notion, then try the digest.

## Gotchas

- **Notion 2000-char block limit** — `lib/notion.mjs` splits long paragraphs.
- **Notion 100-children-per-request limit** — the weekly summary batches via
  PATCH `/blocks/{id}/children`.
- **Dedup window** — the collector treats any URL seen in the last 3 days as
  already collected, so the same story doesn't land twice on consecutive runs.
- **Claude output parsing** — `parseJsonArray` strips ```json fences and
  anything outside the outermost `[...]`, but Claude occasionally returns
  malformed JSON. The collector logs the raw output on parse failure so you
  can rerun manually.
- **web_search rate** — the collector caps at 6 searches per run; increase
  `maxUses` in `collector.mjs` only if you see too-few-items runs.
- **Empty days** — morning digest exits cleanly with no email when there are
  no new rows. Weekly summary skips page creation on empty weeks.

## Files

```
scripts/ai-news/
├── README.md             ← you are here
├── collector.mjs         ← daily news collection
├── morning-digest.mjs    ← daily email
├── weekly-summary.mjs    ← Friday Notion page
└── lib/
    ├── util.mjs          ← env, date helpers, HTML escape
    ├── notion.mjs        ← Notion REST wrapper
    ├── claude.mjs        ← Anthropic API + web_search
    └── gmail.mjs         ← Gmail OAuth send
```
