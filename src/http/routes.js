'use strict';

/**
 * HTTP 路由：只负责解析请求、调用编排服务、回写响应。
 * 折线几何、埋深反推等核心算法一律不在此处出现。
 */

const express = require('express');
const service = require('../service/inspectionService');

function createRouter(configStore) {
  const router = express.Router();

  // 同步处理器包装：把抛出的错误交给统一错误中间件
  const handle = (fn) => (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      next(err);
    }
  };

  // 折线声程几何核算：半跨 / 一个 skip / 一个半 skip
  router.post('/skip-geometry', handle((req, res) => {
    res.json(service.skipGeometryReport(req.body));
  }));

  // 回波埋深反推
  router.post('/echo-depth', handle((req, res) => {
    res.json(service.echoDepthReport(req.body));
  }));

  // 探伤配置：命名存取（运行期有效，不跨重启保留）
  router.put('/configs/:name', handle((req, res) => {
    res.json(service.saveConfig(configStore, req.params.name, req.body));
  }));

  router.get('/configs', handle((req, res) => {
    res.json({ configs: configStore.list() });
  }));

  router.get('/configs/:name', handle((req, res) => {
    const config = service.requireConfig(configStore, req.params.name);
    res.json({ name: req.params.name, ...config });
  }));

  router.delete('/configs/:name', handle((req, res) => {
    service.requireConfig(configStore, req.params.name);
    configStore.remove(req.params.name);
    res.status(204).end();
  }));

  // 用命名配置做几何核算 / 埋深反推
  router.post('/configs/:name/skip-geometry', handle((req, res) => {
    const config = service.requireConfig(configStore, req.params.name);
    const report = service.skipGeometryReport(config);
    res.json({ config: req.params.name, ...report });
  }));

  router.post('/configs/:name/echo-depth', handle((req, res) => {
    const config = service.requireConfig(configStore, req.params.name);
    const report = service.echoDepthReport({ ...config, echoPath: (req.body || {}).echoPath });
    res.json({ config: req.params.name, ...report });
  }));

  return router;
}

module.exports = { createRouter };
