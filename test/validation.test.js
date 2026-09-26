'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateProbeParams, validateEchoReading } = require('../src/validation/validate');

const goodParams = { thickness: 20, angleDeg: 45, velocity: 3230 };

test('合法参数通过校验', () => {
  assert.deepEqual(validateProbeParams(goodParams), []);
  assert.deepEqual(validateEchoReading(0), []);
  assert.deepEqual(validateEchoReading(123.4), []);
});

test('板厚不为正被拦截并说明原因', () => {
  for (const thickness of [0, -5]) {
    const errors = validateProbeParams({ ...goodParams, thickness });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /板厚必须为正数/);
  }
  const errors = validateProbeParams({ ...goodParams, thickness: '二十' });
  assert.match(errors[0], /板厚必须是有限数值/);
});

test('折射角不在 (0, 90) 开区间被拦截，90 度退化情形单独说明', () => {
  for (const angleDeg of [0, -10, 90, 120]) {
    const errors = validateProbeParams({ ...goodParams, angleDeg });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /\(0, 90\) 开区间/);
  }
  const at90 = validateProbeParams({ ...goodParams, angleDeg: 90 });
  assert.match(at90[0], /90 度时声束贴着板面传播/);
});

test('声速不为正被拦截并说明原因', () => {
  for (const velocity of [0, -3230]) {
    const errors = validateProbeParams({ ...goodParams, velocity });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /声速必须为正数/);
  }
});

test('回波声程为负被拦截并说明原因', () => {
  const errors = validateEchoReading(-0.5);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /回波声程不能为负/);
});

test('多项同时非法时原因一并返回', () => {
  const errors = validateProbeParams({ thickness: -1, angleDeg: 90, velocity: 0 });
  assert.equal(errors.length, 3);
});

test('空参数整体被拦截', () => {
  assert.equal(validateProbeParams(undefined).length, 3);
  assert.equal(validateProbeParams({}).length, 3);
});
