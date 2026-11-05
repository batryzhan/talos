import {runM0} from '../swarm/consensus';
import {Rng} from '../swarm/rng';
import type {RunLogRecord} from '../contracts/types';
export function downloadLog(rows:RunLogRecord[],csv=false){
 const keys: (keyof RunLogRecord)[]=['run_id','seed','controller','N','p','epoch','time','agent_id','state','command','E_h','E_traj','TSR','SSR'];
 const data=csv?[keys.join(','),...rows.map(r=>keys.map(k=>JSON.stringify(r[k]??'')).join(','))].join('\n'):JSON.stringify(rows,null,2);
 const url=URL.createObjectURL(new Blob([data],{type:csv?'text/csv':'application/json'}));const a=document.createElement('a');a.href=url;a.download=`TALOS_run_log.${csv?'csv':'json'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function benchmark(progress:(s:string)=>void){
 const rows:{series:string;n:number;p:number;eps:number;mean:number;sd:number;ci:number;failed:number;curve:number[];ks:number[]}[]=[];
 const configs=[...[2,4,8].flatMap(n=>[0,.1,.3].map(p=>({series:'900',n,p,eps:.2}))),...[.05,.1,.2,.4].map(eps=>({series:'400',n:8,p:.3,eps}))];
 for(const c of configs){const runs=Array.from({length:100},(_,seed)=>runM0({...c,steps:100,seed,threshold:.01}));
 // Censored runs are reported separately; means use converged observations only.
 const ks=runs.map(r=>r.kConverged??NaN),valid=ks.filter(Number.isFinite),mean=valid.reduce((a,b)=>a+b,0)/(valid.length||1),sd=Math.sqrt(valid.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,valid.length-1));
 rows.push({...c,mean,sd,ci:valid.length===100?1.9842*sd/10:NaN,failed:100-valid.length,ks,curve:Array.from({length:101},(_,k)=>runs.reduce((a,r)=>a+r.samples[k].D,0)/100)});
 progress(`${rows.length}/13 · ${rows.length*100}/1300 запусков`);await new Promise(r=>setTimeout(r,0));}
 const paired=[2,4,8].map(n=>{const a=rows.find(r=>r.series==='900'&&r.n===n&&r.p===0)!,b=rows.find(r=>r.series==='900'&&r.n===n&&r.p===.3)!;
 const differences=a.ks.map((k,i)=>b.ks[i]-k).filter(Number.isFinite),rng=new Rng(n),samples=Array.from({length:2000},()=>differences.reduce(sum=>sum+differences[Math.floor(rng.random()*differences.length)],0)/differences.length).sort((a,b)=>a-b);
 return {n,count:differences.length,mean:differences.reduce((a,b)=>a+b,0)/differences.length,lo:samples[50],hi:samples[1950]};});return {rows,paired};
}
export function plot(canvas:HTMLCanvasElement,curves:{curve:number[];label:string}[]){const g=canvas.getContext('2d')!;g.clearRect(0,0,canvas.width,canvas.height);g.strokeStyle='#526170';g.strokeRect(38,10,canvas.width-50,canvas.height-40);g.font='11px monospace';g.fillStyle='#c5d6e5';g.fillText('log₁₀ D(k)  0 → −8',40,canvas.height-10);
 curves.forEach((r,i)=>{g.strokeStyle=['#c9d1d9','#d29922','#238636'][i%3];g.beginPath();r.curve.forEach((d,k)=>{const x=38+k/100*(canvas.width-50),y=10+Math.min(8,-Math.log10(Math.max(1e-8,d)))/8*(canvas.height-40);if(k)g.lineTo(x,y);else g.moveTo(x,y);});g.stroke();g.fillStyle=g.strokeStyle;g.fillText(r.label,45+(i%3)*140,24+Math.floor(i/3)*14);});}
