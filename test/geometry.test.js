'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { legPath, skipPath, pathForLegs } = require('../src/geometry/skipPath');
const { surfaceDistanceForLegs, reflectionsForLegs } = require('../src/geometry/groundDistance');
const { locateEcho } = require('../src/geometry/echoDepth');

const rad = (deg) => (deg * Math.PI) / 180;

function approx(actual, expected, tol = 1e-9) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= tol * scale,
    `期望 ${actual} ≈ ${expected}（容差 ${tol}）`,
  );
}

// ---- 几何关系一：板厚翻倍，一个 skip 的声程与地面距离都随之翻倍 ----
test('板厚翻倍：一个 skip 的声程与地面距离都翻倍', () => {
  const angle = rad(60);
  const t1 = 20;
  const t2 = 40;
  approx(skipPath(t2, angle), 2 * skipPath(t1, angle));
  approx(surfaceDistanceForLegs(t2, angle, 2), 2 * surfaceDistanceForLegs(t1, angle, 2));
});

// ---- 几何关系二：板厚不变、折射角增大，地面距离变大、单个 skip 声程变长 ----
test('板厚不变、折射角增大：地面距离变大，单个 skip 声程变长', () => {
  const t = 20;
  const angles = [30, 45, 60, 75];
  for (let i = 1; i < angles.length; i += 1) {
    const smaller = rad(angles[i - 1]);
    const larger = rad(angles[i]);
    assert.ok(
      surfaceDistanceForLegs(t, larger, 2) > surfaceDistanceForLegs(t, smaller, 2),
      `角度 ${angles[i]}° 的地面距离应大于 ${angles[i - 1]}°`,
    );
    assert.ok(
      skipPath(t, larger) > skipPath(t, smaller),
      `角度 ${angles[i]}° 的 skip 声程应大于 ${angles[i - 1]}°`,
    );
  }
});

// ---- 几何关系三：正入射极限，折射角趋零时声程收敛到两倍板厚 ----
test('正入射极限：折射角趋零时一个 skip 声程收敛到两倍板厚', () => {
  const t = 25;
  // 偏差随角度减小而单调收敛到 0（极限行为，而非某个角度下硬性相等）
  const deviations = [1, 1e-1, 1e-2, 1e-3].map((deg) => skipPath(t, rad(deg)) - 2 * t);
  for (const deviation of deviations) {
    assert.ok(deviation >= 0, 'cos ≤ 1，声程不小于 2T');
  }
  for (let i = 1; i < deviations.length; i += 1) {
    assert.ok(deviations[i] < deviations[i - 1], '角度越小，声程越贴近 2T');
  }
  // 足够小的角度下，声程在数值上就等于 2T，地面距离同时趋于 0
  approx(skipPath(t, rad(1e-6)), 2 * t, 1e-9);
  approx(surfaceDistanceForLegs(t, rad(1e-6), 2), 0, 1e-5);
});

// ---- 45° 基准算例：手算值钉进回归 ----
test('45° 基准算例：一个 skip 声程 = 2T/cos45°（手算回归）', () => {
  const t = 20;
  const angle = rad(45);
  // 手算：2×20 / (√2/2) = 40·√2 = 56.568542494923804
  approx(skipPath(t, angle), 40 * Math.SQRT2, 1e-12);
  approx(skipPath(t, angle), 56.568542494923804, 1e-9);
  // 半跨声程 = T/cos45° = 20·√2
  approx(legPath(t, angle), 20 * Math.SQRT2, 1e-12);
  // 一个 skip 地面距离 = 2·T·tan45° = 40
  approx(surfaceDistanceForLegs(t, angle, 2), 40, 1e-9);
  // 一个半 skip（三程）声程 = 3T/cos45° = 60·√2
  approx(pathForLegs(t, angle, 3), 60 * Math.SQRT2, 1e-12);
});

// ---- 反射次数：半跨 0 次、一个 skip 1 次、一个半 skip 2 次 ----
test('反射次数随程数递增：到达前落面才算一次反射', () => {
  assert.equal(reflectionsForLegs(1), 0);
  assert.equal(reflectionsForLegs(2), 1);
  assert.equal(reflectionsForLegs(3), 2);
});

// ---- 回波反推：相似三角形埋深，几何自洽而非正入射读数 ----
test('回波落在半 skip 到一个 skip 之间：相似三角形反推埋深', () => {
  const t = 20;
  const angle = rad(60);
  // ℓ = 20/cos60° = 40，取 S = 50（落在 40~80 之间），程内余量 r = 10
  const located = locateEcho(t, angle, 50);

  approx(located.depth, 15); // d = T − r·cos60° = 20 − 5
  assert.equal(located.reflections, 1); // 底面反射过一次
  assert.equal(located.direction, 'upgoing');
  assert.equal(located.legIndex, 2);
  approx(located.surfaceDistance, 50 * Math.sin(angle));

  // 几何自洽：埋深必须落在 [0, T] 内；
  // 若按正入射式读数 S·cosβ = 25 已超过板厚，明显不成立
  const naiveVertical = 50 * Math.cos(angle);
  assert.ok(naiveVertical > t);
  assert.ok(located.depth >= 0 && located.depth <= t);
  assert.notEqual(located.depth, naiveVertical);

  // 往返自洽：由埋深正算回声程应还原读数
  const reconstructed = legPath(t, angle) + (t - located.depth) / Math.cos(angle);
  approx(reconstructed, 50);
});

test('回波超过两个 skip：按折回规则正确计入反射次数', () => {
  const t = 20;
  const angle = rad(60); // ℓ = 40，两个 skip = 160
  const located = locateEcho(t, angle, 170); // 已完成 4 程 + 余量 10，第 5 程下行

  assert.equal(located.completedLegs, 4);
  assert.equal(located.reflections, 4); // 在 40/80/120/160 处各反射一次
  assert.equal(located.direction, 'downgoing');
  approx(located.depth, 10 * Math.cos(angle)); // = 5，而不是 170·cos60° = 85
  assert.ok(located.depth <= t);
});

test('回波在首个半跨内：直射段，无反射', () => {
  const t = 20;
  const angle = rad(60);
  const located = locateEcho(t, angle, 10);

  approx(located.depth, 10 * Math.cos(angle)); // 5
  assert.equal(located.reflections, 0);
  assert.equal(located.legIndex, 1);
  assert.equal(located.direction, 'downgoing');
});

test('整程边界：声程恰为一个 skip 时回波来自顶面，落面不计反射', () => {
  const t = 20;
  const angle = rad(60);
  const atTop = locateEcho(t, angle, 80); // 恰两程，回到顶面
  approx(atTop.depth, 0);
  assert.equal(atTop.reflections, 1); // 只在底面反射过一次

  const atBottom = locateEcho(t, angle, 40); // 恰一程，打到底面
  approx(atBottom.depth, t);
  assert.equal(atBottom.reflections, 0);
});
