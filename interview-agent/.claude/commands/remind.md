---
description: classification.md のフォロー TODO を Google Calendar の終日イベントとして一括登録
argument-hint: <candidate-slug>
---

# /remind — フォロー TODO を Calendar に登録

`/classify` が生成したフォロー計画の各 TODO を Google Calendar の終日イベントとして一括登録します。
これで「やり忘れ」がゼロになります。

## 引数
- `$1` : 候補者 slug

## 手順

### Step 1: classification.md を読む
- `candidates/$1/classification.md` を Read
- フォロー計画テーブル（期日・アクション・担当）を抽出
- `profile.md` から候補者氏名と分類を取得

classification.md がなければ「先に `/classify $1` を」と案内して終了。

### Step 2: 各 TODO ごとに Calendar イベント作成
各行に対し以下のパラメータで Calendar MCP の **create_event** を呼ぶ:

- `summary`: `[<分類>フォロー] <氏名> - <アクション要約>`
  - 例: `[迷い層フォロー] 田中由紀 - 家族向け資料送付`
- `startTime` / `endTime`: 期日の 00:00 〜 翌日 00:00（終日扱い、UTC で計算）
- `allDay`: true
- `timeZone`: `Asia/Tokyo`
- `description`: 以下
  ```
  候補者: <氏名>
  slug: <slug>
  分類: <分類>
  アクション: <full アクションテキスト>

  議事録: candidates/<slug>/minutes.md
  フォロー文面: candidates/<slug>/followup-messages.md

  実行時のコマンド例:
    /email-draft <slug>
  ```
- `visibility`: `"private"`
- `colorId`:
  - 本気層: `11`（Tomato）
  - 迷い層: `5`（Banana）
  - 冷やかし: `8`（Graphite）
- `notificationLevel`: `"NONE"`

### Step 3: 重複チェック
同じ期日・同じ slug の既存イベントがないか、**list_events** で事前確認。
あればスキップして「既存」とカウント。

### Step 4: classification.md 更新
各 TODO 行の「状態」列を「未着手（Calendar登録済）」に更新し、`候補者 TODO 登録済み: <イベント数>件` の行を末尾追記。

### Step 5: ユーザーへの報告
```
🔔 Calendar リマインダー登録完了: <氏名>
  登録: 4 件 / 既存: 0 件 / スキップ: 0 件

  🔴 [本気層フォロー] 契約書 PDF 送付 — 2026-05-02
  🟡 [迷い層フォロー] 家族向け資料 — 2026-05-08
  🟡 [迷い層フォロー] 合格者事例共有 — 2026-05-15
  🟢 [冷やかしフォロー] 体験レッスン案内 — 2026-05-30

次のアクション:
  /today で今日の対応事項を確認
```

## 制約
- 既に同じ日付・同じ slug のイベントがある場合は重複作成しない
- 失注と判定されたら、未来の TODO はすべて cancel（別コマンド `/unremind` を将来追加）
- 期日が過去の TODO は登録せず「期日切れのためスキップ」と報告
- Calendar MCP が未接続なら MCP-SETUP.md への誘導を表示
