'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createConfigStore } = require('../src/config/store');

const configA = { thickness: 20, angleDeg: 60, velocity: 3230 };
const configB = { thickness: 40, angleDeg: 45, velocity: 5900 };

test('命名配置可存可取可列可删', () => {
  const store = createConfigStore();
  store.save('weld-a', configA);
  store.save('weld-b', configB);

  assert.deepEqual(store.get('weld-a'), configA);
  assert.deepEqual(store.get('weld-b'), configB);

  const names = store.list().map((c) => c.name).sort();
  assert.deepEqual(names, ['weld-a', 'weld-b']);

  assert.equal(store.remove('weld-a'), true);
  assert.equal(store.get('weld-a'), undefined);
  assert.equal(store.remove('weld-a'), false);
});

test('两套配置互不干扰：各自的板厚角度不会串到另一套头上', () => {
  const store = createConfigStore();
  store.save('weld-a', configA);
  store.save('weld-b', configB);

  // 覆盖 weld-a 后，weld-b 保持原样
  store.save('weld-a', { ...configA, thickness: 25 });
  assert.equal(store.get('weld-a').thickness, 25);
  assert.deepEqual(store.get('weld-b'), configB);
});

test('取回的是副本：调用方改动不会污染库里的配置', () => {
  const store = createConfigStore();
  store.save('weld-a', configA);

  const fetched = store.get('weld-a');
  fetched.thickness = 999;
  assert.equal(store.get('weld-a').thickness, configA.thickness);
});
