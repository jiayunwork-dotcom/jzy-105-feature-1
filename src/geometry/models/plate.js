'use strict';

/**
 * 板材几何模型：平行板里的等腰折线。
 *
 * 实现几何模型的统一能力：程声程、表面距离、埋深定位、自身合法性检查。
 * 板材没有超出共享规则（validation/validate.js）之外的专属拦截，
 * 具体的声程 / 地面距离 / 埋深算法沿用 geometry/ 下的既有模块。
 */

const { pathForLegs } = require('../skipPath');
const { surfaceDistanceForLegs, reflectionsForLegs } = require('../groundDistance');
const { locateEcho } = require('../echoDepth');

const DEG_TO_RAD = Math.PI / 180;

function createPlateModel(params) {
  const { thickness, angleDeg, velocity } = params || {};
  // 以下方法只在参数通过校验后被编排层调用
  const angleRad = angleDeg * DEG_TO_RAD;

  return {
    kind: 'plate',

    /** 几何专属拦截：板材没有专属规则（板厚 / 折射角 / 声速由共享规则拦截） */
    validateParams: () => [],

    /** 报告中的输入回显 */
    inputEcho: () => ({ thickness, angleDeg, velocity }),

    /** n 程（n 个半跨）累计的斜边声程 */
    pathForLegs: (legs) => pathForLegs(thickness, angleRad, legs),

    /** n 程累计的地面投影距离 */
    surfaceDistanceForLegs: (legs) => surfaceDistanceForLegs(thickness, angleRad, legs),

    /** 走完 n 程到达终点前经历的全反射次数 */
    reflectionsForLegs,

    /** 由回波声程按相似三角形 + 折回规则反推埋深 */
    locateEcho: (echoPath) => locateEcho(thickness, angleRad, echoPath),

    /** 板材没有额外要报告的几何量 */
    extras: () => ({}),
  };
}

module.exports = { createPlateModel };
