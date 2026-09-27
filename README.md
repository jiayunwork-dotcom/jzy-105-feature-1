# 超声斜射探伤折线声程几何核算服务

面向对接焊缝超声斜射探伤的常驻几何核算服务，支持两种工件几何：

- **板材**（缺省）：探头以折射角 β 把声束斜射进厚度 T 的板材，声束在上下表面之间走等腰折线；
- **管材**：探头贴在管子外壁、沿周向斜射，声束在凸外壁与内壁之间走非等腰折线——打到内壁时的入射角比折射角更大，一程的声程、落点弧长、回波埋深都与平板不同。

调用方在请求里用 `geometry` 字段说明这次是板（`plate`，缺省）还是管（`pipe`），服务按对应的几何模型出结果，并在每份核算结果里注明这次用的是哪种几何模型。

只经 HTTP 对外服务，无网页；不承担探伤委托单或质检流程，只专注折线声程几何本身。

## 几何模型

### 板材（`geometry: "plate"`，缺省）

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
- 到达缺陷前的反射次数 = 已完成程数 k（读数恰好落在表面上时落面本身不计，取 k − 1）

### 管材（`geometry: "pipe"`）

调用方给外径与壁厚：外半径 R = 外径 / 2，内半径 r = R − 壁厚。折射角 β 仍相对入射点处的外壁法线量。声束打到内壁时入射角 θ 满足：

```
sin θ = R · sin β / r        （三角形 OAB 正弦定理，O 为管心）
```

| 量 | 公式 |
| --- | --- |
| 一程（半跨）声程 | `L = R·cos β − r·cos θ` |
| 一个 skip（两程）声程 | `2L`（内壁全反射后按对称路径回到外壁） |
| 一程扫过的圆心角 | `γ = θ − β` |
| 半跨外壁弧长 | `R·γ`（沿外壁表面量，对应板材的地面距离） |
| 一个 skip 外壁弧长 | `2R·γ` |
| 最大允许折射角 | `asin(r / R)`，取到即擦内壁而过、没有折线 |
| 走完 n 程前的全反射次数 | `n − 1`（口径与板材一致） |

回波埋深反推：一程之内埋深与声程**不是**线性关系，不能按相似三角形折余弦。设程内余量折算成「距本程外壁端的沿束距离」u（上行程按对称折算 u = L − 余量），声束所在点 P 到管心的真实距离由余弦定理给出：

```
|OP|² = R² + u² − 2R·u·cos β      埋深 d = R − |OP|
本程内已扫圆心角 φ = atan2(u·sin β, R − u·cos β)，外壁弧长位置 = R·(累计圆心角)
```

读数跨过内壁反射进入上行段、或超过两个 skip 的，按与板材同口径的折回规则定位到对应那一程，再算这一程里的真实埋深；缺陷在外壁上的弧长位置一并给出。

手算核对基准（外径 200 mm、壁厚 20 mm、折射角 45°）：一程声程 = 50√2 − 10√14 ≈ 33.2941 mm，一个 skip ≈ 66.5882 mm；内壁入射角 ≈ 62.114°；半跨外壁弧长 ≈ 29.870 mm，一个 skip ≈ 59.741 mm；最大允许折射角 ≈ 53.130°；回波 20 mm 时埋深 ≈ 12.985 mm（同厚度平板上为 14.142 mm）。

单位约定：厚度/外径与声程 mm，折射角 度，声速 m/s，传播时间 µs。

## 运行

```bash
npm install
npm start          # 监听 PORT（默认 3000）
npm test           # node:test 全量测试
```

Docker 一键构建、启动即对外应答，板材与管材两种核算都可用；测试随镜像打包，容器里可直接全量跑通：

```bash
docker build -t skip-geometry .
docker run --rm -p 3000:3000 skip-geometry
docker run --rm --entrypoint npm skip-geometry test   # 容器内跑测试
```

## 接口

### `POST /api/skip-geometry` — 折线声程几何核算

板材（`geometry` 缺省即板材，返回结构与数值同改动前一致，仅新增 `geometry` 标注）：

```bash
curl -s localhost:3000/api/skip-geometry \
  -H 'content-type: application/json' \
  -d '{"thickness": 20, "angleDeg": 60, "velocity": 3230}'
```

```json
{
  "geometry": "plate",
  "input": { "thickness": 20, "angleDeg": 60, "velocity": 3230 },
  "halfSkip":        { "legs": 1, "path": 40,  "surfaceDistance": 34.641..., "reflections": 0, "timeOfFlightUs": 12.383... },
  "oneSkip":         { "legs": 2, "path": 80,  "surfaceDistance": 69.282..., "reflections": 1, "timeOfFlightUs": 24.767... },
  "oneAndHalfSkip":  { "legs": 3, "path": 120, "surfaceDistance": 103.923..., "reflections": 2, "timeOfFlightUs": 37.151... }
}
```

管材（给外径与壁厚，`surfaceDistance` 为沿外壁表面的弧长）：

```bash
curl -s localhost:3000/api/skip-geometry \
  -H 'content-type: application/json' \
  -d '{"geometry": "pipe", "outerDiameter": 200, "thickness": 20, "angleDeg": 45, "velocity": 3230}'
```

```json
{
  "geometry": "pipe",
  "input": { "geometry": "pipe", "outerDiameter": 200, "thickness": 20, "angleDeg": 45, "velocity": 3230 },
  "innerIncidenceAngleDeg": 62.114...,
  "maxAngleDeg": 53.130...,
  "halfSkip":        { "legs": 1, "path": 33.294..., "surfaceDistance": 29.870..., "reflections": 0, "timeOfFlightUs": 10.307... },
  "oneSkip":         { "legs": 2, "path": 66.588..., "surfaceDistance": 59.740..., "reflections": 1, "timeOfFlightUs": 20.615... },
  "oneAndHalfSkip":  { "legs": 3, "path": 99.882..., "surfaceDistance": 89.610..., "reflections": 2, "timeOfFlightUs": 30.923... }
}
```

### `POST /api/echo-depth` — 回波埋深反推

```bash
curl -s localhost:3000/api/echo-depth \
  -H 'content-type: application/json' \
  -d '{"geometry": "pipe", "outerDiameter": 200, "thickness": 20, "angleDeg": 45, "velocity": 3230, "echoPath": 20}'
```

```json
{
  "geometry": "pipe",
  "input": { "geometry": "pipe", "outerDiameter": 200, "thickness": 20, "angleDeg": 45, "velocity": 3230, "echoPath": 20 },
  "depth": 12.985...,
  "surfaceDistance": 16.324...,
  "completedLegs": 0,
  "legIndex": 1,
  "reflections": 0,
  "direction": "downgoing",
  "timeOfFlightUs": 6.191...
}
```

板材请求不带 `geometry` 即可，返回结构同改动前（埋深按相似三角形；管材则按到管心的真实距离折算）。

### 探伤配置（命名存取，运行期有效，不跨重启保留）

```bash
# 板材配置（老式三字段，仍按板材理解）
curl -X PUT localhost:3000/api/configs/weld-a -H 'content-type: application/json' \
  -d '{"thickness": 20, "angleDeg": 60, "velocity": 3230}'
# 管材配置（带 geometry 与外径、壁厚）
curl -X PUT localhost:3000/api/configs/pipe-weld -H 'content-type: application/json' \
  -d '{"geometry": "pipe", "outerDiameter": 200, "thickness": 20, "angleDeg": 45, "velocity": 3230}'
curl localhost:3000/api/configs                      # 列出全部
curl localhost:3000/api/configs/pipe-weld            # 取出一套
curl -X DELETE localhost:3000/api/configs/pipe-weld  # 删除
curl -X POST localhost:3000/api/configs/pipe-weld/skip-geometry            # 按名核算
curl -X POST localhost:3000/api/configs/pipe-weld/echo-depth \
  -H 'content-type: application/json' -d '{"echoPath": 20}'                # 按名反推
```

板材配置与管材配置可并存：按名核算、按名反推回波各走各自的几何，互不串用。

### 错误响应

非法输入在计算之前被拦截，返回 400 与全部原因：

```json
{ "error": "参数非法", "details": ["按外径 200 mm、壁厚 20 mm，折射角最大允许到 53.130 度（内半径除以外半径的反正弦），收到 60 度；此时声束碰不到内壁、贴着内壁擦过去再回到外壁，没有折线可言"] }
```

拦截规则（对板材与管材都生效）：折射角必须在 (0, 90) 开区间、声速必须为正、回波声程不能为负。板材另要求板厚为正；管材另要求外径为正、壁厚为正且小于外半径、`R·sin β` 必须小于内半径（否则声束碰不到内壁，原因里写明这组外径壁厚下最大允许折射角）。未声明或未知的 `geometry` 分别按板材处理或 400 打回。未找到的配置返回 404。

## 模块划分

```
src/
  geometry/skipPath.js        板材：折线半跨与一个 skip 的声程几何
  geometry/groundDistance.js  板材：地面投影距离与反射次数推算
  geometry/echoDepth.js       板材：由回波声程按相似三角形反推埋深（折回规则）
  geometry/pipeRay.js         管材：圆筒内的非等腰折线几何（声程 / 弧长 / 真实埋深）
  geometry/models/plate.js    板材几何模型（收敛既有模块为统一模型接口）
  geometry/models/pipe.js     管材几何模型（含管材特有的合法性检查）
  geometry/models/index.js    几何模型注册表：按 geometry 字段挑实现，缺省板材
  validation/checks.js        原子参数检查（两种几何共用的基础规则）
  validation/validate.js      板材口径的探伤三要素校验（兼容入口）
  config/store.js             探伤配置存取（纯内存，进程退出即失效）
  service/inspectionService.js 核算编排：先拦截、再按几何类型调模型出报告
  http/routes.js              路由：只做收发，不含核心算法
  http/app.js                 Express 装配与统一错误出口
  server.js                   进程入口
test/                         node:test 测试（几何不变量 / 模型层 / 校验 / 配置 / HTTP）
```

几何模型是一层可替换的东西：板材与管材各自实现同一组能力（参数拦截、程声程、表面距离、埋深定位、附加报告字段），编排层按几何类型挑实现。将来再加别的曲面几何，只需在 `geometry/models/` 登记一个同接口的模型，编排与路由都不用动。

## 回归测试钉住的几何关系

- 板厚翻倍 ⇒ 一个 skip 的声程与地面距离都翻倍；
- 板厚不变、折射角增大 ⇒ 地面距离变大、单个 skip 声程变长；
- 折射角趋零 ⇒ 一个 skip 声程收敛到两倍板厚（正入射极限）；
- 斜射回波按相似三角形反算的埋深与几何自洽（且不等于正入射式垂直读数）；
- 45° 基准算例（T = 20 mm、声速固定）：一个 skip 声程 = 40·√2 ≈ 56.568542494923804 mm，与手算值一致；
- 管材基准算例（外径 200 mm、壁厚 20 mm、折射角 45°，容差 1e-3）：一程声程 ≈ 33.2941 mm、一个 skip ≈ 66.5882 mm、内壁入射角 ≈ 62.114°、半跨弧长 ≈ 29.870 mm、一个 skip 弧长 ≈ 59.741 mm、最大允许折射角 ≈ 53.130°、回波 20 mm 埋深 ≈ 12.985 mm（与平板 14.142 mm 明显区分），折射角 60° 必须被拒；
- 外径达到壁厚的一万倍以上 ⇒ 管材的一程声程、弧长、同一回波读数的埋深与板材结果相对偏差 < 1e-3（大管径退化回板材）；
- 外径有限时 ⇒ 管材一程声程与半跨弧长都不小于板材对应值，内壁入射角严格大于折射角；
- 同一个 skip 里，离入射点 s 与离下一次回到外壁 s 的读数埋深相同；
- 折射角逼近最大允许值 ⇒ 内壁入射角趋向 90°。
