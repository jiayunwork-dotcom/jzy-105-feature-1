'use strict';

/**
 * 非法参数拦截：所有校验在进入几何计算之前完成，
 * 每条规则返回一条带原因的中文描述，收集后统一打回，
 * 避免把非法值（如 90 度折射角）带进 cos 计算才崩。
 *
 * 这里是板材口径的探伤三要素校验（兼容入口）；
 * 管材的合法性检查由管材几何模型自己承担（见 geometry/models/pipe.js）。
 */

const { checkThickness, checkAngleDeg, checkVelocity, checkEchoPath } = require('./checks');

/** 校验探伤三要素（板厚 / 折射角 / 声速），返回错误原因数组（空数组表示通过） */
function validateProbeParams(params) {
  const { thickness, angleDeg, velocity } = params || {};
  return [checkThickness(thickness), checkAngleDeg(angleDeg), checkVelocity(velocity)].filter(Boolean);
}

/** 校验回波声程读数，返回错误原因数组（空数组表示通过） */
function validateEchoReading(echoPath) {
  return [checkEchoPath(echoPath)].filter(Boolean);
}

module.exports = { validateProbeParams, validateEchoReading };
