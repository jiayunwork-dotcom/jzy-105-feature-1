'use strict';

/**
 * 几何模型注册表：编排层按请求里的 geometry 字段挑实现，
 * 不声明 geometry 的一律按板材处理（兼容老调用方）。
 *
 * 每种几何模型实现同一组能力：
 *   validate(params)               自身的合法性检查，返回错误原因数组
 *   normalize(params)              规范化参数集（存配置、回显 input）
 *   pathForLegs(params, legs)      n 程累计声程
 *   surfaceDistanceForLegs(params, legs)  n 程累计表面距离（板：地面投影；管：外壁弧长）
 *   reflectionsForLegs(legs)       走完 n 程到达终点前的全反射次数
 *   locateEcho(params, echoPath)   回波埋深定位
 *   reportExtras(params)           模型专属附加报告字段
 *
 * 将来再加别的曲面几何时，在这里登记一个同接口的模型即可，
 * 编排层与 HTTP 路由都不用动。
 */

const plate = require('./plate');
const pipe = require('./pipe');
const { ValidationError } = require('../../errors');

const models = {
  [plate.type]: plate,
  [pipe.type]: pipe,
};

/** 按请求参数挑几何模型；geometry 缺省按板材，未知类型直接打回 */
function resolveModel(params) {
  const type = (params && params.geometry) || plate.type;
  const model = models[type];
  if (!model) {
    throw new ValidationError([
      `几何类型 geometry 只支持 ${Object.keys(models).join(' / ')}，收到 ${JSON.stringify(type)}`,
    ]);
  }
  return model;
}

module.exports = { resolveModel, models };
