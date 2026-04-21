---
description: 候補者の面談を Google Calendar に登録する（Google Meet URL 自動発行）
argument-hint: <candidate-slug>
---

# /schedule — 面談の Google Calendar 予約

`profile.md` の面談日時情報をもとに、Google Calendar にイベントを作成します。
Google Meet URL 自動発行、30 分前リマインダー、private 可視化まで一括実施。

## 引数
- `$1` : 候補者 slug

## 手順

### Step 1: profile.md 読み込み
- `candidates/$1/profile.md` を Read
- 以下を抽出:
  - 氏名
  - 面談予定日時（形式: `YYYY-MM-DD HH:MM`）
  - 面談形式（対面 / オンライン）
  - 候補者の連絡先メールアドレス（あれば）

面談日時が不明 or 未来ではない場合は、ユーザーに「profile.md の `面談予定日時` を `YYYY-MM-DD HH:MM` 形式で記入してください」と案内して終了。

### Step 2: 面談長さ決定
- オンライン: 30 分（デフォルト）
- 対面: 60 分（デフォルト）
- ユーザーが override 指定した場合はそれに従う

### Step 3: Calendar MCP でイベント作成
Google Calendar MCP の **create_event** ツールを呼ぶ。以下のパラメータをセット:

- `summary`: `[面談] <氏名>（<slug> 面談）`
- `startTime`: profile.md の日時（ISO 8601 形式）
- `endTime`: 開始 + 面談長さ
- `timeZone`: `Asia/Tokyo`
- `description`: 以下の Markdown 風テキスト
  ```
  候補者: <氏名>
  slug: <slug>
  紹介元: <profile.md の紹介元>
  面談形式: <形式>

  【事前準備】/brief <slug> で生成済みブリーフを参照
  brief: candidates/<slug>/brief.md

  【面談中】raw-notes.md に記入
  【面談後】/minutes → /classify → /followup
  ```
- `addGoogleMeetUrl`: **true**（オンライン面談の場合）
- `visibility`: `"private"`
- `attendeeEmails`: 候補者のメールアドレス（profile.md にあれば。ない場合は空配列）
- `notificationLevel`: `"NONE"`（意図しない通知送信を防ぐ）

### Step 4: profile.md に Calendar イベント URL を追記
レスポンスから `htmlLink` を取得し、`profile.md` 末尾に以下を追記:

```markdown

## Calendar
- イベント URL: <htmlLink>
- Google Meet URL: <meetUrl>（オンラインの場合）
- 登録日時: <現在時刻>
```

### Step 5: ユーザーへの報告
```
📅 面談を Calendar に登録しました
  日時: 2026-05-01 15:00 JST（30 分）
  Meet: https://meet.google.com/xxx-yyy-zzz
  Calendar: https://calendar.google.com/event?eid=...

候補者へのリマインドは以下で送れます:
  /email-draft 2026-04-21-tanaka-yuki reminder

次のアクション:
  /brief 2026-04-21-tanaka-yuki
```

## 制約
- **attendeeEmails に候補者アドレスを入れた場合、Google が自動的に招待メールを送る**ことがある。
  → `notificationLevel: NONE` を明示し、意図しない通知送信を防ぐ
- 既にイベント URL が `profile.md` にある場合は「既に登録済み」と警告し、重複作成をスキップ
- 土日祝や深夜帯の予定は、ユーザーに確認してから作成する
- Calendar MCP が未接続なら「MCP-SETUP.md の手順で Google Calendar MCP を接続してください」と案内

## エラーハンドリング
- 403: 「OAuth スコープ不足。calendar.events を許可してください」
- 404: 「カレンダー ID が不正です」
- タイムアウト: 30 秒待ってリトライ、3 回失敗したらエラー報告
