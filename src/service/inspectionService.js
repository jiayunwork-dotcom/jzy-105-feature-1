'use strict';

/**
 * 核算编排层：先做参数拦截，再按几何类型挑几何模型出报告。
 * 板材 / 管材各自实现同一组几何能力（见 geometry/models/），
 * 本层只面向「几何模型」这一抽象编排，不出现按几何类型分支的算法；
 * HTTP 路由只负责收发。
 *
 * 单位约定：厚度与声程 mm，折射角 度，声速 m/s，传播时间 µs。
 */

const { createGeometryModel } = require('../geometry/models');
const { validateProbeParams, validateEchoReading } = require('../validation/validate');
const { ValidationError, NotFoundError } = require('../errors');

/** 斜边声程(mm) 按材料声速(m/s) 折算单程传播时间(µs) */
function timeOfFlightUs(pathMm, velocityMPerS) {
  return (pathMm / velocityMPerS) * 1000;
}

function legReport(model, velocity, legs) {
  const path = model.pathForLegs(legs);
  return {
    legs,
    path,
    surfaceDistance: model.surfaceDistanceForLegs(legs),
    reflections: model.reflectionsForLegs(legs),
    timeOfFlightUs: timeOfFlightUs(path, velocity),
  };
}

/** 折线声程几何报告：半跨、一个 skip、一个半 skip 的声程 / 表面距离 / 反射次数 */
function skipGeometryReport(params) {
  const model = createGeometryModel(params);
  const errors = [...validateProbeParams(params), ...model.validateParams()];
  if (errors.length > 0) throw new ValidationError(errors);

  return {
    geometry: model.kind,
    input: model.inputEcho(),
    halfSkip: legReport(model, params.velocity, 1),
    oneSkip: legReport(model, params.velocity, 2),
    oneAndHalfSkip: legReport(model, params.velocity, 3),
    ...model.extras(),
  };
}

/** 回波埋深反推报告：埋深、表面距离、所在程数、反射次数、声束方向 */
function echoDepthReport(params) {
  const { echoPath } = params || {};
  const model = createGeometryModel(params);
  const errors = [
    ...validateProbeParams(params),
    ...model.validateParams(),
    ...validateEchoReading(echoPath),
  ];
  if (errors.length > 0) throw new ValidationError(errors);

  const located = model.locateEcho(echoPath);
  return {
    geometry: model.kind,
    input: { ...model.inputEcho(), echoPath },
    ...located,
    ...model.extras(),
    timeOfFlightUs: timeOfFlightUs(echoPath, params.velocity),
  };
}

/** 保存一套命名探伤配置（先过参数拦截；老式三要素配置按板材理解） */
function saveConfig(store, name, params) {
  const model = createGeometryModel(params);
  const errors = [...validateProbeParams(params), ...model.validateParams()];
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
