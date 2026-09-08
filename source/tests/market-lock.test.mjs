import assert from 'node:assert/strict';
import { applyMarketLock, createProjectMarketSnapshot } from '../app/lib/marketLock.ts';
const base=createProjectMarketSnapshot('P',{aluminiumUsdT:2500,copperUsdT:9000,usdRub:78,sourceDate:'01.09.2026',capturedAt:'2026-09-01T00:00:00.000Z'});
let r=applyMarketLock(base,{aluminiumUsdT:2600,copperUsdT:9100,usdRub:80,sourceDate:'02.09.2026',capturedAt:'2026-09-02T00:00:00.000Z'},'2026-09-10T00:00:00.000Z');
assert.equal(r.usdRub,78); assert.equal(r.aluminiumUsdT,2500);
r=applyMarketLock(base,{aluminiumUsdT:2600,copperUsdT:8500,usdRub:80,sourceDate:'16.09.2026',capturedAt:'2026-09-16T00:00:00.000Z'},'2026-09-16T00:00:00.000Z');
assert.equal(r.usdRub,80); assert.equal(r.aluminiumUsdT,2600); assert.equal(r.copperUsdT,9000);
assert.equal(r.copperLock.valueCapturedAt,'2026-09-01T00:00:00.000Z');
assert.equal(r.copperLock.reviewedAt,'2026-09-16T00:00:00.000Z');
// Each indicator keeps its own review clock: only Al is expired here.
const independent={...r,aluminiumLock:{...r.aluminiumLock,validUntil:'2026-09-20T00:00:00.000Z'},copperLock:{...r.copperLock,validUntil:'2026-10-01T00:00:00.000Z'},usdLock:{...r.usdLock,validUntil:'2026-10-01T00:00:00.000Z'}};
const independentResult=applyMarketLock(independent,{aluminiumUsdT:2700,copperUsdT:9500,usdRub:90,sourceDate:'21.09.2026',capturedAt:'2026-09-21T00:00:00.000Z'},'2026-09-21T00:00:00.000Z');
assert.equal(independentResult.aluminiumUsdT,2700);
assert.equal(independentResult.copperUsdT,9000);
assert.equal(independentResult.usdRub,80);
console.log('market lock ok');
