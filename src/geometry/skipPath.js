'use strict';

/**
 * 折线声程（斜边）几何。
 *
 * 探头以折射角 beta（相对于板面法线）把声束斜射进厚度为 T 的板材，
 * 声束在上下表面之间全反射、折线前进。把“打到对面”的单程称为一程（半跨）：
 *   一程斜边声程 = T / cos(beta)
 *   一个完整 skip（去 + 回，两程）= 2T / cos(beta)
 * 折射角趋零时 cos(beta) -> 1，一个 skip 的声程收敛到 2T（正入射极限）。
 */

/** 单个半跨（一程）的斜边声程：T / cos(beta) */
function legPath(thickness, angleRad) {
  return thickness / Math.cos(angleRad);
}

/** 一个完整 skip（两程）的斜边声程：2T / cos(beta) */
function skipPath(thickness, angleRad) {
  return (2 * thickness) / Math.cos(angleRad);
}

/** n 程（n 个半跨）累计的斜边声程 */
function pathForLegs(thickness, angleRad, legs) {
  return (legs * thickness) / Math.cos(angleRad);
}

module.exports = { legPath, skipPath, pathForLegs };
