import test from 'node:test'; import assert from 'node:assert/strict';
function commercial(materials, base, lossPct, markupPct, vatPct){const loss=materials*lossPct/100;const cost=base+loss;const markup=cost*markupPct/100;const net=cost+markup;const vat=net*vatPct/100;return {loss,cost,markup,net,vat,total:net+vat}}
test('defaults: 1% technology loss and 20% VAT',()=>{const x=commercial(1000,1500,1,0,20);assert.equal(x.loss,10);assert.equal(x.total,1812)});
test('VAT may be zero and markup is percentage',()=>{const x=commercial(1000,1500,1,10,0);assert.equal(x.total,1661)});
