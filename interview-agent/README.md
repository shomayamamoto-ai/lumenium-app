# 面談支援エージェント v2

モデル／アクター候補者の **スカウト〜面談〜成約〜PDCA** を Claude Code 上で一気通貫にまわすエージェントです。

## 🧭 候補者ライフサイクルとコマンド対応

```
 ┌──────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌─────────┐
 │ スカウト │→→│ 面談準備 │→→│ 面談実施  │→→│ 面談後    │→→│ PDCA    │
 └──────────┘   └──────────┘   └───────────┘   └──────────┘   └─────────┘
    /dm         /new, /brief    (raw-notes       /minutes       /today
                /rehearse        .md に記入)     /classify      /weekly
                                                 /followup      /compare
```

## 🎛 コマンド一覧

| コマンド | いつ使う | 入力 | 出力 |
|---------|---------|------|------|
| `/new <氏名> [URL...]` | 新規候補者を登録するとき | 氏名＋SNS URL | `candidates/<slug>/` 一式 |
| `/dm <slug>` | スカウト DM を送る直前 | profile.md | DM 3 パターン＋推奨理由 |
| `/brief <slug>` | 面談前日〜当日 | profile.md, SNS | 1 枚ブリーフ＋直前 5 分チェックリスト |
| `/rehearse <slug>` | 面談 10 分前の練習 | brief.md | 30 分 5 フェーズ台本＋NG ワード＋自己採点 |
| `/minutes <slug>` | 面談直後 | raw-notes.md | 構造化議事録 |
| `/classify <slug>` | 議事録生成後 | minutes.md | 本気/迷い/冷やかし＋期日付き TODO |
| `/followup <slug>` | 分類直後 | classification.md | 即送信文面（LINE/メール）複数パターン |
| `/today` | 毎朝 | 全 candidates | 今日やるべきアクション優先度付き |
| `/weekly [日付]` | 毎週月曜朝 | 全 candidates | KPI＋ボトルネック＋改善仮説 |
| `/compare <slug...>` | 月 1 回 PDCA | 複数 candidates | 勝ちパターン言語化レポート |

## 🚀 セットアップ

```bash
cd interview-agent
claude
```

Claude Code が `.claude/commands/` と `.claude/agents/` を自動で読み込みます。

## 💼 典型ワークフロー

### A. 新規候補者を見つけた → スカウト DM を送るまで
```
/new 田中由紀 https://instagram.com/tanaka_yuki_model https://tiktok.com/@tanaka_yuki
/dm 2026-04-21-tanaka-yuki
# → 3 パターンから 1 つ選んで相手に送信
```

### B. 面談が決まった → 面談当日まで
```
# profile.md に面談日時などを追記
/brief 2026-04-21-tanaka-yuki
/rehearse 2026-04-21-tanaka-yuki   # 練習したい場合
# 面談 5 分前にブリーフ末尾のチェックリストを確認
```

### C. 面談中
- `candidates/<slug>/raw-notes.md` を開いて項目を埋める（★項目は必須）
- 走り書き OK、誤字 OK

### D. 面談直後 → フォロー開始
```
/minutes 2026-04-21-tanaka-yuki
/classify 2026-04-21-tanaka-yuki
/followup 2026-04-21-tanaka-yuki
# → 生成されたメッセージを LINE/DM/メールにコピペして送信
```

### E. 毎朝 / 毎週 / 月 1 の運用
```
# 毎朝
/today

# 毎週月曜朝
/weekly

# 月 1 で勝ちパターンを言語化
/compare 2026-04-01-成約者slug 2026-04-05-未成約slug 2026-04-12-冷やかしslug
```

## 🗂 ディレクトリ構成

```
interview-agent/
├── PRD.md                       # 何を作るか・KPI
├── CLAUDE.md                    # Claude への文脈・倫理規定
├── README.md                    # このファイル
├── .gitignore                   # 個人情報を Git から除外
├── .claude/
│   ├── commands/                # 10 個のスラッシュコマンド
│   │   ├── new.md
│   │   ├── dm.md
│   │   ├── brief.md
│   │   ├── rehearse.md
│   │   ├── minutes.md
│   │   ├── classify.md
│   │   ├── followup.md
│   │   ├── today.md
│   │   ├── weekly.md
│   │   └── compare.md
│   └── agents/
│       └── sns-analyzer.md      # SNS 並列分析サブエージェント
├── templates/
│   ├── brief.md
│   ├── minutes.md
│   ├── classification.md
│   └── raw-notes-checklist.md   # 面談中に埋めるチェックリスト
├── candidates/
│   ├── _example/                # 構造見本（コミット対象）
│   └── <slug>/                  # 個別データ（.gitignore で除外）
│       ├── profile.md
│       ├── brief.md
│       ├── rehearsal.md
│       ├── raw-notes.md
│       ├── minutes.md
│       ├── classification.md
│       ├── followup-messages.md
│       └── dm-drafts.md
└── reports/                     # /weekly と /compare の出力先
    ├── weekly-YYYY-MM-DD.md
    └── compare-YYYY-MM-DD.md
```

## 🔒 プライバシーと倫理

`.gitignore` で以下を自動除外済み:
- `candidates/*`（`_example/` のみ許可）
- `*.mp3 *.m4a *.wav *.mp4`（録音原本）
- `transcript-raw-*.txt`（文字起こし原本）

`CLAUDE.md` に以下を明文化:
- 容姿の数値評価禁止
- 差別的表現禁止
- 未成年警告の義務化
- センシティブ情報（宗教・政治・病歴）の原則非記録
- 操作的手法（虚偽の希少性、焦らせ）の生成禁止

## 🎯 KPI 目標（PRD.md 参照）

| 指標 | 現状 | 1 ヶ月後 | 3 ヶ月後 |
|------|------|---------|---------|
| 面談準備時間 | 30 分 | 5 分 | 3 分 |
| 議事録作成時間 | 20 分 | 2 分 | 1 分 |
| スカウト DM 返信率 | ベース値計測 | +50% | +100% |
| 本気層成約率 | 未計測 | 計測開始 | +10pt |

## 🧪 試してみる（架空サンプル）

```bash
cp -r candidates/_example candidates/2026-05-01-test
# その中の profile.md は既に埋まっている
```

Claude Code で:
```
/brief 2026-05-01-test
/minutes 2026-05-01-test
/classify 2026-05-01-test
/followup 2026-05-01-test
```

## 🛠 次に追加したい機能（v3 候補）

- **MCP 連携**: Googleカレンダー（面談枠自動提案）、Gmail（返信送付）、LINE 公式アカウント
- **音声文字起こしフック**: `raw-audio.m4a` を置いたら自動で `transcript.md` 生成
- **自動タグ付け**: 議事録の発言から関心タグを自動抽出（「K-POP」「ダンス」）
- **A/B ラベル記録**: どの DM パターンを使ったか記録し、返信率を学習
- **成約/失注ラベル**: `outcome.md` を候補者フォルダに追加し、`/compare` の精度向上

## ❓ よくある質問

**Q: Claude はネットに候補者の個人情報を送っていませんか?**
A: `candidates/*` は `.gitignore` で Git から除外しています。ただし Claude Code は Anthropic サーバと通信するため、送信内容については Anthropic のプライバシーポリシーに従います。録音データの取り扱いは特に慎重に。

**Q: 面談中にタイピングが追いつきません**
A: 音声録音 + 別途文字起こし（Whisper 等）→ `transcript.md` として保存 → `/minutes` がそれを読みます。

**Q: 複数担当者で共有したい**
A: profile/brief/minutes など個人情報を含むファイルは Git 同期できません。別途 Google Drive や Notion との MCP 連携を v3 で検討予定。
