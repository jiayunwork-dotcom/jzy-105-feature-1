'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const pipeRay = require('../src/geometry/pipeRay');
const platePath = require('../src/geometry/skipPath');
const plateGround = require('../src/geometry/groundDistance');
const plateEcho = require('../src/geometry/echoDepth');

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;

/** 基准算例容差：1e-3 mm 或 1e-3 度 */
function approx(actual, expected, tol = 1e-3) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `期望 ${actual} ≈ ${expected}（容差 ${tol}）`,
  );
}

// 手算核对基准：外径 200 mm（R = 100）、壁厚 20 mm（r = 80）、折射角 45°
const R = 100;
const T = 20;
const r = R - T;
const BETA = rad(45);

// ---- 基准算例：一程声程 / 内壁入射角 / 外壁弧长（手算值钉进回归） ----
test('管材基准算例：外径 200、壁厚 20、折射角 45°', () => {
  // 内壁入射角：sinθ = R·sin45°/r = 0.8839 → θ ≈ 62.114°
  approx(deg(pipeRay.innerIncidenceAngle(R, r, BETA)), 62.114, 1e-3);
  // 一程声程 = R·cos45° − r·cosθ = 50√2 − 10√14 ≈ 33.2941 mm
  approx(pipeRay.legPath(R, r, BETA), 50 * Math.SQRT2 - 10 * Math.sqrt(14), 1e-9);
  approx(pipeRay.legPath(R, r, BETA), 33.2941, 1e-3);
  // 一个 skip 由两段等长的程组成 ≈ 66.5882 mm
  approx(pipeRay.pathForLegs(R, r, BETA, 2), 66.5882, 1e-3);
  approx(pipeRay.pathForLegs(R, r, BETA, 2), 2 * pipeRay.legPath(R, r, BETA), 1e-9);
  // 半跨外壁弧长 ≈ 29.870 mm，一个 skip ≈ 59.741 mm
  approx(pipeRay.surfaceDistanceForLegs(R, r, BETA, 1), 29.87, 1e-3);
  approx(pipeRay.surfaceDistanceForLegs(R, r, BETA, 2), 59.741, 1e-3);
  // 这组管径壁厚下最大允许折射角 = asin(r/R) ≈ 53.130°
  approx(deg(pipeRay.maxRefractedAngle(R, r)), 53.13, 1e-3);
});

// ---- 基准算例：回波 20 mm 的埋深，与同厚度平板明显区分 ----
test('管材基准算例：回波 20 mm 埋深约 12.985 mm，区别于平板的 14.142 mm', () => {
  const located = pipeRay.locateEcho(R, r, BETA, 20);
  approx(located.depth, 12.985, 1e-3);
  assert.equal(located.completedLegs, 0);
  assert.equal(located.direction, 'downgoing');
  assert.equal(located.reflections, 0);

  const plateDepth = plateEcho.locateEcho(T, BETA, 20).depth;
  approx(plateDepth, 14.142, 1e-3);
  // 两者必须明显区分开：管材里声束更「直」地扎向管心方向，同读数埋深更浅
  assert.ok(Math.abs(located.depth - plateDepth) > 1);
});

// ---- 几何关系：大管径下管材退化回板材（相对偏差 < 1e-3） ----
test('外径达到壁厚的一万倍以上时，管材结果退化回板材', () => {
  const thickness = 20;
  const outerRadius = 10000 * thickness; // 外径 = 两万倍壁厚，满足「一万倍以上」
  const innerRadius = outerRadius - thickness;
  const angle = rad(45);

  const pipeLeg = pipeRay.legPath(outerRadius, innerRadius, angle);
  const plateLeg = platePath.legPath(thickness, angle);
  assert.ok(Math.abs(pipeLeg - plateLeg) / plateLeg < 1e-3, `一程声程相对偏差 ${pipeLeg} vs ${plateLeg}`);

  const pipeArc = pipeRay.surfaceDistanceForLegs(outerRadius, innerRadius, angle, 1);
  const plateGroundDistance = plateGround.surfaceDistanceForLegs(thickness, angle, 1);
  assert.ok(
    Math.abs(pipeArc - plateGroundDistance) / plateGroundDistance < 1e-3,
    `半跨弧长相对偏差 ${pipeArc} vs ${plateGroundDistance}`,
  );

  const pipeDepth = pipeRay.locateEcho(outerRadius, innerRadius, angle, 20).depth;
  const plateDepth = plateEcho.locateEcho(thickness, angle, 20).depth;
  assert.ok(
    Math.abs(pipeDepth - plateDepth) / plateDepth < 1e-3,
    `同一回波读数埋深相对偏差 ${pipeDepth} vs ${plateDepth}`,
  );
});

// ---- 几何关系：外径有限时管材的一程声程与半跨弧长都不小于板材，内壁入射角严格更大 ----
test('外径有限时：管材一程声程与半跨弧长不小于板材，内壁入射角严格大于折射角', () => {
  const cases = [
    { outerDiameter: 200, thickness: 20, angleDeg: 45 },
    { outerDiameter: 100, thickness: 10, angleDeg: 30 },
    { outerDiameter: 500, thickness: 50, angleDeg: 50 },
    { outerDiameter: 80, thickness: 25, angleDeg: 20 },
    { outerDiameter: 100, thickness: 5, angleDeg: 60 },
  ];
  for (const { outerDiameter, thickness, angleDeg } of cases) {
    const outerRadius = outerDiameter / 2;
    const innerRadius = outerRadius - thickness;
    const angle = rad(angleDeg);
    const label = `外径${outerDiameter}/壁厚${thickness}/β${angleDeg}°`;

    const pipeLeg = pipeRay.legPath(outerRadius, innerRadius, angle);
    const plateLeg = platePath.legPath(thickness, angle);
    assert.ok(pipeLeg >= plateLeg, `${label}：管材一程声程 ${pipeLeg} 应不小于板材 ${plateLeg}`);

    const pipeArc = pipeRay.surfaceDistanceForLegs(outerRadius, innerRadius, angle, 1);
    const plateArc = plateGround.surfaceDistanceForLegs(thickness, angle, 1);
    assert.ok(pipeArc >= plateArc, `${label}：管材半跨弧长 ${pipeArc} 应不小于板材 ${plateArc}`);

    const theta = pipeRay.innerIncidenceAngle(outerRadius, innerRadius, angle);
    assert.ok(theta > angle, `${label}：内壁入射角 ${deg(theta)}° 应严格大于折射角 ${angleDeg}°`);
  }
});

// ---- 几何关系：同一个 skip 里，距入射点 s 与距下次回到外壁 s 的读数埋深相同 ----
test('同一个 skip 内：离入射点 s 与离下一次回到外壁 s 的读数埋深相同', () => {
  const leg = pipeRay.legPath(R, r, BETA);
  for (const s of [5, 12.3, 20, 30]) {
    const fromEntry = pipeRay.locateEcho(R, r, BETA, s);
    const fromNextReturn = pipeRay.locateEcho(R, r, BETA, 2 * leg - s);
    approx(fromEntry.depth, fromNextReturn.depth, 1e-9);
    assert.equal(fromEntry.direction, 'downgoing');
    assert.equal(fromNextReturn.direction, 'upgoing');
  }
});

// ---- 几何关系：折射角逼近最大允许值时，内壁入射角趋向 90° ----
test('折射角逼近最大允许值时，内壁入射角趋向 90 度', () => {
  const maxAngle = pipeRay.maxRefractedAngle(R, r);
  const theta = pipeRay.innerIncidenceAngle(R, r, maxAngle - rad(1e-6));
  assert.ok(deg(theta) > 89.99 && deg(theta) < 90, `内壁入射角 ${deg(theta)}° 应趋向 90°`);
});

// ---- 回波定位：跨内壁反射进入上行段，按真实管心距离算埋深 ----
test('回波跨过内壁反射进入上行段：按折回规则定位并算真实埋深', () => {
  const leg = pipeRay.legPath(R, r, BETA);
  const located = pipeRay.locateEcho(R, r, BETA, leg + 10);

  assert.equal(located.completedLegs, 1);
  assert.equal(located.legIndex, 2);
  assert.equal(located.direction, 'upgoing');
  assert.equal(located.reflections, 1);
  approx(located.depth, 14.863, 1e-3);
  assert.ok(located.depth > 0 && located.depth < T);
  // 与内壁触点前对称位置的埋深一致（距内壁触点同为 10 mm 声程）
  approx(located.depth, pipeRay.locateEcho(R, r, BETA, leg - 10).depth, 1e-9);
});

// ---- 回波定位：超过两个 skip 仍按折回规则定位到对应那一程 ----
test('回波超过两个 skip：按折回规则定位到对应那一程再算真实埋深', () => {
  const leg = pipeRay.legPath(R, r, BETA);
  const located = pipeRay.locateEcho(R, r, BETA, 4 * leg + 15);

  assert.equal(located.completedLegs, 4);
  assert.equal(located.legIndex, 5);
  assert.equal(located.direction, 'downgoing');
  assert.equal(located.reflections, 4); // 在 1/2/3/4 程边界各反射一次
  approx(located.depth, 9.98, 1e-3);
  assert.ok(located.depth <= T);
  // 缺陷在外壁上的弧长位置一并给出
  approx(located.surfaceDistance, 131.291, 1e-3);
});

// ---- 反射次数口径与板材一致：读数落在壁面上时落面本身不计 ----
test('整程边界：读数恰好落在内壁或外壁上时落面本身不计反射', () => {
  const leg = pipeRay.legPath(R, r, BETA);

  const atInner = pipeRay.locateEcho(R, r, BETA, leg); // 恰一程，打到内壁
  approx(atInner.depth, T, 1e-9);
  assert.equal(atInner.reflections, 0);
  approx(atInner.surfaceDistance, pipeRay.surfaceDistanceForLegs(R, r, BETA, 1), 1e-9);

  const atOuter = pipeRay.locateEcho(R, r, BETA, 2 * leg); // 恰两程，回到外壁
  approx(atOuter.depth, 0, 1e-9);
  assert.equal(atOuter.reflections, 1); // 只在内壁反射过一次
  approx(atOuter.surfaceDistance, pipeRay.surfaceDistanceForLegs(R, r, BETA, 2), 1e-9);
});
