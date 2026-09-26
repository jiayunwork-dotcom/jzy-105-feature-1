'use strict';

const { legPath } = require('./skipPath');

/**
 * 由回波声程反推缺陷埋深（相似三角形 + 折回规则）。
 *
 * 设一程斜边声程为 ℓ = T / cos(beta)，回波声程读数为 S（探头到反射体的单程声程）。
 * 已完成 k = floor(S / ℓ) 程，程内余量 r = S - k·ℓ：
 *   - k 为偶数：当前程声束下行，埋深 d = r·cos(beta)；
 *   - k 为奇数：当前程已在底面反射、声束上行，埋深 d = T - r·cos(beta)。
 * 水平投影单调前进，缺陷的地面距离恒为 S·sin(beta)。
 * 到达缺陷前经历的全反射次数 = 已完成程数 k；
 * 若 S 恰好落在整程边界（反射体就在表面），落面本身不计反射，取 k - 1。
 *
 * 这样无论读数落在半跨内、半 skip 到一个 skip 之间，还是超过两个 skip，
 * 都按同一条折回规则计数，而不会把总声程直接当成垂直埋深。
 */
function locateEcho(thickness, angleRad, echoPath) {
  const leg = legPath(thickness, angleRad);
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
  const vertical = remainder * Math.cos(angleRad);
  let depth = downgoing ? vertical : thickness - vertical;
  // 数值误差钳位到 [0, T]
  depth = Math.min(Math.max(depth, 0), thickness);

  const atSurface = remainder === 0;
  const reflections = atSurface ? Math.max(0, completedLegs - 1) : completedLegs;

  return {
    depth,
    surfaceDistance: echoPath * Math.sin(angleRad),
    completedLegs,
    legIndex: completedLegs + 1,
    reflections,
    direction: downgoing ? 'downgoing' : 'upgoing',
  };
}

module.exports = { locateEcho };
