---
name: video-subtitle
description: Take a raw video to a near-finished deliverable without compromising quality — extract audio, two-pass loudness-normalise, transcribe at full precision with faster-whisper large-v3 (VAD + word timestamps + pause-aware re-segmentation), clean up hallucinations and decoder loops, and burn in subtitles at visually-lossless quality. Use when the user asks to generate subtitles, caption a video, or produce a finished mp4 from footage.
---

# video-subtitle

Goal: skip the Adobe Premiere round-trip and produce a finished deliverable whose only "cost" is wall-clock time — no quality trade is made silently. If a faster path would degrade the output, it is **off by default** and behind an explicit flag.

Pipeline:

```
入力動画
  └─ ffmpeg: 音声抽出 (highpass 80Hz)
       └─ ffmpeg: 2-pass loudnorm (-16 LUFS, linear mode)   [放送基準]
            └─ faster-whisper large-v3 (float32, beam=10,   [full precision]
               condition_on_previous_text=True, VAD,
               word_timestamps → pause-aware re-segment)
                 └─ clean_srt.py: ループ検出 + ハルシネーション辞書
                      └─ ffmpeg: CRF 17 / preset slow で焼き込み  [視覚可逆]
```

## One-line usage

```bash
scripts/video-subtitle/run.sh path/to/input.mp4
```

Outputs land next to the input:

- `<name>.raw.wav` — 抽出直後のモノラル 16kHz
- `<name>.wav` — 2 パス loudnorm 適用済み (Whisper 入力)
- `<name>.raw.srt` — Whisper 生出力 (ポーズ再セグメント済み)
- `<name>.srt` — クリーニング済み (納品 / Premiere インポート可)
- `<name>.subtitled.mp4` — 焼き込み完パケ

全中間ファイルはキャッシュ。クリーンルールやフォントだけ直して再走行しても、重い Whisper 計算は再実行されない。

## Options

| フラグ | 意味 | 既定 |
|---|---|---|
| `--lang <code>` | `ja` / `en` 等 | `ja` |
| `--model <name>` | `tiny` / `base` / `small` / `medium` / `large-v3` | `large-v3` |
| `--beam <n>` | beam search 幅。大きいほど精度↑/時間↑ | `10` |
| `--prompt <text>` | `initial_prompt` — 固有名詞や専門用語を先に渡して誤認識を抑える | (空) |
| `--preview` | `tiny` + 焼き込みスキップ + loudnorm スキップ。**品質トレードあり、明示的に opt-in** | off |
| `--no-burn` | SRT のみ出力 | 焼き込む |
| `--no-normalize` | loudnorm を掛けない (既に整音済み素材用) | 適用 |
| `--crf <n>` | libx264 CRF。17 は視覚可逆レンジ | `17` |
| `--preset <name>` | libx264 preset。`slow` は同画質で高圧縮 | `slow` |
| `--font <name>` | 焼き込みフォント | macOS: Hiragino Sans / Linux: Noto Sans CJK JP |
| `--fontsize <n>` | 文字サイズ (px)。`0` で動画高さの 4% を自動採用 | `0` |
| `--out <dir>` | 出力先 | 入力と同じディレクトリ |

## 所要時間の目安 (品質優先設定のまま)

素材が 10 分のトーク動画とすると:

| 環境 | `large-v3` + beam 10 + 2パス loudnorm | 焼き込み CRF17 slow |
|---|---|---|
| CPU 8 コア (GPU なし) | 30-60 分 | 実尺 × 1-2 |
| CUDA GPU (例: L4 / T4) | 3-8 分 | 実尺 × 0.5-1 |

品質設定を弄らずに速くしたいときの最適手は **GPU 付きホストに回す** こと。CPU で時間がかかるのは容認し、精度は落とさない。

## 推奨ワークフロー

1. **プレビューで文章を確認する (任意)**: `--preview` は `tiny` モデル+loudnorm スキップなので数分で text だけ出る。固有名詞の誤認識チェックに便利。ここで気付いた語は次の 2. で `--prompt` に入れる。
2. **本番**: 品質既定のまま `run.sh video.mp4`。必要なら `--prompt "Lumenium, SaaS, Next.js, ..."` で用語ヒント。
3. **反復**: 誤認識が残れば `.srt` を手で直して `--no-burn` を外して再走行。`.wav` / `.raw.srt` はキャッシュなので、焼き込みだけ走る (数十秒)。

段階が明確に分かれているので、1 回目の重い走行の後は軽い反復だけで完成に持っていける。

## 品質設計の根拠 (削らなかったもの)

- **Compute type**: CPU は `float32`、CUDA は `float16`。`int8` 量子化はまったく使わない。量子化で失う精度は Whisper では体感できるレベル。
- **Beam size 10**: デフォルトの 5 から上げる。caching されるので繰り返しは発生しない。
- **`condition_on_previous_text=True`**: 長尺での文脈維持に必要。ループ暴走はクリーナー側の n-gram 反復検出で潰すので、文脈を切る必要はない。
- **Temperature fallback `[0.0, 0.2, ..., 1.0]`** と `log_prob_threshold=-1.0`: Whisper 内蔵の品質保証経路をそのまま使う。
- **Word timestamps + pause-aware re-segment**: 30 秒チャンクの中で文が途切れず自然な切れ目 (≥0.6 秒の無音) で改行。字幕の読みリズムが劇的に良くなる。
- **2-pass loudnorm** (`linear=true`): シングルパスは target offset を推定するだけで、素材ごとに -0.5〜-1.5 LUFS ズレる。2 パスは測定値を直接使うので放送基準 ±0.1 dB に収まる。
- **CRF 17 + preset slow**: 視覚可逆レンジ。preset slow は同画質で高圧縮 (= ファイルサイズ小)、焼き込み作業の時間で稼ぐ。
- **`pix_fmt yuv420p`**: すべての再生環境で互換。
- **`-movflags +faststart`**: Web 再生で即頭出し。

## プレビューモードで **意図的に** 削るもの

`--preview` のときだけ、以下がユーザーの同意のもと off になる:

- `large-v3` → `tiny` モデル (文字起こし精度を大きく落とす)
- beam 10 → 5
- 2 パス loudnorm をスキップ (音声確認しないので不要)
- 焼き込みスキップ

使用目的は「文字の誤認識をざっと見て `--prompt` を固める」ことに限定している。本番納品物として使わないこと。

## 環境セットアップ

初回だけ:

```bash
scripts/video-subtitle/bootstrap.sh
```

- Ubuntu/Debian: `apt-get` で `ffmpeg` と `fonts-noto-cjk`、`pip` で `faster-whisper`
- macOS: Homebrew で `ffmpeg`、`pip` で `faster-whisper`
- それ以外: 手動導入を案内

`run.sh` は起動時に不足を検知して `bootstrap.sh` を自動呼び出しするので、通常は意識しない。

## Claude がやるべきこと

ユーザーから動画パスと依頼 (例: 「この mp4 に字幕つけて焼き込みまで」) が来たら:

1. 動画の長さを `ffprobe -show_entries format=duration` で見積もる。上の表を元に「CPU だと ~XX 分かかります、質を落とさずに速くしたい場合は GPU ホストを検討してください」と事前に伝える。
2. 固有名詞や専門用語が絡む案件なら、ユーザーにヒアリングして `--prompt` に渡す。
3. 長尺 (30 分超) は「先に `--preview` で text だけ見ますか?」と提案。**提案するだけで勝手に preview モードに倒さない** — preview は品質を落とすから。
4. 本番は品質既定のまま走らせる。失敗してもキャッシュ (`raw.wav` / `wav` / `raw.srt`) は残るので同じコマンドで再開できる。
5. 完了後は `<name>.srt` と `<name>.subtitled.mp4` のパスを明示して報告、納品形態に応じて焼き込み版か SRT 版のどちらを使うか尋ねる。

## クリーニングの中身 (`clean_srt.py`)

- **デコーダループ検出**: `(.{2,40}?)(\s|、|。)*\1{2,}` パターンで 3 回以上の連続反復を 1 回に圧縮。`ありがとうございました × 5` → `ありがとうございました`。
- **ハルシネーション辞書**: ご視聴/ご清聴/チャンネル登録/字幕提供/高評価/次回お楽しみに/thanks for watching/like and subscribe/subtitles by ... など。`HALLUCINATION_PATTERNS` に追記運用。
- **重複統合 / 短尺マージ / 長尺分割 / 空白正規化**: 既存。
- `tests/test_clean_srt.py` が 20 ケースで回帰防止。
