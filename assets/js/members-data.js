/* ADVO VISIONS - placeholder member dataset (150 members)
   Roles, surnames and given names are combined to create plausible credits.
   Used by members.html and member.html (via ?id=). */

(function (global) {
  const ROLES = [
    "Director", "Cinematographer", "Producer", "Editor",
    "Colorist", "Sound Designer", "Motion Designer", "Art Director",
    "Production Manager", "VFX Supervisor", "Assistant Director", "Stylist",
    "Lighting Designer", "Scriptwriter", "Photographer"
  ];

  const DEPTS = [
    "Direction", "Cinematography", "Post Production",
    "Design", "Production", "Sound & Music"
  ];

  const SURNAMES = [
    "Sato","Suzuki","Takahashi","Tanaka","Ito","Watanabe","Yamamoto","Nakamura",
    "Kobayashi","Kato","Yoshida","Yamada","Sasaki","Yamaguchi","Saito","Matsumoto",
    "Inoue","Kimura","Hayashi","Shimizu","Morita","Abe","Ikeda","Hashimoto",
    "Fujita","Ogawa","Goto","Okada","Hasegawa","Murakami","Kondo","Ishikawa",
    "Nakajima","Maeda","Fujii","Aoki","Ando","Sakamoto","Nishimura","Fukuda",
    "Ota","Miura","Takeuchi","Kaneko","Nakagawa","Harada","Morimoto","Takada",
    "Oshima","Endo"
  ];

  const GIVEN = [
    "Ren","Haruto","Yuto","Sora","Riku","Kaito","Daiki","Takumi",
    "Aoi","Hina","Yui","Sakura","Mei","Rio","Nao","Yuki",
    "Kenta","Sho","Taiga","Hiroto","Ayaka","Miyu","Rina","Akari",
    "Koki","Shota","Yuma","Kaede","Mio","Karen"
  ];

  const BIO_TEMPLATES = [
    "映像表現の境界を越えることをテーマに、国内外のブランド、ファッション、音楽ビデオ領域で活動。現代的な緊張感と詩情を併せ持つ画作りを得意とする。",
    "静と動の対比を軸に、短編映画からグローバルブランドのCMまで幅広く制作。光のグラデーションと身体的リズムに重きを置いた演出で国際映像祭にて複数回の受賞歴を持つ。",
    "ドキュメンタリー出身。被写体との関係の中から立ち上がる「偶然と必然のあいだ」を切り取る。近年はナラティブ広告、企業ブランディングの分野にも領域を広げている。",
    "都市・自然・人という三つの軸を行き来するビジュアルストーリーテラー。繊細なカラーグレーディングと大胆な構図設計が支持され、ラグジュアリー領域のクライアントを多く手がける。",
    "音響とイメージの相互作用を研究するバックグラウンドを生かし、ミュージックフィルム、アートインスタレーション、ブランディング映像を横断して制作している。"
  ];

  const EXPERTISE = [
    ["Narrative","Commercial","Fashion"],
    ["Music Video","Live Film","Documentary"],
    ["Branding","Luxury","Automotive"],
    ["Portrait","Editorial","Beauty"],
    ["Event","Sports","Travel"]
  ];

  // deterministic pseudo-random from index so IDs stay stable across renders
  function seeded(i) {
    let x = Math.sin(i * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }
  function pick(arr, i, salt = 0) {
    return arr[Math.floor(seeded(i + salt) * arr.length)];
  }

  const MEMBERS = Array.from({ length: 150 }, (_, i) => {
    const n = i + 1;
    const surname = pick(SURNAMES, n, 11);
    const given = pick(GIVEN, n, 29);
    const role = pick(ROLES, n, 47);
    const dept = pick(DEPTS, n, 71);
    const bio = pick(BIO_TEMPLATES, n, 103);
    const exp = pick(EXPERTISE, n, 131);
    // use a stable seeded portrait from picsum + randomuser look-alike
    const gender = seeded(n + 200) > 0.5 ? "men" : "women";
    const pid = Math.floor(seeded(n + 300) * 99);
    const year = 2015 + Math.floor(seeded(n + 400) * 10);
    return {
      id: String(n).padStart(3, "0"),
      name: `${surname} ${given}`,
      nameKana: `${surname.toUpperCase()} ${given.toUpperCase()}`,
      role,
      dept,
      bio,
      expertise: exp,
      joined: year,
      portrait: `https://randomuser.me/api/portraits/${gender}/${pid}.jpg`,
      // fallback generic silhouette
      fallback: `https://picsum.photos/seed/advo-${n}/400/400`
    };
  });

  global.ADVO_MEMBERS = MEMBERS;
  global.ADVO_DEPTS = DEPTS;
})(window);
