'use strict';

/**
 * 板材几何模型：平行板里的等腰折线（相似三角形那一套）。
 * 纯几何函数在 geometry/ 既有模块里，这里把它们收敛成与管材一致的
 * 模型接口（参数拦截 / 程声程 / 表面距离 / 埋深定位），供编排层无差别调用。
 *
 * 表面距离 = 地面投影距离。
 */

const skipPath = require('../skipPath');
const groundDistance = require('../groundDistance');
const echoDepth = require('../echoDepth');
const { validateProbeParams } = require('../../validation/validate');

const DEG_TO_RAD = Math.PI / 180;

const plate = {
  type: 'plate',

  /** 板材口径的合法性检查：板厚为正、折射角 (0, 90)、声速为正 */
  validate(params) {
    return validateProbeParams(params);
  },

  /** 规范化参数集（存配置、回显 input 用）；显式声明过 geometry 的保留该字段 */
  normalize(params) {
    const normalized = {
      thickness: params.thickness,
      angleDeg: params.angleDeg,
      velocity: params.velocity,
    };
    if (Object.prototype.hasOwnProperty.call(params, 'geometry')) {
      normalized.geometry = plate.type;
    }
    return normalized;
  },

  pathForLegs(params, legs) {
    return skipPath.pathForLegs(params.thickness, params.angleDeg * DEG_TO_RAD, legs);
  },

  surfaceDistanceForLegs(params, legs) {
    return groundDistance.surfaceDistanceForLegs(params.thickness, params.angleDeg * DEG_TO_RAD, legs);
  },

  reflectionsForLegs(legs) {
    return groundDistance.reflectionsForLegs(legs);
  },

  locateEcho(params, echoPath) {
    return echoDepth.locateEcho(params.thickness, params.angleDeg * DEG_TO_RAD, echoPath);
  },

  /** 板材没有模型专属的附加报告字段 */
  reportExtras() {
    return {};
  },
};

module.exports = plate;
