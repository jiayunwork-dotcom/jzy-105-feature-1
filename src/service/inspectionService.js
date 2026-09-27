'use strict';

/**
 * 核算编排层：先做参数拦截，再按几何类型挑模型出报告。
 * HTTP 路由只负责收发；板材与管材的几何差异全部收敛在
 * geometry/models/ 里的可替换模型层，这里不出现
 * 「是管这样算、是板那样算」的分支。
 *
 * 单位约定：厚度/外径与声程 mm，折射角 度，声速 m/s，传播时间 µs。
 */

const { resolveModel } = require('../geometry/models');
const { validateEchoReading } = require('../validation/validate');
const { ValidationError, NotFoundError } = require('../errors');

/** 斜边声程(mm) 按材料声速(m/s) 折算单程传播时间(µs) */
function timeOfFlightUs(pathMm, velocityMPerS) {
  return (pathMm / velocityMPerS) * 1000;
}

function legReport(model, params, legs) {
  const path = model.pathForLegs(params, legs);
  return {
    legs,
    path,
    surfaceDistance: model.surfaceDistanceForLegs(params, legs),
    reflections: model.reflectionsForLegs(legs),
    timeOfFlightUs: timeOfFlightUs(path, params.velocity),
  };
}

/** 折线声程几何报告：半跨、一个 skip、一个半 skip 的声程 / 表面距离 / 反射次数 */
function skipGeometryReport(params) {
  const model = resolveModel(params);
  const errors = model.validate(params);
  if (errors.length > 0) throw new ValidationError(errors);

  return {
    geometry: model.type,
    input: model.normalize(params),
    ...model.reportExtras(params),
    halfSkip: legReport(model, params, 1),
    oneSkip: legReport(model, params, 2),
    oneAndHalfSkip: legReport(model, params, 3),
  };
}

/** 回波埋深反推报告：埋深、表面距离、所在程数、反射次数、声束方向 */
function echoDepthReport(params) {
  const { echoPath } = params || {};
  const model = resolveModel(params);
  const errors = [...model.validate(params), ...validateEchoReading(echoPath)];
  if (errors.length > 0) throw new ValidationError(errors);

  const located = model.locateEcho(params, echoPath);
  return {
    geometry: model.type,
    input: { ...model.normalize(params), echoPath },
    ...located,
    timeOfFlightUs: timeOfFlightUs(echoPath, params.velocity),
  };
}

/** 保存一套命名探伤配置（先过该几何模型自己的参数拦截） */
function saveConfig(store, name, params) {
  const model = resolveModel(params);
  const errors = model.validate(params);
  if (errors.length > 0) throw new ValidationError(errors);
  const saved = store.save(name, model.normalize(params));
  return { name, ...saved };
}

/** 按名取配置，取不到抛 404 */
function requireConfig(store, name) {
  const config = store.get(name);
  if (!config) throw new NotFoundError(`未找到名为「${name}」的探伤配置`);
  return config;
}

module.exports = { skipGeometryReport, echoDepthReport, saveConfig, requireConfig };
