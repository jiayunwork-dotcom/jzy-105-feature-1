'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createGeometryModel } = require('../src/geometry/models');
const { skipGeometryReport, echoDepthReport } = require('../src/service/inspectionService');
const { legPath: plateLegPath } = require('../src/geometry/skipPath');
const { legSurfaceDistance: plateLegSurface } = require('../src/geometry/groundDistance');
const { locateEcho: plateLocateEcho } = require('../src/geometry/echoDepth');
const { ValidationError } = require('../src/errors');

const rad = (deg) => (deg * Math.PI) / 180;

function approx(actual, expected, tol = 1e-3) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tol * scale,
    `期望 ${actual} ≈ ${expected}（容差 ${tol}）`,
  );
}

// 手算基准：外径 200 mm、壁厚 20 mm、折射角 45°
const BENCH = { geometry: 'pipe', outerDiameter: 200, thickness: 20, angleDeg: 45, velocity: 3230 };
const benchModel = () => createGeometryModel(BENCH);

// ---- 基准算例：一程 / 一个 skip 声程（手算值钉进回归）----
test('管材基准：一程声程 = 50√2 − 10√14 ≈ 33.2941，一个 skip ≈ 66.5882', () => {
  const model = benchModel();
  // 手算：√(100² − 50√2²) − √(80² − 50√2²) = √5000 − √1400 = 50√2 − 10√14
  approx(model.pathForLegs(1), 50 * Math.SQRT2 - 10 * Math.sqrt(14), 1e-12);
  approx(model.pathForLegs(1), 33.2941);
  approx(model.pathForLegs(2), 66.5882);
  approx(model.pathForLegs(3), 3 * (50 * Math.SQRT2 - 10 * Math.sqrt(14)), 1e-12);
});

// ---- 基准算例：内壁入射角与外壁弧长 ----
test('管材基准：内壁入射角 ≈ 62.114°，半跨弧长 ≈ 29.870，一个 skip ≈ 59.741', () => {
  const model = benchModel();
  // sinθ = R·sinβ / r = 100·sin45° / 80 = 5√2/8
  approx(model.extras().innerAngleDeg, (Math.asin((5 * Math.SQRT2) / 8) * 180) / Math.PI, 1e-12);
  approx(model.extras().innerAngleDeg, 62.114);
  // 半跨弧长 = R·(θ − β)
  approx(model.surfaceDistanceForLegs(1), 100 * (Math.asin((5 * Math.SQRT2) / 8) - Math.PI / 4), 1e-12);
  approx(model.surfaceDistanceForLegs(1), 29.87);
  approx(model.surfaceDistanceForLegs(2), 59.741);
});

// ---- 反射次数口径与板材一致：半跨 0 次、一个 skip 1 次 ----
test('管材反射次数口径与板材一致', () => {
  const model = benchModel();
  assert.equal(model.reflectionsForLegs(1), 0);
  assert.equal(model.reflectionsForLegs(2), 1);
  assert.equal(model.reflectionsForLegs(3), 2);
});

// ---- 基准算例：回波 20 mm 的真实埋深，与平板读数明显区分 ----
test('管材基准：回波 20 mm 埋深 ≈ 12.985，同读数平板为 14.142，两者明显区分', () => {
  const model = benchModel();
  const located = model.locateEcho(20);
  // 手算：埋深 = R − √(R² − 2·S·R·cosβ + S²) = 100 − √(10400 − 2000√2)
  approx(located.depth, 100 - Math.sqrt(10400 - 2000 * Math.SQRT2), 1e-12);
  approx(located.depth, 12.985);
  assert.equal(located.direction, 'downgoing');
  assert.equal(located.reflections, 0);

  const plateDepth = plateLocateEcho(20, rad(45), 20).depth;
  approx(plateDepth, 20 * Math.cos(rad(45))); // 14.142
  assert.ok(Math.abs(located.depth - plateDepth) > 1, '管材与平板读数应明显区分');

  // 缺陷在外壁上的弧长位置，也与平板的地面距离区分开
  approx(located.surfaceDistance, 16.325);
  assert.ok(Math.abs(located.surfaceDistance - 20 * Math.sin(rad(45))) > 1);
});

// ---- 折回规则：上行段、整程边界、超过两个 skip ----
test('管材回波：跨内壁反射进入上行段按折回规则算真实埋深', () => {
  const model = benchModel();
  const leg = model.pathForLegs(1);
  const located = model.locateEcho(leg + 10); // 第二程上行，等效下行位置 x = ℓ − 10
  assert.equal(located.direction, 'upgoing');
  assert.equal(located.completedLegs, 1);
  assert.equal(located.legIndex, 2);
  assert.equal(located.reflections, 1);
  approx(located.depth, model.locateEcho(leg - 10).depth, 1e-12);
  assert.ok(located.depth >= 0 && located.depth <= 20);
});

test('管材回波：整程边界落面本身不计反射', () => {
  const model = benchModel();
  const leg = model.pathForLegs(1);

  const atInner = model.locateEcho(leg); // 恰一程，打到内壁
  approx(atInner.depth, 20, 1e-9);
  assert.equal(atInner.reflections, 0);

  const atOuter = model.locateEcho(2 * leg); // 恰两程，回到外壁
  approx(atOuter.depth, 0, 1e-9);
  assert.equal(atOuter.reflections, 1);
  // 边界处弧长位置与 skip 弧长一致
  approx(atOuter.surfaceDistance, model.surfaceDistanceForLegs(2), 1e-9);
});

test('管材回波：超过两个 skip 仍按折回规则定位到对应那一程', () => {
  const model = benchModel();
  const leg = model.pathForLegs(1);
  const located = model.locateEcho(4 * leg + 10); // 两个 skip 之外，第 5 程下行
  assert.equal(located.completedLegs, 4);
  assert.equal(located.legIndex, 5);
  assert.equal(located.reflections, 4);
  assert.equal(located.direction, 'downgoing');
  approx(located.depth, model.locateEcho(10).depth, 1e-12); // 与第一程同位置埋深一致
  assert.ok(located.depth <= 20);
});

// ---- 几何关系：大管径退化回板材（外径 ≥ 壁厚的一万倍）----
test('大管径极限：外径为壁厚一万倍时管材结果退化回板材（相对偏差 < 1e-3）', () => {
  const thickness = 20;
  const outerDiameter = 10000 * thickness;
  for (const angleDeg of [30, 45, 60]) {
    const model = createGeometryModel({ geometry: 'pipe', outerDiameter, thickness, angleDeg, velocity: 3230 });
    const plateLeg = plateLegPath(thickness, rad(angleDeg));
    const plateSurface = plateLegSurface(thickness, rad(angleDeg));
    const echoPath = 20;
    const plateDepth = plateLocateEcho(thickness, rad(angleDeg), echoPath).depth;

    approx(model.pathForLegs(1), plateLeg, 1e-3);
    approx(model.surfaceDistanceForLegs(1), plateSurface, 1e-3);
    approx(model.locateEcho(echoPath).depth, plateDepth, 1e-3);
  }
});

// ---- 几何关系：外径有限时不小于板材、内壁入射角严格更大 ----
test('有限外径：管材一程声程与半跨弧长不小于板材，内壁入射角严格大于折射角', () => {
  const cases = [
    { outerDiameter: 200, thickness: 20, angleDeg: 30 },
    { outerDiameter: 200, thickness: 20, angleDeg: 45 },
    { outerDiameter: 200, thickness: 20, angleDeg: 50 },
    { outerDiameter: 100, thickness: 20, angleDeg: 30 },
    { outerDiameter: 400, thickness: 15, angleDeg: 60 },
    { outerDiameter: 60, thickness: 20, angleDeg: 15 },
  ];
  for (const c of cases) {
    const model = createGeometryModel({ geometry: 'pipe', ...c, velocity: 3230 });
    const plateLeg = plateLegPath(c.thickness, rad(c.angleDeg));
    const plateSurface = plateLegSurface(c.thickness, rad(c.angleDeg));
    assert.ok(
      model.pathForLegs(1) >= plateLeg,
      `OD=${c.outerDiameter} β=${c.angleDeg}°：管材一程声程 ${model.pathForLegs(1)} 应不小于板材 ${plateLeg}`,
    );
    assert.ok(
      model.surfaceDistanceForLegs(1) >= plateSurface,
      `OD=${c.outerDiameter} β=${c.angleDeg}°：管材半跨弧长应不小于板材地面距离`,
    );
    assert.ok(
      model.extras().innerAngleDeg > c.angleDeg,
      `OD=${c.outerDiameter} β=${c.angleDeg}°：内壁入射角应严格大于折射角`,
    );
  }
});

// ---- 几何关系：同一 skip 内对称读数埋深相同 ----
test('同一个 skip 里：离入射点 s 与离回到外壁 s 的读数埋深相同', () => {
  const model = benchModel();
  const leg = model.pathForLegs(1);
  for (const s of [1, 7, 13.5, 30]) {
    approx(model.locateEcho(s).depth, model.locateEcho(2 * leg - s).depth, 1e-9);
    // 后面的 skip 同样成立
    approx(model.locateEcho(2 * leg + s).depth, model.locateEcho(4 * leg - s).depth, 1e-9);
  }
});

// ---- 几何关系：折射角逼近最大允许值时内壁入射角趋向 90° ----
test('折射角逼近最大允许值时内壁入射角趋向 90 度', () => {
  const maxAngleDeg = (Math.asin(80 / 100) * 180) / Math.PI; // 53.13010235415598
  const thetas = [1e-1, 1e-3, 1e-6].map((delta) => {
    const model = createGeometryModel({
      geometry: 'pipe', outerDiameter: 200, thickness: 20, angleDeg: maxAngleDeg - delta, velocity: 3230,
    });
    return model.extras().innerAngleDeg;
  });
  for (const theta of thetas) assert.ok(theta < 90, '未达临界时内壁入射角小于 90°');
  assert.ok(thetas[1] > thetas[0] && thetas[2] > thetas[1], '越贴近临界，内壁入射角越接近 90°');
  approx(thetas[2], 90, 1e-2); // βmax − 1e-6° 时 θ ≈ 89.9907°
});

// ---- 计算前拦截：擦壁退化、壁厚不小于外半径、外径不为正 ----
test('折射角过大碰不到内壁时被拦截，原因写明最大允许角度', () => {
  for (const angleDeg of [60, 53.14]) {
    assert.throws(
      () => skipGeometryReport({ ...BENCH, angleDeg }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.details.some((d) => /53\.13/.test(d)), `原因应写明最大允许角度 53.13 度：${err.details}`);
        assert.ok(err.details.some((d) => /碰不到内壁/.test(d)));
        return true;
      },
    );
  }
  // 53.12° 在允许范围内，正常出结果
  const report = skipGeometryReport({ ...BENCH, angleDeg: 53.12 });
  assert.equal(report.geometry, 'pipe');
});

test('壁厚不小于外半径、外径不为正同样被打回并说明原因', () => {
  assert.throws(
    () => skipGeometryReport({ ...BENCH, thickness: 100 }), // 壁厚 = 外半径
    (err) => err.details.some((d) => /壁厚必须小于外半径/.test(d)),
  );
  assert.throws(
    () => skipGeometryReport({ ...BENCH, thickness: 120 }), // 壁厚 > 外半径
    (err) => err.details.some((d) => /壁厚必须小于外半径/.test(d)),
  );
  for (const outerDiameter of [0, -200, '二百']) {
    assert.throws(
      () => skipGeometryReport({ ...BENCH, outerDiameter }),
      (err) => err.details.some((d) => /外径/.test(d)),
    );
  }
});

test('未知几何类型被拦截并说明支持的类型', () => {
  assert.throws(
    () => skipGeometryReport({ geometry: 'cone', thickness: 20, angleDeg: 45, velocity: 3230 }),
    (err) => err.details.some((d) => /几何类型/.test(d) && /plate/.test(d) && /pipe/.test(d)),
  );
});

// ---- 兼容性：不声明几何类型一律按板材，且结果注明所用模型 ----
test('不声明几何类型按板材处理，所有核算结果注明所用几何模型', () => {
  const legacy = { thickness: 20, angleDeg: 60, velocity: 3230 };
  const report = skipGeometryReport(legacy);
  assert.equal(report.geometry, 'plate');
  assert.deepEqual(report.input, legacy);
  approx(report.oneSkip.path, 80, 1e-9); // 2×20/cos60°，与改动前一致
  assert.ok(!('innerAngleDeg' in report), '板材报告不带管材专属量');

  const echo = echoDepthReport({ ...legacy, echoPath: 50 });
  assert.equal(echo.geometry, 'plate');
  approx(echo.depth, 15, 1e-9);

  // 显式声明 plate 与不声明结果一致
  const explicit = skipGeometryReport({ ...legacy, geometry: 'plate' });
  assert.equal(explicit.geometry, 'plate');
  approx(explicit.oneSkip.path, report.oneSkip.path, 1e-12);
});

// ---- 编排层出管材报告：结构、数值与几何标注 ----
test('管材核算报告：声程 / 弧长 / 内壁入射角齐备并注明几何模型', () => {
  const report = skipGeometryReport(BENCH);
  assert.equal(report.geometry, 'pipe');
  assert.deepEqual(report.input, { geometry: 'pipe', outerDiameter: 200, thickness: 20, angleDeg: 45, velocity: 3230 });
  approx(report.halfSkip.path, 33.2941);
  approx(report.oneSkip.path, 66.5882);
  approx(report.halfSkip.surfaceDistance, 29.87);
  approx(report.oneSkip.surfaceDistance, 59.741);
  approx(report.innerAngleDeg, 62.114);
  assert.equal(report.halfSkip.reflections, 0);
  assert.equal(report.oneSkip.reflections, 1);
  assert.equal(report.oneAndHalfSkip.reflections, 2);
  approx(report.oneSkip.timeOfFlightUs, (report.oneSkip.path / 3230) * 1000, 1e-9);

  const echo = echoDepthReport({ ...BENCH, echoPath: 20 });
  assert.equal(echo.geometry, 'pipe');
  approx(echo.depth, 12.985);
  approx(echo.innerAngleDeg, 62.114);
  assert.equal(echo.input.echoPath, 20);
});
