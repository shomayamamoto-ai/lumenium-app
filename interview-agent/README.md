# 面談支援エージェント

モデル／アクター候補者の面談 **準備・記録・分類** を自動化する Claude Code エージェントです。

## 何ができるか
| コマンド | 何をするか | 目標時間 |
|---------|-----------|---------|
| `/brief <slug>` | SNS を分析し、面談用 1 枚ブリーフを作成 | 30 秒 |
| `/minutes <slug>` | 生メモ／文字起こしを構造化議事録に変換 | 10 秒 |
| `/classify <slug>` | 議事録から候補者タイプ分類とフォロー計画を出力 | 10 秒 |

## セットアップ

### 1. Claude Code をこのディレクトリで起動
```bash
cd interview-agent
claude
```
Claude Code が `.claude/commands/` と `.claude/agents/` を自動検出します。

### 2. 候補者フォルダを作成
```bash
mkdir -p candidates/2026-04-30-yamada-sample
cp candidates/_example/profile.md candidates/2026-04-30-yamada-sample/profile.md
# profile.md を実データで編集
```

slug の命名規則: `YYYY-MM-DD-苗字-下の名前`

## 使い方（典型フロー）

### ① 面談前日〜当日朝
```
/brief 2026-04-30-yamada-sample
```
→ `candidates/<slug>/brief.md` が生成され、3 行サマリーが表示されます。

### ② 面談中
`candidates/<slug>/raw-notes.md` にメモを書く（テキストエディタ or 録音→文字起こし）。

### ③ 面談直後
```
/minutes 2026-04-30-yamada-sample
```
→ `candidates/<slug>/minutes.md` が生成されます。

### ④ 分類とフォロー計画
```
/classify 2026-04-30-yamada-sample
```
→ `candidates/<slug>/classification.md` が生成され、期日付き TODO が出ます。

## ディレクトリ構成
```
interview-agent/
├── PRD.md                     # 作るものと KPI
├── CLAUDE.md                  # Claude への文脈
├── README.md                  # このファイル
├── .gitignore                 # 個人情報を Git に含めない設定
├── .claude/
│   ├── commands/              # /brief /minutes /classify
│   └── agents/
│       └── sns-analyzer.md    # SNS 分析サブエージェント
├── templates/                 # 出力テンプレート
│   ├── brief.md
│   ├── minutes.md
│   └── classification.md
└── candidates/
    ├── _example/              # 構造見本（コミット対象）
    │   ├── profile.md
    │   └── raw-notes.md
    └── <slug>/                # 実データ（.gitignore で除外）
```

## プライバシーと倫理
- 候補者の個人情報は **Git にコミットされません**（`.gitignore` で `candidates/*` を除外済み）
- 録音は **本人同意を取得した上で** 行い、文字起こし後は原音声を削除することを推奨
- `CLAUDE.md` に倫理ガイドラインを定義済み（容姿評価禁止、未成年警告必須など）

## PDCA
議事録が 20–30 件たまったら、次のコマンドを追加予定:
- `/analyze-win-loss` — 成約者と非成約者の差分抽出
- `/dashboard` — 週次 KPI サマリー生成

## 既知の制限
- 非公開 SNS アカウントは分析できません（「取得不可」と返ります）
- 音声録音の文字起こしは別ツール（Whisper など）で事前に行ってください
- 成約率の単一数値予測はしません（確度：高/中/低 で表現）

## トラブルシュート
| 症状 | 対処 |
|------|------|
| `/brief` が profile.md が見つからないと言う | `candidates/<slug>/profile.md` を作成 |
| SNS 取得で「取得不可」が多い | 非公開アカウントか、ログイン必須ページの可能性 |
| 議事録で「生メモ不足」と言われる | `raw-notes.md` に最低でも動機・予算・期日を記載 |
