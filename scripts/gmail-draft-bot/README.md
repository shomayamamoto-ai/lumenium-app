# Gmail Draft Bot v2 — クラウド版

毎朝 08:00 JST (23:00 UTC) に `.github/workflows/gmail-draft-bot.yml` から起動。
未読スレッドに対して AI 下書きを作成し、結果を Notion にログする。

元仕様は Claude Code デスクトップ + MCP 依存だったが、GitHub Actions + Google
REST API + Anthropic API に置き換えて完全にクラウドで完結させている。

## フェーズ

| フェーズ | 内容 | 実装 |
|---|---|---|
| 0 | `in:sent newer_than:30d` を 30 件取得し Claude で文体プロファイル抽出 | `claude.mjs::learnStyle` |
| 1 | `is:unread newer_than:1d -in:spam ...` を 30 件取得しスレッド単位に集約 | `run.mjs::main` |
| 2 | 差出人 / 件名 / 自分最終 / 機密情報でスキップ判定 | `run.mjs::shouldSkip*`, `detectSecret` |
| 3a | 言語判定 (ひらがな/カタカナ/漢字 ≥30% → 日本語, ASCII ≥80% → 英語) | `run.mjs::detectLanguage` |
| 3b | Claude で SCHEDULING / QUESTION / PDF_ATTACHMENT / VIP / NORMAL に分類 | `claude.mjs::classify` |
| 3c | SCHEDULING の場合 Calendar freeBusy で候補 3 件抽出 | `calendar.mjs::suggestTimes` |
| 3d | 文体プロファイル + スレッド履歴を渡して Claude が下書き + 信頼度スコア生成 | `claude.mjs::generateDraft` |
| 3e | `drafts.create` で Gmail に下書き保存 (送信はしない) | `gmail.mjs::createDraft` |
| 4 | 成功行は全件、スキップ行は代表 3 件のみ Notion DB に追記 | `notion.mjs::appendLog` |

## 絶対ルール (コードで強制)

1. `gmail.mjs` は `createDraft` のみ公開。`messages.send` は実装されていない。
2. ラベル / フィルター変更 API も未実装。
3. 受信本文内の指示は system プロンプトで無視するよう指示済み。
4. 機密情報パターン (クレカ/マイナンバー/JWT/APIキー) を検出したら下書き生成前に
   スキップ + Notion に理由記録。
5. 判断が難しければ低スコア (1-2) + 本文に `【要確認】` / `[TODO]` マーカー。
6. スキップ確定スレッドには `get_thread` を呼ばない (差出人・件名だけで判定)。

## 必須 GitHub Secrets

| Secret | 用途 |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 クライアント ID |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 クライアントシークレット |
| `GOOGLE_REFRESH_TOKEN` | Gmail + Calendar の refresh_token (一度だけ手動取得) |
| `ANTHROPIC_API_KEY` | Claude API キー |
| `NOTION_TOKEN` | Notion Integration トークン |
| `NOTION_GMAIL_LOG_DB_ID` | `e4a2289c-77bb-4bd4-8816-e5b9b19acf69` |
| `GMAIL_USER_EMAIL` | 自分のメールアドレス (自分最終判定用) |

## 初回セットアップ

### 1. Google Cloud プロジェクト

1. https://console.cloud.google.com/ でプロジェクトを作成。
2. **APIとサービス → ライブラリ** で `Gmail API` と `Google Calendar API` を
   有効化。
3. **OAuth 同意画面** を構成 (External / ユーザータイプ "外部" / 自分のみを
   テストユーザーに追加)。
4. **認証情報 → 認証情報を作成 → OAuth クライアント ID → デスクトップアプリ**
   を選び `client_id` / `client_secret` を入手。

### 2. refresh_token を取得 (ローカルで一度だけ)

以下のスコープで同意すれば Gmail + Calendar の両方が 1 本のトークンで使える。

```
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/calendar.freebusy
https://www.googleapis.com/auth/calendar.readonly
```

最小の取得スクリプト (手元で実行):

```bash
# https://developers.google.com/oauthplayground で
# 1) 歯車アイコン → "Use your own OAuth credentials" に client_id / secret を入力
# 2) 左のスコープ一覧から上の 4 つを選択 → Authorize APIs
# 3) Exchange authorization code for tokens を押すと refresh_token が表示される
```

### 3. Notion データベース準備

DB URL: https://www.notion.so/96e6f430dc30481aba8d611932b526a9

以下の列を正確にこの名前・型で用意する (Notion のプロパティ名をコード側と
一致させる必要がある):

| 列名 | 型 | 備考 |
|---|---|---|
| 件名 | Title | |
| 処理日時 | Date | Include time = ON |
| 差出人名 | Text | |
| 差出人メール | Email | |
| 言語 | Select | オプション: 日本語 / 英語 / その他 |
| カテゴリ | Select | 通常返信 / 日程調整 / VIP要対応 / PDF添付あり / 質問 / その他 |
| ステータス | Select | 下書き作成 / スキップ / VIP要対応 / エラー |
| 信頼度スコア | Number | 1–5 |
| AI下書き | Text | |
| Thread ID | Text | |
| Draft ID | Text | |
| スキップ理由 | Text | |
| 実送信版 | Text | 手動記入欄 (学習用) |
| 差分メモ | Text | 手動記入欄 (学習用) |

Notion Integration をこの DB の **Connections** に追加 (追加しないと 403)。

### 4. GitHub Secrets 登録

リポジトリの **Settings → Secrets and variables → Actions** で上記 7 つを
登録する。

### 5. 動作確認

**Actions → Gmail Draft Bot → Run workflow** で手動実行。`dry_run = true` に
すると Gmail には書かず Notion ログだけ更新される。

## 手動実行 (ローカル検証)

```bash
cd scripts/gmail-draft-bot
export GOOGLE_CLIENT_ID=...
export GOOGLE_CLIENT_SECRET=...
export GOOGLE_REFRESH_TOKEN=...
export ANTHROPIC_API_KEY=...
export NOTION_TOKEN=...
export NOTION_GMAIL_LOG_DB_ID=e4a2289c-77bb-4bd4-8816-e5b9b19acf69
export GMAIL_USER_EMAIL=you@example.com
DRY_RUN=1 node run.mjs
```

## 学習ループ (将来)

Notion DB の `実送信版` / `差分メモ` 列を手動で埋めれば、後日これを Phase 0
の `learnStyle` に混ぜ込むことで「AI 下書き ↔ 実送信」の差分を直接学習でき
る。現在は未実装。

## トラブルシューティング

- **403 from Notion** → Integration が DB に接続されていない。
- **invalid_grant from Google** → refresh_token が失効。OAuth Playground で
  再取得して `GOOGLE_REFRESH_TOKEN` を更新。
- **scheduling slots が空** → Calendar 参照権限が無い。スコープ
  `calendar.readonly` を含めて再認可。
- **Claude の出力が壊れて score=2 が常に返る** → `claude.mjs::generateDraft`
  の `<<<DRAFT>>> / <<<SCORE>>>` 区切りが守られていない。プロンプトを調整。
