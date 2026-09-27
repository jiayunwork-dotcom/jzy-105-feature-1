'use strict';

/**
 * 管材几何模型：探头贴在管子外壁、沿周向斜射。
 *
 * 调用方给外径与壁厚：外半径 R = 外径 / 2，内半径 r = R − 壁厚。
 * 折射角 β 仍相对入射点处的外壁法线计量。声束在材料里走直线，
 * 它到管心的最近距离（冲击参数）守恒：b = R·sinβ，因此打到内壁时的
 * 入射角 θ 满足 sinθ = R·sinβ / r —— 外壁是凸的，θ 恒大于 β。
 * 内壁全反射后按对称路径回到外壁，一个 skip 由两段等长的程组成。
 *
 * 一程（外壁 → 内壁）：
 *   声程 ℓ = √(R² − b²) − √(r² − b²)
 *   扫过的圆心角 α = θ − β，外壁弧长 = R·α（板材「地面距离」的对应量）
 *
 * 埋深不再与声程成线性（不能按余弦折一下了事）：程内走了 x 时，
 * 所在点到管心的距离 ρ = √(R² − 2x·R·cosβ + x²)，埋深 = R − ρ。
 * 读数跨过内壁反射进入上行段、或超过两个 skip 时，按折回规则定位到
 * 对应那一程，并把上行段映射到等效下行程内位置 x = ℓ − 程内余量再算。
 * 缺陷在外壁上的弧长位置 = R × 累计圆心角；程内已扫圆心角 = asin(b/ρ) − β。
 *
 * 几何上走不通的情形在计算前拦下：R·sinβ ≥ r 时声束碰不到内壁，
 * 贴壁擦过后直接回到外壁，没有折线可言；折射角最大允许 asin(r/R)。
 */

const { reflectionsForLegs } = require('../groundDistance');

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function createPipeModel(params) {
  const { outerDiameter, thickness, angleDeg, velocity } = params || {};

  /**
   * 几何专属拦截：外径、壁厚与外半径的关系、擦壁退化。
   * 壁厚为正、折射角在 (0, 90)、声速为正由共享规则（validation/validate.js）拦截。
   */
  function validateParams() {
    const errors = [];

    const diameterOk = isFiniteNumber(outerDiameter) && outerDiameter > 0;
    if (!isFiniteNumber(outerDiameter)) {
      errors.push('外径必须是有限数值（单位：mm）');
    } else if (outerDiameter <= 0) {
      errors.push(`外径必须为正数，收到 ${outerDiameter}`);
    }

    // 以下相对关系只在相关输入本身合法时才有意义，避免把 NaN 带进比较
    const thicknessOk = isFiniteNumber(thickness) && thickness > 0;
    if (diameterOk && thicknessOk) {
      const R = outerDiameter / 2;
      const innerR = R - thickness;
      if (thickness >= R) {
        errors.push(
          `壁厚必须小于外半径（外径的一半），收到壁厚 ${thickness}、外半径 ${R}；` +
          '壁厚不小于外半径时没有内孔，管材几何不成立',
        );
      } else if (isFiniteNumber(angleDeg) && angleDeg > 0 && angleDeg < 90) {
        const beta = angleDeg * DEG_TO_RAD;
        if (R * Math.sin(beta) >= innerR) {
          const maxAngleDeg = Math.round(Math.asin(innerR / R) * RAD_TO_DEG * 1000) / 1000;
          errors.push(
            `按外径 ${outerDiameter}、壁厚 ${thickness}（内半径 ${innerR}），` +
            `折射角最大允许 ${maxAngleDeg} 度（内半径/外半径的反正弦），收到 ${angleDeg} 度；` +
            '此时 R·sin(折射角) 不小于内半径，声束碰不到内壁、贴壁擦过后直接回到外壁，没有折线可言',
          );
        }
      }
    }
    return errors;
  }

  // 以下计算只在参数通过校验后被编排层调用；几何常量按需算一次
  let cached = null;

  /** 由（已校验的）参数推出全部几何常量 */
  function metrics() {
    if (cached) return cached;
    const R = outerDiameter / 2;
    const innerR = R - thickness;
    const beta = angleDeg * DEG_TO_RAD;
    const impact = R * Math.sin(beta); // 声束到管心的最近距离，沿程守恒
    const theta = Math.asin(impact / innerR); // 内壁入射角（弧度）
    cached = {
      R,
      innerR,
      beta,
      impact,
      theta,
      // 一程声程：外壁交点到弦垂足的距离减去内壁交点到垂足的距离
      leg: Math.sqrt(R * R - impact * impact) - Math.sqrt(innerR * innerR - impact * impact),
      legAngle: theta - beta, // 一程扫过的圆心角
    };
    return cached;
  }

  /**
   * 由回波声程反推缺陷埋深（真实径向距离 + 折回规则）。
   * 反射次数口径与板材一致：落面本身不计反射。
   */
  function locateEcho(echoPath) {
    const { R, beta, impact, leg, legAngle } = metrics();
    let completedLegs = Math.floor(echoPath / leg);
    let remainder = echoPath - completedLegs * leg;

    // 与板材同一口径：读数恰好落在壁面上时归入已完成程，落面本身不计反射。
    const eps = 1e-9 * leg;
    if (remainder > 0 && leg - remainder < eps) {
      completedLegs += 1;
      remainder = 0;
    } else if (remainder < eps) {
      remainder = 0;
    }

    const downgoing = completedLegs % 2 === 0;
    // 上行段按折回规则映射到等效下行程内位置：
    // 同一 skip 内距入射点 s 与距回到外壁 s 的两点埋深相同
    const x = downgoing ? remainder : leg - remainder;
    const rho = Math.sqrt(R * R - 2 * x * R * Math.cos(beta) + x * x);
    let depth = R - rho;
    // 数值误差钳位到 [0, 壁厚]
    depth = Math.min(Math.max(depth, 0), thickness);

    // 缺陷相对入射点的累计圆心角：每整程扫过 legAngle，
    // 程内已扫角度 = 缺陷点处声束与当地法线夹角 asin(b/ρ) − β
    const legAdvance = Math.asin(Math.min(1, impact / rho)) - beta;
    const swept = downgoing
      ? completedLegs * legAngle + legAdvance
      : (completedLegs + 1) * legAngle - legAdvance;

    const atSurface = remainder === 0;
    const reflections = atSurface ? Math.max(0, completedLegs - 1) : completedLegs;

    return {
      depth,
      surfaceDistance: R * swept, // 沿外壁表面的弧长位置
      completedLegs,
      legIndex: completedLegs + 1,
      reflections,
      direction: downgoing ? 'downgoing' : 'upgoing',
    };
  }

  return {
    kind: 'pipe',
    validateParams,
    inputEcho: () => ({ geometry: 'pipe', outerDiameter, thickness, angleDeg, velocity }),
    pathForLegs: (legs) => legs * metrics().leg,
    surfaceDistanceForLegs: (legs) => legs * metrics().R * metrics().legAngle,
    reflectionsForLegs,
    locateEcho,
    /** 管材额外报告内壁入射角 */
    extras: () => ({ innerAngleDeg: metrics().theta * RAD_TO_DEG }),
  };
}

module.exports = { createPipeModel };
