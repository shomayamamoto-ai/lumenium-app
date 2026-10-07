// 自動生成（scripts/build-aio-chat-runs.mjs）。手で直さないでください。
// Claude のチャットがウェブ検索で行ったAIO計測。APIの残高を使わない計測で、
// lumenium.net のサイトでだけ、管理画面の計測履歴に並びます（api/aio.js）。
export const CHAT_RUNS = [
 {
  "id": "2026-10-08-0030-chat",
  "source": "chat",
  "site": "lumenium.net",
  "note": "Claude（Claude Code のチャット）がウェブ検索（US リージョンの検索）で各質問を1回ずつ調べ、その結果だけを根拠に答えたもの。lumenium.net は28問すべての検索結果に1件も出てこなかった。",
  "startedAt": "2026-10-07T15:30:00.000Z",
  "finishedAt": "2026-10-07T15:30:00.000Z",
  "settings": {
   "samples": 1,
   "engines": [
    "claude"
   ],
   "questionsHash": "09bbc68d",
   "questionCount": 28,
   "customQuestions": false,
   "models": {
    "claude": "Claude（チャット・ウェブ検索）"
   },
   "judgeModel": "Claude（チャット・ウェブ検索）"
  },
  "questions": [
   {
    "id": "brand-what",
    "cat": "ブランド指名",
    "branded": true,
    "q": "ルメニウム（Lumenium）とはどんな会社ですか？事業内容と拠点を教えてください。"
   },
   {
    "id": "brand-real",
    "cat": "ブランド指名",
    "branded": true,
    "q": "Lumenium という日本の制作会社は実在しますか？公式サイトはどこですか？"
   },
   {
    "id": "brand-vs",
    "cat": "ブランド指名",
    "branded": true,
    "q": "ルメニウムとLumentumは同じ会社ですか？"
   },
   {
    "id": "trust-review",
    "cat": "評判・信頼性",
    "branded": true,
    "q": "ルメニウム（Lumenium）という制作会社の評判を教えてください。実際に利用した人の声はありますか？"
   },
   {
    "id": "trust-real",
    "cat": "評判・信頼性",
    "branded": true,
    "q": "ルメニウムに制作を依頼しても大丈夫ですか？会社の所在地や事業者情報は確認できますか？"
   },
   {
    "id": "trust-newco",
    "cat": "評判・信頼性",
    "q": "設立して間もない制作会社に発注するのは不安です。信頼できるかどうか、何で見分ければよいですか？",
    "branded": false
   },
   {
    "id": "video-hire",
    "cat": "動画制作",
    "q": "東京で採用動画の制作を依頼できる会社を教えてください。",
    "branded": false
   },
   {
    "id": "video-cheap",
    "cat": "動画制作",
    "q": "中小企業でも頼める安い動画制作会社はどこですか？相場も教えてください。",
    "branded": false
   },
   {
    "id": "video-price",
    "cat": "動画制作",
    "q": "会社紹介動画の制作費用はいくらくらいかかりますか？依頼先の候補も挙げてください。",
    "branded": false
   },
   {
    "id": "ai-train",
    "cat": "AI導入・研修",
    "q": "社員向けの生成AI研修をやってくれる会社を教えてください。",
    "branded": false
   },
   {
    "id": "ai-intro",
    "cat": "AI導入・研修",
    "q": "中小企業がAIを業務に導入したいとき、どこに相談すればよいですか？",
    "branded": false
   },
   {
    "id": "ai-rule",
    "cat": "AI導入・研修",
    "q": "ChatGPTを社内で使えるようにしたいのですが、社内ルールづくりから支援してくれる会社はありますか？",
    "branded": false
   },
   {
    "id": "sns-line",
    "cat": "SNS・LINE",
    "q": "企業のLINE公式アカウントの構築を代行してくれる会社はありますか？",
    "branded": false
   },
   {
    "id": "sns-ops",
    "cat": "SNS・LINE",
    "q": "SNS運用代行を依頼できる東京の会社を教えてください。",
    "branded": false
   },
   {
    "id": "sns-short",
    "cat": "SNS・LINE",
    "q": "InstagramやTikTokの短い動画を、撮影から投稿までまとめて任せられる会社はありますか？",
    "branded": false
   },
   {
    "id": "web-make",
    "cat": "Web制作・システム開発",
    "q": "企業のホームページ制作を依頼できる会社を東京で探しています。",
    "branded": false
   },
   {
    "id": "web-sys",
    "cat": "Web制作・システム開発",
    "q": "業務システムの開発を小規模から相談できる会社はありますか？",
    "branded": false
   },
   {
    "id": "web-renew",
    "cat": "Web制作・システム開発",
    "q": "古い会社のホームページを作り直したいのですが、相談できる制作会社を教えてください。",
    "branded": false
   },
   {
    "id": "cast-book",
    "cat": "キャスト手配",
    "q": "イベントのMCやキャストを手配してくれる会社を教えてください。",
    "branded": false
   },
   {
    "id": "cast-expo",
    "cat": "キャスト手配",
    "q": "展示会の司会やコンパニオンを手配したいのですが、東京で相談できる会社はありますか？",
    "branded": false
   },
   {
    "id": "cast-shoot",
    "cat": "キャスト手配",
    "q": "撮影に出演するモデルやナレーターの手配も含めて、動画制作を任せられる会社はありますか？",
    "branded": false
   },
   {
    "id": "cre-logo",
    "cat": "クリエイティブ",
    "q": "会社のロゴやバナーのデザインを依頼できる制作会社を教えてください。",
    "branded": false
   },
   {
    "id": "cre-brand",
    "cat": "クリエイティブ",
    "q": "ロゴから名刺・会社案内まで、まとめてデザインを頼める会社を教えてください。",
    "branded": false
   },
   {
    "id": "cre-pamph",
    "cat": "クリエイティブ",
    "q": "会社案内のパンフレットや展示会のパネルを作ってくれる制作会社を探しています。",
    "branded": false
   },
   {
    "id": "cross-onestop",
    "cat": "横断・比較",
    "q": "動画もWebもAI研修もまとめて頼める制作会社はありますか？",
    "branded": false
   },
   {
    "id": "cross-dx",
    "cat": "横断・比較",
    "q": "中小企業のDXを一社でまとめて支援してくれる会社を教えてください。",
    "branded": false
   },
   {
    "id": "cross-choose",
    "cat": "横断・比較",
    "q": "制作会社を選ぶとき、何を基準に比較すればよいですか？おすすめの会社も挙げてください。",
    "branded": false
   },
   {
    "id": "cross-budget",
    "cat": "横断・比較",
    "q": "予算100万円以内で、動画制作とホームページ制作の両方を相談できる会社はありますか？",
    "branded": false
   }
  ],
  "results": [
   {
    "key": "brand-what#claude#0",
    "id": "brand-what",
    "cat": "ブランド指名",
    "q": "ルメニウム（Lumenium）とはどんな会社ですか？事業内容と拠点を教えてください。",
    "branded": true,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "「ルメニウム（Lumenium）」という名前の会社は検索結果に見つかりませんでした。似た名前の日本ルメンタム株式会社（光半導体デバイスの開発・製造、相模原・高尾・新宿などに拠点）の情報が該当すると考えられます。",
    "named": true,
    "verdict": "other_company",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://hrmos.co/pages/lumentum/jobs/2230523987053064211",
      "title": "",
      "host": "hrmos.co"
     },
     {
      "url": "https://mynavi-agent.jp/corpdetail/31921/",
      "title": "",
      "host": "mynavi-agent.jp"
     },
     {
      "url": "https://discovery.patsnap.com/company/lumens/",
      "title": "",
      "host": "discovery.patsnap.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "hrmos.co",
     "mynavi-agent.jp",
     "discovery.patsnap.com",
     "datanyze.com"
    ],
    "sourceUrls": [
     "https://hrmos.co/pages/lumentum/jobs/2230523987053064211",
     "https://mynavi-agent.jp/corpdetail/31921/",
     "https://discovery.patsnap.com/company/lumens/",
     "https://www.datanyze.com/companies/lumium/353729374"
    ],
    "ownPages": [],
    "companies": [
     "日本ルメンタム株式会社"
    ],
    "position": null,
    "sentiment": null,
    "missing": "公式サイト・事業者情報",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "brand-real#claude#0",
    "id": "brand-real",
    "cat": "ブランド指名",
    "q": "Lumenium という日本の制作会社は実在しますか？公式サイトはどこですか？",
    "branded": true,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "「Lumenium」という日本の制作会社と公式サイトは、検索結果では確認できませんでした。似た名前の株式会社Lumii（動画制作）、ルミネ、韓国のLED企業Lumens、ゲーム会社Limeなどが見つかります。正確な社名をご確認ください。",
    "named": true,
    "verdict": "denied",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://web-kanji.com/works/9612",
      "title": "",
      "host": "web-kanji.com"
     },
     {
      "url": "https://www.shopowner-support.net/?p=173632",
      "title": "",
      "host": "shopowner-support.net"
     },
     {
      "url": "https://www.bloomberg.com/quote/LUMINZ:JP",
      "title": "",
      "host": "bloomberg.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "web-kanji.com",
     "shopowner-support.net",
     "bloomberg.com",
     "ledinside.com"
    ],
    "sourceUrls": [
     "https://web-kanji.com/works/9612",
     "https://www.shopowner-support.net/?p=173632",
     "https://www.bloomberg.com/quote/LUMINZ:JP",
     "https://www.ledinside.com/node/22285"
    ],
    "ownPages": [],
    "companies": [
     "株式会社Lumii",
     "株式会社ルミネ",
     "Lumens",
     "Lime"
    ],
    "position": null,
    "sentiment": null,
    "missing": "公式サイト・会社情報",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "brand-vs#claude#0",
    "id": "brand-vs",
    "cat": "ブランド指名",
    "q": "ルメニウムとLumentumは同じ会社ですか？",
    "branded": true,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "検索結果では「ルメニウム」はLumentum（ルメンタム）のことと解釈され、同じ会社として説明されました。Lumentumは米サンノゼ本社の光・フォトニクス企業で、日本法人は日本ルメンタム株式会社です。",
    "named": true,
    "verdict": "other_company",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://hrmos.co/pages/lumentum",
      "title": "",
      "host": "hrmos.co"
     },
     {
      "url": "https://www.careercross.com/company/pdf-338352",
      "title": "",
      "host": "careercross.com"
     },
     {
      "url": "https://www.theglobeandmail.com/investing/markets/stocks/LITE-Q/profile/",
      "title": "",
      "host": "theglobeandmail.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "hrmos.co",
     "careercross.com",
     "theglobeandmail.com",
     "r-agent.com"
    ],
    "sourceUrls": [
     "https://hrmos.co/pages/lumentum",
     "https://www.careercross.com/company/pdf-338352",
     "https://www.theglobeandmail.com/investing/markets/stocks/LITE-Q/profile/",
     "https://www.r-agent.com/company/c7684/"
    ],
    "ownPages": [],
    "companies": [
     "Lumentum",
     "日本ルメンタム株式会社"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "trust-review#claude#0",
    "id": "trust-review",
    "cat": "評判・信頼性",
    "q": "ルメニウム（Lumenium）という制作会社の評判を教えてください。実際に利用した人の声はありますか？",
    "branded": true,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "「ルメニウム」という会社の評判や利用者の声は、検索結果に見当たりませんでした。似た名前の株式会社Lumii（動画制作・YouTube運用代行）の情報は見つかります。",
    "named": true,
    "verdict": "denied",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.shopowner-support.net/?p=173632",
      "title": "",
      "host": "shopowner-support.net"
     },
     {
      "url": "https://boxil.jp/service/8347/reviews/30031/",
      "title": "",
      "host": "boxil.jp"
     },
     {
      "url": "https://jp.trustpilot.com/review/lumens.com",
      "title": "",
      "host": "jp.trustpilot.com"
     }
    ],
    "searched": false,
    "searchCount": 3,
    "sources": [
     "shopowner-support.net",
     "boxil.jp",
     "jp.trustpilot.com"
    ],
    "sourceUrls": [
     "https://www.shopowner-support.net/?p=173632",
     "https://boxil.jp/service/8347/reviews/30031/",
     "https://jp.trustpilot.com/review/lumens.com"
    ],
    "ownPages": [],
    "companies": [
     "株式会社Lumii"
    ],
    "position": null,
    "sentiment": null,
    "missing": "評判・利用者の声",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "trust-real#claude#0",
    "id": "trust-real",
    "cat": "評判・信頼性",
    "q": "ルメニウムに制作を依頼しても大丈夫ですか？会社の所在地や事業者情報は確認できますか？",
    "branded": true,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "「ルメニウム」の所在地や事業者情報は確認できませんでした。検索で出てくるのは日本ルメンタム株式会社（相模原市）、株式会社秋田ルミナ、株式会社ルミネなど別の会社です。依頼前に、所在地・代表者・連絡先が公開されているかを確認してください。",
    "named": true,
    "verdict": "denied",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://mynavi-agent.jp/corpdetail/31921/",
      "title": "",
      "host": "mynavi-agent.jp"
     },
     {
      "url": "https://www.biz.ne.jp/company/luminejp/",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://www.creditsafe.com/business-index/ja-jp/company/luminus-be00438222",
      "title": "",
      "host": "creditsafe.com"
     }
    ],
    "searched": false,
    "searchCount": 3,
    "sources": [
     "mynavi-agent.jp",
     "biz.ne.jp",
     "creditsafe.com"
    ],
    "sourceUrls": [
     "https://mynavi-agent.jp/corpdetail/31921/",
     "https://www.biz.ne.jp/company/luminejp/",
     "https://www.creditsafe.com/business-index/ja-jp/company/luminus-be00438222"
    ],
    "ownPages": [],
    "companies": [
     "日本ルメンタム株式会社",
     "株式会社秋田ルミナ",
     "株式会社ルミネ"
    ],
    "position": null,
    "sentiment": null,
    "missing": "所在地・事業者情報",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "trust-newco#claude#0",
    "id": "trust-newco",
    "cat": "評判・信頼性",
    "q": "設立して間もない制作会社に発注するのは不安です。信頼できるかどうか、何で見分ければよいですか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "目的・予算・納期・契約条件を整理し、複数社に同じ条件で見積もりを依頼して比べるのが基本です。自社で完結できる業務か、連絡の速さ、見積もりの「一式」の内訳（修正回数・著作権・元データ）を確認しましょう。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://atsoho.com/blog/thumbnail-banner-anzen",
      "title": "",
      "host": "atsoho.com"
     },
     {
      "url": "https://media-radar.jp/detail35973.html",
      "title": "",
      "host": "media-radar.jp"
     },
     {
      "url": "https://hnavi.co.jp/lp/hp2/",
      "title": "",
      "host": "hnavi.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 3,
    "sources": [
     "atsoho.com",
     "media-radar.jp",
     "hnavi.co.jp"
    ],
    "sourceUrls": [
     "https://atsoho.com/blog/thumbnail-banner-anzen",
     "https://media-radar.jp/detail35973.html",
     "https://hnavi.co.jp/lp/hp2/"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "video-hire#claude#0",
    "id": "video-hire",
    "cat": "動画制作",
    "q": "東京で採用動画の制作を依頼できる会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "東京は動画制作会社の選択肢が最も多い地域です。採用動画の実績がある会社として株式会社LOCUSなどが挙がります。比較サイトやミツモアで複数社の見積もりを取り、目的に合う実績で選ぶのが近道です。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://stock-sun.com/column/tokyo-video-production/",
      "title": "",
      "host": "stock-sun.com"
     },
     {
      "url": "https://imitsu.jp/ct-movie/pr-tokyo/ci-chiyoda-ku/supplier/61578/service/120175/achievement/14357",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://meetsmore.com/t/video-production/tokyo",
      "title": "",
      "host": "meetsmore.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "stock-sun.com",
     "imitsu.jp",
     "meetsmore.com",
     "hnavi.co.jp"
    ],
    "sourceUrls": [
     "https://stock-sun.com/column/tokyo-video-production/",
     "https://imitsu.jp/ct-movie/pr-tokyo/ci-chiyoda-ku/supplier/61578/service/120175/achievement/14357",
     "https://meetsmore.com/t/video-production/tokyo",
     "https://hnavi.co.jp/knowledge/blog/tokyo_video_companies/"
    ],
    "ownPages": [],
    "companies": [
     "株式会社LOCUS"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "video-cheap#claude#0",
    "id": "video-cheap",
    "cat": "動画制作",
    "q": "中小企業でも頼める安い動画制作会社はどこですか？相場も教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "制作会社への依頼は30万〜200万円程度が相場で、SNS向けショート動画は1〜5万円台から発注できます。仲介を通さずフリーランスや小規模制作会社に直接頼むと中間マージンがかかりません。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://atsoho.com/blog/video-outsourcing-freelance-vs-agency-cost",
      "title": "",
      "host": "atsoho.com"
     },
     {
      "url": "https://0120.co.jp/blog/video-02/",
      "title": "",
      "host": "0120.co.jp"
     },
     {
      "url": "https://stock-sun.com/?p=143278",
      "title": "",
      "host": "stock-sun.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "atsoho.com",
     "0120.co.jp",
     "stock-sun.com"
    ],
    "sourceUrls": [
     "https://atsoho.com/blog/video-outsourcing-freelance-vs-agency-cost",
     "https://0120.co.jp/blog/video-02/",
     "https://stock-sun.com/?p=143278",
     "https://atsoho.com/blog/video-production-cost-guide"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "video-price#claude#0",
    "id": "video-price",
    "cat": "動画制作",
    "q": "会社紹介動画の制作費用はいくらくらいかかりますか？依頼先の候補も挙げてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "会社紹介動画は30万〜200万円が一般的な相場です。スライド中心なら5万〜50万円、撮影＋テロップで30万〜100万円、複数カメラや演者起用で100万円以上が目安です。依頼先は比較サイトで複数社を比べるのが一般的です。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.biz.ne.jp/matome/2009150/",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://imitsu.jp/cost/movie/",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://meetsmore.com/product-services/CM-video-advertisement-production/media/208535",
      "title": "",
      "host": "meetsmore.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "biz.ne.jp",
     "imitsu.jp",
     "meetsmore.com",
     "atsoho.com"
    ],
    "sourceUrls": [
     "https://www.biz.ne.jp/matome/2009150/",
     "https://imitsu.jp/cost/movie/",
     "https://meetsmore.com/product-services/CM-video-advertisement-production/media/208535",
     "https://atsoho.com/blog/company-video-production-cost"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "ai-train#claude#0",
    "id": "ai-train",
    "cat": "AI導入・研修",
    "q": "社員向けの生成AI研修をやってくれる会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "社員向け生成AI研修では、インソース、株式会社Algoage、テックアカデミー、NOVELなどが挙がります。対面・オンラインの形式や、業務に合わせたカスタマイズの可否、料金で比べてください。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://weel.co.jp/media/generative-ai-training",
      "title": "",
      "host": "weel.co.jp"
     },
     {
      "url": "https://www.cyberagent.co.jp/techinfo/news/detail/id=29837",
      "title": "",
      "host": "cyberagent.co.jp"
     },
     {
      "url": "https://stock-sun.com/column/generative-ai-training/",
      "title": "",
      "host": "stock-sun.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "weel.co.jp",
     "cyberagent.co.jp",
     "stock-sun.com",
     "insource.co.jp"
    ],
    "sourceUrls": [
     "https://weel.co.jp/media/generative-ai-training",
     "https://www.cyberagent.co.jp/techinfo/news/detail/id=29837",
     "https://stock-sun.com/column/generative-ai-training/",
     "https://www.insource.co.jp/resource/pdf/generative_ai_proposal_2511.pdf"
    ],
    "ownPages": [],
    "companies": [
     "株式会社インソース",
     "株式会社Algoage",
     "テックアカデミー",
     "NOVEL"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "ai-intro#claude#0",
    "id": "ai-intro",
    "cat": "AI導入・研修",
    "q": "中小企業がAIを業務に導入したいとき、どこに相談すればよいですか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "中小企業のAI導入では「相談相手がいない」ことが課題になっています。株式会社ユニークポイントの「みんなのAI相談室」のような相談サービスや、課題整理から定着まで伴走する導入支援会社、補助金の活用が選択肢です。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://prtimes.jp/main/html/rd/p/000000005.000170244.html",
      "title": "",
      "host": "prtimes.jp"
     },
     {
      "url": "https://start-link.jp/hubspot-ai/ai/genai-work/ai-efficiency-sme-guide",
      "title": "",
      "host": "start-link.jp"
     },
     {
      "url": "https://weel.co.jp/media/small-and-medium-sized-enterprises-ai-introduction-support/",
      "title": "",
      "host": "weel.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "prtimes.jp",
     "start-link.jp",
     "weel.co.jp",
     "jfc.go.jp"
    ],
    "sourceUrls": [
     "https://prtimes.jp/main/html/rd/p/000000005.000170244.html",
     "https://start-link.jp/hubspot-ai/ai/genai-work/ai-efficiency-sme-guide",
     "https://weel.co.jp/media/small-and-medium-sized-enterprises-ai-introduction-support/",
     "https://www.jfc.go.jp/n/findings/pdf/ronbun2102_02.pdf"
    ],
    "ownPages": [],
    "companies": [
     "株式会社ユニークポイント"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "ai-rule#claude#0",
    "id": "ai-rule",
    "cat": "AI導入・研修",
    "q": "ChatGPTを社内で使えるようにしたいのですが、社内ルールづくりから支援してくれる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "社内導入では情報管理のルールづくりが最重要です。導入手順や社内ルールのテンプレートを公開している事業者があり、LegalOn Technologiesは弁護士と作成した社内ルールのひな形を配布しています。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://ai.giftx.co.jp/blog/chatgpt-company-rollout-guide/",
      "title": "",
      "host": "ai.giftx.co.jp"
     },
     {
      "url": "https://ai-keiei.shift-ai.co.jp/?p=3141",
      "title": "",
      "host": "ai-keiei.shift-ai.co.jp"
     },
     {
      "url": "https://www.businessinsider.jp/article/271489/",
      "title": "",
      "host": "businessinsider.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "ai.giftx.co.jp",
     "ai-keiei.shift-ai.co.jp",
     "businessinsider.jp",
     "legalontech.com"
    ],
    "sourceUrls": [
     "https://ai.giftx.co.jp/blog/chatgpt-company-rollout-guide/",
     "https://ai-keiei.shift-ai.co.jp/?p=3141",
     "https://www.businessinsider.jp/article/271489/",
     "https://www.legalontech.com/jp/download/112-01"
    ],
    "ownPages": [],
    "companies": [
     "LegalOn Technologies"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "sns-line#claude#0",
    "id": "sns-line",
    "cat": "SNS・LINE",
    "q": "企業のLINE公式アカウントの構築を代行してくれる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "LINE公式アカウントの構築代行は、初期設定・リッチメニュー・ステップ配信・友だち集めの導線設計までを任せられます。ミライクや株式会社MARKELINKなどがあり、初期構築は55万〜88万円程度の例があります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.shopowner-support.net/customer_attraction_information/online/linebiz/line-official-account-setup-service/",
      "title": "",
      "host": "shopowner-support.net"
     },
     {
      "url": "https://ecnomikata.com/blog/49966/",
      "title": "",
      "host": "ecnomikata.com"
     },
     {
      "url": "https://meetsmore.com/products/markelink",
      "title": "",
      "host": "meetsmore.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "shopowner-support.net",
     "ecnomikata.com",
     "meetsmore.com",
     "lme.jp"
    ],
    "sourceUrls": [
     "https://www.shopowner-support.net/customer_attraction_information/online/linebiz/line-official-account-setup-service/",
     "https://ecnomikata.com/blog/49966/",
     "https://meetsmore.com/products/markelink",
     "https://lme.jp/media/line/construction/"
    ],
    "ownPages": [],
    "companies": [
     "ミライク",
     "株式会社MARKELINK"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "sns-ops#claude#0",
    "id": "sns-ops",
    "cat": "SNS・LINE",
    "q": "SNS運用代行を依頼できる東京の会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "東京には大手専業からスタートアップまで多くのSNS運用代行会社があり、戦略立案・投稿制作・分析・広告運用まで支援します。費用相場は月45万円前後です。比較記事で得意領域を見て選びましょう。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.onamae.com/business/article/242480/",
      "title": "",
      "host": "onamae.com"
     },
     {
      "url": "https://stock-sun.com/column/sns-management-tokyo/",
      "title": "",
      "host": "stock-sun.com"
     },
     {
      "url": "https://pamxy.co.jp/marke-driven/sns-marketing/tokyo-sns-operation-agency/amp/",
      "title": "",
      "host": "pamxy.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "onamae.com",
     "stock-sun.com",
     "pamxy.co.jp",
     "web-kanji.com"
    ],
    "sourceUrls": [
     "https://www.onamae.com/business/article/242480/",
     "https://stock-sun.com/column/sns-management-tokyo/",
     "https://pamxy.co.jp/marke-driven/sns-marketing/tokyo-sns-operation-agency/amp/",
     "https://web-kanji.com/posts/sns-tokyo"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "sns-short#claude#0",
    "id": "sns-short",
    "cat": "SNS・LINE",
    "q": "InstagramやTikTokの短い動画を、撮影から投稿までまとめて任せられる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "企画・撮影・編集・投稿・分析までまとめて任せられる会社として、株式会社アドライブエージェント、株式会社S.Line、株式会社美手紙の「ショート動画屋さん」などがあります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.lancers.jp/profile/lib_creators/portfolio",
      "title": "",
      "host": "lancers.jp"
     },
     {
      "url": "https://s--line.co.jp/short-video-agency/",
      "title": "",
      "host": "s--line.co.jp"
     },
     {
      "url": "https://webtan.impress.co.jp/r/prtimes/items/000000017.000113048",
      "title": "",
      "host": "webtan.impress.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "lancers.jp",
     "s--line.co.jp",
     "webtan.impress.co.jp",
     "crowdworks.jp"
    ],
    "sourceUrls": [
     "https://www.lancers.jp/profile/lib_creators/portfolio",
     "https://s--line.co.jp/short-video-agency/",
     "https://webtan.impress.co.jp/r/prtimes/items/000000017.000113048",
     "https://crowdworks.jp/public/employees/4202948"
    ],
    "ownPages": [],
    "companies": [
     "株式会社アドライブエージェント",
     "株式会社S.Line",
     "株式会社美手紙"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "web-make#claude#0",
    "id": "web-make",
    "cat": "Web制作・システム開発",
    "q": "企業のホームページ制作を依頼できる会社を東京で探しています。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "東京で企業サイトの実績がある会社として、株式会社ベイジ（BtoB）、株式会社タクト、ココチ株式会社、株式会社サイブリッジ、株式会社イースネットなどが挙がります。6〜10ページ・予算70万円程度の依頼例もあります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://meetsmore.com/t/website-development/tokyo",
      "title": "",
      "host": "meetsmore.com"
     },
     {
      "url": "https://webtan.impress.co.jp/u/2021/04/28/39987",
      "title": "",
      "host": "webtan.impress.co.jp"
     },
     {
      "url": "https://www.biz.ne.jp/subject/toi_detail.html?tid=969535",
      "title": "",
      "host": "biz.ne.jp"
     }
    ],
    "searched": false,
    "searchCount": 3,
    "sources": [
     "meetsmore.com",
     "webtan.impress.co.jp",
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://meetsmore.com/t/website-development/tokyo",
     "https://webtan.impress.co.jp/u/2021/04/28/39987",
     "https://www.biz.ne.jp/subject/toi_detail.html?tid=969535"
    ],
    "ownPages": [],
    "companies": [
     "株式会社ベイジ",
     "株式会社タクト",
     "ココチ株式会社",
     "株式会社サイブリッジ",
     "株式会社イースネット"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "web-sys#claude#0",
    "id": "web-sys",
    "cat": "Web制作・システム開発",
    "q": "業務システムの開発を小規模から相談できる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "紙やエクセルの業務を小規模なシステムにする相談なら、株式会社リエゾンなど中小企業向けの開発会社があります。発注ナビやアイミツなどのポータルで、規模に合う会社を紹介してもらう方法もあります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://hnavi.co.jp/enterprise/?page=30",
      "title": "",
      "host": "hnavi.co.jp"
     },
     {
      "url": "https://imitsu.jp/list/web-system/small-business/",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://hnavi.co.jp/knowledge/blog/small-system_companies/",
      "title": "",
      "host": "hnavi.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "hnavi.co.jp",
     "imitsu.jp",
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://hnavi.co.jp/enterprise/?page=30",
     "https://imitsu.jp/list/web-system/small-business/",
     "https://hnavi.co.jp/knowledge/blog/small-system_companies/",
     "https://www.biz.ne.jp/list/system/"
    ],
    "ownPages": [],
    "companies": [
     "株式会社リエゾン"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "web-renew#claude#0",
    "id": "web-renew",
    "cat": "Web制作・システム開発",
    "q": "古い会社のホームページを作り直したいのですが、相談できる制作会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "リニューアルでは、理由・今の問題点・作り直した後のイメージを整理してから制作会社に相談するとスムーズです。比較ビズなどには同様のリニューアル相談が多数あり、複数社から提案を受けられます。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.biz.ne.jp/subject/toi_detail.html?tid=974672",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://www.biz.ne.jp/subject/toi_detail.html?tid=992516",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://www.shopowner-support.net/?p=9263",
      "title": "",
      "host": "shopowner-support.net"
     }
    ],
    "searched": false,
    "searchCount": 3,
    "sources": [
     "biz.ne.jp",
     "shopowner-support.net"
    ],
    "sourceUrls": [
     "https://www.biz.ne.jp/subject/toi_detail.html?tid=974672",
     "https://www.biz.ne.jp/subject/toi_detail.html?tid=992516",
     "https://www.shopowner-support.net/?p=9263"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cast-book#claude#0",
    "id": "cast-book",
    "cat": "キャスト手配",
    "q": "イベントのMCやキャストを手配してくれる会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "イベント企画会社をアイミツで探す方法のほか、ココナラやクラウドワークスでプロの司会者に直接依頼する方法、株式会社ベルフォースのような人材会社に手配してもらう方法があります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://imitsu.jp/list/event-planning/liveevent-staff/",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://coconala.com/services/4279981",
      "title": "",
      "host": "coconala.com"
     },
     {
      "url": "https://crowdworks.jp/public/employees/142436",
      "title": "",
      "host": "crowdworks.jp"
     }
    ],
    "searched": false,
    "searchCount": 3,
    "sources": [
     "imitsu.jp",
     "coconala.com",
     "crowdworks.jp"
    ],
    "sourceUrls": [
     "https://imitsu.jp/list/event-planning/liveevent-staff/",
     "https://coconala.com/services/4279981",
     "https://crowdworks.jp/public/employees/142436"
    ],
    "ownPages": [],
    "companies": [
     "株式会社ベルフォース"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cast-expo#claude#0",
    "id": "cast-expo",
    "cat": "キャスト手配",
    "q": "展示会の司会やコンパニオンを手配したいのですが、東京で相談できる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "展示会の司会・コンパニオンは、株式会社ケイプロモーション（イベコン.com、渋谷区）や株式会社ファクトなどが手配しています。教育体制・欠員時のバックアップ・費用を比べて選びましょう。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://rocket-boys.co.jp/?p=1165",
      "title": "",
      "host": "rocket-boys.co.jp"
     },
     {
      "url": "https://prtimes.jp/main/html/rd/p/000000006.000057754.html",
      "title": "",
      "host": "prtimes.jp"
     },
     {
      "url": "https://rocket-boys.co.jp/security-measures-lab/event-staff/",
      "title": "",
      "host": "rocket-boys.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 3,
    "sources": [
     "rocket-boys.co.jp",
     "prtimes.jp"
    ],
    "sourceUrls": [
     "https://rocket-boys.co.jp/?p=1165",
     "https://prtimes.jp/main/html/rd/p/000000006.000057754.html",
     "https://rocket-boys.co.jp/security-measures-lab/event-staff/"
    ],
    "ownPages": [],
    "companies": [
     "株式会社ケイプロモーション",
     "株式会社ファクト"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cast-shoot#claude#0",
    "id": "cast-shoot",
    "cat": "キャスト手配",
    "q": "撮影に出演するモデルやナレーターの手配も含めて、動画制作を任せられる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "ナレーター手配と収録なら株式会社エーフラット、モデル・ナレーターを含めて動画制作をまとめて頼むならアクエリアスモデルズのように人材を内製化している会社があります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://f-w.co.jp/?p=32964",
      "title": "",
      "host": "f-w.co.jp"
     },
     {
      "url": "https://zaikei.co.jp/releases/2214939/",
      "title": "",
      "host": "zaikei.co.jp"
     },
     {
      "url": "https://www.value-press.com/pressrelease/325993",
      "title": "",
      "host": "value-press.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "f-w.co.jp",
     "zaikei.co.jp",
     "value-press.com",
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://f-w.co.jp/?p=32964",
     "https://zaikei.co.jp/releases/2214939/",
     "https://www.value-press.com/pressrelease/325993",
     "https://www.biz.ne.jp/company/aq-movie/"
    ],
    "ownPages": [],
    "companies": [
     "株式会社エーフラット",
     "アクエリアスモデルズ"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cre-logo#claude#0",
    "id": "cre-logo",
    "cat": "クリエイティブ",
    "q": "会社のロゴやバナーのデザインを依頼できる制作会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "クラウドワークスなどで複数のデザイナーから提案を受ける方法と、比較ビズで紹介されている制作会社（22社）に依頼する方法があります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://crowdworks.jp/public/proposal_products/15167315",
      "title": "",
      "host": "crowdworks.jp"
     },
     {
      "url": "https://www.biz.ne.jp/matome/2002867/",
      "title": "",
      "host": "biz.ne.jp"
     }
    ],
    "searched": false,
    "searchCount": 2,
    "sources": [
     "crowdworks.jp",
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://crowdworks.jp/public/proposal_products/15167315",
     "https://www.biz.ne.jp/matome/2002867/"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cre-brand#claude#0",
    "id": "cre-brand",
    "cat": "クリエイティブ",
    "q": "ロゴから名刺・会社案内まで、まとめてデザインを頼める会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "ロゴと名刺をセットで作るサービスがココナラやクラウドワークスにあり、2万円前後の例もあります。会社案内まで含めるなら、複数の制作物を扱うデザイン会社に見積もりを取りましょう。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://crowdworks.jp/public/proposal_products/14249159",
      "title": "",
      "host": "crowdworks.jp"
     },
     {
      "url": "https://coconala.com/services/2832518",
      "title": "",
      "host": "coconala.com"
     }
    ],
    "searched": false,
    "searchCount": 2,
    "sources": [
     "crowdworks.jp",
     "coconala.com"
    ],
    "sourceUrls": [
     "https://crowdworks.jp/public/proposal_products/14249159",
     "https://coconala.com/services/2832518"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cre-pamph#claude#0",
    "id": "cre-pamph",
    "cat": "クリエイティブ",
    "q": "会社案内のパンフレットや展示会のパネルを作ってくれる制作会社を探しています。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "展示会パネルは株式会社アズ・クリエイトなどが制作しています（A1・B1サイズなど）。比較ビズやランサーズで、会社案内・パンフレットとパネルをまとめて依頼できる会社を探せます。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.lancers.jp/menu/detail/1279025",
      "title": "",
      "host": "lancers.jp"
     },
     {
      "url": "https://www.biz.ne.jp/subject/toi_detail.html?tid=989999",
      "title": "",
      "host": "biz.ne.jp"
     }
    ],
    "searched": false,
    "searchCount": 2,
    "sources": [
     "lancers.jp",
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://www.lancers.jp/menu/detail/1279025",
     "https://www.biz.ne.jp/subject/toi_detail.html?tid=989999"
    ],
    "ownPages": [],
    "companies": [
     "株式会社アズ・クリエイト"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cross-onestop#claude#0",
    "id": "cross-onestop",
    "cat": "横断・比較",
    "q": "動画もWebもAI研修もまとめて頼める制作会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "動画とAIをまとめて支援する会社として、aicrew株式会社（AI動画制作研修）、Enter ENT（Web・ショート動画・AI制作、港区）、株式会社エーファクト、REZARD FILMなどがあります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.lancers.jp/client/Enter_ENT",
      "title": "",
      "host": "lancers.jp"
     },
     {
      "url": "https://ascii.jp/elem/000/004/363/4363644/",
      "title": "",
      "host": "ascii.jp"
     },
     {
      "url": "https://www.biz.ne.jp/company/afact/",
      "title": "",
      "host": "biz.ne.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "lancers.jp",
     "ascii.jp",
     "biz.ne.jp",
     "uravation.com"
    ],
    "sourceUrls": [
     "https://www.lancers.jp/client/Enter_ENT",
     "https://ascii.jp/elem/000/004/363/4363644/",
     "https://www.biz.ne.jp/company/afact/",
     "https://uravation.com/ai-creative-training/"
    ],
    "ownPages": [],
    "companies": [
     "aicrew株式会社",
     "Enter ENT",
     "株式会社エーファクト",
     "REZARD FILM"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cross-dx#claude#0",
    "id": "cross-dx",
    "cat": "横断・比較",
    "q": "中小企業のDXを一社でまとめて支援してくれる会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "キヤノンシステムアンドサポート（まかせてIT DXシリーズ、DX認定取得支援120万円〜）や、ミロク情報サービス（MJS DXコンサルティング、全国33拠点）が伴走支援をしています。商工会議所のDX推進プログラムもあります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.jri.co.jp/page.jsp?id=105184",
      "title": "",
      "host": "jri.co.jp"
     },
     {
      "url": "https://cloud.watch.impress.co.jp/docs/news/1668514.html",
      "title": "",
      "host": "cloud.watch.impress.co.jp"
     },
     {
      "url": "https://www.mjs.co.jp/news/news_2025/000000430.000018493/pdf/d18493-430-68e7049e03b3ec1e661835811bab9bc8.pdf",
      "title": "",
      "host": "mjs.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "jri.co.jp",
     "cloud.watch.impress.co.jp",
     "mjs.co.jp",
     "nagoya-cci.or.jp"
    ],
    "sourceUrls": [
     "https://www.jri.co.jp/page.jsp?id=105184",
     "https://cloud.watch.impress.co.jp/docs/news/1668514.html",
     "https://www.mjs.co.jp/news/news_2025/000000430.000018493/pdf/d18493-430-68e7049e03b3ec1e661835811bab9bc8.pdf",
     "https://nagoya-cci.or.jp/pr/newsrelease20230609/12p.pdf"
    ],
    "ownPages": [],
    "companies": [
     "キヤノンシステムアンドサポート株式会社",
     "株式会社ミロク情報サービス"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cross-choose#claude#0",
    "id": "cross-choose",
    "cat": "横断・比較",
    "q": "制作会社を選ぶとき、何を基準に比較すればよいですか？おすすめの会社も挙げてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "同業種の制作実績があるか、実績サイトをスマホで見て品質を確かめ、候補を3〜5社に絞って同じ条件で見積もりを比べるのが基本です。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://atsoho.com/blog/production-company-choice-tokyo",
      "title": "",
      "host": "atsoho.com"
     },
     {
      "url": "https://jinrai.co.jp/blog/homepage-seisaku-kaisha-erabikata/",
      "title": "",
      "host": "jinrai.co.jp"
     },
     {
      "url": "https://imitsu.jp/matome/hp-design/4202341051950229",
      "title": "",
      "host": "imitsu.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "atsoho.com",
     "jinrai.co.jp",
     "imitsu.jp"
    ],
    "sourceUrls": [
     "https://atsoho.com/blog/production-company-choice-tokyo",
     "https://jinrai.co.jp/blog/homepage-seisaku-kaisha-erabikata/",
     "https://imitsu.jp/matome/hp-design/4202341051950229",
     "https://imitsu.jp/ct-movie/recommend/"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cross-budget#claude#0",
    "id": "cross-budget",
    "cat": "横断・比較",
    "q": "予算100万円以内で、動画制作とホームページ制作の両方を相談できる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "100万円以内のホームページ制作の依頼は比較ビズに多数ありますが、動画制作と両方を相談できる会社を特定できる情報は検索結果にありませんでした。両方を扱う制作会社に、条件をそろえて見積もりを依頼してください。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.biz.ne.jp/subject/toi_detail.html?tid=980566",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://www.biz.ne.jp/subject/toi_detail.html?tid=966707",
      "title": "",
      "host": "biz.ne.jp"
     }
    ],
    "searched": false,
    "searchCount": 2,
    "sources": [
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://www.biz.ne.jp/subject/toi_detail.html?tid=980566",
     "https://www.biz.ne.jp/subject/toi_detail.html?tid=966707"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   }
  ],
  "summary": {
   "missingEvidence": [
    "公式サイト・事業者情報",
    "公式サイト・会社情報",
    "評判・利用者の声",
    "所在地・事業者情報"
   ],
   "asked": 28,
   "total": 28,
   "questions": 28,
   "samples": 1,
   "engineIds": [
    "claude"
   ],
   "coverage": 1,
   "errors": [],
   "unjudged": 0,
   "truncated": 0,
   "failed": 0,
   "fallback": false,
   "stats": {
    "recommend": {
     "k": 0,
     "n": 23,
     "p": 0,
     "lo": 0,
     "hi": 0.14312112541726274
    },
    "openMention": {
     "k": 0,
     "n": 23,
     "p": 0,
     "lo": 0,
     "hi": 0.14312112541726274
    },
    "mention": {
     "k": 0,
     "n": 28,
     "p": 0,
     "lo": 0,
     "hi": 0.12064720365810762
    },
    "cite": {
     "k": 0,
     "n": 28,
     "p": 0,
     "lo": 0,
     "hi": 0.12064720365810762
    },
    "searched": {
     "k": 0,
     "n": 28,
     "p": 0,
     "lo": 0,
     "hi": 0.12064720365810762
    }
   },
   "mentionRate": 0,
   "openMentionRate": 0,
   "recommendRate": 0,
   "citeRate": 0,
   "searchRate": 0,
   "verdicts": {
    "recommended": 0,
    "mentioned": 0,
    "denied": 3,
    "other_company": 2,
    "absent": 23
   },
   "engines": [
    {
     "id": "claude",
     "label": "Claude",
     "model": "Claude（チャット・ウェブ検索）",
     "total": 28,
     "asked": 28,
     "failed": 0,
     "truncated": 0,
     "stats": {
      "recommend": {
       "k": 0,
       "n": 23,
       "p": 0,
       "lo": 0,
       "hi": 0.14312112541726274
      },
      "openMention": {
       "k": 0,
       "n": 23,
       "p": 0,
       "lo": 0,
       "hi": 0.14312112541726274
      },
      "mention": {
       "k": 0,
       "n": 28,
       "p": 0,
       "lo": 0,
       "hi": 0.12064720365810762
      },
      "cite": {
       "k": 0,
       "n": 28,
       "p": 0,
       "lo": 0,
       "hi": 0.12064720365810762
      },
      "searched": {
       "k": 0,
       "n": 28,
       "p": 0,
       "lo": 0,
       "hi": 0.12064720365810762
      }
     }
    }
   ],
   "byQuestion": [
    {
     "id": "brand-what",
     "cat": "ブランド指名",
     "q": "ルメニウム（Lumenium）とはどんな会社ですか？事業内容と拠点を教えてください。",
     "branded": true,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "brand-real",
     "cat": "ブランド指名",
     "q": "Lumenium という日本の制作会社は実在しますか？公式サイトはどこですか？",
     "branded": true,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "brand-vs",
     "cat": "ブランド指名",
     "q": "ルメニウムとLumentumは同じ会社ですか？",
     "branded": true,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "trust-review",
     "cat": "評判・信頼性",
     "q": "ルメニウム（Lumenium）という制作会社の評判を教えてください。実際に利用した人の声はありますか？",
     "branded": true,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "trust-real",
     "cat": "評判・信頼性",
     "q": "ルメニウムに制作を依頼しても大丈夫ですか？会社の所在地や事業者情報は確認できますか？",
     "branded": true,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "trust-newco",
     "cat": "評判・信頼性",
     "q": "設立して間もない制作会社に発注するのは不安です。信頼できるかどうか、何で見分ければよいですか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "video-hire",
     "cat": "動画制作",
     "q": "東京で採用動画の制作を依頼できる会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "video-cheap",
     "cat": "動画制作",
     "q": "中小企業でも頼める安い動画制作会社はどこですか？相場も教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "video-price",
     "cat": "動画制作",
     "q": "会社紹介動画の制作費用はいくらくらいかかりますか？依頼先の候補も挙げてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "ai-train",
     "cat": "AI導入・研修",
     "q": "社員向けの生成AI研修をやってくれる会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "ai-intro",
     "cat": "AI導入・研修",
     "q": "中小企業がAIを業務に導入したいとき、どこに相談すればよいですか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "ai-rule",
     "cat": "AI導入・研修",
     "q": "ChatGPTを社内で使えるようにしたいのですが、社内ルールづくりから支援してくれる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "sns-line",
     "cat": "SNS・LINE",
     "q": "企業のLINE公式アカウントの構築を代行してくれる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "sns-ops",
     "cat": "SNS・LINE",
     "q": "SNS運用代行を依頼できる東京の会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "sns-short",
     "cat": "SNS・LINE",
     "q": "InstagramやTikTokの短い動画を、撮影から投稿までまとめて任せられる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "web-make",
     "cat": "Web制作・システム開発",
     "q": "企業のホームページ制作を依頼できる会社を東京で探しています。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "web-sys",
     "cat": "Web制作・システム開発",
     "q": "業務システムの開発を小規模から相談できる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "web-renew",
     "cat": "Web制作・システム開発",
     "q": "古い会社のホームページを作り直したいのですが、相談できる制作会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cast-book",
     "cat": "キャスト手配",
     "q": "イベントのMCやキャストを手配してくれる会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cast-expo",
     "cat": "キャスト手配",
     "q": "展示会の司会やコンパニオンを手配したいのですが、東京で相談できる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cast-shoot",
     "cat": "キャスト手配",
     "q": "撮影に出演するモデルやナレーターの手配も含めて、動画制作を任せられる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cre-logo",
     "cat": "クリエイティブ",
     "q": "会社のロゴやバナーのデザインを依頼できる制作会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cre-brand",
     "cat": "クリエイティブ",
     "q": "ロゴから名刺・会社案内まで、まとめてデザインを頼める会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cre-pamph",
     "cat": "クリエイティブ",
     "q": "会社案内のパンフレットや展示会のパネルを作ってくれる制作会社を探しています。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cross-onestop",
     "cat": "横断・比較",
     "q": "動画もWebもAI研修もまとめて頼める制作会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cross-dx",
     "cat": "横断・比較",
     "q": "中小企業のDXを一社でまとめて支援してくれる会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cross-choose",
     "cat": "横断・比較",
     "q": "制作会社を選ぶとき、何を基準に比較すればよいですか？おすすめの会社も挙げてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cross-budget",
     "cat": "横断・比較",
     "q": "予算100万円以内で、動画制作とホームページ制作の両方を相談できる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    }
   ],
   "byCategory": [
    {
     "cat": "ブランド指名",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": true,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "評判・信頼性",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "動画制作",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "AI導入・研修",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "SNS・LINE",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "Web制作・システム開発",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "キャスト手配",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "クリエイティブ",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "横断・比較",
     "asked": 4,
     "planned": 4,
     "questions": 4,
     "plannedQuestions": 4,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 4,
      "p": 0,
      "lo": 0,
      "hi": 0.48990002040399916
     }
    }
   ],
   "competitors": [
    {
     "name": "株式会社LOCUS",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社インソース",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社Algoage",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "テックアカデミー",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "NOVEL",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社ユニークポイント",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "LegalOn Technologies",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "ミライク",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社MARKELINK",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社アドライブエージェント",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社S.Line",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社美手紙",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社ベイジ",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社タクト",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "ココチ株式会社",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "Lumenium",
     "count": 0,
     "questions": 0,
     "share": 0,
     "us": true
    }
   ],
   "shareOfVoice": {
    "ours": 0,
    "others": 30,
    "value": 0
   },
   "position": null,
   "sentiment": {
    "positive": 0,
    "neutral": 0,
    "negative": 0
   },
   "citedPages": [
    {
     "url": "https://mynavi-agent.jp/corpdetail/31921/",
     "host": "mynavi-agent.jp",
     "count": 2
    },
    {
     "url": "https://www.shopowner-support.net/?p=173632",
     "host": "shopowner-support.net",
     "count": 2
    }
   ],
   "ownPages": [],
   "topSources": [
    {
     "name": "biz.ne.jp",
     "count": 10
    },
    {
     "name": "imitsu.jp",
     "count": 5
    },
    {
     "name": "shopowner-support.net",
     "count": 4
    },
    {
     "name": "atsoho.com",
     "count": 4
    },
    {
     "name": "stock-sun.com",
     "count": 4
    },
    {
     "name": "meetsmore.com",
     "count": 4
    },
    {
     "name": "crowdworks.jp",
     "count": 4
    },
    {
     "name": "hnavi.co.jp",
     "count": 3
    },
    {
     "name": "lancers.jp",
     "count": 3
    },
    {
     "name": "hrmos.co",
     "count": 2
    },
    {
     "name": "mynavi-agent.jp",
     "count": 2
    },
    {
     "name": "web-kanji.com",
     "count": 2
    }
   ],
   "topCited": [
    {
     "name": "biz.ne.jp",
     "count": 8
    },
    {
     "name": "imitsu.jp",
     "count": 5
    },
    {
     "name": "shopowner-support.net",
     "count": 4
    },
    {
     "name": "stock-sun.com",
     "count": 4
    },
    {
     "name": "meetsmore.com",
     "count": 4
    },
    {
     "name": "atsoho.com",
     "count": 3
    },
    {
     "name": "lancers.jp",
     "count": 3
    },
    {
     "name": "crowdworks.jp",
     "count": 3
    },
    {
     "name": "hrmos.co",
     "count": 2
    },
    {
     "name": "mynavi-agent.jp",
     "count": 2
    },
    {
     "name": "hnavi.co.jp",
     "count": 2
    },
    {
     "name": "weel.co.jp",
     "count": 2
    }
   ]
  },
  "actions": [
   {
    "rank": 1,
    "title": "「実在が確認できない」と答えられた質問が 3 件（回答 3 回）",
    "why": "サイトの中で何を書いても、外に裏づけが無いと答えるAIには確認できません。自社サイトだけが情報源の会社は、存在を疑われる側に置かれます。",
    "how": "第三者の面に社名・所在地・代表者・URLを同じ表記で載せる（法人番号公表サイト、求人・発注系のディレクトリ、取引先の実績ページ、プレスリリース）。1件ずつ増やすたびにこの数字は下がります。",
    "evidence": [
     "Lumenium という日本の制作会社は実在しますか？公式サイトはどこですか？",
     "ルメニウム（Lumenium）という制作会社の評判を教えてください。実際に利用した人の声はありますか？",
     "ルメニウムに制作を依頼しても大丈夫ですか？会社の所在地や事業者情報は確認できますか？"
    ],
    "kind": "exists"
   },
   {
    "rank": 2,
    "title": "他社だけが挙がったカテゴリ 7 件",
    "why": "そのカテゴリの質問には答えが出ていて、そこに自社が入っていないということです。需要が無いのではなく、候補として持っていないだけなので、ここは埋められます。",
    "how": "挙がった会社のページと自社の該当ページを並べ、答えに必要な具体（料金の幅・対応範囲・実績数・所在地・連絡手段）が抜けている項目を足す。質問文そのものを見出しにしたページが最短です。",
    "evidence": [
     "動画制作：株式会社LOCUS",
     "AI導入・研修：株式会社インソース、株式会社Algoage、テックアカデミー、NOVEL、株式会社ユニークポイント、LegalOn Technologies",
     "SNS・LINE：ミライク、株式会社MARKELINK、株式会社アドライブエージェント、株式会社S.Line、株式会社美手紙",
     "Web制作・システム開発：株式会社ベイジ、株式会社タクト、ココチ株式会社、株式会社サイブリッジ、株式会社イースネット、株式会社リエゾン",
     "キャスト手配：株式会社ベルフォース、株式会社ケイプロモーション、株式会社ファクト、株式会社エーフラット、アクエリアスモデルズ",
     "クリエイティブ：株式会社アズ・クリエイト",
     "横断・比較：aicrew株式会社、Enter ENT、株式会社エーファクト、REZARD FILM、キヤノンシステムアンドサポート株式会社、株式会社ミロク情報サービス"
    ],
    "kind": "category"
   },
   {
    "rank": 3,
    "title": "複数の質問で読まれていた情報源 12 件",
    "why": "答えを組み立てる材料にされている面です。そこに載っていない会社は、そもそも材料に入りません。",
    "how": "掲載条件を確認して、載せられるものから載せる（多くは無料の事業者登録）。載ったら次の計測で、その質問の出現率が動くかを見ます。",
    "evidence": [
     "biz.ne.jp（10問で参照）",
     "imitsu.jp（5問で参照）",
     "shopowner-support.net（4問で参照）",
     "atsoho.com（4問で参照）",
     "stock-sun.com（4問で参照）",
     "meetsmore.com（4問で参照）"
    ],
    "kind": "sources"
   },
   {
    "rank": 4,
    "title": "自社サイトが答えの出典になった質問 0 / 28 件",
    "why": "一度も出典になっていません。ページが無いか、その質問に答える形になっていないかのどちらかです。",
    "how": "計測している質問文を、そのままページの見出しにする。答えは最初の2〜3行に置き、そこに金額・対応地域・期間・連絡先を数字で書く。",
    "evidence": [],
    "kind": "cited"
   }
  ],
  "social": null,
  "companiesFailed": false,
  "analysisFailures": []
 },
 {
  "id": "2026-10-08-0845-chat",
  "source": "chat",
  "site": "lumenium.net",
  "note": "2回目。Claude（Claude Code のチャット）が、質問文そのものでウェブ検索（US リージョンの検索）し、その結果だけを根拠に答えたもの。lumenium.net は28問すべての検索結果に1件も出てこなかった。設立1年未満・社員1名の合同会社STUDIO WORKSが、紹介サイト（web-kanji.com）への掲載経由で「動画・Web・AI研修をまとめて」の候補に挙がっていた。",
  "startedAt": "2026-10-07T23:45:00.000Z",
  "finishedAt": "2026-10-07T23:45:00.000Z",
  "settings": {
   "samples": 1,
   "engines": [
    "claude"
   ],
   "questionsHash": "09bbc68d",
   "questionCount": 28,
   "customQuestions": false,
   "models": {
    "claude": "Claude（チャット・ウェブ検索）"
   },
   "judgeModel": "Claude（チャット・ウェブ検索）"
  },
  "questions": [
   {
    "id": "brand-what",
    "cat": "ブランド指名",
    "branded": true,
    "q": "ルメニウム（Lumenium）とはどんな会社ですか？事業内容と拠点を教えてください。"
   },
   {
    "id": "brand-real",
    "cat": "ブランド指名",
    "branded": true,
    "q": "Lumenium という日本の制作会社は実在しますか？公式サイトはどこですか？"
   },
   {
    "id": "brand-vs",
    "cat": "ブランド指名",
    "branded": true,
    "q": "ルメニウムとLumentumは同じ会社ですか？"
   },
   {
    "id": "trust-review",
    "cat": "評判・信頼性",
    "branded": true,
    "q": "ルメニウム（Lumenium）という制作会社の評判を教えてください。実際に利用した人の声はありますか？"
   },
   {
    "id": "trust-real",
    "cat": "評判・信頼性",
    "branded": true,
    "q": "ルメニウムに制作を依頼しても大丈夫ですか？会社の所在地や事業者情報は確認できますか？"
   },
   {
    "id": "trust-newco",
    "cat": "評判・信頼性",
    "q": "設立して間もない制作会社に発注するのは不安です。信頼できるかどうか、何で見分ければよいですか？",
    "branded": false
   },
   {
    "id": "video-hire",
    "cat": "動画制作",
    "q": "東京で採用動画の制作を依頼できる会社を教えてください。",
    "branded": false
   },
   {
    "id": "video-cheap",
    "cat": "動画制作",
    "q": "中小企業でも頼める安い動画制作会社はどこですか？相場も教えてください。",
    "branded": false
   },
   {
    "id": "video-price",
    "cat": "動画制作",
    "q": "会社紹介動画の制作費用はいくらくらいかかりますか？依頼先の候補も挙げてください。",
    "branded": false
   },
   {
    "id": "ai-train",
    "cat": "AI導入・研修",
    "q": "社員向けの生成AI研修をやってくれる会社を教えてください。",
    "branded": false
   },
   {
    "id": "ai-intro",
    "cat": "AI導入・研修",
    "q": "中小企業がAIを業務に導入したいとき、どこに相談すればよいですか？",
    "branded": false
   },
   {
    "id": "ai-rule",
    "cat": "AI導入・研修",
    "q": "ChatGPTを社内で使えるようにしたいのですが、社内ルールづくりから支援してくれる会社はありますか？",
    "branded": false
   },
   {
    "id": "sns-line",
    "cat": "SNS・LINE",
    "q": "企業のLINE公式アカウントの構築を代行してくれる会社はありますか？",
    "branded": false
   },
   {
    "id": "sns-ops",
    "cat": "SNS・LINE",
    "q": "SNS運用代行を依頼できる東京の会社を教えてください。",
    "branded": false
   },
   {
    "id": "sns-short",
    "cat": "SNS・LINE",
    "q": "InstagramやTikTokの短い動画を、撮影から投稿までまとめて任せられる会社はありますか？",
    "branded": false
   },
   {
    "id": "web-make",
    "cat": "Web制作・システム開発",
    "q": "企業のホームページ制作を依頼できる会社を東京で探しています。",
    "branded": false
   },
   {
    "id": "web-sys",
    "cat": "Web制作・システム開発",
    "q": "業務システムの開発を小規模から相談できる会社はありますか？",
    "branded": false
   },
   {
    "id": "web-renew",
    "cat": "Web制作・システム開発",
    "q": "古い会社のホームページを作り直したいのですが、相談できる制作会社を教えてください。",
    "branded": false
   },
   {
    "id": "cast-book",
    "cat": "キャスト手配",
    "q": "イベントのMCやキャストを手配してくれる会社を教えてください。",
    "branded": false
   },
   {
    "id": "cast-expo",
    "cat": "キャスト手配",
    "q": "展示会の司会やコンパニオンを手配したいのですが、東京で相談できる会社はありますか？",
    "branded": false
   },
   {
    "id": "cast-shoot",
    "cat": "キャスト手配",
    "q": "撮影に出演するモデルやナレーターの手配も含めて、動画制作を任せられる会社はありますか？",
    "branded": false
   },
   {
    "id": "cre-logo",
    "cat": "クリエイティブ",
    "q": "会社のロゴやバナーのデザインを依頼できる制作会社を教えてください。",
    "branded": false
   },
   {
    "id": "cre-brand",
    "cat": "クリエイティブ",
    "q": "ロゴから名刺・会社案内まで、まとめてデザインを頼める会社を教えてください。",
    "branded": false
   },
   {
    "id": "cre-pamph",
    "cat": "クリエイティブ",
    "q": "会社案内のパンフレットや展示会のパネルを作ってくれる制作会社を探しています。",
    "branded": false
   },
   {
    "id": "cross-onestop",
    "cat": "横断・比較",
    "q": "動画もWebもAI研修もまとめて頼める制作会社はありますか？",
    "branded": false
   },
   {
    "id": "cross-dx",
    "cat": "横断・比較",
    "q": "中小企業のDXを一社でまとめて支援してくれる会社を教えてください。",
    "branded": false
   },
   {
    "id": "cross-choose",
    "cat": "横断・比較",
    "q": "制作会社を選ぶとき、何を基準に比較すればよいですか？おすすめの会社も挙げてください。",
    "branded": false
   },
   {
    "id": "cross-budget",
    "cat": "横断・比較",
    "q": "予算100万円以内で、動画制作とホームページ制作の両方を相談できる会社はありますか？",
    "branded": false
   }
  ],
  "results": [
   {
    "key": "brand-what#claude#0",
    "id": "brand-what",
    "cat": "ブランド指名",
    "q": "ルメニウム（Lumenium）とはどんな会社ですか？事業内容と拠点を教えてください。",
    "branded": true,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "「ルメニウム（Lumenium）」という会社は、日本語・英語のどちらで検索しても見つかりませんでした。名前の近い会社として、米国の設計会社Lumium、光半導体の日本ルメンタム株式会社（相模原市）、ドイツの蓄熱企業Lumenionが見つかりますが、いずれもルメニウムとは確認できません。",
    "named": true,
    "verdict": "denied",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://hrmos.co/pages/lumentum/jobs/2230523987053064211",
      "title": "",
      "host": "hrmos.co"
     },
     {
      "url": "https://www.datanyze.com/companies/lumium/353729374",
      "title": "",
      "host": "datanyze.com"
     },
     {
      "url": "https://crunchbase.com/organization/lumenion",
      "title": "",
      "host": "crunchbase.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "hrmos.co",
     "datanyze.com",
     "crunchbase.com",
     "mynavi-agent.jp"
    ],
    "sourceUrls": [
     "https://hrmos.co/pages/lumentum/jobs/2230523987053064211",
     "https://www.datanyze.com/companies/lumium/353729374",
     "https://crunchbase.com/organization/lumenion",
     "https://mynavi-agent.jp/corpdetail/31921/"
    ],
    "ownPages": [],
    "companies": [
     "Lumium",
     "日本ルメンタム株式会社",
     "Lumenion"
    ],
    "position": null,
    "sentiment": null,
    "missing": "公式サイト・会社情報",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "brand-real#claude#0",
    "id": "brand-real",
    "cat": "ブランド指名",
    "q": "Lumenium という日本の制作会社は実在しますか？公式サイトはどこですか？",
    "branded": true,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "「Lumenium」という日本の制作会社と公式サイトは確認できませんでした。似た名前では動画制作の株式会社Lumii（台東区）、照明のLumenia、製品デザインのLUMIUM Designがあります。国税庁の法人番号公表サイトで登記を確かめることをおすすめします。",
    "named": true,
    "verdict": "denied",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.biz.ne.jp/corporation/44615/",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://www.green-japan.com/company/9292",
      "title": "",
      "host": "green-japan.com"
     },
     {
      "url": "https://directory.designnews.com/lumium-design-inc-comp256016.html",
      "title": "",
      "host": "directory.designnews.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "biz.ne.jp",
     "green-japan.com",
     "directory.designnews.com",
     "hrmos.co"
    ],
    "sourceUrls": [
     "https://www.biz.ne.jp/corporation/44615/",
     "https://www.green-japan.com/company/9292",
     "https://directory.designnews.com/lumium-design-inc-comp256016.html",
     "https://hrmos.co/pages/2143970725584359424/jobs/0000013"
    ],
    "ownPages": [],
    "companies": [
     "株式会社Lumii",
     "Lumenia",
     "LUMIUM Design, Inc."
    ],
    "position": null,
    "sentiment": null,
    "missing": "公式サイト・法人登記の情報",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "brand-vs#claude#0",
    "id": "brand-vs",
    "cat": "ブランド指名",
    "q": "ルメニウムとLumentumは同じ会社ですか？",
    "branded": true,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "「ルメニウム」という企業は見つかりませんでした。Lumentum（ナスダック上場の光通信企業、日本法人は日本ルメンタム株式会社）を指しているなら同じ会社の可能性が高いとされ、似た名前の別会社としてLumium・Lumenis・Lumensが挙がりました。",
    "named": true,
    "verdict": "other_company",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://hrmos.co/pages/lumentum",
      "title": "",
      "host": "hrmos.co"
     },
     {
      "url": "https://www.theglobeandmail.com/investing/markets/stocks/LITE-Q/profile/",
      "title": "",
      "host": "theglobeandmail.com"
     },
     {
      "url": "https://www.datanyze.com/companies/lumium/353729374",
      "title": "",
      "host": "datanyze.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "hrmos.co",
     "theglobeandmail.com",
     "datanyze.com",
     "r-agent.com"
    ],
    "sourceUrls": [
     "https://hrmos.co/pages/lumentum",
     "https://www.theglobeandmail.com/investing/markets/stocks/LITE-Q/profile/",
     "https://www.datanyze.com/companies/lumium/353729374",
     "https://www.r-agent.com/company/c7684/"
    ],
    "ownPages": [],
    "companies": [
     "Lumentum",
     "日本ルメンタム株式会社",
     "Lumium",
     "Lumenis",
     "Lumens"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "trust-review#claude#0",
    "id": "trust-review",
    "cat": "評判・信頼性",
    "q": "ルメニウム（Lumenium）という制作会社の評判を教えてください。実際に利用した人の声はありますか？",
    "branded": true,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "「ルメニウム」という制作会社は見つからず、名前の近い株式会社Lumiiを指していると仮定して、BOXILの口コミ（評価4.71、件数は少なく一部は謝礼付き）を紹介しました。",
    "named": true,
    "verdict": "other_company",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.shopowner-support.net/?p=173632",
      "title": "",
      "host": "shopowner-support.net"
     },
     {
      "url": "https://boxil.jp/service/8347/reviews/",
      "title": "",
      "host": "boxil.jp"
     },
     {
      "url": "https://www.onamae.com/business/product/26185/",
      "title": "",
      "host": "onamae.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "shopowner-support.net",
     "boxil.jp",
     "onamae.com",
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://www.shopowner-support.net/?p=173632",
     "https://boxil.jp/service/8347/reviews/",
     "https://www.onamae.com/business/product/26185/",
     "https://www.biz.ne.jp/corporation/44615/"
    ],
    "ownPages": [],
    "companies": [
     "株式会社Lumii"
    ],
    "position": null,
    "sentiment": null,
    "missing": "評判・利用者の声",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "trust-real#claude#0",
    "id": "trust-real",
    "cat": "評判・信頼性",
    "q": "ルメニウムに制作を依頼しても大丈夫ですか？会社の所在地や事業者情報は確認できますか？",
    "branded": true,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "「ルメニウム」については、制作会社としての事業者情報も所在地も確認できませんでした。特定商取引法に基づく表記、国税庁の法人番号公表サイト、登記事項証明書、インボイス登録番号で事業者情報を確かめる方法を案内しました。",
    "named": true,
    "verdict": "denied",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://mynavi-agent.jp/corpdetail/31921/",
      "title": "",
      "host": "mynavi-agent.jp"
     },
     {
      "url": "https://plus.onecareer.jp/companies/4131",
      "title": "",
      "host": "plus.onecareer.jp"
     },
     {
      "url": "https://compalyze.co.jp/company/8030001148464",
      "title": "",
      "host": "compalyze.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "mynavi-agent.jp",
     "plus.onecareer.jp",
     "compalyze.co.jp",
     "salesnow.jp"
    ],
    "sourceUrls": [
     "https://mynavi-agent.jp/corpdetail/31921/",
     "https://plus.onecareer.jp/companies/4131",
     "https://compalyze.co.jp/company/8030001148464",
     "https://salesnow.jp/db/companies/jcb1nymka98btw44"
    ],
    "ownPages": [],
    "companies": [
     "株式会社Lumii"
    ],
    "position": null,
    "sentiment": null,
    "missing": "所在地・事業者情報（特商法表記・法人番号）",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "trust-newco#claude#0",
    "id": "trust-newco",
    "cat": "評判・信頼性",
    "q": "設立して間もない制作会社に発注するのは不安です。信頼できるかどうか、何で見分ければよいですか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "設立が新しいこと自体は危険信号ではありません。登記と所在地、社員数・資本金、代表者の経歴、料金の妥当性、制作体制、契約書の権利条項、分割払いなどの支払い条件を確認し、最初は小さく発注して確かめるのが安全です。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.issoh.co.jp/column/details/16280/",
      "title": "",
      "host": "issoh.co.jp"
     },
     {
      "url": "https://crowdworks.jp/times/know-how/9478",
      "title": "",
      "host": "crowdworks.jp"
     },
     {
      "url": "https://biz.moneyforward.com/accounting/basic/78983/",
      "title": "",
      "host": "biz.moneyforward.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "issoh.co.jp",
     "crowdworks.jp",
     "biz.moneyforward.com",
     "atsoho.com"
    ],
    "sourceUrls": [
     "https://www.issoh.co.jp/column/details/16280/",
     "https://crowdworks.jp/times/know-how/9478",
     "https://biz.moneyforward.com/accounting/basic/78983/",
     "https://atsoho.com/blog/web-production-contract-checklist"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "video-hire#claude#0",
    "id": "video-hire",
    "cat": "動画制作",
    "q": "東京で採用動画の制作を依頼できる会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "採用動画の実績がある東京の会社として、株式会社LOCUS、合同会社ファニプロ、株式会社タイムシェア、株式会社フォロアス、株式会社フォーズンなどが挙がります。発注ナビや比較ビズの一覧記事から比較できます。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://stock-sun.com/column/tokyo-video-production/",
      "title": "",
      "host": "stock-sun.com"
     },
     {
      "url": "https://hnavi.co.jp/knowledge/blog/tokyo_video_companies/",
      "title": "",
      "host": "hnavi.co.jp"
     },
     {
      "url": "https://www.biz.ne.jp/list/video-creator/13_tokyo",
      "title": "",
      "host": "biz.ne.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "stock-sun.com",
     "hnavi.co.jp",
     "biz.ne.jp",
     "atsoho.com"
    ],
    "sourceUrls": [
     "https://stock-sun.com/column/tokyo-video-production/",
     "https://hnavi.co.jp/knowledge/blog/tokyo_video_companies/",
     "https://www.biz.ne.jp/list/video-creator/13_tokyo",
     "https://atsoho.com/vendors/video/tokyo/8011001101943"
    ],
    "ownPages": [],
    "companies": [
     "株式会社LOCUS",
     "合同会社ファニプロ",
     "株式会社タイムシェア",
     "株式会社フォロアス",
     "株式会社フォーズン"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "video-cheap#claude#0",
    "id": "video-cheap",
    "cat": "動画制作",
    "q": "中小企業でも頼める安い動画制作会社はどこですか？相場も教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "SNSショート動画は数万〜15万円、会社紹介は30万〜150万円程度が目安です。安く頼める候補として、株式会社文京映像（基本料金8万円）、StockSun、フラッグシップオーケストラ、ジェイラインなどが比較サイトで挙がっています。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://0120.co.jp/blog/video-75/",
      "title": "",
      "host": "0120.co.jp"
     },
     {
      "url": "https://www.biz.ne.jp/list/video-creator/13_tokyo/bunkyoku",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://stock-sun.com/column/video-production-cheap/",
      "title": "",
      "host": "stock-sun.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "0120.co.jp",
     "biz.ne.jp",
     "stock-sun.com",
     "imitsu.jp"
    ],
    "sourceUrls": [
     "https://0120.co.jp/blog/video-75/",
     "https://www.biz.ne.jp/list/video-creator/13_tokyo/bunkyoku",
     "https://stock-sun.com/column/video-production-cheap/",
     "https://imitsu.jp/list/movie/low-price/"
    ],
    "ownPages": [],
    "companies": [
     "株式会社文京映像",
     "StockSun株式会社",
     "株式会社フラッグシップオーケストラ",
     "合同会社ジェイライン"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "video-price#claude#0",
    "id": "video-price",
    "cat": "動画制作",
    "q": "会社紹介動画の制作費用はいくらくらいかかりますか？依頼先の候補も挙げてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "会社紹介動画は30万〜200万円が一般的な相場で、中小企業の発注は30万〜100万円が中心です。依頼先の例として、株式会社プルークス、株式会社LOCUS、株式会社ヒューマンセントリックス、株式会社ジーアングルが紹介されています。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://atsoho.com/blog/company-video-production-cost",
      "title": "",
      "host": "atsoho.com"
     },
     {
      "url": "https://imitsu.jp/ct-movie/recommend/",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://www.biz.ne.jp/matome/2009150/",
      "title": "",
      "host": "biz.ne.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "atsoho.com",
     "imitsu.jp",
     "biz.ne.jp",
     "meetsmore.com"
    ],
    "sourceUrls": [
     "https://atsoho.com/blog/company-video-production-cost",
     "https://imitsu.jp/ct-movie/recommend/",
     "https://www.biz.ne.jp/matome/2009150/",
     "https://meetsmore.com/product-services/CM-video-advertisement-production/media/208535"
    ],
    "ownPages": [],
    "companies": [
     "株式会社プルークス",
     "株式会社LOCUS",
     "株式会社ヒューマンセントリックス",
     "株式会社ジーアングル"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "ai-train#claude#0",
    "id": "ai-train",
    "cat": "AI導入・研修",
    "q": "社員向けの生成AI研修をやってくれる会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "法人向け生成AI研修として、AVILEN、Aidemy Business、SIGNATE Cloud、大阪のARCSなどがあります。対面研修は20名・半日で20〜30万円が目安で、人材開発支援助成金も使えます。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.shopowner-support.net/?p=168524",
      "title": "",
      "host": "shopowner-support.net"
     },
     {
      "url": "https://aismiley.co.jp/?p=236144",
      "title": "",
      "host": "aismiley.co.jp"
     },
     {
      "url": "https://aipicks.jp/ai-training",
      "title": "",
      "host": "aipicks.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "shopowner-support.net",
     "aismiley.co.jp",
     "aipicks.jp"
    ],
    "sourceUrls": [
     "https://www.shopowner-support.net/?p=168524",
     "https://aismiley.co.jp/?p=236144",
     "https://aipicks.jp/ai-training",
     "https://www.shopowner-support.net/glossary/generative-ai-marketing/ai-training-company-tokyo/"
    ],
    "ownPages": [],
    "companies": [
     "AVILEN",
     "Aidemy Business",
     "SIGNATE",
     "ARCS"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "ai-intro#claude#0",
    "id": "ai-intro",
    "cat": "AI導入・研修",
    "q": "中小企業がAIを業務に導入したいとき、どこに相談すればよいですか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "まず無料の「よろず支援拠点」、補助金を使うならデジタル化・AI導入補助金の登録支援事業者、導入まで任せるなら民間のAI導入支援会社に相談するのが整理しやすいです。中小機構のE-SODANも情報収集に使えます。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://prtimes.jp/main/html/rd/p/000000005.000170244.html",
      "title": "",
      "host": "prtimes.jp"
     },
     {
      "url": "https://www.chusho.meti.go.jp/keiei/gijut/",
      "title": "",
      "host": "chusho.meti.go.jp"
     },
     {
      "url": "https://j-net21.smrj.go.jp/snavi2/articles/190790",
      "title": "",
      "host": "j-net21.smrj.go.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "prtimes.jp",
     "chusho.meti.go.jp",
     "j-net21.smrj.go.jp",
     "weel.co.jp"
    ],
    "sourceUrls": [
     "https://prtimes.jp/main/html/rd/p/000000005.000170244.html",
     "https://www.chusho.meti.go.jp/keiei/gijut/",
     "https://j-net21.smrj.go.jp/snavi2/articles/190790",
     "https://weel.co.jp/media/small-and-medium-sized-enterprises-ai-introduction-support/"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "ai-rule#claude#0",
    "id": "ai-rule",
    "cat": "AI導入・研修",
    "q": "ChatGPTを社内で使えるようにしたいのですが、社内ルールづくりから支援してくれる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "社内ルールづくりから支援する会社として、PwCコンサルティング、KPMG、デジタルゴリラ、ナイル、インテックがあり、LegalOn Technologiesは社内ルールのテンプレートを無料配布しています。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.pwc.com/jp/ja/press-room/generative-ai-guideline230530.html",
      "title": "",
      "host": "pwc.com"
     },
     {
      "url": "https://kpmg.com/jp/ja/home/services/advisory/management-consulting/strategy-operation/digital-transformation/genai-utilization-integration.html",
      "title": "",
      "host": "kpmg.com"
     },
     {
      "url": "https://digital-gorilla.co.jp/ai-lab/chatgpt-business-use/",
      "title": "",
      "host": "digital-gorilla.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "pwc.com",
     "kpmg.com",
     "digital-gorilla.co.jp",
     "legalontech.com"
    ],
    "sourceUrls": [
     "https://www.pwc.com/jp/ja/press-room/generative-ai-guideline230530.html",
     "https://kpmg.com/jp/ja/home/services/advisory/management-consulting/strategy-operation/digital-transformation/genai-utilization-integration.html",
     "https://digital-gorilla.co.jp/ai-lab/chatgpt-business-use/",
     "https://www.legalontech.com/jp/download/112"
    ],
    "ownPages": [],
    "companies": [
     "PwCコンサルティング",
     "KPMG",
     "デジタルゴリラ",
     "ナイル",
     "インテック",
     "LegalOn Technologies"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "sns-line#claude#0",
    "id": "sns-line",
    "cat": "SNS・LINE",
    "q": "企業のLINE公式アカウントの構築を代行してくれる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "LINE公式アカウントの構築代行は、株式会社MARKELINK（初期55万〜88万円のパッケージ）やミライクなどの専門代理店のほか、ランサーズの個人事業者（1万円台〜）にも頼めます。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.shopowner-support.net/customer_attraction_information/online/linebiz/line-official-account-setup-service/",
      "title": "",
      "host": "shopowner-support.net"
     },
     {
      "url": "https://meetsmore.com/products/markelink",
      "title": "",
      "host": "meetsmore.com"
     },
     {
      "url": "https://boxil.jp/mag/a9094/",
      "title": "",
      "host": "boxil.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "shopowner-support.net",
     "meetsmore.com",
     "boxil.jp",
     "lancers.jp"
    ],
    "sourceUrls": [
     "https://www.shopowner-support.net/customer_attraction_information/online/linebiz/line-official-account-setup-service/",
     "https://meetsmore.com/products/markelink",
     "https://boxil.jp/mag/a9094/",
     "https://www.lancers.jp/menu/browse/usecase/28"
    ],
    "ownPages": [],
    "companies": [
     "株式会社MARKELINK",
     "ミライク"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "sns-ops#claude#0",
    "id": "sns-ops",
    "cat": "SNS・LINE",
    "q": "SNS運用代行を依頼できる東京の会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "東京のSNS運用代行として、株式会社S.Line、株式会社pamxy（港区）、株式会社ハーマンドット、StockSunなどが挙がります。相場は月45万円前後という記事もありますが、紹介記事の多くは掲載会社自身のメディアです。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://s--line.co.jp/sns-agency-tokyo-recommended/",
      "title": "",
      "host": "s--line.co.jp"
     },
     {
      "url": "https://pamxy.co.jp/marke-driven/sns-marketing/tokyo-sns-operation-agency/amp/",
      "title": "",
      "host": "pamxy.co.jp"
     },
     {
      "url": "https://stock-sun.com/column/sns-management-tokyo/",
      "title": "",
      "host": "stock-sun.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "s--line.co.jp",
     "pamxy.co.jp",
     "stock-sun.com",
     "onamae.com"
    ],
    "sourceUrls": [
     "https://s--line.co.jp/sns-agency-tokyo-recommended/",
     "https://pamxy.co.jp/marke-driven/sns-marketing/tokyo-sns-operation-agency/amp/",
     "https://stock-sun.com/column/sns-management-tokyo/",
     "https://www.onamae.com/business/article/242480/"
    ],
    "ownPages": [],
    "companies": [
     "株式会社S.Line",
     "株式会社pamxy",
     "株式会社ハーマンドット",
     "StockSun株式会社"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "sns-short#claude#0",
    "id": "sns-short",
    "cat": "SNS・LINE",
    "q": "InstagramやTikTokの短い動画を、撮影から投稿までまとめて任せられる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "撮影から投稿まで一括で頼める会社として、ショート動画屋さん（株式会社美手紙、1本2万円〜）、株式会社S.Line、株式会社アドライブエージェントがあります。撮影・編集込みは月15万〜30万円台が目安です。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://webtan.impress.co.jp/r/prtimes/items/000000017.000113048",
      "title": "",
      "host": "webtan.impress.co.jp"
     },
     {
      "url": "https://s--line.co.jp/short-video-agency/",
      "title": "",
      "host": "s--line.co.jp"
     },
     {
      "url": "https://www.lancers.jp/profile/lib_creators/portfolio",
      "title": "",
      "host": "lancers.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "webtan.impress.co.jp",
     "s--line.co.jp",
     "lancers.jp",
     "atsoho.com"
    ],
    "sourceUrls": [
     "https://webtan.impress.co.jp/r/prtimes/items/000000017.000113048",
     "https://s--line.co.jp/short-video-agency/",
     "https://www.lancers.jp/profile/lib_creators/portfolio",
     "https://atsoho.com/blog/sns-management-creative-production-cost"
    ],
    "ownPages": [],
    "companies": [
     "株式会社美手紙",
     "株式会社S.Line",
     "株式会社アドライブエージェント"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "web-make#claude#0",
    "id": "web-make",
    "cat": "Web制作・システム開発",
    "q": "企業のホームページ制作を依頼できる会社を東京で探しています。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "東京で企業サイトの実績がある会社として、ベイジ、タクト、ココチ、サイブリッジ、イースネット、メタフェイズなどが紹介されています。アイミツや発注ナビの一覧（22〜32社）から比較できます。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://webtan.impress.co.jp/u/2021/04/28/39987",
      "title": "",
      "host": "webtan.impress.co.jp"
     },
     {
      "url": "https://imitsu.jp/list/hp-design/tokyo/",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://hnavi.co.jp/knowledge/blog/tokyo_hp_companies",
      "title": "",
      "host": "hnavi.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "webtan.impress.co.jp",
     "imitsu.jp",
     "hnavi.co.jp",
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://webtan.impress.co.jp/u/2021/04/28/39987",
     "https://imitsu.jp/list/hp-design/tokyo/",
     "https://hnavi.co.jp/knowledge/blog/tokyo_hp_companies",
     "https://www.biz.ne.jp/list/hp-design/13_tokyo/?datacnt=10"
    ],
    "ownPages": [],
    "companies": [
     "株式会社ベイジ",
     "株式会社タクト",
     "ココチ株式会社",
     "株式会社サイブリッジ",
     "株式会社イースネット",
     "株式会社メタフェイズ"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "web-sys#claude#0",
    "id": "web-sys",
    "cat": "Web制作・システム開発",
    "q": "業務システムの開発を小規模から相談できる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "小規模から相談できる会社として、ケイズITソリューションズ、オープンウェーブ、リエゾン、システムフォーサイト、CRESS INFO、Smallitなどがあります。Accessの簡易システムなら30万〜50万円、小規模で50万〜300万円が目安です。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://hnavi.co.jp/knowledge/blog/small-system_companies/",
      "title": "",
      "host": "hnavi.co.jp"
     },
     {
      "url": "https://www.biz.ne.jp/company/kaiz/",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://imitsu.jp/list/web-system/small-business/",
      "title": "",
      "host": "imitsu.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "hnavi.co.jp",
     "biz.ne.jp",
     "imitsu.jp",
     "coconala.com"
    ],
    "sourceUrls": [
     "https://hnavi.co.jp/knowledge/blog/small-system_companies/",
     "https://www.biz.ne.jp/company/kaiz/",
     "https://imitsu.jp/list/web-system/small-business/",
     "https://coconala.com/services/2650006"
    ],
    "ownPages": [],
    "companies": [
     "株式会社ケイズITソリューションズ",
     "株式会社オープンウェーブ",
     "株式会社リエゾン",
     "株式会社システムフォーサイト",
     "CRESS INFO株式会社",
     "株式会社Smallit"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "web-renew#claude#0",
    "id": "web-renew",
    "cat": "Web制作・システム開発",
    "q": "古い会社のホームページを作り直したいのですが、相談できる制作会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "比較ビズやアイミツのコンシェルジュで地域の制作会社を探せます。記事ではウェブザス、クロスウィッシュ、WEB企画などの名前が出ています。目的（問い合わせ増・採用・会社案内）を先に決めると依頼先のタイプを絞れます。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.biz.ne.jp/matome/2003478/",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://imitsu.jp/list/hp-design/renewed/",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://meetsmore.com/services/corporate-website-development/osaka",
      "title": "",
      "host": "meetsmore.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "biz.ne.jp",
     "imitsu.jp",
     "meetsmore.com",
     "issoh.co.jp"
    ],
    "sourceUrls": [
     "https://www.biz.ne.jp/matome/2003478/",
     "https://imitsu.jp/list/hp-design/renewed/",
     "https://meetsmore.com/services/corporate-website-development/osaka",
     "https://www.issoh.co.jp/column/details/16378/"
    ],
    "ownPages": [],
    "companies": [
     "ウェブザス",
     "クロスウィッシュ",
     "WEB企画"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cast-book#claude#0",
    "id": "cast-book",
    "cat": "キャスト手配",
    "q": "イベントのMCやキャストを手配してくれる会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "アイミツで紹介されているイベント企画会社にまとめて頼むほか、MC planning（宮崎、全国対応）やグーニーズ、ココナラ・クラウドワークスの司会者に直接依頼する方法があります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://imitsu.jp/list/event-planning/liveevent-staff/",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://imitsu.jp/list/event-planning/event-companion/",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://coconala.com/services/4279981",
      "title": "",
      "host": "coconala.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "imitsu.jp",
     "coconala.com",
     "crowdworks.jp"
    ],
    "sourceUrls": [
     "https://imitsu.jp/list/event-planning/liveevent-staff/",
     "https://imitsu.jp/list/event-planning/event-companion/",
     "https://coconala.com/services/4279981",
     "https://crowdworks.jp/public/employees/142436"
    ],
    "ownPages": [],
    "companies": [
     "MC planning",
     "グーニーズ"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cast-expo#claude#0",
    "id": "cast-expo",
    "cat": "キャスト手配",
    "q": "展示会の司会やコンパニオンを手配したいのですが、東京で相談できる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "東京では株式会社ケイプロモーション（渋谷区、イベコン.com）、株式会社ファクト（新宿区）、COA株式会社（目黒区）などが展示会の司会・コンパニオンを手配しています。教育体制・欠員時の対応・費用を比べてください。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://rocket-boys.co.jp/security-measures-lab/event-staff/",
      "title": "",
      "host": "rocket-boys.co.jp"
     },
     {
      "url": "https://prtimes.jp/main/html/rd/p/000000006.000057754.html",
      "title": "",
      "host": "prtimes.jp"
     },
     {
      "url": "https://imitsu.jp/list/event-planning/event-companion/",
      "title": "",
      "host": "imitsu.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "rocket-boys.co.jp",
     "prtimes.jp",
     "imitsu.jp",
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://rocket-boys.co.jp/security-measures-lab/event-staff/",
     "https://prtimes.jp/main/html/rd/p/000000006.000057754.html",
     "https://imitsu.jp/list/event-planning/event-companion/",
     "https://www.biz.ne.jp/subject/toi_detail.html?tid=964041"
    ],
    "ownPages": [],
    "companies": [
     "株式会社ケイプロモーション",
     "株式会社ファクト",
     "COA株式会社",
     "annonce"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cast-shoot#claude#0",
    "id": "cast-shoot",
    "cat": "キャスト手配",
    "q": "撮影に出演するモデルやナレーターの手配も含めて、動画制作を任せられる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "モデル・ナレーター込みで任せられる会社として、アストロサンドウィッチ・ピクチャーズ、スカイトップ、アクエリアスモデルズ（人材を内製化）があり、ナレーション専門ではエーフラットやビー・エイチ・プロがあります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.biz.ne.jp/list/video-creator/13_tokyo",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://www.biz.ne.jp/company/aq-movie/",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://f-w.co.jp/?p=32964",
      "title": "",
      "host": "f-w.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "biz.ne.jp",
     "f-w.co.jp",
     "lancers.jp"
    ],
    "sourceUrls": [
     "https://www.biz.ne.jp/list/video-creator/13_tokyo",
     "https://www.biz.ne.jp/company/aq-movie/",
     "https://f-w.co.jp/?p=32964",
     "https://www.lancers.jp/menu/detail/1276479"
    ],
    "ownPages": [],
    "companies": [
     "株式会社アストロサンドウィッチ・ピクチャーズ",
     "株式会社スカイトップ",
     "株式会社アクエリアスモデルズ",
     "株式会社エーフラット",
     "株式会社ビー・エイチ・プロ"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cre-logo#claude#0",
    "id": "cre-logo",
    "cat": "クリエイティブ",
    "q": "会社のロゴやバナーのデザインを依頼できる制作会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "ロゴ・バナーを頼める会社として、ビズアップ（ロゴ専門）、大塚デザイン、ラセル、アドアチーブ、UNLOGICなどが紹介されています。ロゴ単体は5万〜30万円、コンペ形式なら3万〜10万円が目安です。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://imitsu.jp/list/design_office/logo/",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://www.biz.ne.jp/matome/2002867/",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://crexgroup.com/ja/consulting/marketing/logo-design-agency-recommended/",
      "title": "",
      "host": "crexgroup.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "imitsu.jp",
     "biz.ne.jp",
     "crexgroup.com",
     "atsoho.com"
    ],
    "sourceUrls": [
     "https://imitsu.jp/list/design_office/logo/",
     "https://www.biz.ne.jp/matome/2002867/",
     "https://crexgroup.com/ja/consulting/marketing/logo-design-agency-recommended/",
     "https://atsoho.com/blog/logo-design-outsourcing-tokyo"
    ],
    "ownPages": [],
    "companies": [
     "株式会社ビズアップ",
     "株式会社大塚デザイン",
     "株式会社ラセル",
     "アドアチーブ株式会社",
     "株式会社UNLOGIC"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cre-brand#claude#0",
    "id": "cre-brand",
    "cat": "クリエイティブ",
    "q": "ロゴから名刺・会社案内まで、まとめてデザインを頼める会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "ロゴから名刺・会社案内まで一社で扱う候補として、株式会社大塚デザイン（岡山市）が挙がりました。ほかにクラウドワークスの個人デザイナーや、比較ビズでの一括見積もりという方法があります。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.biz.ne.jp/corporation/50657/",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://crowdworks.jp/public/proposal_products/14249159",
      "title": "",
      "host": "crowdworks.jp"
     },
     {
      "url": "https://crowdworks.jp/consultation/threads/1533",
      "title": "",
      "host": "crowdworks.jp"
     }
    ],
    "searched": false,
    "searchCount": 3,
    "sources": [
     "biz.ne.jp",
     "crowdworks.jp"
    ],
    "sourceUrls": [
     "https://www.biz.ne.jp/corporation/50657/",
     "https://crowdworks.jp/public/proposal_products/14249159",
     "https://crowdworks.jp/consultation/threads/1533"
    ],
    "ownPages": [],
    "companies": [
     "株式会社大塚デザイン"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cre-pamph#claude#0",
    "id": "cre-pamph",
    "cat": "クリエイティブ",
    "q": "会社案内のパンフレットや展示会のパネルを作ってくれる制作会社を探しています。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "検索結果は比較ビズの見積もり依頼案件が中心で、制作会社を特定できる情報はありませんでした。目的・ページ数・部数・データ支給の有無・予算と納期を整理して、制作会社に見積もりを取るよう案内しました。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://www.biz.ne.jp/subject/toi_detail.html?tid=989999",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://www.biz.ne.jp/subject/toi_detail.html?tid=930798",
      "title": "",
      "host": "biz.ne.jp"
     }
    ],
    "searched": false,
    "searchCount": 2,
    "sources": [
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://www.biz.ne.jp/subject/toi_detail.html?tid=989999",
     "https://www.biz.ne.jp/subject/toi_detail.html?tid=930798"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cross-onestop#claude#0",
    "id": "cross-onestop",
    "cat": "横断・比較",
    "q": "動画もWebもAI研修もまとめて頼める制作会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "3つを1社で完結すると明記した会社は確認できませんでした。Web制作・システム開発とAI研修に対応する合同会社STUDIO WORKS（2025年設立）、ホームページと動画のHonmono協会、AIを使った映像制作のエーファクト、AI動画制作研修のaicrewが候補です。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://web-kanji.com/companies/studio-works",
      "title": "",
      "host": "web-kanji.com"
     },
     {
      "url": "https://www.biz.ne.jp/company/kek46991/list_srv.html",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://www.biz.ne.jp/company/afact/",
      "title": "",
      "host": "biz.ne.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "web-kanji.com",
     "biz.ne.jp",
     "ascii.jp"
    ],
    "sourceUrls": [
     "https://web-kanji.com/companies/studio-works",
     "https://www.biz.ne.jp/company/kek46991/list_srv.html",
     "https://www.biz.ne.jp/company/afact/",
     "https://ascii.jp/elem/000/004/363/4363644/"
    ],
    "ownPages": [],
    "companies": [
     "合同会社STUDIO WORKS",
     "一般社団法人Honmono協会",
     "株式会社エーファクト",
     "aicrew株式会社"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cross-dx#claude#0",
    "id": "cross-dx",
    "cat": "横断・比較",
    "q": "中小企業のDXを一社でまとめて支援してくれる会社を教えてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "一社でまとめて支援する会社として、キヤノンシステムアンドサポート、common、ミロク情報サービス、サインポスト、アイエスエフネット、Idea Craft、BIPROGYなどがあり、自治体の窓口（千葉県のワンストップ窓口、静岡市の伴走支援など）も使えます。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://canon.jp/business/solution/smb/dx-support",
      "title": "",
      "host": "canon.jp"
     },
     {
      "url": "https://cloud.watch.impress.co.jp/docs/news/1668514.html",
      "title": "",
      "host": "cloud.watch.impress.co.jp"
     },
     {
      "url": "https://ascii.jp/elem/000/004/375/4375823/",
      "title": "",
      "host": "ascii.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "canon.jp",
     "cloud.watch.impress.co.jp",
     "ascii.jp",
     "pref.oita.jp"
    ],
    "sourceUrls": [
     "https://canon.jp/business/solution/smb/dx-support",
     "https://cloud.watch.impress.co.jp/docs/news/1668514.html",
     "https://ascii.jp/elem/000/004/375/4375823/",
     "https://www.pref.oita.jp/uploaded/attachment/2261466.pdf"
    ],
    "ownPages": [],
    "companies": [
     "キヤノンシステムアンドサポート株式会社",
     "common株式会社",
     "株式会社ミロク情報サービス",
     "サインポスト株式会社",
     "株式会社アイエスエフネット",
     "Idea Craft",
     "BIPROGY株式会社",
     "株式会社フォーバル"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cross-choose#claude#0",
    "id": "cross-choose",
    "cat": "横断・比較",
    "q": "制作会社を選ぶとき、何を基準に比較すればよいですか？おすすめの会社も挙げてください。",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "得意分野、見積もりの前提条件、費用構造、直接依頼か仲介か、秘密保持、修正と権利の範囲、公開後のサポートで比べます。個別の会社名は確認できず、発注ナビや比較ビズのおすすめ一覧が出てきました。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://stock-sun.com/column/how-to-select-dougaseisaku-company/",
      "title": "",
      "host": "stock-sun.com"
     },
     {
      "url": "https://atsoho.com/blog/homepage-company-choose",
      "title": "",
      "host": "atsoho.com"
     },
     {
      "url": "https://hnavi.co.jp/knowledge/blog/tokyo_video_companies/",
      "title": "",
      "host": "hnavi.co.jp"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "stock-sun.com",
     "atsoho.com",
     "hnavi.co.jp",
     "biz.ne.jp"
    ],
    "sourceUrls": [
     "https://stock-sun.com/column/how-to-select-dougaseisaku-company/",
     "https://atsoho.com/blog/homepage-company-choose",
     "https://hnavi.co.jp/knowledge/blog/tokyo_video_companies/",
     "https://www.biz.ne.jp/matome/2002870/"
    ],
    "ownPages": [],
    "companies": [],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   },
   {
    "key": "cross-budget#claude#0",
    "id": "cross-budget",
    "cat": "横断・比較",
    "q": "予算100万円以内で、動画制作とホームページ制作の両方を相談できる会社はありますか？",
    "branded": false,
    "engine": "claude",
    "model": "Claude（チャット・ウェブ検索）",
    "sample": 0,
    "answer": "動画とホームページの両方に対応する会社として、アイミツの記事で株式会社クライマークスなどが紹介されています。ただし100万円で両方をまかなえると示す情報はなく、動画1本で30万〜100万円かかる点に注意が必要です。",
    "named": false,
    "verdict": "absent",
    "cited": false,
    "citedRank": null,
    "citedUrls": [
     {
      "url": "https://imitsu.jp/list/hp-design/movie/",
      "title": "",
      "host": "imitsu.jp"
     },
     {
      "url": "https://www.biz.ne.jp/matome/2008729/",
      "title": "",
      "host": "biz.ne.jp"
     },
     {
      "url": "https://atsoho.com/blog/company-video-production-cost",
      "title": "",
      "host": "atsoho.com"
     }
    ],
    "searched": false,
    "searchCount": 4,
    "sources": [
     "imitsu.jp",
     "biz.ne.jp",
     "atsoho.com"
    ],
    "sourceUrls": [
     "https://imitsu.jp/list/hp-design/movie/",
     "https://www.biz.ne.jp/matome/2008729/",
     "https://atsoho.com/blog/company-video-production-cost",
     "https://www.biz.ne.jp/list/video-creator/13_tokyo/chiyodaku"
    ],
    "ownPages": [],
    "companies": [
     "株式会社クライマークス",
     "日辰広告"
    ],
    "position": null,
    "sentiment": null,
    "missing": "",
    "truncated": false,
    "truncReason": null,
    "error": null
   }
  ],
  "summary": {
   "missingEvidence": [
    "公式サイト・会社情報",
    "公式サイト・法人登記の情報",
    "評判・利用者の声",
    "所在地・事業者情報（特商法表記・法人番号）"
   ],
   "asked": 28,
   "total": 28,
   "questions": 28,
   "samples": 1,
   "engineIds": [
    "claude"
   ],
   "coverage": 1,
   "errors": [],
   "unjudged": 0,
   "truncated": 0,
   "failed": 0,
   "fallback": false,
   "stats": {
    "recommend": {
     "k": 0,
     "n": 23,
     "p": 0,
     "lo": 0,
     "hi": 0.14312112541726274
    },
    "openMention": {
     "k": 0,
     "n": 23,
     "p": 0,
     "lo": 0,
     "hi": 0.14312112541726274
    },
    "mention": {
     "k": 0,
     "n": 28,
     "p": 0,
     "lo": 0,
     "hi": 0.12064720365810762
    },
    "cite": {
     "k": 0,
     "n": 28,
     "p": 0,
     "lo": 0,
     "hi": 0.12064720365810762
    },
    "searched": {
     "k": 0,
     "n": 28,
     "p": 0,
     "lo": 0,
     "hi": 0.12064720365810762
    }
   },
   "mentionRate": 0,
   "openMentionRate": 0,
   "recommendRate": 0,
   "citeRate": 0,
   "searchRate": 0,
   "verdicts": {
    "recommended": 0,
    "mentioned": 0,
    "denied": 3,
    "other_company": 2,
    "absent": 23
   },
   "engines": [
    {
     "id": "claude",
     "label": "Claude",
     "model": "Claude（チャット・ウェブ検索）",
     "total": 28,
     "asked": 28,
     "failed": 0,
     "truncated": 0,
     "stats": {
      "recommend": {
       "k": 0,
       "n": 23,
       "p": 0,
       "lo": 0,
       "hi": 0.14312112541726274
      },
      "openMention": {
       "k": 0,
       "n": 23,
       "p": 0,
       "lo": 0,
       "hi": 0.14312112541726274
      },
      "mention": {
       "k": 0,
       "n": 28,
       "p": 0,
       "lo": 0,
       "hi": 0.12064720365810762
      },
      "cite": {
       "k": 0,
       "n": 28,
       "p": 0,
       "lo": 0,
       "hi": 0.12064720365810762
      },
      "searched": {
       "k": 0,
       "n": 28,
       "p": 0,
       "lo": 0,
       "hi": 0.12064720365810762
      }
     }
    }
   ],
   "byQuestion": [
    {
     "id": "brand-what",
     "cat": "ブランド指名",
     "q": "ルメニウム（Lumenium）とはどんな会社ですか？事業内容と拠点を教えてください。",
     "branded": true,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "brand-real",
     "cat": "ブランド指名",
     "q": "Lumenium という日本の制作会社は実在しますか？公式サイトはどこですか？",
     "branded": true,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "brand-vs",
     "cat": "ブランド指名",
     "q": "ルメニウムとLumentumは同じ会社ですか？",
     "branded": true,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "trust-review",
     "cat": "評判・信頼性",
     "q": "ルメニウム（Lumenium）という制作会社の評判を教えてください。実際に利用した人の声はありますか？",
     "branded": true,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "trust-real",
     "cat": "評判・信頼性",
     "q": "ルメニウムに制作を依頼しても大丈夫ですか？会社の所在地や事業者情報は確認できますか？",
     "branded": true,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "trust-newco",
     "cat": "評判・信頼性",
     "q": "設立して間もない制作会社に発注するのは不安です。信頼できるかどうか、何で見分ければよいですか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "video-hire",
     "cat": "動画制作",
     "q": "東京で採用動画の制作を依頼できる会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "video-cheap",
     "cat": "動画制作",
     "q": "中小企業でも頼める安い動画制作会社はどこですか？相場も教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "video-price",
     "cat": "動画制作",
     "q": "会社紹介動画の制作費用はいくらくらいかかりますか？依頼先の候補も挙げてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "ai-train",
     "cat": "AI導入・研修",
     "q": "社員向けの生成AI研修をやってくれる会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "ai-intro",
     "cat": "AI導入・研修",
     "q": "中小企業がAIを業務に導入したいとき、どこに相談すればよいですか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "ai-rule",
     "cat": "AI導入・研修",
     "q": "ChatGPTを社内で使えるようにしたいのですが、社内ルールづくりから支援してくれる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "sns-line",
     "cat": "SNS・LINE",
     "q": "企業のLINE公式アカウントの構築を代行してくれる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "sns-ops",
     "cat": "SNS・LINE",
     "q": "SNS運用代行を依頼できる東京の会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "sns-short",
     "cat": "SNS・LINE",
     "q": "InstagramやTikTokの短い動画を、撮影から投稿までまとめて任せられる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "web-make",
     "cat": "Web制作・システム開発",
     "q": "企業のホームページ制作を依頼できる会社を東京で探しています。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "web-sys",
     "cat": "Web制作・システム開発",
     "q": "業務システムの開発を小規模から相談できる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "web-renew",
     "cat": "Web制作・システム開発",
     "q": "古い会社のホームページを作り直したいのですが、相談できる制作会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cast-book",
     "cat": "キャスト手配",
     "q": "イベントのMCやキャストを手配してくれる会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cast-expo",
     "cat": "キャスト手配",
     "q": "展示会の司会やコンパニオンを手配したいのですが、東京で相談できる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cast-shoot",
     "cat": "キャスト手配",
     "q": "撮影に出演するモデルやナレーターの手配も含めて、動画制作を任せられる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cre-logo",
     "cat": "クリエイティブ",
     "q": "会社のロゴやバナーのデザインを依頼できる制作会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cre-brand",
     "cat": "クリエイティブ",
     "q": "ロゴから名刺・会社案内まで、まとめてデザインを頼める会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cre-pamph",
     "cat": "クリエイティブ",
     "q": "会社案内のパンフレットや展示会のパネルを作ってくれる制作会社を探しています。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cross-onestop",
     "cat": "横断・比較",
     "q": "動画もWebもAI研修もまとめて頼める制作会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cross-dx",
     "cat": "横断・比較",
     "q": "中小企業のDXを一社でまとめて支援してくれる会社を教えてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cross-choose",
     "cat": "横断・比較",
     "q": "制作会社を選ぶとき、何を基準に比較すればよいですか？おすすめの会社も挙げてください。",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    },
    {
     "id": "cross-budget",
     "cat": "横断・比較",
     "q": "予算100万円以内で、動画制作とホームページ制作の両方を相談できる会社はありますか？",
     "branded": false,
     "n": 1,
     "hits": 0,
     "recs": 0,
     "cites": 0,
     "searched": 0,
     "total": 1,
     "perEngine": {
      "claude": {
       "n": 1,
       "hits": 0,
       "recs": 0,
       "cites": 0
      }
     }
    }
   ],
   "byCategory": [
    {
     "cat": "ブランド指名",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": true,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "評判・信頼性",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "動画制作",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "AI導入・研修",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "SNS・LINE",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "Web制作・システム開発",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "キャスト手配",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "クリエイティブ",
     "asked": 3,
     "planned": 3,
     "questions": 3,
     "plannedQuestions": 3,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 3,
      "p": 0,
      "lo": 0,
      "hi": 0.5615060804490177
     }
    },
    {
     "cat": "横断・比較",
     "asked": 4,
     "planned": 4,
     "questions": 4,
     "plannedQuestions": 4,
     "branded": false,
     "mentions": 0,
     "cites": 0,
     "thin": false,
     "rate": 0,
     "ci": {
      "k": 0,
      "n": 4,
      "p": 0,
      "lo": 0,
      "hi": 0.48990002040399916
     }
    }
   ],
   "competitors": [
    {
     "name": "株式会社LOCUS",
     "count": 2,
     "questions": 2,
     "share": 0.08695652173913043,
     "us": false
    },
    {
     "name": "StockSun株式会社",
     "count": 2,
     "questions": 2,
     "share": 0.08695652173913043,
     "us": false
    },
    {
     "name": "株式会社S.Line",
     "count": 2,
     "questions": 2,
     "share": 0.08695652173913043,
     "us": false
    },
    {
     "name": "株式会社大塚デザイン",
     "count": 2,
     "questions": 2,
     "share": 0.08695652173913043,
     "us": false
    },
    {
     "name": "合同会社ファニプロ",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社タイムシェア",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社フォロアス",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社フォーズン",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社文京映像",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社フラッグシップオーケストラ",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "合同会社ジェイライン",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社プルークス",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社ヒューマンセントリックス",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "株式会社ジーアングル",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "AVILEN",
     "count": 1,
     "questions": 1,
     "share": 0.043478260869565216,
     "us": false
    },
    {
     "name": "Lumenium",
     "count": 0,
     "questions": 0,
     "share": 0,
     "us": true
    }
   ],
   "shareOfVoice": {
    "ours": 0,
    "others": 78,
    "value": 0
   },
   "position": null,
   "sentiment": {
    "positive": 0,
    "neutral": 0,
    "negative": 0
   },
   "citedPages": [
    {
     "url": "https://www.datanyze.com/companies/lumium/353729374",
     "host": "datanyze.com",
     "count": 2
    },
    {
     "url": "https://mynavi-agent.jp/corpdetail/31921/",
     "host": "mynavi-agent.jp",
     "count": 2
    },
    {
     "url": "https://www.biz.ne.jp/corporation/44615/",
     "host": "biz.ne.jp",
     "count": 2
    },
    {
     "url": "https://hnavi.co.jp/knowledge/blog/tokyo_video_companies/",
     "host": "hnavi.co.jp",
     "count": 2
    },
    {
     "url": "https://www.biz.ne.jp/list/video-creator/13_tokyo",
     "host": "biz.ne.jp",
     "count": 2
    },
    {
     "url": "https://atsoho.com/blog/company-video-production-cost",
     "host": "atsoho.com",
     "count": 2
    },
    {
     "url": "https://imitsu.jp/list/event-planning/event-companion/",
     "host": "imitsu.jp",
     "count": 2
    }
   ],
   "ownPages": [],
   "topSources": [
    {
     "name": "biz.ne.jp",
     "count": 16
    },
    {
     "name": "imitsu.jp",
     "count": 9
    },
    {
     "name": "atsoho.com",
     "count": 7
    },
    {
     "name": "stock-sun.com",
     "count": 4
    },
    {
     "name": "hnavi.co.jp",
     "count": 4
    },
    {
     "name": "hrmos.co",
     "count": 3
    },
    {
     "name": "shopowner-support.net",
     "count": 3
    },
    {
     "name": "crowdworks.jp",
     "count": 3
    },
    {
     "name": "meetsmore.com",
     "count": 3
    },
    {
     "name": "lancers.jp",
     "count": 3
    },
    {
     "name": "datanyze.com",
     "count": 2
    },
    {
     "name": "mynavi-agent.jp",
     "count": 2
    }
   ],
   "topCited": [
    {
     "name": "biz.ne.jp",
     "count": 12
    },
    {
     "name": "imitsu.jp",
     "count": 8
    },
    {
     "name": "stock-sun.com",
     "count": 4
    },
    {
     "name": "hnavi.co.jp",
     "count": 4
    },
    {
     "name": "shopowner-support.net",
     "count": 3
    },
    {
     "name": "atsoho.com",
     "count": 3
    },
    {
     "name": "hrmos.co",
     "count": 2
    },
    {
     "name": "datanyze.com",
     "count": 2
    },
    {
     "name": "boxil.jp",
     "count": 2
    },
    {
     "name": "crowdworks.jp",
     "count": 2
    },
    {
     "name": "prtimes.jp",
     "count": 2
    },
    {
     "name": "meetsmore.com",
     "count": 2
    }
   ]
  },
  "actions": [
   {
    "rank": 1,
    "title": "「実在が確認できない」と答えられた質問が 3 件（回答 3 回）",
    "why": "サイトの中で何を書いても、外に裏づけが無いと答えるAIには確認できません。自社サイトだけが情報源の会社は、存在を疑われる側に置かれます。",
    "how": "第三者の面に社名・所在地・代表者・URLを同じ表記で載せる（法人番号公表サイト、求人・発注系のディレクトリ、取引先の実績ページ、プレスリリース）。1件ずつ増やすたびにこの数字は下がります。",
    "evidence": [
     "ルメニウム（Lumenium）とはどんな会社ですか？事業内容と拠点を教えてください。",
     "Lumenium という日本の制作会社は実在しますか？公式サイトはどこですか？",
     "ルメニウムに制作を依頼しても大丈夫ですか？会社の所在地や事業者情報は確認できますか？"
    ],
    "kind": "exists"
   },
   {
    "rank": 2,
    "title": "他社だけが挙がったカテゴリ 7 件",
    "why": "そのカテゴリの質問には答えが出ていて、そこに自社が入っていないということです。需要が無いのではなく、候補として持っていないだけなので、ここは埋められます。",
    "how": "挙がった会社のページと自社の該当ページを並べ、答えに必要な具体（料金の幅・対応範囲・実績数・所在地・連絡手段）が抜けている項目を足す。質問文そのものを見出しにしたページが最短です。",
    "evidence": [
     "動画制作：株式会社LOCUS、合同会社ファニプロ、株式会社タイムシェア、株式会社フォロアス、株式会社フォーズン、株式会社文京映像",
     "AI導入・研修：AVILEN、Aidemy Business、SIGNATE、ARCS、PwCコンサルティング、KPMG",
     "SNS・LINE：株式会社MARKELINK、ミライク、株式会社S.Line、株式会社pamxy、株式会社ハーマンドット、StockSun株式会社",
     "Web制作・システム開発：株式会社ベイジ、株式会社タクト、ココチ株式会社、株式会社サイブリッジ、株式会社イースネット、株式会社メタフェイズ",
     "キャスト手配：MC planning、グーニーズ、株式会社ケイプロモーション、株式会社ファクト、COA株式会社、annonce",
     "クリエイティブ：株式会社ビズアップ、株式会社大塚デザイン、株式会社ラセル、アドアチーブ株式会社、株式会社UNLOGIC",
     "横断・比較：合同会社STUDIO WORKS、一般社団法人Honmono協会、株式会社エーファクト、aicrew株式会社、キヤノンシステムアンドサポート株式会社、common株式会社"
    ],
    "kind": "category"
   },
   {
    "rank": 3,
    "title": "複数の質問で読まれていた情報源 12 件",
    "why": "答えを組み立てる材料にされている面です。そこに載っていない会社は、そもそも材料に入りません。",
    "how": "掲載条件を確認して、載せられるものから載せる（多くは無料の事業者登録）。載ったら次の計測で、その質問の出現率が動くかを見ます。",
    "evidence": [
     "biz.ne.jp（16問で参照）",
     "imitsu.jp（9問で参照）",
     "atsoho.com（7問で参照）",
     "stock-sun.com（4問で参照）",
     "hnavi.co.jp（4問で参照）",
     "hrmos.co（3問で参照）"
    ],
    "kind": "sources"
   },
   {
    "rank": 4,
    "title": "自社サイトが答えの出典になった質問 0 / 28 件",
    "why": "一度も出典になっていません。ページが無いか、その質問に答える形になっていないかのどちらかです。",
    "how": "計測している質問文を、そのままページの見出しにする。答えは最初の2〜3行に置き、そこに金額・対応地域・期間・連絡先を数字で書く。",
    "evidence": [],
    "kind": "cited"
   }
  ],
  "social": null,
  "companiesFailed": false,
  "analysisFailures": []
 }
]
