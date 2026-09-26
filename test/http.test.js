'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/http/app');

let server;
let base;

test.before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

function approx(actual, expected, tol = 1e-9) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tol * scale,
    `期望 ${actual} ≈ ${expected}（容差 ${tol}）`,
  );
}

async function request(method, path, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, options);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const post = (path, body) => request('POST', path, body);

// ---- 几何核算接口：基本形状与反射次数 ----
test('POST /api/skip-geometry 返回半跨 / 一个 skip / 一个半 skip', async () => {
  const { status, body } = await post('/api/skip-geometry', {
    thickness: 20,
    angleDeg: 60,
    velocity: 3230,
  });
  assert.equal(status, 200);

  approx(body.halfSkip.path, 40); // 20 / cos60°
  approx(body.oneSkip.path, 80); // 2×20 / cos60°
  approx(body.oneAndHalfSkip.path, 120);
  approx(body.oneSkip.surfaceDistance, 40 * Math.tan(Math.PI / 3));
  assert.equal(body.halfSkip.reflections, 0);
  assert.equal(body.oneSkip.reflections, 1);
  assert.equal(body.oneAndHalfSkip.reflections, 2);
  // 声速参与传播时间折算：80mm / 3230m/s ≈ 24.768µs
  approx(body.oneSkip.timeOfFlightUs, (80 / 3230) * 1000, 1e-6);
});

// ---- 经 HTTP 钉住几何关系一：板厚翻倍则单个 skip 声程翻倍 ----
test('经接口验证：板厚翻倍则单个 skip 声程与地面距离翻倍', async () => {
  const angle = { angleDeg: 60, velocity: 3230 };
  const thin = await post('/api/skip-geometry', { thickness: 20, ...angle });
  const thick = await post('/api/skip-geometry', { thickness: 40, ...angle });

  approx(thick.body.oneSkip.path, 2 * thin.body.oneSkip.path);
  approx(thick.body.oneSkip.surfaceDistance, 2 * thin.body.oneSkip.surfaceDistance);
});

// ---- 经 HTTP 钉住几何关系二：折射角增大则地面距离变大 ----
test('经接口验证：板厚不变而折射角增大时地面距离变大', async () => {
  const baseParams = { thickness: 20, velocity: 3230 };
  const a45 = await post('/api/skip-geometry', { ...baseParams, angleDeg: 45 });
  const a60 = await post('/api/skip-geometry', { ...baseParams, angleDeg: 60 });

  assert.ok(a60.body.oneSkip.surfaceDistance > a45.body.oneSkip.surfaceDistance);
  assert.ok(a60.body.oneSkip.path > a45.body.oneSkip.path);
});

// ---- 经 HTTP 钉住几何关系三：正入射极限 ----
test('经接口验证：折射角趋零时一个 skip 声程收敛到两倍板厚', async () => {
  const { body } = await post('/api/skip-geometry', {
    thickness: 25,
    angleDeg: 1e-6,
    velocity: 5900,
  });
  approx(body.oneSkip.path, 50, 1e-6);
});

// ---- 45° 基准算例经接口回归 ----
test('45° 基准算例经接口回归：一个 skip 声程 = 40·√2', async () => {
  const { status, body } = await post('/api/skip-geometry', {
    thickness: 20,
    angleDeg: 45,
    velocity: 5900,
  });
  assert.equal(status, 200);
  approx(body.oneSkip.path, 40 * Math.SQRT2, 1e-12);
  approx(body.oneSkip.surfaceDistance, 40, 1e-9);
});

// ---- 回波埋深反推接口 ----
test('POST /api/echo-depth：半 skip 到一个 skip 之间按相似三角形反推', async () => {
  const { status, body } = await post('/api/echo-depth', {
    thickness: 20,
    angleDeg: 60,
    velocity: 3230,
    echoPath: 50,
  });
  assert.equal(status, 200);
  approx(body.depth, 15);
  assert.equal(body.reflections, 1);
  assert.equal(body.direction, 'upgoing');
  approx(body.surfaceDistance, 50 * Math.sin(Math.PI / 3));
});

test('POST /api/echo-depth：超过两个 skip 按折回规则计入反射次数', async () => {
  const { status, body } = await post('/api/echo-depth', {
    thickness: 20,
    angleDeg: 60,
    velocity: 3230,
    echoPath: 170,
  });
  assert.equal(status, 200);
  assert.equal(body.reflections, 4);
  assert.equal(body.direction, 'downgoing');
  approx(body.depth, 5);
});

// ---- 非法输入：算之前挡住并说明原因 ----
test('非法输入一律 400 并带原因', async () => {
  const cases = [
    [{ thickness: 0, angleDeg: 45, velocity: 3230 }, /板厚必须为正数/],
    [{ thickness: -3, angleDeg: 45, velocity: 3230 }, /板厚必须为正数/],
    [{ thickness: 20, angleDeg: 0, velocity: 3230 }, /开区间/],
    [{ thickness: 20, angleDeg: 90, velocity: 3230 }, /90 度时声束贴着板面传播/],
    [{ thickness: 20, angleDeg: 120, velocity: 3230 }, /开区间/],
    [{ thickness: 20, angleDeg: 45, velocity: 0 }, /声速必须为正数/],
    [{ thickness: 20, angleDeg: 45, velocity: -100 }, /声速必须为正数/],
    [{ thickness: '二十', angleDeg: 45, velocity: 3230 }, /板厚必须是有限数值/],
  ];
  for (const [payload, pattern] of cases) {
    const { status, body } = await post('/api/skip-geometry', payload);
    assert.equal(status, 400, `payload=${JSON.stringify(payload)}`);
    assert.equal(body.error, '参数非法');
    assert.ok(body.details.some((d) => pattern.test(d)), `原因应匹配 ${pattern}，实际 ${body.details}`);
  }
});

test('回波声程为负被 400 打回', async () => {
  const { status, body } = await post('/api/echo-depth', {
    thickness: 20,
    angleDeg: 60,
    velocity: 3230,
    echoPath: -1,
  });
  assert.equal(status, 400);
  assert.ok(body.details.some((d) => /回波声程不能为负/.test(d)));
});

// ---- 探伤配置：命名存取与两套配置隔离 ----
test('探伤配置的保存、查询、删除与按名核算', async () => {
  const weldA = { thickness: 20, angleDeg: 60, velocity: 3230 };
  const weldB = { thickness: 40, angleDeg: 45, velocity: 5900 };

  let res = await request('PUT', '/api/configs/weld-a', weldA);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { name: 'weld-a', ...weldA });

  res = await request('PUT', '/api/configs/weld-b', weldB);
  assert.equal(res.status, 200);

  res = await request('GET', '/api/configs');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.configs.map((c) => c.name).sort(), ['weld-a', 'weld-b']);

  // 两套配置一起用，各自的几何互不干扰
  const fromA = await post('/api/configs/weld-a/skip-geometry');
  const fromB = await post('/api/configs/weld-b/skip-geometry');
  approx(fromA.body.oneSkip.path, 80); // 2×20/cos60°
  approx(fromB.body.oneSkip.path, 80 * Math.SQRT2); // 2×40/cos45°
  assert.equal(fromA.body.input.thickness, 20);
  assert.equal(fromB.body.input.thickness, 40);

  // 按名做埋深反推
  const echo = await post('/api/configs/weld-a/echo-depth', { echoPath: 50 });
  assert.equal(echo.status, 200);
  approx(echo.body.depth, 15);

  // 删除后即 404
  res = await request('DELETE', '/api/configs/weld-a');
  assert.equal(res.status, 204);
  res = await request('GET', '/api/configs/weld-a');
  assert.equal(res.status, 404);
  res = await post('/api/configs/weld-a/skip-geometry');
  assert.equal(res.status, 404);
});

test('保存非法配置被 400 打回，未知配置 404', async () => {
  let res = await request('PUT', '/api/configs/bad', { thickness: -1, angleDeg: 45, velocity: 3230 });
  assert.equal(res.status, 400);
  assert.ok(res.body.details.some((d) => /板厚必须为正数/.test(d)));

  res = await request('GET', '/api/configs/never-saved');
  assert.equal(res.status, 404);
  assert.match(res.body.error, /未找到/);
});

test('健康检查与未知路由', async () => {
  let res = await request('GET', '/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');

  res = await request('GET', '/no-such-route');
  assert.equal(res.status, 404);
});
