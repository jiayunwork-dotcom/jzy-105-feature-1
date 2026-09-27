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

function approx(actual, expected, tol = 1e-3) {
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

// 手算基准：外径 200 mm、壁厚 20 mm、折射角 45°
const BENCH = { geometry: 'pipe', outerDiameter: 200, thickness: 20, angleDeg: 45, velocity: 3230 };

// ---- 管材几何核算接口 ----
test('POST /api/skip-geometry 管材：声程 / 弧长 / 内壁入射角与手算一致', async () => {
  const { status, body } = await post('/api/skip-geometry', BENCH);
  assert.equal(status, 200);
  assert.equal(body.geometry, 'pipe');

  approx(body.halfSkip.path, 33.2941);
  approx(body.oneSkip.path, 66.5882);
  approx(body.oneAndHalfSkip.path, 3 * 33.29410425091534);
  approx(body.halfSkip.surfaceDistance, 29.87);
  approx(body.oneSkip.surfaceDistance, 59.741);
  approx(body.innerAngleDeg, 62.114);
  assert.equal(body.halfSkip.reflections, 0);
  assert.equal(body.oneSkip.reflections, 1);
  assert.equal(body.oneAndHalfSkip.reflections, 2);
  approx(body.oneSkip.timeOfFlightUs, (body.oneSkip.path / 3230) * 1000, 1e-9);
});

test('POST /api/echo-depth 管材：回波 20 mm 埋深 ≈ 12.985，与平板明显区分', async () => {
  const { status, body } = await post('/api/echo-depth', { ...BENCH, echoPath: 20 });
  assert.equal(status, 200);
  assert.equal(body.geometry, 'pipe');
  approx(body.depth, 12.985);
  approx(body.surfaceDistance, 16.325);
  assert.equal(body.direction, 'downgoing');
  assert.equal(body.reflections, 0);

  // 同厚度同角度同读数的平板：14.142，两者必须明显区分
  const plate = await post('/api/echo-depth', { thickness: 20, angleDeg: 45, velocity: 3230, echoPath: 20 });
  approx(plate.body.depth, 14.142);
  assert.ok(Math.abs(body.depth - plate.body.depth) > 1);
});

// ---- 兼容性：不声明几何类型一律按板材 ----
test('不声明几何类型的请求按板材处理，返回结构与原有一致并注明 plate', async () => {
  const { status, body } = await post('/api/skip-geometry', {
    thickness: 20,
    angleDeg: 45,
    velocity: 5900,
  });
  assert.equal(status, 200);
  assert.equal(body.geometry, 'plate');
  approx(body.oneSkip.path, 40 * Math.SQRT2, 1e-12);
  approx(body.oneSkip.surfaceDistance, 40, 1e-9);
  assert.deepEqual(body.input, { thickness: 20, angleDeg: 45, velocity: 5900 });
  assert.ok(!('innerAngleDeg' in body));
});

test('只带外径却不声明几何类型，仍按板材处理', async () => {
  const { status, body } = await post('/api/skip-geometry', {
    thickness: 20,
    angleDeg: 45,
    velocity: 5900,
    outerDiameter: 200,
  });
  assert.equal(status, 200);
  assert.equal(body.geometry, 'plate');
  approx(body.oneSkip.path, 40 * Math.SQRT2, 1e-12);
});

// ---- 管材非法输入：算之前挡住并说明原因 ----
test('管材非法输入一律 400 并带原因', async () => {
  const cases = [
    [{ ...BENCH, angleDeg: 60 }, /53\.13/], // 超过最大允许折射角
    [{ ...BENCH, angleDeg: 60 }, /碰不到内壁/],
    [{ ...BENCH, outerDiameter: 0 }, /外径必须为正数/],
    [{ ...BENCH, outerDiameter: -200 }, /外径必须为正数/],
    [{ ...BENCH, outerDiameter: '二百' }, /外径必须是有限数值/],
    [{ ...BENCH, thickness: 100 }, /壁厚必须小于外半径/], // 壁厚 = 外半径
    [{ ...BENCH, thickness: 120 }, /壁厚必须小于外半径/], // 壁厚 > 外半径
    [{ ...BENCH, angleDeg: 90 }, /开区间/], // 板材的拦截规则对管材依旧有效
    [{ ...BENCH, velocity: 0 }, /声速必须为正数/],
    [{ ...BENCH, thickness: -1 }, /板厚必须为正数/],
  ];
  for (const [payload, pattern] of cases) {
    const { status, body } = await post('/api/skip-geometry', payload);
    assert.equal(status, 400, `payload=${JSON.stringify(payload)}`);
    assert.equal(body.error, '参数非法');
    assert.ok(body.details.some((d) => pattern.test(d)), `原因应匹配 ${pattern}，实际 ${body.details}`);
  }
});

test('未知几何类型 400 打回', async () => {
  const { status, body } = await post('/api/skip-geometry', {
    geometry: 'cone',
    thickness: 20,
    angleDeg: 45,
    velocity: 3230,
  });
  assert.equal(status, 400);
  assert.ok(body.details.some((d) => /几何类型/.test(d)));
});

test('管材回波声程为负被 400 打回', async () => {
  const { status, body } = await post('/api/echo-depth', { ...BENCH, echoPath: -1 });
  assert.equal(status, 400);
  assert.ok(body.details.some((d) => /回波声程不能为负/.test(d)));
});

// ---- 探伤配置：板材与管材并存，按名核算各走各的几何 ----
test('管材配置可存可取，与板材配置并存时按名核算互不串用', async () => {
  const pipeConfig = { geometry: 'pipe', outerDiameter: 200, thickness: 20, angleDeg: 45, velocity: 3230 };
  const plateConfig = { thickness: 20, angleDeg: 45, velocity: 3230 };

  // 管材配置带全部管材参数保存
  let res = await request('PUT', '/api/configs/pipe-a', pipeConfig);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { name: 'pipe-a', ...pipeConfig });

  // 老式三要素配置仍按板材理解，返回结构不变
  res = await request('PUT', '/api/configs/plate-a', plateConfig);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { name: 'plate-a', ...plateConfig });

  // 取回：管材配置带着几何参数，板材配置还是老三样
  res = await request('GET', '/api/configs/pipe-a');
  assert.deepEqual(res.body, { name: 'pipe-a', ...pipeConfig });
  res = await request('GET', '/api/configs/plate-a');
  assert.deepEqual(res.body, { name: 'plate-a', ...plateConfig });

  res = await request('GET', '/api/configs');
  assert.deepEqual(res.body.configs.map((c) => c.name).sort(), ['pipe-a', 'plate-a']);

  // 按名核算：同名参数（壁厚 20、45°）下两种几何各出各的结果
  const fromPipe = await post('/api/configs/pipe-a/skip-geometry');
  const fromPlate = await post('/api/configs/plate-a/skip-geometry');
  assert.equal(fromPipe.body.geometry, 'pipe');
  assert.equal(fromPlate.body.geometry, 'plate');
  approx(fromPipe.body.oneSkip.path, 66.5882);
  approx(fromPlate.body.oneSkip.path, 40 * Math.SQRT2, 1e-12);
  approx(fromPipe.body.innerAngleDeg, 62.114);
  assert.ok(!('innerAngleDeg' in fromPlate.body));

  // 按名反推回波：同样各走各的几何
  const echoPipe = await post('/api/configs/pipe-a/echo-depth', { echoPath: 20 });
  const echoPlate = await post('/api/configs/plate-a/echo-depth', { echoPath: 20 });
  assert.equal(echoPipe.body.geometry, 'pipe');
  assert.equal(echoPlate.body.geometry, 'plate');
  approx(echoPipe.body.depth, 12.985);
  approx(echoPlate.body.depth, 14.142);
});

test('非法管材配置保存被 400 打回', async () => {
  let res = await request('PUT', '/api/configs/pipe-bad', {
    geometry: 'pipe',
    outerDiameter: 200,
    thickness: 20,
    angleDeg: 60, // 超过最大允许折射角
    velocity: 3230,
  });
  assert.equal(res.status, 400);
  assert.ok(res.body.details.some((d) => /53\.13/.test(d)));

  res = await request('GET', '/api/configs/pipe-bad');
  assert.equal(res.status, 404);
});
