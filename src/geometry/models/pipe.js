'use strict';

/**
 * 管材几何模型：探头贴管子外壁、沿周向斜射，
 * 声束在凸外壁与内壁之间走非等腰折线。
 * 纯几何关系在 geometry/pipeRay.js，这里把管材参数（外径 + 壁厚）
 * 折算成内外半径，并实现与板材一致的模型接口，外加管材特有的
 * 合法性检查（外径为正、壁厚小于外半径、声束必须能够触及内壁）。
 *
 * 表面距离 = 沿外壁表面的弧长（对应板材的地面投影距离）。
 */

const pipeRay = require('../pipeRay');
const { reflectionsForLegs } = require('../groundDistance');
const { isFiniteNumber, checkVelocity } = require('../../validation/checks');

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function checkOuterDiameter(outerDiameter) {
  if (!isFiniteNumber(outerDiameter)) return '外径必须是有限数值';
  if (outerDiameter <= 0) return `外径必须为正数，收到 ${outerDiameter}`;
  return null;
}

function checkWallThickness(thickness, outerDiameter) {
  if (!isFiniteNumber(thickness)) return '壁厚必须是有限数值';
  if (thickness <= 0) return `壁厚必须为正数，收到 ${thickness}`;
  if (isFiniteNumber(outerDiameter) && outerDiameter > 0 && thickness >= outerDiameter / 2) {
    return `壁厚必须小于外半径（外径的一半），收到壁厚 ${thickness}、外径 ${outerDiameter}`;
  }
  return null;
}

function checkAngleDeg(angleDeg) {
  if (!isFiniteNumber(angleDeg)) return '折射角必须是有限数值（单位：度）';
  if (angleDeg <= 0 || angleDeg >= 90) {
    return (
      `折射角必须位于 (0, 90) 开区间内（单位：度），收到 ${angleDeg}；` +
      '等于 90 度时声束贴着外壁传播，无法形成折线声程'
    );
  }
  return null;
}

/**
 * 几何可达性：R·sin β 不小于内半径时，声束根本碰不到内壁，
 * 会贴着内壁擦过去再回到外壁，没有折线可言，必须在计算前拦下。
 */
function checkBeamReach(outerDiameter, thickness, angleDeg) {
  const outerRadius = outerDiameter / 2;
  const innerRadius = outerRadius - thickness;
  const angleRad = angleDeg * DEG_TO_RAD;
  if (outerRadius * Math.sin(angleRad) < innerRadius) return null;
  const maxAngleDeg = pipeRay.maxRefractedAngle(outerRadius, innerRadius) * RAD_TO_DEG;
  return (
    `按外径 ${outerDiameter} mm、壁厚 ${thickness} mm，` +
    `折射角最大允许到 ${maxAngleDeg.toFixed(3)} 度（内半径除以外半径的反正弦），收到 ${angleDeg} 度；` +
    '此时声束碰不到内壁、贴着内壁擦过去再回到外壁，没有折线可言'
  );
}

/** 由管材参数折算内外半径 */
function radii(params) {
  const outerRadius = params.outerDiameter / 2;
  return { outerRadius, innerRadius: outerRadius - params.thickness };
}

const pipe = {
  type: 'pipe',

  /** 管材口径的合法性检查：板材那几条基础规则依旧有效，再加管材特有规则 */
  validate(params) {
    const { outerDiameter, thickness, angleDeg, velocity } = params || {};
    const errors = [
      checkOuterDiameter(outerDiameter),
      checkWallThickness(thickness, outerDiameter),
      checkAngleDeg(angleDeg),
      checkVelocity(velocity),
    ].filter(Boolean);
    // 基本参数都站得住，才检查声束能否触及内壁
    if (errors.length === 0) {
      const unreachable = checkBeamReach(outerDiameter, thickness, angleDeg);
      if (unreachable) errors.push(unreachable);
    }
    return errors;
  },

  /** 规范化参数集（存配置、回显 input 用）：管材参数 = 外径 + 壁厚 + 折射角 + 声速 */
  normalize(params) {
    return {
      geometry: pipe.type,
      outerDiameter: params.outerDiameter,
      thickness: params.thickness,
      angleDeg: params.angleDeg,
      velocity: params.velocity,
    };
  },

  pathForLegs(params, legs) {
    const { outerRadius, innerRadius } = radii(params);
    return pipeRay.pathForLegs(outerRadius, innerRadius, params.angleDeg * DEG_TO_RAD, legs);
  },

  surfaceDistanceForLegs(params, legs) {
    const { outerRadius, innerRadius } = radii(params);
    return pipeRay.surfaceDistanceForLegs(outerRadius, innerRadius, params.angleDeg * DEG_TO_RAD, legs);
  },

  /** 反射次数口径与板材一致：走完 n 程到达终点前经历 n − 1 次全反射 */
  reflectionsForLegs(legs) {
    return reflectionsForLegs(legs);
  },

  locateEcho(params, echoPath) {
    const { outerRadius, innerRadius } = radii(params);
    return pipeRay.locateEcho(outerRadius, innerRadius, params.angleDeg * DEG_TO_RAD, echoPath);
  },

  /** 管材附加报告字段：内壁入射角、这组外径壁厚下允许的最大折射角 */
  reportExtras(params) {
    const { outerRadius, innerRadius } = radii(params);
    const angleRad = params.angleDeg * DEG_TO_RAD;
    return {
      innerIncidenceAngleDeg: pipeRay.innerIncidenceAngle(outerRadius, innerRadius, angleRad) * RAD_TO_DEG,
      maxAngleDeg: pipeRay.maxRefractedAngle(outerRadius, innerRadius) * RAD_TO_DEG,
    };
  },
};

module.exports = pipe;
