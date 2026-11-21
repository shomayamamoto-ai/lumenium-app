const fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'index.html'),'utf8');
const src=html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const m={exports:{}}; new Function('module',src)(m);
const E=m.exports; let fails=0;
const eq=(name,got,exp)=>{const ok=got===exp; if(!ok)fails++; console.log((ok?'OK  ':'NG  ')+name+' => '+got+(ok?'':' (expected '+exp+')'));};
const near=(name,got,exp,tol)=>{const ok=Math.abs(got-exp)<=tol; if(!ok)fails++; console.log((ok?'OK  ':'NG  ')+name+' => '+got+' (≈'+exp+' ±'+tol+')');};
const c26=E.YEARCFG[2026], c25=E.YEARCFG[2025];
const mk=(year=2026, f)=>{ const D={v:1,year,wallets:[{id:'b',name:'口座',kind:'bank'},{id:'c',name:'カード',kind:'card'},{id:'cash',name:'現金',kind:'cash'}],txs:[],assets:[],rules:[],years:{}}; const Y=E.yearOf(D); if(f) f(D,Y); return D; };
const inc=(date,amount,extra={})=>({id:Math.random()+'',type:'income',date,acct:'売上高',amount,wallet:'b',tax:'10',wh:0,...extra});
const exp=(date,amount,acct='消耗品費',extra={})=>({id:Math.random()+'',type:'expense',date,acct,amount,wallet:'b',tax:'10',ratio:100,...extra});

console.log('--- 所得税の基本 ---');
eq('所得税 課税300万',E.incomeTax(3000000),202500);
eq('所得税 課税1000万',E.incomeTax(10000000),1764000);
eq('所得税 課税4000万',E.incomeTax(40000000),13204000);
console.log('--- 給与所得控除（令和8年分は220万円以下一律74万円） ---');
eq('R8 給与 178万',E.salaryIncome(1780000,c26),1040000);
eq('R8 給与 2,199,000',E.salaryIncome(2199000,c26),1459000);
eq('R8 給与 2,200,000',E.salaryIncome(2200000,c26),1460000);
eq('R8 給与 2,201,000',E.salaryIncome(2201000,c26),1460000);
eq('R8 給与 500万',E.salaryIncome(5000000,c26),3560000);
eq('R7 給与 200万',E.salaryIncome(2000000,c25),1320000);
eq('R7 給与 190万',E.salaryIncome(1900000,c25),1250000);
console.log('--- 年齢（12/31時点・1月1日生まれ） ---');
eq('2004-01-01生 → 2026年末',E.ageOf({birth:'2004-01-01'},2026),23);
eq('2004-01-02生 → 2026年末',E.ageOf({birth:'2004-01-02'},2026),22);
eq('年齢未入力',E.ageOf({age:''},2026),null);
console.log('--- 中古資産の耐用年数（簡便法） ---');
eq('普通車6年・経過48か月',E.usedLife(6,48),2);
eq('普通車6年・経過24か月',E.usedLife(6,24),4);
eq('PC4年・全部経過',E.usedLife(4,60),2);
eq('建物附属15年・経過60か月',E.usedLife(15,60),11);
console.log('--- 地震保険（旧長期を含む） ---');
eq('所得税 地震3万+旧長期1.5万',E.quakeDed(30000,15000),42500);
eq('住民税 地震3万+旧長期1.5万',E.quakeDedR(30000,15000),25000);
console.log('--- 所得金額調整控除 ---');
{ const D=mk(2026,(D,Y)=>{Y.salary.revenue=9000000;Y.blue='white';Y.deps.push({name:'子',birth:'2015-05-05',income:0});});
  const R=E.compute(D); eq('給与900万・子あり 調整控除',R.tax.incomeAdj,50000); eq('給与所得',R.tax.salaryInc,9000000-1950000-50000); }
console.log('--- 勤労学生控除（令和8年分は89万円以下） ---');
{ const D=mk(2026,(D,Y)=>{Y.salary.revenue=1630000;Y.blue='white';Y.ded.student=true;}); const R=E.compute(D);
  eq('給与163万 合計所得',R.tax.total,890000); eq('勤労学生控除',R.tax.dedList.find(x=>x.k==='勤労学生控除').v,270000); }
{ const D=mk(2026,(D,Y)=>{Y.salary.revenue=1640000;Y.blue='white';Y.ded.student=true;}); const R=E.compute(D);
  eq('給与164万 勤労学生対象外',R.tax.dedList.find(x=>x.k==='勤労学生控除').v,0); }
console.log('--- 白色の事業専従者控除 ---');
{ const D=mk(2026,(D,Y)=>{Y.blue='white';D.txs.push(inc('2026-03-01',3000000));Y.spouse={has:true,income:0,worker:true};}); const R=E.compute(D);
  eq('専従者控除（配偶者）',R.pl.workerDed,860000); eq('事業所得',R.pl.bizIncome,2140000); eq('配偶者控除は対象外',R.tax.sp.amt,0); }
console.log('--- 青色の専従者給与 ---');
{ const D=mk(2026,(D,Y)=>{D.txs.push(inc('2026-03-01',3000000));D.txs.push(exp('2026-12-25',1200000,'専従者給与',{tax:'0'}));Y.spouse={has:true,income:0,worker:true};}); const R=E.compute(D);
  eq('控除前所得',R.pl.beforeBlue,1800000); eq('事業所得',R.pl.bizIncome,1150000); eq('貸借一致',R.bs.totA,R.bs.totL); }
console.log('--- 純損失の繰越控除 ---');
{ const D=mk(2026,(D,Y)=>{D.txs.push(inc('2026-03-01',2650000));Y.lossCarry=500000;}); const R=E.compute(D);
  eq('合計所得金額',R.tax.total,2000000); eq('総所得金額等',R.tax.sogo,1500000); eq('翌年へ',R.tax.lossNext,0); }
{ const D=mk(2026,(D,Y)=>{D.txs.push(inc('2026-03-01',500000));D.txs.push(exp('2026-04-01',800000,'外注工賃'));}); const R=E.compute(D);
  eq('赤字の年 純損失',R.tax.netLoss,300000); eq('翌年へ繰り越す損失',R.tax.lossNext,300000); eq('青色控除は0',R.pl.blueDed,0); }
console.log('--- 住民税（非課税・調整控除・ふるさと納税） ---');
{ const D=mk(2026,(D,Y)=>{Y.salary.revenue=1190000;Y.blue='white';}); const R=E.compute(D); eq('給与119万 単身 非課税',R.resident.total,0); }
{ const D=mk(2026,(D,Y)=>{Y.salary.revenue=1200000;Y.blue='white';}); const R=E.compute(D);
  eq('給与120万 所得割',R.resident.shotoku,1500); eq('給与120万 年額',R.resident.total,6500); }
{ const base=mk(2026,(D,Y)=>{Y.salary.revenue=5000000;Y.blue='white';Y.ded.social=700000;});
  const don=mk(2026,(D,Y)=>{Y.salary.revenue=5000000;Y.blue='white';Y.ded.social=700000;Y.ded.donation=30000;});
  const a=E.compute(base), b=E.compute(don);
  const save=(a.tax.totalTax-b.tax.totalTax)+(a.resident.total-b.resident.total);
  near('ふるさと3万 → 税の軽減（自己負担2,000円）',save,28000,200);
  eq('調整控除（単身・課税所得200万超）',a.resident.adj,2500); }
console.log('--- 個人事業税（営業月数で事業主控除を月割り） ---');
{ const D=mk(2026,(D,Y)=>{D.txs.push(inc('2026-07-01',3000000));Y.bizMonths=6;}); const R=E.compute(D);
  eq('事業主控除 6か月',R.bizTax.ownerDed,1450000); eq('事業税',R.bizTax.tax,77500); }
console.log('--- 消費税の未払計上 ---');
{ const D=mk(2026,(D,Y)=>{Y.ctax='2wari';Y.accrueCtax=true;D.txs.push(inc('2026-05-01',11000000));}); const R=E.compute(D);
  eq('2割特例 納付額',R.ctax.due,200000); eq('租税公課に計上',R.bal('租税公課'),200000); eq('貸借一致',R.bs.totA,R.bs.totL); }
console.log('--- 予定納税の判定 ---');
{ const D=mk(2026,(D,Y)=>{Y.blue='white';D.txs.push(inc('2026-03-01',8000000));}); const R=E.compute(D);
  eq('予定納税（申告納税額の1/3）',R.tax.yotei,Math.floor(R.tax.declared/3/100)*100); console.log('    申告納税額',R.tax.declared); }
console.log('--- 帳簿チェック ---');
{ const D=mk(2026,(D,Y)=>{D.txs.push(inc('2025-03-01',500000));Y.opening.wallets={b:0};}); D.years['2025']={}; const R=E.compute(D);
  eq('期首残高と前年末の不一致を検出',R.warnings.some(w=>w.includes('前年の期末残高')),true); }
{ const D=mk(2026,(D,Y)=>{D.txs.push(inc('2026-03-01',500000));Y.recon={b:'499000'};}); const R=E.compute(D);
  eq('通帳残高とのずれを検出',R.warnings.some(w=>w.includes('ずれています')),true); }
{ const D=mk(2026,(D,Y)=>{D.txs.push(inc('2026-03-01',500000));D.txs.push(exp('2026-04-01',16980,'租税公課',{memo:'住民税 第1期'}));D.txs.push(exp('2026-05-01',150000,'消耗品費',{memo:'ノートPC'}));}); const R=E.compute(D);
  eq('経費にならない支出を検出',R.warnings.some(w=>w.includes('経費にならない')),true);
  eq('10万円以上の消耗品を検出',R.warnings.some(w=>w.includes('10万円以上')),true); }

console.log('--- ふるさと納税：収入を変えても自己負担がおよそ2,000円 ---');
const mkF=(year,rev,biz,don)=>{const D={v:1,year,wallets:[{id:'b',name:'口座',kind:'bank'}],txs:[],assets:[],rules:[],years:{}};const Y=E.yearOf(D);
 Y.blue=biz?'65':'white'; Y.salary.revenue=rev; Y.ded.social=Math.round((rev+biz)*0.14); Y.ded.donation=don;
 if(biz) D.txs.push({id:'x',type:'income',date:year+'-03-01',acct:'売上高',amount:biz,wallet:'b',tax:'0',wh:0}); return E.compute(D);};

for (const year of [2025,2026]) for (const [rev,biz] of [[3000000,0],[4500000,0],[6000000,0],[8000000,0],[10000000,0],[0,3000000],[0,6000000],[0,10000000]]) {
  const a=mkF(year,rev,biz,0), b=mkF(year,rev,biz,20000);
  const saving=(a.tax.totalTax-b.tax.totalTax)+(a.resident.total-b.resident.total);
  const ok=Math.abs(saving-18000)<=300; if(!ok) fails++;
  console.log(`${ok?'OK':'NG'} ${E.YEARCFG[year].label} 給与${rev/1e4}万 事業売上${biz/1e4}万 寄附2万 → 軽減${saving}円（自己負担${20000-saving}円）`);
}
console.log(fails?`\n${fails} FAILED`:'\nALL PASSED'); process.exit(fails?1:0);
