---
name: video-subtitle
description: End-to-end video subtitle and edit pipeline that replaces the Premiere round-trip — extract audio with two-pass loudness normalisation, transcribe with faster-whisper large-v3 (full precision, word timestamps), clean Whisper hallucinations, proofread the SRT through Claude with a glossary-aware cached prompt, detect and cut filler words and stutters with audio fades, and burn in subtitles at visually-lossless quality. Use when the user asks to generate subtitles, caption a video, cut fillers, or produce a finished mp4 from raw footage.
---

# video-subtitle

Goal: take raw footage to a finished deliverable in one command, without a single Premiere round-trip and without quietly trading quality for speed.

```
入力動画
  └─ ffmpeg: 抽出 (highpass 80Hz)
       └─ ffmpeg: 2-pass loudnorm (-16 LUFS, linear)            [放送基準]
            └─ faster-whisper large-v3 (float32, beam 10,        [full precision]
               condition_on_previous_text, VAD, word timestamps,
               glossary を initial_prompt に注入)
                 └─ clean_srt: ループ・幻覚除去
                      └─ Claude Sonnet 4.6 で校正                [glossary をキャッシュ]
                         (誤字・固有名詞・カナ漢字・句読点の局所修正のみ)
                          └─ word timestamps からフィラー/吃り/長無音検出
                              └─ ffmpeg: 該当区間カット (音声フェード)
                                  └─ ffmpeg: CRF 17 / preset slow で焼き込み
```

これを Premiere の従来運用と並べると:

| 旧 (Premiere 運用) | 新 (このパイプライン) |
|---|---|
| Premiere で文字起こし | Whisper large-v3 + word timestamps |
| Premiere の "Filler Word Detection" でカット | word-level filler 辞書 + 吃り検出 (誤判定は `cuts.json` で目視→`--exclude-cut` で除外) |
| SRT 書き出し | 自動 |
| Claude にコピペで校正依頼 | パイプラインに組み込み済み (`proofread.py`) |
| Premiere に SRT 戻す | 不要 (焼き込み版を直接出力) |
| 誤って切られたフィラーを手戻し | カット前に `cuts.json` レビュー、または再実行で `--exclude-cut` |

## 一発実行

```bash
scripts/video-subtitle/run.sh path/to/input.mp4
```

成果物 (入力の隣):

| ファイル | 用途 |
|---|---|
| `<name>.raw.wav` / `.wav` | 抽出+整音 (キャッシュ) |
| `<name>.raw.srt` | Whisper 生出力 (キャッシュ) |
| `<name>.words.json` | 単語タイミング (cuts 検出用、キャッシュ) |
| `<name>.clean.srt` | クリーナ通過後 |
| `<name>.proofread.srt` | Claude 校正後 (キャッシュ) |
| `<name>.proofread.diff` | 校正前後の unified diff (目視レビュー用) |
| `<name>.srt` | **最終 SRT** (Premiere に戻す場合これを使う) |
| `<name>.cuts.json` | カット候補一覧 (start/end/reason/text/context) |
| `<name>.review.md` | 人間用カット一覧表 |
| `<name>.cut.mp4` / `.cut.srt` | カット適用後 (タイムスタンプ調整済み) |
| `<name>.subtitled.mp4` | **完パケ焼き込み** (納品形態) |

中間ファイルは全部キャッシュ。校正/カット/焼き込みを別々にやり直せる。

## オプション

| フラグ | 意味 | 既定 |
|---|---|---|
| `--lang <code>` | `ja` / `en` 等 | `ja` |
| `--model <name>` | `tiny`/`base`/`small`/`medium`/`large-v3` | `large-v3` |
| `--beam <n>` | beam search 幅 | `10` |
| `--prompt <text>` | Whisper の `initial_prompt` (glossary に追記される) | (空) |
| `--glossary <path>` | 用語集ファイル | `scripts/video-subtitle/glossary.txt` |
| `--no-proofread` | Claude 校正をスキップ (API キー無しでも自動スキップされる) | 実行 |
| `--no-cut` | フィラー/吃り検出とカットをスキップ | 実行 |
| `--aggressive-fillers` | `あの` `まあ` `なんか` `ちょっと` も filler 扱い | off |
| `--silence-threshold <s>` | N 秒以上の無音を ~0.3s まで詰める | off |
| `--exclude-cut START-END` | 指定範囲をカット対象から除外 (繰り返し可) | — |
| `--no-burn` | SRT のみ出力。焼き込みなし | 焼き込む |
| `--no-normalize` | loudnorm をかけない | かける |
| `--crf <n>` | libx264 CRF (17 = 視覚可逆) | `17` |
| `--preset <name>` | libx264 preset | `slow` |
| `--font <name>` | 焼き込みフォント | macOS=Hiragino / それ以外=Noto |
| `--fontsize <n>` | 0 で動画高さの 4% を自動採用 | `0` |
| `--preview` | tiny + loudnorm/cut/proofread/burn 全部スキップ。**品質トレードあり、明示的 opt-in** | off |

## カット精度を保つ仕組み

旧運用での一番の苦痛が「Premiere が無音と低信頼度で勝手にフィラー判定して切る」こと。同じことを繰り返さないために:

1. **word-level 判定**。Whisper の `word_timestamps` を使うので「あの人」の「あの」と独立した「あの」を区別できる。
2. **保守的辞書を既定に**。`えー` `えーと` `あー` `うー` `えっと` だけ。文脈で意味を持つ語 (`あの` `まあ` `なんか` `ちょっと`) は `--aggressive-fillers` で明示的に有効化。
3. **すべてのカットを `cuts.json` と `review.md` に書き出す**。何が切られたか実行直後に確認できる。
4. **`--exclude-cut 12.3-13.1` で個別除外**。全工程キャッシュなので、カット判定だけ直して数十秒で再走行できる。
5. **音声フェード (12ms)** をカット境界に入れて、編集点クリックを物理的に消す。
6. **吃り検出は 3 回以上の連続反復のみ**。「とても とても」のような正当な強調は残す。

## Claude 校正の中身

- モデル: **`claude-sonnet-4-6`** (Opus は校正タスクには過剰、Sonnet で精度十分かつ速く安い)
- プロンプト: 校正方針 (固定) + glossary (プロジェクトごと) を `system` に置き、glossary ブロックに `cache_control` 設定。チャンク (40 cue ずつ) は `messages` に毎回入る。
- **キャッシュ効果**: 1 チャンク目だけ用語集に full price、以降はキャッシュ読み (~0.1×)。glossary が ~2000 トークン超ならキャッシュ。届かない場合は warning が出る。
- 出力: Pydantic スキーマで構造化 (`{cue_index, original, corrected, reason}`)。タイムスタンプは絶対に触らない、cue を消さない、書き換えない。**局所修正のみ**。
- ANTHROPIC_API_KEY が無ければ自動スキップして clean.srt をそのまま使う。

## 用語集 (`glossary.txt`)

```
# Lumenium 関連
Lumenium

# Stack
Next.js
Vercel
TypeScript
```

`#` でコメント。1 行 1 語。Whisper の `initial_prompt` と Claude のシステムプロンプト両方に注入される。**追加運用がそのまま品質改善になる**ので、誤認識を見つけたらここに追記して再走行 (Whisper キャッシュは消す)。

## 所要時間 (10 分動画、品質既定)

| 環境 | Whisper (large-v3, beam 10) | Claude 校正 | カット適用 + 焼き込み |
|---|---|---|---|
| CPU 8 コア | 30-60 分 | 1-3 分 | 実尺 × 1-2 |
| CUDA GPU (L4/T4) | 3-8 分 | 1-3 分 | 実尺 × 0.5-1 |

GPU で回すと精度を落とさず速くなる唯一の正攻法。CPU 専用環境なら時間を呑む。

## 推奨ワークフロー

1. 用語集を編集。ありそうな固有名詞を入れておく
2. `run.sh video.mp4` を流して放置
3. 完了後、`<name>.review.md` でカット一覧、`<name>.proofread.diff` で校正内容を 1 分でレビュー
4. 違和感がある箇所だけ `--exclude-cut START-END` または手動で `<name>.srt` を編集して再走行 (Whisper/校正はキャッシュから即終了、カット+焼き込みだけ走る)
5. `<name>.subtitled.mp4` を納品 / `<name>.srt` を Premiere にインポート

## Claude がやること

ユーザーから動画パスと依頼が来たら:

1. `ffprobe` で長さを確認、所要時間の目安を伝える
2. 固有名詞や専門用語があれば聞き出して `--prompt` または glossary 追記
3. ANTHROPIC_API_KEY の有無を確認、ない場合は校正がスキップされることを明言
4. 既定で `run.sh video.mp4` を実行
5. 完了後、`review.md` を読み上げて怪しいカットがあれば `--exclude-cut` を提案

`--preview` は **品質を落とすので勝手に使わない** — ユーザーが明示的に頼んだときだけ。

## ファイル構成

```
scripts/video-subtitle/
├── run.sh                 # オーケストレーション
├── bootstrap.sh           # 依存導入 (ffmpeg + faster-whisper + anthropic)
├── transcribe.py          # faster-whisper ラッパー (words.json も書く)
├── clean_srt.py           # ループ・ハルシネーション・短尺/長尺整形
├── proofread.py           # Claude API (Sonnet 4.6 + prompt caching + Pydantic)
├── detect_fillers.py      # word-level filler/stutter/silence 検出
├── apply_cuts.py          # ffmpeg concat + audio fade + SRT shift
├── glossary.txt           # 用語集 (編集して使う)
└── tests/
    ├── test_clean_srt.py     (20 cases)
    ├── test_detect_fillers.py (12 cases)
    └── test_apply_cuts.py     (12 cases)
```

`python3 -m unittest` で全 44 ケース走る。外部依存なし。
