'use strict';

const express = require('express');
const { createRouter } = require('./routes');
const { createConfigStore } = require('../config/store');
const { ValidationError, NotFoundError } = require('../errors');

function createApp(options = {}) {
  const app = express();
  const configStore = options.configStore || createConfigStore();

  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/', (req, res) => {
    res.json({
      service: '超声斜射探伤折线声程几何核算服务',
      endpoints: {
        'POST /api/skip-geometry': '折线声程几何核算（半跨 / 一个 skip / 一个半 skip），geometry 选 plate（缺省）或 pipe',
        'POST /api/echo-depth': '由回波声程反推缺陷埋深，geometry 选 plate（缺省）或 pipe',
        'PUT /api/configs/:name': '保存命名探伤配置（板材：板厚 / 折射角 / 声速；管材：geometry=pipe + 外径 / 壁厚 / 折射角 / 声速）',
        'GET /api/configs': '列出全部探伤配置',
        'GET /api/configs/:name': '取出一套探伤配置',
        'DELETE /api/configs/:name': '删除一套探伤配置',
        'POST /api/configs/:name/skip-geometry': '按命名配置做几何核算',
        'POST /api/configs/:name/echo-depth': '按命名配置做埋深反推',
      },
    });
  });

  app.use('/api', createRouter(configStore));

  app.use((req, res) => {
    res.status(404).json({ error: '接口不存在' });
  });

  // 统一错误出口：参数拦截 400，配置缺失 404，其余 500
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: '参数非法', details: err.details });
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: '请求体不是合法 JSON' });
    }
    console.error(err);
    return res.status(500).json({ error: '服务内部错误' });
  });

  return app;
}

module.exports = { createApp };
