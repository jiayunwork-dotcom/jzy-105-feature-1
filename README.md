# 超声斜射探伤折线声程几何核算服务

面向钢板对接焊缝超声斜射探伤的常驻几何核算服务。探头以折射角 β 把声束斜射进厚度 T 的板材，声束在上下表面之间全反射、折线前进，本服务负责把这条折线路径算清楚：走一个来回（一个 skip）是多少声程、声束落在板另一面的地面投影有多远、遇到回波时缺陷大概埋在多深。

只经 HTTP 对外服务，无网页；不承担探伤委托单或质检流程，只专注折线声程几何本身。

## 几何模型

| 量 | 公式 |
| --- | --- |
| 半跨（一程）斜边声程 | `T / cos β` |
| 一个 skip（两程）斜边声程 | `2T / cos β` |
| 半跨地面投影距离 | `T · tan β` |
| 一个 skip 地面投影距离 | `2T · tan β` |
| 走完 n 程前的全反射次数 | `n − 1` |
| 正入射极限（β → 0） | 一个 skip 声程 → `2T` |

回波埋深反推（S 为回波声程读数，ℓ = T / cos β）：已完成 k = ⌊S / ℓ⌋ 程、程内余量 r = S − k·ℓ，按相似三角形：

- k 为偶数（当前程下行）：埋深 `d = r · cos β`
- k 为奇数（已在底面反射、上行）：埋深 `d = T − r · cos β`
- 缺陷地面距离恒为 `S · sin β`（水平方向只前进不折返）
- 到达缺陷前的反射次数 = 已完成程数 k（读数超过两个 skip 时同样按此折回规则计数，不会把总声程直接当成垂直埋深）

单位约定：板厚与声程 mm，折射角 度，声速 m/s，传播时间 µs。

## 运行

```bash
npm install
npm start          # 监听 PORT（默认 3000）
npm test           # node:test 全量测试
```

Docker 一键构建、启动即对外应答：

```bash
docker build -t skip-geometry .
docker run --rm -p 3000:3000 skip-geometry
```

## 接口

### `POST /api/skip-geometry` — 折线声程几何核算

```bash
curl -s localhost:3000/api/skip-geometry \
  -H 'content-type: application/json' \
  -d '{"thickness": 20, "angleDeg": 60, "velocity": 3230}'
```

返回半跨、一个 skip、一个半 skip 各自的斜边声程、地面距离、反射次数与单程传播时间：

```json
{
  "input": { "thickness": 20, "angleDeg": 60, "velocity": 3230 },
  "halfSkip":        { "legs": 1, "path": 40,  "surfaceDistance": 34.641..., "reflections": 0, "timeOfFlightUs": 12.383... },
  "oneSkip":         { "legs": 2, "path": 80,  "surfaceDistance": 69.282..., "reflections": 1, "timeOfFlightUs": 24.767... },
  "oneAndHalfSkip":  { "legs": 3, "path": 120, "surfaceDistance": 103.923..., "reflections": 2, "timeOfFlightUs": 37.151... }
}
```

### `POST /api/echo-depth` — 回波埋深反推

```bash
curl -s localhost:3000/api/echo-depth \
  -H 'content-type: application/json' \
  -d '{"thickness": 20, "angleDeg": 60, "velocity": 3230, "echoPath": 50}'
```

```json
{
  "input": { "thickness": 20, "angleDeg": 60, "velocity": 3230, "echoPath": 50 },
  "depth": 15,
  "surfaceDistance": 43.301...,
  "completedLegs": 1,
  "legIndex": 2,
  "reflections": 1,
  "direction": "upgoing",
  "timeOfFlightUs": 15.479...
}
```

### 探伤配置（命名存取，运行期有效，不跨重启保留）

```bash
curl -X PUT localhost:3000/api/configs/weld-a -H 'content-type: application/json' \
  -d '{"thickness": 20, "angleDeg": 60, "velocity": 3230}'
curl localhost:3000/api/configs                      # 列出全部
curl localhost:3000/api/configs/weld-a               # 取出一套
curl -X DELETE localhost:3000/api/configs/weld-a     # 删除
curl -X POST localhost:3000/api/configs/weld-a/skip-geometry            # 按名核算
curl -X POST localhost:3000/api/configs/weld-a/echo-depth \
  -H 'content-type: application/json' -d '{"echoPath": 50}'             # 按名反推
```

多套配置各自独立，互不干扰。

### 错误响应

非法输入在计算之前被拦截，返回 400 与全部原因：

```json
{ "error": "参数非法", "details": ["折射角必须位于 (0, 90) 开区间内（单位：度），收到 90；等于 90 度时声束贴着板面传播，无法形成折线声程"] }
```

拦截规则：板厚必须为正、折射角必须在 (0, 90) 开区间（含 90° 贴板面退化情形）、声速必须为正、回波声程不能为负。未找到的配置返回 404。

## 模块划分

```
src/
  geometry/skipPath.js        折线半跨与一个 skip 的声程几何
  geometry/groundDistance.js  地面投影距离与反射次数推算
  geometry/echoDepth.js       由回波声程按相似三角形反推埋深（折回规则）
  validation/validate.js      非法参数拦截（算之前挡住并说明原因）
  config/store.js             探伤配置存取（纯内存，进程退出即失效）
  service/inspectionService.js 核算编排：先拦截、再调几何核心出报告
  http/routes.js              路由：只做收发，不含核心算法
  http/app.js                 Express 装配与统一错误出口
  server.js                   进程入口
test/                         node:test 测试（几何不变量 / 校验 / 配置 / HTTP）
```

## 回归测试钉住的几何关系

- 板厚翻倍 ⇒ 一个 skip 的声程与地面距离都翻倍；
- 板厚不变、折射角增大 ⇒ 地面距离变大、单个 skip 声程变长；
- 折射角趋零 ⇒ 一个 skip 声程收敛到两倍板厚（正入射极限）；
- 斜射回波按相似三角形反算的埋深与几何自洽（且不等于正入射式垂直读数）；
- 45° 基准算例（T = 20 mm、声速固定）：一个 skip 声程 = 40·√2 ≈ 56.568542494923804 mm，与手算值一致。
