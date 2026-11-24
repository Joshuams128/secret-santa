const assert = require('assert');
const { draw } = require('./server');
for (let n = 3; n <= 12; n++) for (let t = 0; t < 200; t++) {
  const ps = Array.from({ length: n }, (_, i) => ({ id: 'p' + i }));
  draw(ps);
  const targets = new Set(ps.map(p => p.giveTo));
  assert.strictEqual(targets.size, n, 'everyone receives exactly one gift');
  ps.forEach(p => assert.notStrictEqual(p.giveTo, p.id, 'no self-match'));
}
console.log('draw OK'); process.exit(0);
