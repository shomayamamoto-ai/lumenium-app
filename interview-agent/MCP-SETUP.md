# MCP 連携セットアップ

interview-agent は **Google Calendar / Gmail / Notion** の 3 つの MCP サーバと連携して動作します。
連携済みの環境であれば、以下のコマンドで **日程調整・メール送信・CRM 同期** が自動化されます。

## 🔌 必要な MCP サーバ

| MCP | 用途 | 使うコマンド |
|-----|------|------------|
| **Google Calendar** | 面談予約、リマインダー、TODO 期日の登録 | `/schedule`, `/remind`, `/today`（拡張） |
| **Gmail** | フォローメール・初回 DM の下書き作成 | `/email-draft`, `/followup`（拡張）, `/dm`（拡張） |
| **Notion** | 候補者 CRM、チーム共有、ダッシュボード | `/notion-sync`, `/new`（拡張） |

## ✅ 本セッションで確認済みの接続

```
Google Calendar : shoma.yamamoto@lumenium.net（Asia/Tokyo）
Gmail           : 接続済み
Notion          : 接続済み
```

## 🛠 セットアップ手順（初回のみ）

### 1. Claude Code の MCP サーバ設定
以下はユーザー設定（`~/.claude/settings.json`）でグローバルに、
またはプロジェクト設定（`.claude/settings.json`）でこのエージェントだけに接続できます。

実際の接続方法は Claude Code のドキュメント
<https://code.claude.com/docs/en/mcp> を参照してください。

Claude Code が自動検出するプロジェクト MCP 設定ファイル (`.mcp.json`) の雛形:

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": ["-y", "@google/calendar-mcp"],
      "env": { "GOOGLE_CREDENTIALS": "<path-to-oauth>" }
    },
    "gmail": {
      "command": "npx",
      "args": ["-y", "@google/gmail-mcp"],
      "env": { "GOOGLE_CREDENTIALS": "<path-to-oauth>" }
    },
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": { "NOTION_TOKEN": "<notion-integration-secret>" }
    }
  }
}
```

※ 実運用では、Anthropic または各プロバイダ公式の MCP サーバ、あるいは既に接続済みのマネージド MCP（本環境がこれ）を使ってください。

### 2. Notion 側の準備（Notion 同期を使う場合）
候補者 CRM 用のデータベースを 1 つ作成してください。推奨スキーマ:

| プロパティ名 | 型 | 説明 |
|------------|----|------|
| 氏名 | Title | 候補者の氏名 |
| slug | Rich text | `YYYY-MM-DD-苗字-下の名前` |
| 分類 | Select | 本気層 / 迷い層 / 冷やかし / 未分類 |
| 面談日時 | Date | 面談スケジュール |
| 次アクション期日 | Date | classification.md の最優先 TODO 期日 |
| 紹介元 | Select | Instagram / TikTok / 紹介 / ... |
| 分類確度 | Select | 高 / 中 / 低 |
| 備考 | Rich text | 自由記述 |

データベースの URL をメモして、初回 `/notion-sync` 実行時に渡してください。

### 3. Gmail 側の準備（任意）
ラベルを作っておくと自動分類に便利:
- `面談/候補者` — 候補者関連の下書き用
- `面談/成約済み` — 成約後

## 🧭 コマンドが MCP をどう使うか

### `/schedule <slug>`
- candidate の `profile.md` から面談日時を読む
- Google Calendar に **Google Meet URL 付き** のイベントを作成
- 30 分前のリマインダー自動設定
- 作成した Calendar イベント URL を `profile.md` に追記

### `/remind <slug>`
- `classification.md` のフォロー TODO を読み、各期日で **終日イベント** として Calendar に登録
- タイトル例: `[迷い層フォロー] 田中由紀 - 家族向け資料送付`

### `/today` (MCP 拡張版)
- ローカルファイル走査 + Google Calendar の本日予定を統合
- 面談・フォローアクション・Gmail 未返信ドラフトも横断表示

### `/email-draft <slug> [pattern]`
- `followup-messages.md` からメッセージを読み、Gmail の **下書き** として作成
- `profile.md` の連絡先宛、件名・本文を自動セット
- ユーザーは Gmail アプリで最終確認→送信するだけ

### `/notion-sync <slug>`
- `profile.md` + `classification.md` を読み、指定 Notion データベースに 1 レコード Create or Update
- チーム共有可能な CRM ビューが Notion 上に自動構築される

### `/dm <slug>` (Gmail 拡張)
- 従来通り 3 パターン生成 + **ユーザーが選んだパターンを Gmail 下書きに保存**

### `/new <氏名> [URL...]` (Notion 拡張)
- 従来通りローカル candidates/ を作成 + **Notion DB にも空レコードを 1 件 Create**

## 🔒 プライバシーと安全性

- **下書き保存のみ、自動送信はしない**（常にユーザーの最終確認を挟む）
- **既読通知・削除は行わない**
- Calendar イベントは **private** として作成（他の参加者に候補者情報が漏れないよう配慮）
- Notion 書き込みは個人用 integration トークン経由で、共有 workspace の場合は候補者 DB のみ公開スコープを絞る

## 🧪 動作確認

MCP が正しく繋がっているか、以下の read-only コマンドで確認できます:

```
claude
> list_calendars を呼んで私のカレンダー一覧を表示して
> notion-search で "interview" を検索して
> list_labels を呼んで Gmail のラベル一覧を表示して
```

いずれも認証エラーやタイムアウトにならなければ OK です。

## 🚨 トラブルシュート

| 症状 | 原因 | 対処 |
|------|------|------|
| "MCP tool not found" | サーバ未接続 | `claude mcp list` で接続確認、必要なら再接続 |
| Calendar 作成で 403 | OAuth スコープ不足 | `calendar.events` スコープで再認可 |
| Notion で "unauthorized" | integration が DB に招待されていない | Notion DB の「Connections」で integration を追加 |
| Gmail 下書き後に文字化け | エンコーディング | `body` にプレーンテキスト、`htmlBody` に HTML を分離して渡す |
