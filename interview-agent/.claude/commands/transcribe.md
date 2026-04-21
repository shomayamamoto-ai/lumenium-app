---
description: 候補者フォルダ内の音声ファイルを Whisper で文字起こしし transcript.md を生成する
argument-hint: <candidate-slug> [--no-redact] [--model MODEL]
---

# /transcribe — 音声 → 文字起こし

`candidates/<slug>/raw-audio.*`（m4a / mp3 / wav / mp4）を自動検出し、Whisper で文字起こしして `transcript.md` を生成します。生成後は PII を自動除去し、`/minutes` で参照可能な形にします。

## 引数
- `$1` : 候補者 slug
- `$2` 以降: 任意フラグ
  - `--no-redact` : PII 除去をスキップ（内部レビュー用）
  - `--model <name>` : Whisper モデル指定（`tiny` / `base` / `small` / `medium` / `large-v3`、デフォルト `large-v3`）

## 手順

### Step 1: 音声ファイル検出
`candidates/$1/` 配下を以下の優先順で探す:
1. `raw-audio.m4a`
2. `raw-audio.mp3`
3. `raw-audio.wav`
4. `raw-audio.mp4`
5. `raw-audio.webm`

見つからない場合は、`raw-audio.*` のマッチもあわせて試す（拡張子違いに対応）。
それでも無ければユーザーに以下を案内して終了:
```
音声ファイルが見つかりません。以下のパスに配置してください:
  candidates/$1/raw-audio.m4a（推奨）

その後、/transcribe $1 を再実行してください。
```

### Step 2: 既存 transcript.md のチェック
既に `candidates/$1/transcript.md` が存在する場合、ユーザーに以下を問う:
```
既に transcript.md が存在します（生成日時: YYYY-MM-DD HH:MM）。
上書きしますか? (y/N)
```
N なら処理中止。

### Step 3: Whisper 実行
Bash で以下を実行:
```bash
bash scripts/transcribe.sh \
  candidates/$1/raw-audio.<ext> \
  candidates/$1/transcript.md \
  $FLAGS
```

バックエンドは `scripts/transcribe.sh` が自動検出:
- faster-whisper（推奨、ローカル）
- whisper CLI（ローカル）
- whisper.cpp（ローカル）
- OpenAI Whisper API（`OPENAI_API_KEY` 環境変数経由、クラウド）

### Step 4: 生成結果の要約表示
`transcript.md` のメタデータ部（冒頭）を読み、以下をユーザーに報告:
```
📝 文字起こし完了: candidates/$1/transcript.md
  所要時間: 42:15
  セグメント数: 180
  信頼度: 高
  バックエンド: faster-whisper / large-v3
  PII 除去: 実施済（[電話番号]×2, [メールアドレス]×1）

次のアクション:
  cat candidates/$1/transcript.md | less      # 内容確認
  /minutes $1                                   # 議事録生成（transcript.md を優先的に使用）
```

### Step 5: 次のステップ案内
ユーザーに「/minutes $1 で議事録化できます」とだけ伝える。
自動で `/minutes` を起動しない（人間がまず transcript の正確性を確認すべき）。

## バックエンド未インストール時

`scripts/transcribe.sh` が `BACKEND=none` を返した場合は、`TRANSCRIPTION-SETUP.md` の冒頭（インストール手順）を引用して案内する:

```
文字起こしバックエンドが未インストールです。以下のいずれかをセットアップしてください:

[推奨: ローカル実行、プライベート]
  pip install faster-whisper

[クラウド実行、セットアップ最速]
  export OPENAI_API_KEY=sk-...

詳細は TRANSCRIPTION-SETUP.md 参照。
```

## 大きなファイルへの対処
- **25MB 超** の場合、OpenAI API はエラー。ローカル backend を推奨
- **2時間超** の面談は Whisper が途中で品質低下することがある。`ffmpeg` で 30 分ごとに分割してから `/transcribe` を複数回実行し、後で結合

## 制約
- 音声ファイルは Git にコミットしない（`.gitignore` で除外済み）
- PII 除去後の `transcript.md` と、除去前 `transcript.md.raw` が併存する（レビュー用に一時保持、レビュー後は `.raw` を手動削除推奨）
- 面談は **本人同意を得た上で** 録音することを前提とする（CLAUDE.md の倫理規定）
- 未成年候補者の場合、録音前に保護者同意を取得していること

## セキュリティ
- OpenAI API を使う場合、音声データは OpenAI に送信される。センシティブな面談は **ローカル backend 必須**
- `transcript.md.raw`（PII 除去前）は 7 日以内に手動削除することを推奨
