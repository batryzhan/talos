import {useSyncExternalStore} from 'react';
import type {XboxController} from '../input/XboxController';
export function XboxGamepadHUD({pad}:{pad:XboxController}){
 const s=useSyncExternalStore(pad.subscribe,pad.getSnapshot);
 const axes=[['LS X',s.leftStickRaw.x],['LS Y',s.leftStickRaw.y],['RS X',s.rightStickRaw.x],['RS Y',s.rightStickRaw.y]] as const;
 return <aside className="pad"><h3>XBOX 360 <span className={s.connected?'ready':'warn'}>{s.connected?'ONLINE':'OFFLINE'}</span></h3><table><tbody>{axes.map(([name,value])=><tr key={name}><th scope="row">{name}</th><td><meter aria-label={name} min={-1} max={1} value={value}/></td><td>{value.toFixed(3)}</td></tr>)}{([['LT',s.leftTrigger],['RT',s.rightTrigger]] as const).map(([name,value])=><tr key={name}><th scope="row" className={value>.05?'ready':''}>{name}</th><td><progress aria-label={name} max={1} value={value}/></td><td>{value.toFixed(3)}</td></tr>)}</tbody></table><p>FOCUS {s.focus.kind==='agent'?`#${s.focus.agentId}`:s.focus.teamId} · CTRL {s.controller}</p><small>A Lift / Assemble · B HOLD · LB/RB Focus<br/>Y Solo ⇄ Macro · R3 Camera<br/>WASD / Q,E Drive · Z,X Lift<br/>Space HOLD · C Camera · M Controller</small></aside>;
}
