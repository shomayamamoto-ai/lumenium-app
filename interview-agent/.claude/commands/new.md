---
description: 候補者フォルダとプロフィールを一発生成する（面談前の準備ショートカット）
argument-hint: <氏名> [SNS URL を任意個続けて指定可]
---

# /new — 候補者フォルダ自動生成

氏名と（任意で）SNS URL を渡すと、以下を一発で行います:
1. slug を生成し `candidates/<slug>/` を作成
2. `profile.md` をテンプレから生成して SNS URL を差し込む
3. `raw-notes-checklist.md` を配置（面談中に埋めるためのチェックリスト）
4. 次に実行すべきコマンドを案内

## 引数
- `$1` : 氏名（例: 「田中 由紀」。スペースあり OK）
- `$2` 以降: SNS URL を任意個

## 手順

### Step 1: slug 生成
- 今日の日付 `YYYY-MM-DD` を取得
- 氏名をローマ字に変換（Claude が妥当な transliteration）
- 半角小文字＋ハイフン統一
- 例: `田中 由紀` → `2026-05-01-tanaka-yuki`
- 同名が既に存在する場合は末尾に `-02`, `-03` を付ける

### Step 2: フォルダ作成
Bash: `mkdir -p candidates/<slug>`

### Step 3: profile.md 生成
以下を `candidates/<slug>/profile.md` に Write:

```markdown
# 候補者プロフィール: <氏名>

- 氏名: <氏名>
- 漢字読み: （記入）
- 推定年齢: （記入 / 本人申告あれば）
- 所在地: （記入）
- 連絡先: （記入）
- 紹介元 / 流入経路: （記入）
- 面談予定日時: （記入）
- 面談形式: 対面 / オンライン（記入）

## SNS
<渡された URL を箇条書きで>
- Instagram: <URL or 「なし」>
- TikTok: <URL or 「なし」>
- YouTube: <URL or 「なし」>
- X: <URL or 「なし」>

## 事前アンケート回答
（記入）

## 担当者メモ（事前）
（記入）
```

URL からプラットフォームを推定（`instagram.com` → Instagram 等）して該当行に差し込む。不明な URL は「その他 SNS」セクションにまとめる。

### Step 4: raw-notes-checklist.md 配置
`templates/raw-notes-checklist.md` をコピーして `candidates/<slug>/raw-notes.md` として配置する（面談中に埋めてもらう用）。

### Step 5: Notion 同期の提案（MCP 接続時のみ、任意）
Notion MCP が接続されていて `.notion-config` が存在する場合、ユーザーに以下を問う:
```
Notion CRM にも登録しますか? (Y/n)
```
Y なら `/notion-sync $slug` を内部的に呼び、候補者レコードを作成。
N またはスキップ時は「後で `/notion-sync <slug>` で同期できます」と案内のみ。

### Step 6: 案内を表示
ユーザーには以下を返す:

```
✅ 作成完了: candidates/<slug>/

次の推奨フロー:
1. profile.md に不足情報を追記（面談日時・連絡先など）
2. /dm <slug>             ← スカウト DM 送る場合
3. /schedule <slug>       ← 面談を Calendar に登録（MCP）
4. /brief <slug>          ← 面談前ブリーフを生成
5. /rehearse <slug>       ← 面談練習したい場合
6. 面談中 → raw-notes.md に記入
7. /minutes <slug>        ← 議事録化
8. /classify <slug>       ← 分類＆フォロー計画
9. /remind <slug>         ← フォロー TODO を Calendar 登録（MCP）
10. /followup <slug>      ← 送信メッセージを生成
11. /email-draft <slug>   ← Gmail 下書き作成（MCP）
```

## 制約
- 個人情報を Claude が勝手に推測して埋めない（`（記入）` のまま残す）
- SNS URL のバリデーションは形式チェックのみ（実際の到達は /brief 時に確認）
