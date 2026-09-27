'use strict';

/**
 * 原子参数检查：每条规则返回一条带原因的中文描述，通过返回 null。
 * 板材与管材两种几何模型共用这一组基础规则（折射角区间、声速为正、
 * 回波声程非负等），各自特有的规则（板厚 / 壁厚 / 外径 / 几何可达性）
 * 由模型自己补充。
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

module.exports = { isFiniteNumber, checkThickness, checkAngleDeg, checkVelocity, checkEchoPath };
