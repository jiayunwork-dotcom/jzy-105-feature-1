'use strict';

/** 参数非法（HTTP 400）：携带全部拦截原因 */
class ValidationError extends Error {
  constructor(details) {
    super('参数非法');
    this.name = 'ValidationError';
    this.details = details;
  }
}

/** 资源不存在（HTTP 404），如未命名的探伤配置 */
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

module.exports = { ValidationError, NotFoundError };
