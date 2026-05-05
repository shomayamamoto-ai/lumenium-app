# AdvoVisions — 移行ガイド

このフォルダ（`advovisions-export/`）は、合同会社 AdvoVisions の Web サイト一式を
独立したリポジトリとして移行できる形にまとめた完成版です。

公開後の URL は次のようになります（推奨）:
- `https://shomayamamoto-ai.github.io/advovisions/`
- もしくは独自ドメイン（例: `https://advovisions.com`）

---

## 移行手順

### 1. GitHub で新しいリポジトリを作成

1. https://github.com/new を開く
2. Repository name: `advovisions`
3. Public を選択
4. Add a README / .gitignore / license は **チェックなし**
5. 「Create repository」をクリック

### 2. このフォルダの中身を新リポジトリへ push

ターミナルから以下を実行してください（このフォルダの中で実行）:

```bash
cd advovisions-export
git init
git branch -M main
git add .
git commit -m "Initial commit: AdvoVisions website"
git remote add origin https://github.com/shomayamamoto-ai/advovisions.git
git push -u origin main
```

### 3. GitHub Pages を有効化

1. 新リポジトリの Settings → Pages を開く
2. Source: `Deploy from a branch`
3. Branch: `gh-pages` / Folder: `/ (root)`
4. Save

push の 1〜2 分後、GitHub Actions が自動で `gh-pages` ブランチにデプロイし、
公開 URL `https://shomayamamoto-ai.github.io/advovisions/` でアクセスできるようになります。

---

## 独自ドメイン（オプション）

例えば `advovisions.com` を取得した場合:

1. ドメインレジストラ（お名前.com / Cloudflare Registrar など）で
   DNS の CNAME レコードを `shomayamamoto-ai.github.io` に向ける
2. 新リポジトリのルートに `CNAME` ファイルを作成し、`advovisions.com` と書く
3. Settings → Pages → Custom domain に `advovisions.com` を入力

---

## ファイル構成

```
advovisions-export/
├── index.html          ← トップページ（Hero / About / Process / Manifesto / Categories / Talents / Services / Works / News / CEO / Testimonials / Awards / Instagram / FAQ / Contact）
├── members.html        ← 所属タレント180名一覧（カテゴリ・検索フィルタ）
├── member.html         ← タレント個別プロフィール（写真・SNS・ギャラリー・フィルモグラフィ・キャスティングシート）
├── about.html          ← 会社概要・代表プロフィール
├── audition.html       ← オーディション応募
├── news.html           ← お知らせ一覧
├── privacy.html        ← プライバシーポリシー
├── 404.html            ← 404 ページ
├── reset.html          ← Service Worker キャッシュクリア用
├── manifest.json       ← PWA manifest
├── sw.js               ← Service Worker (キャッシュクリア専用)
├── sitemap.xml         ← SEO sitemap
├── robots.txt          ← クローラ制御
├── assets/
│   ├── css/style.css   ← 全スタイル（v=73）
│   ├── js/main.js      ← メインスクリプト（カスタムカーソル / ライトボックス / マグネティックボタン / プロフィール描画 / メンバーフィルタ）
│   ├── js/members-data.js ← 180名のサンプルデータ
│   ├── js/news-data.js
│   └── img/            ← ロゴ・代表写真・OG画像
└── .github/workflows/pages.yml  ← 自動デプロイ設定
```

---

## サイト機能一覧

- カスタム追従カーソル（リング+ドット）
- 3 幕構成のオープニングアニメーション
- ヒーロー動画＋ CTA
- スクロール進捗バー＋章ナビ
- マグネティック CTA ボタン
- フォトギャラリー・ライトボックス
- 自動回転テスティモニアル
- カテゴリフィルター・検索（180 名）
- カスタム 404
- レスポンシブ完全対応（モバイル/タブレット/デスクトップ）
- OGP 完備（Twitter/Slack/LINE で青いプレビュー表示）

---

質問・不明点があれば、いつでもどうぞ。
