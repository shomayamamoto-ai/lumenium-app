---
name: video-subtitle
description: Take a raw video to a near-finished deliverable in one shot — extract audio, normalise loudness, transcribe with faster-whisper (VAD-gated), clean up hallucinations, and burn in readable subtitles with a safe-area margin. Use when the user asks to generate subtitles, caption a video, or produce a finished mp4 from footage.
---

# video-subtitle

Goal: skip the Adobe Premiere round-trip. One command in, a finished mp4 (or a polished `.srt` for import) out.

Pipeline:

```
入力動画
  └─ ffmpeg: 音声抽出 + highpass + loudnorm (-16 LUFS)
       └─ faster-whisper + Silero VAD (無音スキップ)
            └─ clean_srt.py: ハルシネーション削除 / 重複統合 / 分割整形
                 └─ ffmpeg: セーフエリア + 解像度連動フォントで焼き込み
```

## One-line usage

```bash
scripts/video-subtitle/run.sh path/to/input.mp4
```

Outputs land next to the input:

- `<name>.wav` — 16 kHz mono, loudnorm 済みの中間ファイル
- `<name>.raw.srt` — faster-whisper 生出力
- `<name>.srt` — クリーニング済み (納品 / Premiere インポート可)
- `<name>.subtitled.mp4` — 焼き込み完パケ

全中間ファイルはキャッシュされる。クリーンルールだけ弄って再走行すると whisper は再実行されない。

## Options

| フラグ | 意味 | 既定 |
|---|---|---|
| `--lang <code>` | `ja` / `en` 等 | `ja` |
| `--model <name>` | `tiny` / `base` / `small` / `medium` / `large-v3` | `medium` |
| `--preview` | 高速プレビュー (`tiny` モデル + 焼き込みスキップ) | off |
| `--no-burn` | SRT のみ出力 | 焼き込む |
| `--no-normalize` | loudnorm を掛けない (既に整音済みのとき) | 適用 |
| `--font <name>` | 焼き込みフォント | macOS: Hiragino Sans / Linux: Noto Sans CJK JP |
| `--fontsize <n>` | 文字サイズ (px)。`0` なら動画高さの約 4% を自動採用 | `0` |
| `--out <dir>` | 出力先 | 入力と同じディレクトリ |

## 推奨ワークフロー (完成最速)

1. **プレビュー**: `run.sh video.mp4 --preview` で数分以内に `.srt` だけ作る。誤認識を目視で直したい箇所を洗う (固有名詞が鬼門)。
2. **辞書追加**: 誤認識が目立つ語は `scripts/video-subtitle/clean_srt.py` の `HALLUCINATION_PATTERNS` に入れるか、`.srt` を直接編集する。
3. **本番**: `run.sh video.mp4` で `medium` モデル + 焼き込み。既存 `.wav` はキャッシュ再利用で爆速 (音声抽出は skip、whisper だけ走る)。

段階が分かれているので、2 ↔ 3 を何度でも高速に回せる。

## 環境セットアップ

初回だけ:

```bash
scripts/video-subtitle/bootstrap.sh
```

- Ubuntu/Debian: `apt-get` で `ffmpeg` と `fonts-noto-cjk` を導入、`pip` で `faster-whisper` を入れる
- macOS: Homebrew で `ffmpeg`、`pip` で `faster-whisper`
- それ以外: 手動で `ffmpeg` と `faster-whisper` を入れるよう案内

`run.sh` は起動時に足りないものを検知して `bootstrap.sh` を自動呼び出しするので、通常は意識しなくていい。

## Claude がやるべきこと

ユーザーから動画パスと依頼 (例: 「この mp4 に字幕つけて焼き込みまで」) が来たら:

1. 動画の長さを `ffprobe -show_entries format=duration` で見積もり、所要時間を先に伝える。目安:
   - `medium` + CPU: 実尺 × 0.3〜1 (VAD により静かな動画ほど短縮)
   - `tiny` + `--preview`: 実尺 × 0.05〜0.15
2. 長尺 (15 分超) や固有名詞が多い案件では、まず `--preview` を走らせて text を確認することを提案する。
3. `run.sh` を起動し、失敗したらキャッシュ中間物 (`.wav` / `.raw.srt`) を残したまま終了する。同じコマンドで再開できる。
4. 完了後は `<name>.srt` と `<name>.subtitled.mp4` のパスを明示して報告する。納品形態に応じて焼き込み版か SRT 版のどちらを使うか尋ねる。

## クリーニングの中身 (`clean_srt.py`)

- 末尾ハルシネーション (`ご視聴ありがとうございました` / `Thanks for watching` / `字幕提供:〜` 等) を除去
- 連続する同一テキストの重複を統合
- 短すぎるキュー (< 0.4 秒) は前後にマージ (先頭孤児も後方向へ救済)
- 長すぎる 1 行 (> 42 文字) は句読点で分割し duration を比例配分
- 全角空白含む空白を正規化

辞書は `HALLUCINATION_PATTERNS` に集約、誤認識パターンはここに追記運用。`scripts/video-subtitle/tests/test_clean_srt.py` が 13 ケースで回帰防止。

## 完パケ品質のこだわりどころ

- **音量**: `loudnorm=I=-16:LRA=11:TP=-1.5` で配信標準 (-16 LUFS)。音量ムラが出やすい収録素材でそのまま視聴可能に。
- **セーフエリア**: `MarginV = FontSize` で YouTube UI と被らない位置。
- **可読性**: `Outline=3` + `BorderStyle=1` (縁取りのみ、影なし) で下地に依存せず読める。
- **解像度追従**: 1080p → 43px、720p → 29px、4K → 86px で物理的な字の大きさを揃える。
- **Web 最適化**: 出力 mp4 は `+faststart` 付き、Web 再生で頭出し即再生。
