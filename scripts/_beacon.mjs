// 静的ページ（about.html, pricing.html, services/*.html …）に埋め込む計測。
//
// アプリ側は src/lib/pageview.js が同じことをしますが、静的ページは
// React を読み込まないので、小さな素の JavaScript を直接置いています。
// これまで同じ一行が3か所に写されていました。片方だけ直せば片方は古い
// まま——そして「直したのに一部のページだけ変わらない」は、原因の
// 見えない止まり方の典型です。1か所にまとめます。
//
// 数えるのは3つだけです。
//   ・そのページが開かれたこと（と、どこから来たか）
//   ・半分まで来たこと
//   ・終わりまで来たこと
//
// 閲覧数は「開かれた」までしか言いません。開いてすぐ閉じたのか最後まで
// 読んだのかが分からないと、文章が効いているかを判断できず、直す場所も
// 選べません。
//
// 自分のアクセスは数えません。印はこの端末の localStorage にだけ置き、
// 訪問者の端末には何も置きません（cookie も使いません）。

export const BEACON = `<script>(function(){try{
try{if(localStorage.getItem('lum_notrack')==='1')return}catch(e){}
var s=function(b){try{fetch('/api/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b),keepalive:true,credentials:'omit'}).catch(function(){})}catch(e){}};
var p=location.pathname.replace(/\\/$/,'')||'/';
s({p:p,r:document.referrer||''});
var seen={},c=function(){var d=document.documentElement,h=d.scrollHeight-innerHeight,r=h<=40?1:(scrollY||0)/h;
if(r>=0.5&&!seen.h){seen.h=1;s({p:p,e:'read_half'})}
if(r>=0.9&&!seen.e){seen.e=1;s({p:p,e:'read_end'})}};
var w=0;addEventListener('scroll',function(){if(w)return;w=1;requestAnimationFrame(function(){w=0;c()})},{passive:true});
setTimeout(c,1500);
}catch(e){}})();</script>`.replace(/\n/g, '')
