# Nightly routine

Runs daily at 05:00 JST (20:00 UTC) via `.github/workflows/nightly.yml`.
Can also be triggered manually via `workflow_dispatch`.

## Section map

| Section | What it does | Implementation |
|---|---|---|
| B | `npm ci` → `npm run build` → detect & remove safe `console.log`/`debugger`; report `TODO` count; open cleanup PR if anything was removed | workflow + `cleanup.mjs` + `peter-evans/create-pull-request` |
| C | `npm audit --json`, flag if critical+high > 0 | `run.mjs::sectionC` |
| D | Sum `dist/` bytes, compare with previous day from `nightly-data` branch, alert if > +10% | `run.mjs::sectionD` + `persist-history.sh` |
| E | `git diff` of `src/` over last 7 days, send to Claude API for critical-issue review (skipped if > 5000 lines) | `run.mjs::sectionE` |
| F | Check latest Vercel deployment state via REST API | `run.mjs::sectionF` |
| G | List Vercel project env vars and flag any whose type is not `sensitive` | `run.mjs::sectionG` |
| H | Post markdown report as a new Notion page under `NOTION_PARENT_PAGE_ID` | `run.mjs::sectionH` |

Section A (local stash/checkout) is intentionally omitted — Actions always
starts from a clean checkout.

## Required GitHub Secrets

- `VERCEL_TOKEN` — vercel.com → Settings → Tokens
- `VERCEL_TEAM_ID` — `team_mkY3wMorXaeNfKaRiknkPGYR`
- `NOTION_TOKEN` — Notion integration internal token
- `NOTION_PARENT_PAGE_ID` — `346d39ce-861a-81ed-b7f2-df20e73602a2`
- `ANTHROPIC_API_KEY` — optional; section E is skipped if absent
- `GITHUB_TOKEN` — auto-provided

## One-time setup

1. Register the 5 secrets above in repo **Settings → Secrets and variables → Actions**.
2. Connect the Notion integration to the parent "Lumenium Nightly Reports" page
   (page → … → Connections → add integration). Without this, the API returns 403.
3. Create the `nightly-data` branch with an initial empty history file:
   ```bash
   git checkout --orphan nightly-data
   git rm -rf . 2>/dev/null || true
   : > bundle-history.txt
   git add bundle-history.txt
   git commit -m "init: empty bundle history"
   git push -u origin nightly-data
   git checkout main
   ```
4. Trigger a manual run: **Actions → Nightly → Run workflow**.

## Bundle history format

`bundle-history.txt` is tab-separated, append-only:

```
2026-04-18	184320
2026-04-19	186112
```

Stored on the `nightly-data` branch. Never merge this branch into `main`.

## Notion gotchas

- 2000-char per-block limit → `run.mjs` splits paragraphs automatically.
- 100-children per request limit → `run.mjs` batches via PATCH `/blocks/{id}/children`.
