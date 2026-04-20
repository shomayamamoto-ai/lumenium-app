/* AdvoVisions — 150 placeholder talents
   Categories (8): 男性アクター / 女性アクター / 男性モデル / 女性モデル /
                   男性歌手 / 女性歌手 / 男性声優 / 女性声優 */

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

  const CATEGORIES = [
    {
      dept: "男性アクター", gender: "M",
      roles: ["俳優", "若手俳優", "ベテラン俳優", "舞台俳優"],
      skills: ["殺陣", "乗馬", "ボクシング", "ダンス", "英会話", "和太鼓", "書道", "アクション"],
      bio: [
        "舞台とドラマを軸に、近年は映画主演作も続く若手俳優。繊細な芝居で評価を集める。",
        "連続ドラマ・映画・舞台まで幅広く活動。憑依型の演技で業界内の支持も厚い。",
        "骨太な役柄からコメディまで、振れ幅の広い演技が魅力。",
        "子役時代から映像作品に出演。思春期を経て繊細な内面表現のできる俳優として再評価されている。"
      ],
      films: [
        ["映画", "『静かな海の底』主演（監督：黒澤 遼）"],
        ["連続ドラマ", "『東京エレクトリック』第2話ゲスト"],
        ["舞台", "『マクベス』マクベス役（新国立劇場）"],
        ["CM", "NIKKO MOTORS『The Drive Beyond』"],
        ["映画", "『夜が明けるまで』助演"]
      ]
    },
    {
      dept: "女性アクター", gender: "F",
      roles: ["女優", "若手女優", "ベテラン女優", "舞台女優"],
      skills: ["バレエ", "茶道", "日本舞踊", "フランス語", "ピアノ", "乗馬", "ジャズダンス", "書道"],
      bio: [
        "透明感ある佇まいと芯のある芝居で、映画・ドラマ・CMの第一線で活躍。",
        "繊細で凜とした演技が魅力。主演映画が続き、ファッション誌の表紙を飾る機会も多い。",
        "オリジナル脚本の映画・ドラマで存在感を発揮。監督や脚本家からの指名が絶えない実力派。",
        "舞台出身で、生身の表現力に定評。主演映画が国際映画祭でも評価されている。"
      ],
      films: [
        ["映画", "『光の庭』主演（カンヌ映画祭正式出品）"],
        ["連続ドラマ", "『銀河前線』ヒロイン役"],
        ["CM", "資生堂 新フレグランスキャンペーン"],
        ["舞台", "『かもめ』ニーナ役"],
        ["雑誌", "VOGUE JAPAN 表紙"]
      ]
    },
    {
      dept: "男性モデル", gender: "M",
      roles: ["モデル", "メンズモデル", "広告モデル", "ランウェイモデル"],
      skills: ["ランウェイ", "ポージング", "英会話", "韓国語", "スタイリング", "フィットネス", "写真"],
      bio: [
        "国内外のランウェイ・広告キャンペーンで活躍するモデル。東京・パリ・ミラノを行き来する。",
        "メンズ誌の専属モデル。独自のスタイル感で支持され、俳優業にも活動を広げている。",
        "広告・カタログ・エディトリアルを横断。近年はブランドアンバサダー契約も複数。"
      ],
      films: [
        ["ランウェイ", "Tokyo Fashion Week — ATTACHMENT"],
        ["広告", "UNIQLO U キャンペーン"],
        ["雑誌", "UOMO 専属モデル"],
        ["キャンペーン", "SHISEIDO MEN 広告"],
        ["TV", "FNS モデルオブザイヤー出演"]
      ]
    },
    {
      dept: "女性モデル", gender: "F",
      roles: ["モデル", "ファッションモデル", "専属モデル", "広告モデル"],
      skills: ["ランウェイ", "ポージング", "英会話", "韓国語", "スタイリング", "ヨガ", "写真"],
      bio: [
        "国内外のランウェイ・広告キャンペーンで活躍するモデル。東京・パリ・ミラノを行き来する。",
        "ファッション誌の専属モデル。独自のスタイル感と透明感で支持され、アートディレクションも手がける。",
        "広告・カタログ・エディトリアルまで幅広く活動。近年は俳優としての活動領域も広げている。"
      ],
      films: [
        ["ランウェイ", "Paris Fashion Week — MAISON IKKO"],
        ["広告", "UNIQLO Global Campaign"],
        ["雑誌", "non-no 専属モデル"],
        ["キャンペーン", "Cartier アジアビジュアル"],
        ["TV", "FNS モデルオブザイヤー出演"]
      ]
    },
    {
      dept: "男性歌手", gender: "M",
      roles: ["シンガー", "シンガーソングライター", "ラッパー", "ボーカリスト"],
      skills: ["ギター", "作詞作曲", "DTM", "ラップ", "英語詞", "韓国語詞", "プロデュース"],
      bio: [
        "自作の楽曲で国内外の音楽シーンから注目を集めるアーティスト。映画・ドラマ主題歌の提供も多数。",
        "繊細な歌声と独自の世界観で支持を広げる。配信リリースごとにチャート上位にランクイン。",
        "ライブパフォーマンスに定評。フェス出演、海外ツアー、タイアップなど多面的に展開中。"
      ],
      films: [
        ["シングル", "『Moonsick』配信リリース"],
        ["アルバム", "1st Album『Hours of Becoming』"],
        ["タイアップ", "ドラマ『銀河前線』主題歌"],
        ["ライブ", "Zepp Tour 2025 全国6都市"],
        ["フェス", "SUMMER SONIC 出演"]
      ]
    },
    {
      dept: "女性歌手", gender: "F",
      roles: ["シンガー", "シンガーソングライター", "ボーカリスト", "ピアノ弾き語り"],
      skills: ["ピアノ", "作詞作曲", "ギター", "英語詞", "韓国語詞", "ダンス振付", "プロデュース"],
      bio: [
        "自作の楽曲で国内外の音楽シーンから注目を集めるアーティスト。映画・ドラマ主題歌の提供も多数。",
        "繊細な歌声と独自の世界観で支持を広げる。配信リリースごとにチャート上位にランクイン。",
        "ライブパフォーマンスに定評。フェス出演、海外ツアー、タイアップなど多面的に展開中。"
      ],
      films: [
        ["シングル", "『夜明けの灯』配信リリース"],
        ["アルバム", "1st Album『Still, Moving』"],
        ["タイアップ", "ドラマ『光の庭』主題歌"],
        ["ライブ", "Billboard Live 全国ツアー"],
        ["フェス", "FUJI ROCK FESTIVAL 出演"]
      ]
    },
    {
      dept: "男性声優", gender: "M",
      roles: ["声優", "ナレーター", "吹き替え声優", "アニメ声優"],
      skills: ["アフレコ", "ナレーション", "歌唱", "英語ナレーション", "方言", "朗読"],
      bio: [
        "アニメ・吹き替え・ナレーションを横断する声の表現者。声質の幅広さで国内外の作品に起用される。",
        "深く落ち着いた声質で、CMナレーション・ドキュメンタリーを中心に活動。",
        "アニメ主要キャラクターでブレイク。繊細な感情表現と歌唱力を兼ね備えたアーティスト型声優。"
      ],
      films: [
        ["アニメ", "『夜明けのルーメン』主役"],
        ["吹替", "映画『City of Glass』主人公"],
        ["ゲーム", "『Chronos Saga』メインキャラクター"],
        ["ナレーション", "NHK ドキュメンタリー『手しごと』"],
        ["朗読劇", "『銀河鉄道の夜』出演"]
      ]
    },
    {
      dept: "女性声優", gender: "F",
      roles: ["声優", "ナレーター", "吹き替え声優", "アニメ声優"],
      skills: ["アフレコ", "ナレーション", "歌唱", "英語ナレーション", "方言", "朗読", "ラジオDJ"],
      bio: [
        "アニメ・吹き替え・ナレーションを横断する声の表現者。声質の幅広さで国内外の作品に起用される。",
        "透明感ある声質で、CM・アニメ・ゲームを中心に活動。",
        "アニメ主要キャラクターでブレイク。繊細な感情表現と歌唱力を兼ね備えたアーティスト型声優。"
      ],
      films: [
        ["アニメ", "『光の檻』ヒロイン"],
        ["吹替", "海外ドラマ『Silent Night』主人公"],
        ["ゲーム", "『Aether Tale』主要キャラクター"],
        ["ナレーション", "資生堂 TVCM ナレーション"],
        ["ラジオ", "J-WAVE レギュラー"]
      ]
    }
  ];

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

  const N = 150;
  const MEMBERS = Array.from({ length: N }, (_, i) => {
    const n = i + 1;
    // Round-robin through 8 categories so counts are balanced
    const cat = CATEGORIES[(n - 1) % CATEGORIES.length];
    const isFemale = cat.gender === "F";

    const surname = pick(SURNAMES, n, 11);
    const given = isFemale ? pick(GIVEN_F, n, 29) : pick(GIVEN_M, n, 29);
    const useKata = seeded(n + 500) > 0.9;
    const nameJa = useKata ? pick(KATAKANA_NAMES, n, 37) : `${surname}${given}`;
    const romaji = useKata ? nameJa : `${surname} ${given}`.toUpperCase();

    const role = pick(cat.roles, n, 47);
    const bio = pick(cat.bio, n, 103);
    const skills = pickN(cat.skills, 3, n * 3 + 51);
    const filmography = pickN(cat.films, 4, n * 7);
    const birthCity = pick(BIRTH_CITIES, n, 83);
    const blood = pick(BLOOD_TYPES, n, 113);
    const debutYear = 2005 + Math.floor(seeded(n + 400) * 20);
    const height = isFemale
      ? 150 + Math.floor(seeded(n + 600) * 25)
      : 165 + Math.floor(seeded(n + 600) * 25);

    const genderFolder = isFemale ? "women" : "men";
    const pid = Math.floor(seeded(n + 300) * 99);

    const newsPool = [
      { date: "2026.03.12", text: "新作映画『光の庭』先行プレビュー上映会にゲスト出演しました。" },
      { date: "2026.02.20", text: "ブランドキャンペーン KITO Watches の新作ビジュアルが公開されました。" },
      { date: "2026.01.28", text: "配信シングル「Reflections」がストリーミング月間再生数1,000万回を突破。" },
      { date: "2025.12.14", text: "第38回 日本映像大賞 新人賞を受賞しました。" },
      { date: "2025.11.02", text: "連続ドラマ「銀河前線」第2話より出演いたします。" }
    ];
    const news = pickN(newsPool, 2 + Math.floor(seeded(n + 900) * 2), n + 42);

    return {
      id: String(n).padStart(3, "0"),
      name: nameJa,
      nameKana: romaji,
      role,
      dept: cat.dept,
      gender: cat.gender,
      bio,
      expertise: skills,
      birthCity,
      blood,
      height,
      joined: debutYear,
      filmography,
      news,
      portrait: `https://randomuser.me/api/portraits/${genderFolder}/${pid}.jpg`,
      fallback: `https://picsum.photos/seed/advo-${n}/600/800`
    };
  });

  global.ADVO_MEMBERS = MEMBERS;
  global.ADVO_DEPTS = CATEGORIES.map(c => c.dept);
})(window);
