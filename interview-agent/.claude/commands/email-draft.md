---
description: followup-messages.md の文面を Gmail の下書きとして作成する（送信はユーザーが最終確認）
argument-hint: <candidate-slug> [pattern]
---

# /email-draft — Gmail 下書き作成

`/followup` で生成したメッセージを **Gmail の下書き** として保存します。
自動送信はしません。ユーザーが Gmail アプリで最終確認してから送信します。

## 引数
- `$1` : 候補者 slug
- `$2` : パターン指定（省略可、デフォルトは **即送信メッセージ**）
  - `immediate` : 即送信メッセージ（デフォルト）
  - `nurture` : 7 日後ナーチャリング
  - `invite` : 14 日後体験レッスン招待
  - `final` : 30 日後最終フォロー
  - `dm-a` / `dm-b` / `dm-c` : 初回 DM 3 パターン（`dm-drafts.md` 経由）
  - `reminder` : 面談前日リマインダー（自動生成）

## 手順

### Step 1: 情報収集
- `candidates/$1/profile.md` を Read → 宛先メールアドレスと氏名
- `candidates/$1/followup-messages.md` を Read → パターンに応じた文面を抽出
- `$2` が `dm-*` の場合は `dm-drafts.md` を読む
- `$2` が `reminder` の場合は、ブリーフと面談日時から自動的にリマインダー文を生成

### Step 2: 宛先バリデーション
`profile.md` にメールアドレスがなければ、ユーザーに以下を案内して終了:
```
profile.md に「連絡先」が記載されていません。
メールアドレスを追記するか、LINE/DM 版を使ってください（ファイル参照のみ）:
  candidates/$1/followup-messages.md
```

### Step 3: 件名とメール版本文の抽出
`followup-messages.md` から指定パターンの **メール版** セクション（件名付き・丁寧バージョン）を取り出す。
メール版セクションが存在しない場合は、LINE 版をメール向けに軽く書き換える（敬体を統一、署名欄を追加）。

### Step 4: Gmail MCP で下書き作成
Gmail MCP の **create_draft** ツールを呼ぶ:

- `to`: `[候補者のメールアドレス]`
- `subject`: 件名（例: `【○○スクール】面談のお礼と次のステップについて`）
- `body`: プレーンテキスト本文（改行保持）
- `htmlBody`: HTML 版（段落 `<p>` で包み、重要箇所を `<strong>` で強調）

### Step 5: 下書き作成後の報告
Gmail から返った draft ID と件名をユーザーに表示:

```
📬 Gmail 下書きを作成しました
  宛先: tanaka.yuki@example.com
  件名: 【○○スクール】面談のお礼と次のステップについて
  パターン: immediate（即送信）
  下書き ID: <id>

次のアクション:
  1. Gmail を開いて下書きを確認
  2. 署名・添付ファイルを最終調整
  3. 送信

※ 自動送信はしていません。送信は必ずご自身で行ってください。
```

## 制約
- **絶対に自動送信しない**。create_draft のみ、send_message は使わない
- 宛先は **profile.md に記載された 1 件のアドレス** に限定（複数宛に誤送信するリスク排除）
- CC/BCC は原則空
- 候補者名は件名・本文の適切な位置に自然に組み込む
- 未成年候補者の場合、保護者アドレスが profile.md にあればそちらも CC に入れる（要ユーザー確認）
- 同じパターンの下書きが直近 24h 以内に存在する場合は警告し、ユーザー確認後にのみ再作成

## エラーハンドリング
- Gmail MCP 未接続: MCP-SETUP.md を案内
- 認証エラー: OAuth スコープ `gmail.compose` が必要な旨を表示
- 空の本文: followup-messages.md に該当パターンがない → `/followup $1` 実行を案内
