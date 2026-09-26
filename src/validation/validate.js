'use strict';

/**
 * 非法参数拦截：所有校验在进入几何计算之前完成，
 * 每条规则返回一条带原因的中文描述，收集后统一打回，
 * 避免把非法值（如 90 度折射角）带进 cos 计算才崩。
 */

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkThickness(thickness) {
  if (!isFiniteNumber(thickness)) return '板厚必须是有限数值';
  if (thickness <= 0) return `板厚必须为正数，收到 ${thickness}`;
  return null;
}

function checkAngleDeg(angleDeg) {
  if (!isFiniteNumber(angleDeg)) return '折射角必须是有限数值（单位：度）';
  if (angleDeg <= 0 || angleDeg >= 90) {
    return (
      `折射角必须位于 (0, 90) 开区间内（单位：度），收到 ${angleDeg}；` +
      '等于 90 度时声束贴着板面传播，无法形成折线声程'
    );
  }
  return null;
}

function checkVelocity(velocity) {
  if (!isFiniteNumber(velocity)) return '材料声速必须是有限数值';
  if (velocity <= 0) return `材料声速必须为正数，收到 ${velocity}`;
  return null;
}

function checkEchoPath(echoPath) {
  if (!isFiniteNumber(echoPath)) return '回波声程必须是有限数值';
  if (echoPath < 0) return `回波声程不能为负，收到 ${echoPath}`;
  return null;
}

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
