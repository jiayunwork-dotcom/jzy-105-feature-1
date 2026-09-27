'use strict';

/**
 * 几何模型注册表：编排层只面向「几何模型」这一组统一能力
 * （程声程 / 表面距离 / 埋深定位 / 自身合法性检查），
 * 按请求里的 geometry 字段挑实现，不声明时一律按板材处理。
 * 将来新增曲面几何时在此登记即可，编排层与路由都不用动。
 */

const { createPlateModel } = require('./plate');
const { createPipeModel } = require('./pipe');
const { ValidationError } = require('../../errors');

const factories = {
  plate: createPlateModel,
  pipe: createPipeModel,
};

const DEFAULT_GEOMETRY = 'plate';

/** 按参数里的几何类型创建几何模型；未声明 geometry 时按板材 */
function createGeometryModel(params) {
  const kind = params && params.geometry !== undefined ? params.geometry : DEFAULT_GEOMETRY;
  const factory = factories[kind];
  if (!factory) {
    throw new ValidationError([
      `几何类型 geometry 只支持 plate（板材）与 pipe（管材），收到 ${String(kind)}；` +
      '不声明 geometry 时按板材处理',
    ]);
  }
  return factory(params);
}

module.exports = { createGeometryModel };
