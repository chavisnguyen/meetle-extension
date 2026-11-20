import assert from 'node:assert/strict';
import { ranges, STEP } from './upload.js';
assert.deepEqual(ranges(10, 4), [[0, 3], [4, 7], [8, 9]]);
assert.deepEqual(ranges(8, 4), [[0, 3], [4, 7]]);
assert.equal(STEP % (256 * 1024), 0);
console.log('ok');
