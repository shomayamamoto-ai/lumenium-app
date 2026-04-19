---
name: video-subtitle
description: Automate the ffmpeg → Whisper → SRT clean → burn-in/Premiere round-trip for a video file. Use when the user asks to generate subtitles for a video, burn captions into an mp4, or transcribe/caption footage.
---

# video-subtitle

Pipeline: `入力動画 → ffmpegで音声抽出 → Whisperで文字起こし → SRTクリーニング → 焼き込みmp4 (またはSRTのみ)`。

Adobe Premiere に戻さずに完パケできるのが目的。SRT だけ欲しい場合は `--no-burn` を渡す。

## 前提

以下が PATH にあること:

- `ffmpeg` / `ffprobe`
- `whisper` (`pip install -U openai-whisper`) もしくは `whisper.cpp`
- `python3` (`pysrt` 不要、標準ライブラリのみで動作)

足りないものがあれば、ユーザーに具体的な導入コマンドを提示してから続行する。

## 使い方

基本:

```bash
scripts/video-subtitle/run.sh path/to/input.mp4
```

主要オプション:

| フラグ | 意味 | 既定 |
|---|---|---|
| `--lang <code>` | 言語コード (`ja`, `en` 等)。Whisper の `--language` | `ja` |
| `--model <name>` | Whisperモデル (`tiny`/`base`/`small`/`medium`/`large-v3`) | `medium` |
| `--no-burn` | SRT だけ出力し焼き込みを行わない | (焼き込む) |
| `--font <name>` | 焼き込みフォント名 | `Hiragino Sans` |
| `--fontsize <n>` | 焼き込み文字サイズ (px) | `42` |
| `--out <dir>` | 出力先ディレクトリ | 入力ファイルの隣 |

出力:

- `<name>.raw.srt` — Whisper生出力
- `<name>.srt` — クリーニング済み (納品/Premiereインポート用)
- `<name>.subtitled.mp4` — SRT焼き込み済み mp4 (`--no-burn` 時は生成しない)

## 実行時のふるまい

ユーザーから動画ファイルのパスと依頼が来たら:

1. `scripts/video-subtitle/run.sh` を Bash で起動。引数はユーザーの指示から判断して組み立てる。
2. 長尺 (> 15分) の場合は Whisper の所要時間を見積もって事前に伝える (`medium` で実時間の0.3〜1倍程度)。
3. 失敗した場合は **途中成果物を残したまま** 終了する (音声wav・raw.srt は消さない)。再実行時に whisper 再走行を避けるため、`<name>.raw.srt` が既にあればスキップする実装になっている。
4. 焼き込み後は `ffprobe` で duration を照合し、無音/長さズレを検出したら警告する。

## クリーニングの中身 (`clean_srt.py`)

Whisper 特有のノイズを除去する:

- 末尾ハルシネーション (`ご視聴ありがとうございました` / `Thanks for watching` / `字幕は〜` 等) を削除
- 連続する同一テキストの重複行を1つに統合
- 極端に短いキャプション (< 0.4秒) を次の行にマージ
- 極端に長いキャプション (> 42文字 / 行) を句読点で分割
- 先頭/末尾の空白・全角スペースを正規化

辞書は `scripts/video-subtitle/clean_srt.py` 冒頭の `HALLUCINATION_PATTERNS` に集約。誤認識が目立つ固有名詞が出てきたら、そこに追記していく運用。

## Premiere に戻すフロー (焼き込みしない場合)

1. `--no-burn` で `<name>.srt` を生成
2. Premiere の `File → Import` で SRT を取り込むとキャプショントラックとして展開される
3. フォント/色だけ整えて書き出し

焼き込み版 (`.subtitled.mp4`) を納品に使う場合は、Premiere を開く必要すらない。
