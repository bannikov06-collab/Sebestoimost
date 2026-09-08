import assert from 'node:assert/strict';
import {estimateProductionHours,calculateQueueDates} from '../app/lib/projectPlanning.ts';
const r=estimateProductionHours([{code:'FE',current:2000,lengthMm:3000,quantity:10}]);
assert(r.hours>4);
const q=calculateQueueDates([{priorityOrder:1,productionHours:12},{priorityOrder:2,productionHours:24},{priorityOrder:null,productionHours:5}],'2026-09-02T00:00:00.000Z');
assert(q[0].plannedReady); assert(q[1].plannedReady); assert.equal(q[2].plannedReady,'');
const parallel=calculateQueueDates([
 {id:1,priorityOrder:1,productionHours:36,productionLoads:{'Лазер':24,'Сборка':12}},
 {id:2,priorityOrder:2,productionHours:24,productionLoads:{'Лазер':12,'Сборка':12}},
],'2026-09-02T00:00:00.000Z');
assert.equal(parallel[0].plannedStart,'2026-09-02T00:00:00.000Z');
assert.equal(parallel[0].plannedReady,'2026-09-04T00:00:00.000Z');
assert.equal(parallel[1].departmentSchedule['Сборка'].start,'2026-09-03T00:00:00.000Z');
assert.equal(parallel[1].departmentSchedule['Лазер'].start,'2026-09-04T00:00:00.000Z');
console.log('project planning ok');
