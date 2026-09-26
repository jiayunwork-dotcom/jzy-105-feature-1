'use strict';

const { createApp } = require('./http/app');

const port = Number(process.env.PORT || 3000);
const app = createApp();

app.listen(port, () => {
  console.log(`声程几何核算服务已启动，监听端口 ${port}`);
});
