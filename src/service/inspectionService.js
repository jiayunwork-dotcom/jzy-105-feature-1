'use strict';

/**
 * 核算编排层：先做参数拦截，再调用几何核心出报告。
 * HTTP 路由只负责收发，所有几何与反推逻辑都收在这里及 geometry/ 模块。
 *
 * 单位约定：板厚与声程 mm，折射角 度，声速 m/s，传播时间 µs。
 */

const { pathForLegs } = require('../geometry/skipPath');
const { surfaceDistanceForLegs, reflectionsForLegs } = require('../geometry/groundDistance');
const { locateEcho } = require('../geometry/echoDepth');
const { validateProbeParams, validateEchoReading } = require('../validation/validate');
const { ValidationError, NotFoundError } = require('../errors');

const DEG_TO_RAD = Math.PI / 180;

/** 斜边声程(mm) 按材料声速(m/s) 折算单程传播时间(µs) */
function timeOfFlightUs(pathMm, velocityMPerS) {
  return (pathMm / velocityMPerS) * 1000;
}

function legReport(thickness, angleRad, velocity, legs) {
  const path = pathForLegs(thickness, angleRad, legs);
  return {
    legs,
    path,
    surfaceDistance: surfaceDistanceForLegs(thickness, angleRad, legs),
    reflections: reflectionsForLegs(legs),
    timeOfFlightUs: timeOfFlightUs(path, velocity),
  };
}

/** 折线声程几何报告：半跨、一个 skip、一个半 skip 的声程 / 地面距离 / 反射次数 */
function skipGeometryReport(params) {
  const errors = validateProbeParams(params);
  if (errors.length > 0) throw new ValidationError(errors);

  const { thickness, angleDeg, velocity } = params;
  const angleRad = angleDeg * DEG_TO_RAD;
  return {
    input: { thickness, angleDeg, velocity },
    halfSkip: legReport(thickness, angleRad, velocity, 1),
    oneSkip: legReport(thickness, angleRad, velocity, 2),
    oneAndHalfSkip: legReport(thickness, angleRad, velocity, 3),
  };
}

/** 回波埋深反推报告：埋深、地面距离、所在程数、反射次数、声束方向 */
function echoDepthReport(params) {
  const { echoPath } = params || {};
  const errors = [...validateProbeParams(params), ...validateEchoReading(echoPath)];
  if (errors.length > 0) throw new ValidationError(errors);

  const { thickness, angleDeg, velocity } = params;
  const angleRad = angleDeg * DEG_TO_RAD;
  const located = locateEcho(thickness, angleRad, echoPath);
  return {
    input: { thickness, angleDeg, velocity, echoPath },
    ...located,
    timeOfFlightUs: timeOfFlightUs(echoPath, velocity),
  };
}

/** 保存一套命名探伤配置（先过参数拦截） */
function saveConfig(store, name, params) {
  const errors = validateProbeParams(params);
  if (errors.length > 0) throw new ValidationError(errors);
  const saved = store.save(name, params);
  return { name, ...saved };
}

/** 按名取配置，取不到抛 404 */
function requireConfig(store, name) {
  const config = store.get(name);
  if (!config) throw new NotFoundError(`未找到名为「${name}」的探伤配置`);
  return config;
}

module.exports = { skipGeometryReport, echoDepthReport, saveConfig, requireConfig };
