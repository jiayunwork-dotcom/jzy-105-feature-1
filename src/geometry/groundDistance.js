'use strict';

/**
 * 地面投影距离与反射次数推算。
 *
 * 每一程的水平投影（半跨地面距离）为 T * tan(beta)。
 * 声束在水平方向上只前进不折返，因此 n 程累计地面距离为 n * T * tan(beta)。
 * 到达终点前经历的全反射次数 = 程数 - 1（终点落面本身不算一次反射）。
 */

/** 单个半跨的地面投影距离：T * tan(beta) */
function legSurfaceDistance(thickness, angleRad) {
  return thickness * Math.tan(angleRad);
}

/** n 程累计的地面投影距离：n * T * tan(beta) */
function surfaceDistanceForLegs(thickness, angleRad, legs) {
  return legs * thickness * Math.tan(angleRad);
}

/** 走完 n 程到达终点前经历的全反射次数 */
function reflectionsForLegs(legs) {
  return legs - 1;
}

module.exports = { legSurfaceDistance, surfaceDistanceForLegs, reflectionsForLegs };
