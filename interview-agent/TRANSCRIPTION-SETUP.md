# 音声文字起こしセットアップ

面談を録音して自動で文字起こしするための手順です。
`/transcribe <slug>` コマンドが使えるようになります。

## 🔐 まず大原則

面談録音は **本人の明示的同意** を取得した上で実施してください。
未成年の場合は **保護者の同意も必須** です。

## 🧭 バックエンドの選択

| バックエンド | コスト | プライバシー | 速度 | 難易度 | 推奨 |
|------------|-------|-----------|------|-------|-----|
| **faster-whisper**（ローカル） | 無料 | 🟢 完全ローカル | ⚡ 高速（GPU 可） | 中 | ⭐ 本命 |
| **openai-whisper**（ローカル） | 無料 | 🟢 完全ローカル | 中〜高速 | 低 | 代替 |
| **whisper.cpp**（ローカル） | 無料 | 🟢 完全ローカル | ⚡⚡ 最速 | やや高 | GPU 不使用でも速い |
| **OpenAI Whisper API** | $0.006/分 | 🟡 音声を OpenAI に送信 | ⚡ 高速 | 最低 | 急いで試したい時だけ |

**推奨**: 面談内容は候補者のセンシティブな発言を含むため、**ローカル** で動くバックエンドをまず選んでください。

## 🚀 クイックスタート（faster-whisper 推奨）

```bash
# Python 3.9 以降が必要
pip install faster-whisper

# 動作確認
python3 -c "from faster_whisper import WhisperModel; print('OK')"
```

初回だけモデルをダウンロードします（large-v3 は約 3GB）。2 回目以降はキャッシュが効きます。

## 🔧 ffmpeg（音声読み込みに必要）

ほぼすべてのバックエンドで ffmpeg が必要です:

**macOS**:
```bash
brew install ffmpeg
```

**Ubuntu / Debian**:
```bash
sudo apt install ffmpeg
```

**Windows**:
<https://ffmpeg.org/download.html> からダウンロード → PATH 追加

## 🌐 OpenAI API（クラウド方式）

急ぎで試したい場合:

```bash
export OPENAI_API_KEY=sk-...  # .bashrc / .zshrc に書いておくと永続化

# 確認
curl -s https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" | head
```

**注意点**:
- 音声ファイルは **25MB 以下** に収める必要あり（長時間面談は分割）
- 音声データは OpenAI に送信される（プライバシー要件に応じて判断）
- `$0.006/分` 課金（60 分面談で約 $0.36）

## 🎙 音声ファイルの置き方

候補者フォルダ直下に、以下のいずれかの名前で置いてください:

```
candidates/2026-05-01-tanaka-yuki/
├── profile.md
├── raw-notes.md
└── raw-audio.m4a          ← ここ（.mp3 / .wav / .mp4 / .webm も可）
```

## 📼 推奨の録音フロー

### 方法 A: スマホで録音 → AirDrop/クラウドで転送
1. iPhone「ボイスメモ」or Android「Recorder」で録音
2. AirDrop / Google Drive 経由で PC へ転送
3. `candidates/<slug>/raw-audio.m4a` にリネーム配置
4. Claude Code で `/transcribe <slug>`

### 方法 B: Zoom / Google Meet で録音
1. 面談を Google Meet で実施（`/schedule` で自動発行）
2. Google Meet の「レコーディング」機能で録画
3. Google Drive から mp4 をダウンロード
4. `ffmpeg -i interview.mp4 -vn -acodec copy raw-audio.m4a` で音声抽出
5. 候補者フォルダに配置 → `/transcribe <slug>`

### 方法 C: 対面面談で IC レコーダー
1. 面談前に「録音させていただいて良いですか?」と同意取得
2. IC レコーダーで録音
3. USB で転送 → `raw-audio.<ext>` として配置
4. `/transcribe <slug>`

## 🤖 自動検出フック

Claude Code セッション開始時、`candidates/` 配下に **音声ファイルがあって transcript.md が無い** ものを自動検出し、画面に表示します（`.claude/settings.json` の SessionStart フック）。

```
🎙️  未処理の音声ファイルが 2 件あります:
  - 2026-05-01-tanaka-yuki  (raw-audio.m4a)
  - 2026-04-28-suzuki-ken  (raw-audio.mp3)

  → 文字起こしするには: /transcribe <slug>
```

## 🔒 プライバシー対策

### PII 自動除去
`/transcribe` は生成後に `scripts/redact-pii.py` で以下を自動置換します:
- 電話番号（`080-1234-5678` → `[電話番号]`）
- メールアドレス
- クレジットカード番号
- 郵便番号

除去前の原文は `transcript.md.raw` に保存されます。**レビュー後は手動で削除してください** (1 週間以内推奨):
```bash
find candidates -name 'transcript.md.raw' -mtime +7 -delete
```

### Git コミット除外
以下は `.gitignore` で自動除外されます:
- `*.m4a *.mp3 *.wav *.mp4 *.webm`
- `candidates/*`（`_example/` 除く）
- `transcript-raw-*.txt`

### ローカル削除ポリシー（推奨）
- 面談から **90 日経過後** に原音声（`raw-audio.*`）を削除
- 成約者は `minutes.md` のみ残す
- 失注確定者は `transcript.md` も削除可

例（シェルで定期実行）:
```bash
find candidates -name 'raw-audio.*' -mtime +90 -delete
```

## 🧪 動作確認

音声ファイルが無くてもスクリプト自体の動作は確認できます:

```bash
# PII 除去のテスト
echo "電話: 090-1234-5678, mail: test@example.com" > /tmp/pii-test.md
python3 scripts/redact-pii.py /tmp/pii-test.md /tmp/pii-result.md
cat /tmp/pii-result.md
# → 電話: [電話番号], mail: [メールアドレス]

# バックエンド検出（whisper 等が入っていれば backend 名が出る）
bash scripts/transcribe.sh /dev/null /dev/null 2>&1 | head -5
```

## 🚨 トラブルシュート

| 症状 | 原因 | 対処 |
|-----|------|------|
| `ffmpeg: not found` | ffmpeg 未インストール | 上記 ffmpeg 節を参照 |
| 「No transcription backend available」 | Whisper 未インストール & API キー未設定 | faster-whisper を pip install |
| 日本語が英語として認識される | モデルが小さすぎる | `--model medium` 以上を指定 |
| OpenAI API で 413 | ファイル > 25MB | ffmpeg で分割 or ローカル使用 |
| 話者区別が出ない | Whisper はダイアライゼーション非対応 | WhisperX を使う（将来対応） |
| メモリ不足で落ちる | large-v3 は 10GB RAM 必要 | `--model medium` や `small` に変更 |

## 🔮 v5 以降の予定
- WhisperX によるダイアライゼーション（「話者 A / B」ラベル）
- 音声配置を検知して自動実行するフック（SessionStart ではなく、ファイルシステム watcher）
- 分割・結合の自動化（長尺面談対応）
- ライブ文字起こし（面談中のリアルタイム表示）
