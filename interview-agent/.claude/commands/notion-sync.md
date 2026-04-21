---
description: 候補者データを Notion データベースに同期（CRM 化、チーム共有）
argument-hint: <candidate-slug>
---

# /notion-sync — Notion CRM に候補者を同期

`profile.md` / `classification.md` の内容を Notion データベースの 1 ページに同期します。
チームで候補者状況を共有できる CRM ビューが自動構築されます。

## 事前準備（初回のみ）
Notion に「候補者 CRM」データベースを作成し、以下のプロパティを用意してください:

| プロパティ | 型 | 必須 |
|-----------|----|----|
| 氏名 | Title | ✅ |
| slug | Rich text | ✅ |
| 分類 | Select（本気層 / 迷い層 / 冷やかし / 未分類） | ✅ |
| 分類確度 | Select（高 / 中 / 低） | |
| 面談日時 | Date | |
| 次アクション期日 | Date | |
| 次アクション | Rich text | |
| 紹介元 | Select | |
| 担当 | Person or Select | |
| ステータス | Select（スカウト / 面談待ち / 面談済 / フォロー中 / 成約 / 失注 / 冷却） | ✅ |

詳細は `MCP-SETUP.md` の Notion 節を参照。

データベース URL を `.notion-config` という隠しファイルに保存済みであることを前提とします（初回実行時に作成）。

## 引数
- `$1` : 候補者 slug

## 手順

### Step 1: 設定読み込み
- `.notion-config` ファイルを Read。なければユーザーに Notion データベース URL を聞き、書き込む
  - 形式:
    ```
    DATABASE_URL=https://www.notion.so/xxxx?v=yyyy
    DATABASE_ID=<抽出した ID>
    ```
- このファイルは `.gitignore` に含める（個人 workspace 情報のため）

### Step 2: 候補者ファイル読み込み
- `candidates/$1/profile.md` を Read
- `candidates/$1/classification.md` があれば Read
- 以下の値を抽出:
  - 氏名
  - slug
  - 分類（なければ「未分類」）
  - 分類確度
  - 面談日時
  - 次アクション期日（フォロー計画テーブルの最優先行）
  - 次アクション（要約）
  - 紹介元
  - ステータス推定:
    - profile.md のみ → `スカウト`
    - 面談日時未来 → `面談待ち`
    - minutes.md あり・classification.md なし → `面談済`
    - classification.md あり → `フォロー中`

### Step 3: 既存レコード検索
**notion-search** ツールで slug をキーに既存ページを検索。
見つかった場合は `page_id` を取得して更新、見つからなければ新規作成。

### Step 4: 新規作成 or 更新
**新規作成の場合**: **notion-create-pages** でデータソース配下に 1 ページを作成。

```json
{
  "parent": { "type": "data_source_id", "data_source_id": "<from config>" },
  "pages": [{
    "properties": {
      "氏名": "<氏名>",
      "slug": "<slug>",
      "分類": "<分類>",
      "分類確度": "<確度>",
      "面談日時": "<ISO 日付>",
      "次アクション期日": "<ISO 日付>",
      "次アクション": "<アクションテキスト>",
      "紹介元": "<紹介元>",
      "ステータス": "<推定ステータス>"
    },
    "content": "<議事録の主要セクションの要約を Markdown で>"
  }]
}
```

**既存更新の場合**: **notion-update-page** でプロパティを上書き。

### Step 5: 本文のセクション
Notion ページ本文には以下を Markdown で入れる:

```markdown
## ブリーフ要約
<brief.md の「ペルソナ 3 行要約」>

## 面談議事録サマリー
- 動機: ...
- 最大障壁: ...
- 刺さった訴求: ...

## 次アクション
<classification.md の最優先 TODO>

## ローカルリンク
- profile: candidates/<slug>/profile.md
- brief: candidates/<slug>/brief.md
- minutes: candidates/<slug>/minutes.md
- classification: candidates/<slug>/classification.md
- followup: candidates/<slug>/followup-messages.md
```

### Step 6: 報告
```
📝 Notion 同期完了: <氏名>
  操作: 新規作成 / 更新
  ページ: https://www.notion.so/xxx
  ステータス: 面談待ち
  次アクション期日: 2026-05-02

ビュー URL: <DATABASE_URL>
```

## 制約
- 候補者の **センシティブ情報**（発言逐語の詳細、私生活情報）は Notion 本文に含めず、ローカル minutes.md を参照する旨を記載するだけに留める
- `_example/` は同期対象外
- Notion のプロパティ名と候補者データの型が一致しない場合、ユーザーにスキーマ修正を案内
- Notion API のレートリミット（3 リクエスト/秒）を尊重、連続同期時は適切に間隔を空ける

## バッチモード（将来）
`/notion-sync all` で全候補者を一括同期する拡張を v4 で検討。
