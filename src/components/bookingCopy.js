// 予約欄（QuickBook・BookingPicker）の言い回し。
//
// 長さ・呼び方・メニュー・オンラインかどうかは、管理画面の「予約管理」で
// 決めたもの（/api/booking が返す minutes / wording / services / online）から
// 作ります。「30分」「最大1時間」のような数字をここに書くと、決まりを
// 変えたときに画面だけが古いまま残るためです。
//
// 「費用はかかりません」は、呼び方が商談・相談で、メニューに料金が書かれて
// いないときだけ出します（サロンの予約に「無料」と出ないように）。

export function bookingCopy(info) {
  const i = info || {}
  const services = i.services || []
  const svc = services.find((s) => s.id === i.service) || services[0] || null
  const minutes = (svc && svc.minutes) || i.minutes || 60
  const wording = i.wording || '商談'
  const online = i.online !== false
  const consult = wording === '商談' || wording === '相談'
  const price = svc && svc.price ? svc.price : ''
  const free = consult && !price
  const tail = price ? `、料金の目安は${price}です。` : free ? '、費用はかかりません。' : 'です。'
  const heading = consult
    ? (free ? (online ? '無料のオンライン相談を、いま予約する' : '無料のご相談を、いま予約する') : 'ご相談の日時を、いま予約する')
    : wording === '来店' ? 'ご来店の日時を、いま予約する' : '空いている日時から、いま予約する'
  return {
    minutes,
    wording,
    online,
    services,
    heading,
    length: `お時間は${minutes}分${tail}`,
    pickerTitle: `このまま${wording}のお時間も決められます`,
    pickerLead: (i.mode === 'google' ? 'ご都合のよい枠を選ぶと、その場で確定します。' : 'ご都合のよい枠を選ぶと、その場でお時間を確保します（確定のご連絡は後ほどお送りします）。')
      + `${online ? 'オンライン（Google Meet）で' : ''}${minutes}分${tail}`,
    doneInvited: 'カレンダーへの登録と招待メールの送信まで完了しました。' + (online ? '当日はメールのURLからご参加ください。' : ''),
    doneHeld: online ? 'お時間を確保しました。オンライン会議のURLを添えて、確定のご連絡をお送りします。' : 'お時間を確保しました。確定のご連絡をお送りします。',
    doneTitle: (invited) => (invited ? `✓ ${wording}のお時間が確定しました` : `✓ ${wording}のお時間を確保しました`),
  }
}
