# docs/specs — 仕様書ディレクトリ

このディレクトリに置かれた仕様書は、**対応する実装の「正」（source of truth）** です。
実装者（Claude Code を含む）は、対象範囲の作業前に必ず該当仕様書を参照してください。

## 現在の有効版

| 仕様書 | 版 | 対象 |
|--------|-----|------|
| [login-page-detailed-spec-v3.md](./login-page-detailed-spec-v3.md) | v3（2026-07-29 確定） | ログインページ（TSAM AI: `/login/index.html` + `auth/` 共通層 + `gas-auth/` のログイン関連部分） |

関連指示書: [docs/instructions/2026-07-29-login-v3-alignment.md](../instructions/2026-07-29-login-v3-alignment.md)

## 運用ルール

- **仕様書と実装が食い違う場合、黙って乖離させないこと。**
  仕様書を直すか実装を直すかを必ず判断し、両方を同期させる。
- 仕様書の参照はセクション番号（§n）で行い、行番号は用いない。
- 仕様書本文の変更は、実装との同期を目的とする場合のみ許可する。

## 注記

本リポジトリ（lumenium-app / lumenium.net）の会員ログイン実装
（`public/login.html` + `api/auth.js` ほか）は、上記仕様書の対象実装とは別物ですが、
同仕様書のセキュリティ原則（エラーコードの AUTH_FAILED への集約によるアカウント列挙耐性 /
リダイレクト先の許可リスト解決 / セッション 12時間・remember 30日 / `remember === true` 厳密判定）
に準拠して実装されています。
