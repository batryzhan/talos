import type { FaultInjection, Vec2 } from '../contracts/types';
export const categories=['стекло','бумага','картон','пластик','металл','неперерабатываемые'];
export const missions=[
 {name:'1 · Разбор завалов',n:4,mass:24,size:{x:2.6,y:1.7},com:{x:.25,y:.12},description:'Плита со смещённым ЦМ. Подъём ≤ 2 мм разности высот, доставка в безопасную зону.'},
 {name:'2 · Длинномерная балка',n:4,mass:20,size:{x:3.6,y:1.1},com:{x:0,y:0},description:'S-коридор: поворот и боковой стрейф виртуальной платформы.'},
 {name:'3 · Радиопомехи и отказ',n:8,mass:32,size:{x:2.8,y:2},com:{x:.1,y:0},description:'Кольцо, p=0.3. Через 5 с транспортировки отключается радио агента 1.'},
 {name:'4 · Сортировка контейнеров',n:4,mass:18,size:{x:2,y:1.5},com:{x:.12,y:0},description:'Демонстрационный детектор категории; масса и ЦМ проверяются независимо до старта.'},
 {name:'5 · Сравнение A / B / C',n:4,mass:24,size:{x:2.6,y:1.7},com:{x:.25,y:.12},description:'Парные физические прогоны A/B/C с одинаковым seed и отказом радио.'},
];
export function supports(n:number,size:{x:number;y:number}):Vec2[]{return Array.from({length:n},(_,i)=>({x:Math.cos(2*Math.PI*i/n)*size.x*.36,y:Math.sin(2*Math.PI*i/n)*size.y*.36}));}
export function faultAt(caseId:number,transportTime:number):FaultInjection {return caseId===2||caseId===4?{lossP:.3,...(transportTime>=5?{radioDead:[1]}:{})}:{};}
export function reference(t:number,curved:boolean){return {x:.07*t,y:curved?.3*Math.sin(t*.35):0,theta:curved?.15*Math.sin(t*.35):0};}
