// Checks that the contract's price table and the modal's copy are the same curve.
//   node scripts/mint/check-price-table.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildTable, tableHex, SUPPLY } from './build-price-table.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const sol = fs.readFileSync(path.join(root, 'contracts', 'src', 'WatchPriceTable.sol'), 'utf8');
const ts = fs.readFileSync(path.join(root, 'lib', 'mint', 'priceTable.ts'), 'utf8');

const table = buildTable();
const solHex = /hex"([0-9a-f]+)"/.exec(sol)?.[1];
assert.ok(solHex, 'no hex table in WatchPriceTable.sol');
assert.equal(solHex.length, SUPPLY * 6, 'table length');
assert.equal(solHex, tableHex(table), 'WatchPriceTable.sol is stale — run build-price-table.mjs');

const tsTable = JSON.parse(/PRICE_MICRO: readonly number\[\] = (\[[^\]]+\])/.exec(ts)?.[1] ?? 'null');
assert.deepEqual(tsTable, table, 'lib/mint/priceTable.ts is stale — run build-price-table.mjs');

assert.equal(table[0], 1000);          // 0.001 ETH
assert.equal(table[SUPPLY - 1], 1e6);  // 1 ETH
for (let i = 1; i < SUPPLY; i++) {
    const step = table[i] / table[i - 1];
    assert.ok(step > 1.04 && step < 1.056, `step at #${i + 1} is ${step}`);
}
console.log(`price table OK: ${SUPPLY} prices, contract and modal agree, every step +4.0–5.6 %`);
