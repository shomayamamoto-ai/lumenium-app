/* AdvoVisions — 150 placeholder talents (芸能事務所所属タレント)
   Categories: 俳優 / 女優 / モデル / アーティスト / 声優 / タレント / パフォーマー
   Used by talents.html and talent.html (via ?id=).
   Renders via window.ADVO_MEMBERS for backwards compatibility. */

(function (global) {
  const SURNAMES = [
    "佐藤","鈴木","高橋","田中","伊藤","渡辺","山本","中村",
    "小林","加藤","吉田","山田","佐々木","山口","斎藤","松本",
    "井上","木村","林","清水","森田","阿部","池田","橋本",
    "藤田","小川","後藤","岡田","長谷川","村上","近藤","石川",
    "中島","前田","藤井","青木","安藤","坂本","西村","福田",
    "太田","三浦","竹内","金子","中川","原田","森本","高田",
    "大島","遠藤","星野","柴田","新井","篠原","片桐","小野",
    "菅原","宮本","若林","矢野"
  ];
  const GIVEN_F = [
    "葵","彩","結衣","さくら","美月","愛","優","花",
    "陽菜","琴音","心音","玲奈","莉子","凛","茉莉","美咲",
    "由衣","千夏","百花","真帆","澪","紗英","栞","美穂"
  ];
  const GIVEN_M = [
    "蓮","陽翔","悠真","樹","湊","新","翔太","海斗",
    "大翔","拓海","颯","陸","悠人","旭","涼","匠",
    "慧","亮介","遼","航平","直人","大地","一翔","寛太"
  ];
  const KATAKANA_NAMES = [
    "RIKU","SORA","RYO","MAYU","EMI","KANA","JIN","AIRI","NOA","TSUBASA"
  ];

  // (category, role label, gender weight M/F/B, bio archetype, skill pool)
  const CATEGORIES = [
    {
      dept: "俳優",
      roles: ["俳優", "若手俳優", "ベテラン俳優", "舞台俳優", "子役出身"],
      skills: ["殺陣", "乗馬", "舞台殺陣", "ダンス", "英会話", "ボクシング", "和太鼓", "書道", "殺陣指導"],
      bio: [
        "舞台とドラマを軸に、近年は映画主演作も続く若手俳優。丁寧な役作りと、身体性を伴った繊細な芝居で評価を集める。",
        "連続ドラマ・映画・舞台まで幅広く活動。どんな役にも自然に入り込む憑依型の演技で、業界内の支持も厚い。",
        "骨太な役柄からコメディまで、振れ幅の広い演技が魅力。近年は国際共同制作作品への出演も増えている。",
        "子役時代から映像作品に出演。思春期を経て、繊細な内面表現のできる俳優として再評価されている。"
      ]
    },
    {
      dept: "女優",
      roles: ["女優", "若手女優", "ベテラン女優", "舞台女優"],
      skills: ["バレエ", "茶道", "日本舞踊", "フランス語", "ピアノ", "乗馬", "ジャズダンス", "書道", "フィギュアスケート"],
      bio: [
        "透明感ある佇まいと芯のある芝居で、映画・ドラマ・CMの第一線で活躍。国内外の映画祭にて受賞歴あり。",
        "繊細で凜とした演技が魅力。主演映画が続き、ファッション・美容雑誌の表紙を飾る機会も多い。",
        "オリジナル脚本の映画・ドラマで存在感を発揮。監督や脚本家からの指名が絶えない実力派。",
        "舞台出身で、生身の表現力に定評。近年は主演映画が国際映画祭でも評価されている。"
      ]
    },
    {
      dept: "モデル",
      roles: ["モデル", "ファッションモデル", "専属モデル", "メンズモデル"],
      skills: ["ランウェイ", "ポージング", "ウォーキング指導", "英会話", "韓国語", "スタイリング", "写真", "ヨガ"],
      bio: [
        "国内外のランウェイ・広告キャンペーンで活躍するモデル。東京・パリ・ミラノを行き来する。",
        "ファッション誌の専属モデル。独自のスタイル感と透明感で支持され、アートディレクションも手がける。",
        "広告・カタログ・エディトリアルまで幅広く活動。近年は俳優としての活動領域も広げている。"
      ]
    },
    {
      dept: "アーティスト",
      roles: ["シンガーソングライター", "ボーカリスト", "ラッパー", "ピアニスト", "ダンサー兼シンガー"],
      skills: ["ギター", "ピアノ", "作詞作曲", "英語詞", "韓国語詞", "DTM", "ダンス振付", "プロデュース"],
      bio: [
        "自作の楽曲で国内外の音楽シーンから注目を集めるアーティスト。映画・ドラマ主題歌の提供も多数。",
        "繊細な歌声と独自の世界観で支持を広げる。配信リリースごとにチャート上位にランクイン。",
        "ライブパフォーマンスに定評。フェス出演、海外ツアー、タイアップなど多面的に展開中。",
        "音楽プロデューサー兼シンガー。劇伴・アーティスト楽曲制作まで幅広く請け負う。"
      ]
    },
    {
      dept: "声優",
      roles: ["声優", "ナレーター", "吹き替え声優", "アニメ声優"],
      skills: ["アフレコ", "ナレーション", "歌唱", "英語ナレーション", "方言", "朗読", "ラジオDJ"],
      bio: [
        "アニメ・吹き替え・ナレーションを横断する声の表現者。声質の幅広さで国内外の作品に起用される。",
        "深く落ち着いた声質で、CMナレーション・ドキュメンタリーを中心に活動。近年はゲーム主要キャラも担当。",
        "アニメ主要キャラクターでブレイク。繊細な感情表現と歌唱力を兼ね備えたアーティスト型声優。"
      ]
    },
    {
      dept: "タレント",
      roles: ["タレント", "MC", "リポーター", "バラエティタレント"],
      skills: ["MC", "司会進行", "英会話", "スポーツ実況", "旅行", "料理", "ギター", "モノマネ"],
      bio: [
        "情報番組のMCを務めるオールラウンダー。バラエティ・報道・CMと幅広く活躍している。",
        "旅番組・グルメ番組でブレイク。親しみやすい人柄と独自の感性で、ファン層を広げ続けている。",
        "ラジオ・テレビ・イベントMCを中心に活動。フットワークの軽さと高い言語化力が評価される。"
      ]
    },
    {
      dept: "パフォーマー",
      roles: ["ダンサー", "パフォーマー", "舞踏家", "アクロバット", "振付師"],
      skills: ["HIPHOP", "ジャズダンス", "コンテンポラリー", "バレエ", "振付", "殺陣", "アクション", "バク転"],
      bio: [
        "国内外のステージで踊るコンテンポラリーダンサー／振付家。ブランドや広告のビジュアル振付も手がける。",
        "アクションチームに所属しながら俳優としても活動。スタントと演技の両面で現場をサポート。",
        "ショー・フェス・ライブツアーでバックダンサー／フロントパフォーマーとして活動するダンサー。"
      ]
    }
  ];

  // deterministic pseudo-random
  function seeded(i) {
    let x = Math.sin(i * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }
  function pick(arr, i, salt = 0) {
    return arr[Math.floor(seeded(i + salt) * arr.length)];
  }
  function pickN(arr, count, seed) {
    const pool = [...arr];
    const out = [];
    for (let k = 0; k < count && pool.length; k++) {
      const idx = Math.floor(seeded(seed + k * 13) * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  const BIRTH_CITIES = [
    "東京都", "神奈川県", "大阪府", "京都府", "福岡県",
    "北海道", "愛知県", "宮城県", "沖縄県", "広島県",
    "長野県", "静岡県", "兵庫県", "新潟県"
  ];
  const BLOOD_TYPES = ["A", "B", "O", "AB"];

  const MEMBERS = Array.from({ length: 150 }, (_, i) => {
    const n = i + 1;
    const cat = pick(CATEGORIES, n, 7);
    // gender leaning by category
    const femaleWeight = cat.dept === "女優" ? 1
                     : cat.dept === "俳優" ? 0
                     : cat.dept === "モデル" ? (seeded(n + 200) > 0.5 ? 1 : 0)
                     : seeded(n + 200);
    const isFemale = femaleWeight > 0.5;
    const surname = pick(SURNAMES, n, 11);
    const given = isFemale ? pick(GIVEN_F, n, 29) : pick(GIVEN_M, n, 29);
    // about 10% of talents use a katakana stage name
    const useKata = seeded(n + 500) > 0.9;
    const nameJa = useKata ? pick(KATAKANA_NAMES, n, 37) : `${surname}${given}`;
    const romaji = useKata ? nameJa : `${surname} ${given}`.toUpperCase();

    const role = pick(cat.roles, n, 47);
    const bio = pick(cat.bio, n, 103);
    const skills = pickN(cat.skills, 3, n * 3 + 51);
    const birthCity = pick(BIRTH_CITIES, n, 83);
    const blood = pick(BLOOD_TYPES, n, 113);
    const debutYear = 2005 + Math.floor(seeded(n + 400) * 20);

    // heights: 150-190
    const height = isFemale
      ? 150 + Math.floor(seeded(n + 600) * 25)
      : 165 + Math.floor(seeded(n + 600) * 25);

    // portraits — use randomuser.me (higher quality) with picsum fallback
    const gender = isFemale ? "women" : "men";
    const pid = Math.floor(seeded(n + 300) * 99);

    return {
      id: String(n).padStart(3, "0"),
      name: nameJa,
      nameKana: romaji,
      role,
      dept: cat.dept,
      bio,
      expertise: skills,
      birthCity,
      blood,
      height,
      joined: debutYear,
      portrait: `https://randomuser.me/api/portraits/${gender}/${pid}.jpg`,
      fallback: `https://picsum.photos/seed/advo-${n}/600/800`
    };
  });

  // filmography / appearances generator (deterministic per member)
  const FILM_CLIENTS = {
    "俳優": [
      ["映画", "『静かな海の底』主演（監督：黒澤 遼）"],
      ["連続ドラマ", "『東京エレクトリック』第2話ゲスト"],
      ["舞台", "『マクベス』マクベス役（新国立劇場）"],
      ["CM", "NIKKO MOTORS『The Drive Beyond』"],
      ["映画", "『夜が明けるまで』助演"]
    ],
    "女優": [
      ["映画", "『光の庭』主演（カンヌ映画祭正式出品）"],
      ["連続ドラマ", "『銀河前線』ヒロイン役"],
      ["CM", "資生堂 新フレグランスキャンペーン"],
      ["舞台", "『かもめ』ニーナ役"],
      ["雑誌", "VOGUE JAPAN 表紙"]
    ],
    "モデル": [
      ["ランウェイ", "Paris Fashion Week — MAISON IKKO"],
      ["広告", "UNIQLO Global Campaign"],
      ["雑誌", "non-no 専属モデル"],
      ["キャンペーン", "Cartier アジアビジュアル"],
      ["TV", "FNS モデルオブザイヤー出演"]
    ],
    "アーティスト": [
      ["シングル", "『Moonsick』配信リリース"],
      ["アルバム", "1st Album『Hours of Becoming』"],
      ["タイアップ", "ドラマ『銀河前線』主題歌"],
      ["ライブ", "Zepp Tour 2025 全国6都市"],
      ["フェス", "SUMMER SONIC 出演"]
    ],
    "声優": [
      ["アニメ", "『夜明けのルーメン』主役"],
      ["吹替", "映画『City of Glass』主人公"],
      ["ゲーム", "『Chronos Saga』メインキャラクター"],
      ["ナレーション", "NHK ドキュメンタリー『手しごと』"],
      ["朗読劇", "『銀河鉄道の夜』出演"]
    ],
    "タレント": [
      ["レギュラー", "毎週金曜『News Lounge』MC"],
      ["特番", "『世界は今』年末特番メイン司会"],
      ["ラジオ", "J-WAVE『Tokyo Daydream』パーソナリティ"],
      ["CM", "伊藤園『おーいお茶』"],
      ["連載", "雑誌CREAエッセイ連載"]
    ],
    "パフォーマー": [
      ["ショー", "SHISEIDO ブランドキャンペーン振付"],
      ["ツアー", "Perfume Tour 2025 バックダンサー"],
      ["CM", "au KDDI キャラクターダンス"],
      ["映画", "『夜明けのルーメン』アクション指導"],
      ["舞台", "『Cirque du Tokyo』メインアクト"]
    ]
  };

  MEMBERS.forEach(m => {
    const pool = FILM_CLIENTS[m.dept] || FILM_CLIENTS["俳優"];
    m.filmography = pickN(pool, 4, parseInt(m.id, 10) * 7);
  });

  // Recent news per talent (2-3 items)
  MEMBERS.forEach(m => {
    const n = parseInt(m.id, 10);
    const items = [
      { date: "2026.03.12", text: `新作映画『光の庭』先行プレビュー上映会にゲスト出演しました。` },
      { date: "2026.02.20", text: `ブランドキャンペーン KITO Watches の新作ビジュアルが公開されました。` },
      { date: "2026.01.28", text: `配信シングル「Reflections」がストリーミング月間再生数1,000万回を突破。` },
      { date: "2025.12.14", text: `第38回 日本映像大賞 新人賞を受賞しました。` },
      { date: "2025.11.02", text: `連続ドラマ「銀河前線」第2話より出演いたします。` }
    ];
    m.news = pickN(items, 2 + Math.floor(seeded(n + 900) * 2), n + 42);
  });

  global.ADVO_MEMBERS = MEMBERS;
  global.ADVO_DEPTS = CATEGORIES.map(c => c.dept);
})(window);
