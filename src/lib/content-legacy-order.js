// 自動生成（一度きり）: 文章の上書きの「何番目」を「どの項目」に読み替える表。
//
// content.json の上書きは、以前は配列の何番目か（site.TESTIMONIALS.1.text）で
// 書いていました。これだと、お客様の声の順番を入れ替えたり1件足したりした
// だけで、上書きが別の人の声に付きます。いまは項目の id で書きます
// （site.TESTIMONIALS.@voice-xxxxxx.text）。
//
// この表は、id に切り替えた時点の並び順を凍結したものです。古い書き方の
// 上書きは、データの並びがその後変わっても、この表で正しい項目に読み替え
// られます（src/lib/content-ids.js の migratePath）。データを並べ替えても、
// この表は直さないでください。
export const LEGACY_ORDER = {
  "site.CASE_STUDIES": [
    "case-tzl18s",
    "case-kwt12q",
    "case-4f45n7"
  ],
  "site.TESTIMONIALS": [
    "voice-ywb0go",
    "voice-p8q48v",
    "voice-i2y4s8",
    "voice-o9ml4a",
    "voice-xrypra"
  ],
  "site.FLOW_STEPS": [
    "step-g1dowt",
    "step-511lym",
    "step-c8t6xa",
    "step-8uatux",
    "step-ufuqn3"
  ],
  "site.PAIN_POINTS": [
    "pain-aqsptr",
    "pain-tjthf7",
    "pain-1v0r7v"
  ],
  "site.BRAND_CHAPTERS": [
    "chapter-xdwkvf",
    "chapter-b64vx9",
    "chapter-0ytiav"
  ],
  "site.POSITIONING_NOTES": [
    "note-jcocqr",
    "note-slkbd0",
    "note-5zb43h"
  ],
  "site.CAREER": [
    "career-8rux83",
    "career-iv5cmo",
    "career-q8r58k",
    "career-9tst17",
    "career-xqm29y",
    "career-yvh4mx"
  ],
  "site.PROFILE_BRICKS": [
    "brick-w7hriq",
    "brick-2cq38h",
    "brick-snp79n"
  ],
  "faq": [
    "faqg-80v6gn",
    "faqg-qzh10v",
    "faqg-v4krzo",
    "faqg-fl18uj"
  ],
  "faq.@faqg-fl18uj.items": [
    "faq-eup29g",
    "faq-6rg2rw",
    "faq-03jodi"
  ],
  "faq.@faqg-v4krzo.items": [
    "faq-1wqxsq",
    "faq-sk3xom",
    "faq-2fa6p5",
    "faq-a1dbk7"
  ],
  "faq.@faqg-qzh10v.items": [
    "faq-yzc2h1",
    "faq-pfexqx",
    "faq-yeb0r1",
    "faq-573t10"
  ],
  "faq.@faqg-80v6gn.items": [
    "faq-85jmty",
    "faq-kpvb1l",
    "faq-ymm0kz",
    "faq-jwu0qu",
    "faq-tjkpm7",
    "faq-vgkwtm"
  ],
  "services": [
    "web",
    "ai",
    "video",
    "sns",
    "creative",
    "cast"
  ],
  "articles": [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16"
  ],
  "site.PRICE_OPTIONS": [
    "video",
    "ai",
    "sns",
    "web",
    "cast",
    "creative"
  ]
}
