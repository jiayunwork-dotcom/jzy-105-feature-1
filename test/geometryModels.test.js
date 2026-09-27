'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveModel, models } = require('../src/geometry/models');
const { ValidationError } = require('../src/errors');

// 几何模型是一层可替换的东西：板材与管材实现同一组能力
const MODEL_INTERFACE = [
  'validate',
  'normalize',
  'pathForLegs',
  'surfaceDistanceForLegs',
  'reflectionsForLegs',
  'locateEcho',
  'reportExtras',
];

test('板材与管材实现同一组模型能力', () => {
  assert.deepEqual(Object.keys(models).sort(), ['pipe', 'plate']);
  for (const [type, model] of Object.entries(models)) {
    assert.equal(model.type, type);
    for (const capability of MODEL_INTERFACE) {
      assert.equal(typeof model[capability], 'function', `${type} 缺少能力 ${capability}`);
    }
  }
});

test('不声明几何类型一律按板材处理，显式声明按声明挑模型', () => {
  assert.equal(resolveModel({}).type, 'plate');
  assert.equal(resolveModel(undefined).type, 'plate');
  assert.equal(resolveModel({ thickness: 20, angleDeg: 45, velocity: 3230 }).type, 'plate');
  assert.equal(resolveModel({ geometry: 'plate' }).type, 'plate');
  assert.equal(resolveModel({ geometry: 'pipe' }).type, 'pipe');
});

test('未知几何类型在计算前被打回', () => {
  for (const geometry of ['sphere', 'PLATE', 42]) {
    assert.throws(() => resolveModel({ geometry }), (err) => {
      assert.ok(err instanceof ValidationError);
      assert.match(err.details[0], /几何类型/);
      return true;
    });
  }
});

test('两种模型的反射次数口径一致：半跨 0 次、一个 skip 1 次', () => {
  for (const model of Object.values(models)) {
    assert.equal(model.reflectionsForLegs(1), 0);
    assert.equal(model.reflectionsForLegs(2), 1);
    assert.equal(model.reflectionsForLegs(3), 2);
  }
});

test('管材模型自身的合法性检查', () => {
  const pipe = models.pipe;
  const good = { geometry: 'pipe', outerDiameter: 200, thickness: 20, angleDeg: 45, velocity: 3230 };
  assert.deepEqual(pipe.validate(good), []);

  // 外径不为正 / 不是数值
  assert.match(pipe.validate({ ...good, outerDiameter: 0 })[0], /外径必须为正数/);
  assert.match(pipe.validate({ ...good, outerDiameter: -200 })[0], /外径必须为正数/);
  assert.match(pipe.validate({ ...good, outerDiameter: '二百' })[0], /外径必须是有限数值/);

  // 壁厚不为正、壁厚不小于外半径
  assert.match(pipe.validate({ ...good, thickness: 0 })[0], /壁厚必须为正数/);
  assert.match(pipe.validate({ ...good, thickness: 100 })[0], /壁厚必须小于外半径/);
  assert.match(pipe.validate({ ...good, thickness: 150 })[0], /壁厚必须小于外半径/);

  // 板材那几条基础规则对管材依旧有效
  assert.match(pipe.validate({ ...good, angleDeg: 0 })[0], /\(0, 90\) 开区间/);
  assert.match(pipe.validate({ ...good, angleDeg: 90 })[0], /\(0, 90\) 开区间/);
  assert.match(pipe.validate({ ...good, velocity: 0 })[0], /声速必须为正数/);

  // 几何走不通：折射角 60° 超过这组外径壁厚允许的最大值 53.130°
  const errors = pipe.validate({ ...good, angleDeg: 60 });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /53\.130/);
  assert.match(errors[0], /碰不到内壁/);
  // 恰好取到最大允许值同样被拦（擦内壁而过，没有折线）
  assert.equal(pipe.validate({ ...good, angleDeg: 53.13010235415598 }).length, 1);
  // 多项同时非法时原因一并返回
  assert.ok(pipe.validate({ geometry: 'pipe' }).length >= 3);
});
