// 静的ページに埋め込む3D（src/lib/lumen3d.js の写し /lumen3d.js を読む）。
//
// 本文は中央の細い列にあるので、結晶は文章の後ろには置きません。
//   ・広い画面 … 右の余白の中央
//   ・狭い画面 … 右上の角に小さく（ページの紋章のように）
// ページの一番上の画面ぶんだけに置き、スクロールすれば一緒に流れて
// いきます。読み始めたあとまで視界に居座らないためです。
//
// 最初の表示を遅くしないよう、画面が落ち着いてから読み込みます。
// 3Dが使えない端末では何も起きません。
export const LUMEN3D_STYLE = `.lumen3d-page{position:absolute;top:0;left:0;width:100%;height:100vh;z-index:-1;pointer-events:none;opacity:0;transition:opacity 1.2s ease}.lumen3d-page.is-on{opacity:1}`

export const LUMEN3D_TAG = `<canvas class="lumen3d-page" aria-hidden="true"></canvas>
<script type="module">(()=>{const c=document.querySelector('.lumen3d-page');if(!c)return;
const place=()=>{const w=c.clientWidth,h=c.clientHeight;
if(w>=1100){const g=(w-760)/2;return{x:w/2+380+g/2,y:Math.min(h*0.34,300),r:Math.min(g*0.34,120)}}
return{x:w-44,y:44,r:Math.min(30,w*0.08)}};
const go=()=>import('/lumen3d.js').then(m=>m.mountLumen3D(c,{mode:'subtle',focus:place,onFirstFrame:()=>c.classList.add('is-on')})).catch(()=>{});
(window.requestIdleCallback||((f)=>setTimeout(f,400)))(go,{timeout:2500})})()</script>`
