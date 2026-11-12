/** Agent-local exponentially smoothed travel times, in seconds. */
export class RouteLearning {
  readonly estimates = new Map<number, number>();
  updates=0;
  constructor(readonly alpha=0.25,readonly threshold=0.3) {}
  estimate(edge:number,prior:number):number {return this.estimates.get(edge)??prior;}
  observe(edge:number,observed:number,prior:number):{old:number;value:number;replan:boolean} {
    if(!(observed>0&&Number.isFinite(observed)))throw new RangeError('Travel time must be positive and finite');
    const old=this.estimate(edge,prior),value=(1-this.alpha)*old+this.alpha*observed;
    this.estimates.set(edge,value);this.updates++;
    return {old,value,replan:Math.abs(observed-old)/old>this.threshold};
  }
}
