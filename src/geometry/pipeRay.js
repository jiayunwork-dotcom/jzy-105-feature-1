'use strict';

/**
 * 管材（圆筒）折线声程几何。
 *
 * 探头贴在管子外壁、沿周向斜射。设管心为 O，外半径 R、内半径 r = R − 壁厚。
 * 声束从外壁入射点 A 以折射角 β（相对 A 处外壁法线，即径向）射入，打到内壁 B。
 * 在三角形 OAB 中：OA = R，OB = r，A 处夹角 β，B 处入射角 θ（相对 B 处径向法线），
 * 由正弦定理得  sin θ = R·sin β / r 。
 * 外壁是凸的，θ 恒大于 β——这是管材与平行板等腰折线的根本差别。
 *
 * 几何可达条件：R·sin β < r。否则声束擦内壁而过、根本碰不到内壁，没有折线可言。
 *
 * 一程（A→B，半跨）：
 *   声程   L = R·cos β − r·cos θ   （圆心到声束所在直线的垂足，两侧线段之差）
 *   圆心角 γ = θ − β
 *   外壁弧长 = R·γ                    （沿外壁表面量，对应板材的「地面距离」）
 * 内壁全反射后路径对称，一个 skip 由两段等长的程组成。
 *
 * 程内定位：把「距本程外壁端的沿束距离」记为 u（下行程 u 就是程内余量，
 * 上行程由对称性折算 u = L − 程内余量），则声束所在点 P 满足
 *   |OP|² = R² + u² − 2R·u·cos β      （三角形 OAP 余弦定理）
 *   埋深 = R − |OP|                    （到管心的真实距离折算成离外壁的深度，
 *                                       一程之内埋深与声程不是线性关系）
 *   本程内已扫圆心角 φ = atan2(u·sin β, R − u·cos β)
 */

/** 内壁入射角 θ（弧度）：sin θ = R·sin β / r */
function innerIncidenceAngle(outerRadius, innerRadius, angleRad) {
  return Math.asin((outerRadius * Math.sin(angleRad)) / innerRadius);
}

/** 这组外径壁厚下允许的最大折射角（弧度）：asin(r / R)，取到该值即擦内壁而过 */
function maxRefractedAngle(outerRadius, innerRadius) {
  return Math.asin(innerRadius / outerRadius);
}

/** 单个半跨（一程）的声程：R·cos β − r·cos θ */
function legPath(outerRadius, innerRadius, angleRad) {
  const theta = innerIncidenceAngle(outerRadius, innerRadius, angleRad);
  return outerRadius * Math.cos(angleRad) - innerRadius * Math.cos(theta);
}

/** 一程扫过的圆心角（弧度）：γ = θ − β */
function legCentralAngle(outerRadius, innerRadius, angleRad) {
  return innerIncidenceAngle(outerRadius, innerRadius, angleRad) - angleRad;
}

/** n 程累计声程（每程等长） */
function pathForLegs(outerRadius, innerRadius, angleRad, legs) {
  return legs * legPath(outerRadius, innerRadius, angleRad);
}

/** n 程累计的外壁弧长（每程扫过相同圆心角） */
function surfaceDistanceForLegs(outerRadius, innerRadius, angleRad, legs) {
  return legs * outerRadius * legCentralAngle(outerRadius, innerRadius, angleRad);
}

/**
 * 由回波声程反推缺陷埋深与外壁弧长位置（折回规则与板材同口径）。
 *
 * 设一程声程为 L，回波声程读数为 S：已完成 k = floor(S / L) 程，程内余量 r' = S − k·L。
 * k 为偶数时当前程由外壁走向内壁（下行），为奇数时已在内壁反射、走向外壁（上行）。
 * 到达缺陷前经历的全反射次数 = 已完成程数 k；读数恰好落在外壁或内壁上时，
 * 落面本身不计，取 k − 1。超过两个 skip 的读数同样按此折回规则定位到对应那一程。
 */
function locateEcho(outerRadius, innerRadius, angleRad, echoPath) {
  const leg = legPath(outerRadius, innerRadius, angleRad);
  const gamma = legCentralAngle(outerRadius, innerRadius, angleRad);
  let completedLegs = Math.floor(echoPath / leg);
  let remainder = echoPath - completedLegs * leg;

  // 浮点保护：声程恰好落在整程边界时，余数应归零并归入已完成程。
  // 两种残渣都要兜住：余数略小于一程（少记一程），或余数是微小浮点噪声。
  const eps = 1e-9 * leg;
  if (remainder > 0 && leg - remainder < eps) {
    completedLegs += 1;
    remainder = 0;
  } else if (remainder < eps) {
    remainder = 0;
  }

  const downgoing = completedLegs % 2 === 0;
  // 距本程外壁端的沿束距离：上行程按 skip 内路径对称折算
  const u = downgoing ? remainder : leg - remainder;

  // 三角形 OAP 余弦定理求 |OP|，埋深 = 外半径 − 到管心的真实距离
  const radius = Math.sqrt(
    outerRadius ** 2 + u ** 2 - 2 * outerRadius * u * Math.cos(angleRad),
  );
  const thickness = outerRadius - innerRadius;
  let depth = outerRadius - radius;
  // 数值误差钳位到 [0, 壁厚]
  depth = Math.min(Math.max(depth, 0), thickness);

  // 本程内已扫圆心角；上行程从本程外壁端（角位置 (k+1)·γ）往回扣
  const phi = Math.atan2(u * Math.sin(angleRad), outerRadius - u * Math.cos(angleRad));
  const swept = downgoing
    ? completedLegs * gamma + phi
    : (completedLegs + 1) * gamma - phi;

  const atSurface = remainder === 0;
  const reflections = atSurface ? Math.max(0, completedLegs - 1) : completedLegs;

  return {
    depth,
    surfaceDistance: outerRadius * swept,
    completedLegs,
    legIndex: completedLegs + 1,
    reflections,
    direction: downgoing ? 'downgoing' : 'upgoing',
  };
}

module.exports = {
  innerIncidenceAngle,
  maxRefractedAngle,
  legPath,
  legCentralAngle,
  pathForLegs,
  surfaceDistanceForLegs,
  locateEcho,
};
