export const CRANK_SECONDS=150;
export const RULESET='1996-crank150-v1';
export class CrankHazard{
 constructor(){this.sinceScare=0;this.rollClock=0;}
 reset(){this.sinceScare=0;this.rollClock=0;}
 advance(dt,cranking,rng=Math.random){
  if(!cranking){this.sinceScare+=dt;return false;}
  let remaining=dt;
  while(remaining>0){
   const step=Math.min(remaining,1-this.rollClock);
   this.sinceScare+=step;this.rollClock+=step;remaining-=step;
   if(this.rollClock>=1-1e-9){
    this.rollClock=0;
    if(rng()<Math.min(1,.01+.005*this.sinceScare)){this.reset();return true;}
   }
  }
  return false;
 }
}
export function formatRace(ms){const n=Math.max(0,Math.floor(ms));return `${String(Math.floor(n/60000)).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')}.${String(n%1000).padStart(3,'0')}`;}
