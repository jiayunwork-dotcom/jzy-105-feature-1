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

/** 基准算例容差：1e-3 mm 或 1e-3 度 */
function approx(actual, expected, tol = 1e-3) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
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

// 手算核对基准：外径 200 mm、壁厚 20 mm、折射角 45°
const PIPE = { geometry: 'pipe', outerDiameter: 200, thickness: 20, angleDeg: 45, velocity: 3230 };

// ---- 管材几何核算接口：基准算例钉进回归 ----
test('POST /api/skip-geometry 管材：一程声程 / 弧长 / 内壁入射角', async () => {
  const { status, body } = await post('/api/skip-geometry', PIPE);
  assert.equal(status, 200);

  // 核算结果注明这次用的是哪种几何模型
  assert.equal(body.geometry, 'pipe');
  assert.deepEqual(body.input, PIPE);

  // 一程声程 50√2 − 10√14 ≈ 33.2941，一个 skip ≈ 66.5882
  approx(body.halfSkip.path, 33.2941);
  approx(body.oneSkip.path, 66.5882);
  approx(body.oneAndHalfSkip.path, 3 * 33.29410425091532, 1e-3);
  // 半跨外壁弧长 ≈ 29.870，一个 skip ≈ 59.741
  approx(body.halfSkip.surfaceDistance, 29.87);
  approx(body.oneSkip.surfaceDistance, 59.741);
  // 内壁入射角 ≈ 62.114°，这组管径壁厚下最大允许折射角 ≈ 53.130°
  approx(body.innerIncidenceAngleDeg, 62.114);
  approx(body.maxAngleDeg, 53.13);
  // 反射次数口径与板材一致：半跨 0 次、一个 skip 1 次
  assert.equal(body.halfSkip.reflections, 0);
  assert.equal(body.oneSkip.reflections, 1);
  assert.equal(body.oneAndHalfSkip.reflections, 2);
  // 传播时间按声速折算：66.5882mm / 3230m/s ≈ 20.616µs
  approx(body.oneSkip.timeOfFlightUs, (66.58820850183064 / 3230) * 1000, 1e-3);
});

// ---- 管材回波埋深：与同厚度平板明显区分 ----
test('POST /api/echo-depth 管材：回波 20 mm 埋深约 12.985，区别于平板的 14.142', async () => {
  const pipeRes = await post('/api/echo-depth', { ...PIPE, echoPath: 20 });
  assert.equal(pipeRes.status, 200);
  assert.equal(pipeRes.body.geometry, 'pipe');
  approx(pipeRes.body.depth, 12.985);
  // 缺陷在外壁上的弧长位置
  approx(pipeRes.body.surfaceDistance, 16.325);
  assert.equal(pipeRes.body.direction, 'downgoing');
  assert.equal(pipeRes.body.reflections, 0);

  // 同样读数在同厚度平板上是 14.142（不声明几何类型按板材处理）
  const plateRes = await post('/api/echo-depth', {
    thickness: 20,
    angleDeg: 45,
    velocity: 3230,
    echoPath: 20,
  });
  assert.equal(plateRes.status, 200);
  assert.equal(plateRes.body.geometry, 'plate');
  approx(plateRes.body.depth, 14.142);
  assert.ok(Math.abs(pipeRes.body.depth - plateRes.body.depth) > 1);
});

// ---- 几何上走不通的情形在计算前拦下，原因写明最大允许折射角 ----
test('折射角 60° 超过管材允许范围被 400 打回，原因写明最大允许 53.130 度', async () => {
  const { status, body } = await post('/api/skip-geometry', { ...PIPE, angleDeg: 60 });
  assert.equal(status, 400);
  assert.equal(body.error, '参数非法');
  assert.ok(
    body.details.some((d) => /53\.130/.test(d) && /碰不到内壁/.test(d)),
    `原因应写明最大允许折射角，实际 ${body.details}`,
  );
});

test('管材非法输入一律 400 并带原因', async () => {
  const cases = [
    [{ ...PIPE, outerDiameter: 0 }, /外径必须为正数/],
    [{ ...PIPE, outerDiameter: -200 }, /外径必须为正数/],
    [{ ...PIPE, outerDiameter: '二百' }, /外径必须是有限数值/],
    [{ ...PIPE, thickness: 0 }, /壁厚必须为正数/],
    [{ ...PIPE, thickness: -5 }, /壁厚必须为正数/],
    [{ ...PIPE, thickness: 100 }, /壁厚必须小于外半径/], // 壁厚 = 外半径
    [{ ...PIPE, thickness: 150 }, /壁厚必须小于外半径/], // 壁厚 > 外半径
    [{ ...PIPE, angleDeg: 0 }, /开区间/],
    [{ ...PIPE, angleDeg: 90 }, /开区间/],
    [{ ...PIPE, velocity: 0 }, /声速必须为正数/],
    [{ ...PIPE, velocity: -3230 }, /声速必须为正数/],
    [{ thickness: 20, angleDeg: 45, velocity: 3230, geometry: 'torus' }, /几何类型/],
  ];
  for (const [payload, pattern] of cases) {
    const { status, body } = await post('/api/skip-geometry', payload);
    assert.equal(status, 400, `payload=${JSON.stringify(payload)}`);
    assert.equal(body.error, '参数非法');
    assert.ok(body.details.some((d) => pattern.test(d)), `原因应匹配 ${pattern}，实际 ${body.details}`);
  }
});

test('管材回波声程为负被 400 打回', async () => {
  const { status, body } = await post('/api/echo-depth', { ...PIPE, echoPath: -1 });
  assert.equal(status, 400);
  assert.ok(body.details.some((d) => /回波声程不能为负/.test(d)));
});

// ---- 兼容性：不声明几何类型的请求一律按板材处理，并注明所用模型 ----
test('不声明几何类型的请求按板材处理，数值与改动前一致', async () => {
  const { status, body } = await post('/api/skip-geometry', {
    thickness: 20,
    angleDeg: 45,
    velocity: 5900,
  });
  assert.equal(status, 200);
  assert.equal(body.geometry, 'plate');
  approx(body.oneSkip.path, 40 * Math.SQRT2, 1e-9);
  approx(body.oneSkip.surfaceDistance, 40, 1e-9);
  assert.deepEqual(body.input, { thickness: 20, angleDeg: 45, velocity: 5900 });
});

// ---- 命名配置：管材参数可存，板材与管材配置并存、按名各走各自几何 ----
test('管材配置与板材配置并存：按名核算、按名反推各走各自几何', async () => {
  // 管材配置可存可取
  let res = await request('PUT', '/api/configs/pipe-weld', PIPE);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { name: 'pipe-weld', ...PIPE });

  // 老式只带板厚、角度、声速的配置仍按板材理解
  const legacy = { thickness: 20, angleDeg: 60, velocity: 3230 };
  res = await request('PUT', '/api/configs/plate-weld', legacy);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { name: 'plate-weld', ...legacy });

  res = await request('GET', '/api/configs/pipe-weld');
  assert.deepEqual(res.body, { name: 'pipe-weld', ...PIPE });
  res = await request('GET', '/api/configs/plate-weld');
  assert.deepEqual(res.body, { name: 'plate-weld', ...legacy });

  // 按名核算：同一服务两套几何互不串用
  const fromPipe = await post('/api/configs/pipe-weld/skip-geometry');
  assert.equal(fromPipe.body.geometry, 'pipe');
  approx(fromPipe.body.halfSkip.path, 33.2941);
  approx(fromPipe.body.innerIncidenceAngleDeg, 62.114);

  const fromPlate = await post('/api/configs/plate-weld/skip-geometry');
  assert.equal(fromPlate.body.geometry, 'plate');
  approx(fromPlate.body.halfSkip.path, 40); // 20 / cos60°

  // 按名反推回波也各走各自几何
  const pipeEcho = await post('/api/configs/pipe-weld/echo-depth', { echoPath: 20 });
  assert.equal(pipeEcho.body.geometry, 'pipe');
  approx(pipeEcho.body.depth, 12.985);

  const plateEcho = await post('/api/configs/plate-weld/echo-depth', { echoPath: 20 });
  assert.equal(plateEcho.body.geometry, 'plate');
  approx(plateEcho.body.depth, 10); // 20·cos60°

  res = await request('DELETE', '/api/configs/pipe-weld');
  assert.equal(res.status, 204);
  res = await request('DELETE', '/api/configs/plate-weld');
  assert.equal(res.status, 204);
});

test('非法管材配置被 400 打回且不入库', async () => {
  let res = await request('PUT', '/api/configs/bad-pipe', { ...PIPE, angleDeg: 60 });
  assert.equal(res.status, 400);
  assert.ok(res.body.details.some((d) => /53\.130/.test(d)));

  res = await request('GET', '/api/configs/bad-pipe');
  assert.equal(res.status, 404);
});
