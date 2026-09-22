// 静的ページ（about.html, pricing.html, services/*.html …）に埋め込む計測。
//
// アプリ側は src/lib/pageview.js が同じことをしますが、静的ページは
// React を読み込まないので、小さな素の JavaScript を直接置いています。
// これまで同じ一行が3か所に写されていました。片方だけ直せば片方は古い
// まま——そして「直したのに一部のページだけ変わらない」は、原因の
// 見えない止まり方の典型です。1か所にまとめます。
//
// 数えるのは5つです。
//   ・そのページが開かれたこと（と、どこから来たか）
//   ・半分まで来たこと / 終わりまで来たこと
//   ・電話・LINE・メール・外部リンクを押したこと
//   ・そのページを最後にサイトを離れたこと
//
// 閲覧数は「開かれた」までしか言いません。開いてすぐ閉じたのか最後まで
// 読んだのかが分からないと、文章が効いているかを判断できず、直す場所も
// 選べません。
//
// 電話や LINE は問い合わせフォームを通らないので、導線の数字には一切
// 出てきません。「送信した 0」のまま実は電話が鳴っていた、が起こります。
//
// 自分のアクセスは数えません。印はこの端末の localStorage にだけ置き、
// 訪問者の端末には何も置きません（cookie も使いません）。

export const BEACON = `<script>(function(){try{
/* 「数から外す」は送るたびに見ます。開いた時に一度だけ見る作りだと、
   管理画面で外した直後に、既に開いているページが送り続けます。 */
var off=function(){try{return localStorage.getItem('lum_notrack')==='1'}catch(e){return false}};
if(off())return;
var s=function(b){if(off())return;try{fetch('/api/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b),keepalive:true,credentials:'omit'}).catch(function(){})}catch(e){}};
var p=location.pathname.replace(/\\/$/,'')||'/';
s({p:p,r:document.referrer||''});
var seen={},c=function(){var d=document.documentElement,h=d.scrollHeight-innerHeight,r=h<=40?1:(scrollY||0)/h;
if(r>=0.5&&!seen.h){seen.h=1;s({p:p,e:'read_half'})}
if(r>=0.9&&!seen.e){seen.e=1;s({p:p,e:'read_end'})}};
var w=0;addEventListener('scroll',function(){if(w)return;w=1;requestAnimationFrame(function(){w=0;c()})},{passive:true});
setTimeout(c,1500);
var host=location.hostname.replace(/^www\\./,''),inside=false;
document.addEventListener('click',function(ev){
var a=ev.target&&ev.target.closest?ev.target.closest('a[href]'):null;if(!a)return;
var href=a.getAttribute('href')||'';
if(href.indexOf('tel:')===0){s({p:p,e:'click_tel'});return}
if(href.indexOf('mailto:')===0){s({p:p,e:'click_mail'});return}
var u;try{u=new URL(href,location.href)}catch(x){return}
if(!/^https?:$/.test(u.protocol))return;
var h=u.hostname.replace(/^www\\./,'');
if(h===host){inside=true;setTimeout(function(){inside=false},2000);return}
if(/(^|\\.)line\\.me$|(^|\\.)lin\\.ee$/.test(h)){s({p:p,e:'click_line'});return}
s({p:p,e:'click_out',d:h});
},true);
var gone=false,leave=function(){if(gone||inside||document.visibilityState!=='hidden')return;gone=true;s({p:p,e:'exit'})};
document.addEventListener('visibilitychange',leave);addEventListener('pagehide',leave);
}catch(e){}})();</script>`.replace(/\n/g, '')
