# 超声斜射探伤折线声程几何核算服务

面向对接焊缝超声斜射探伤的常驻几何核算服务。探头以折射角 β 把声束斜射进工件，声束在内外表面之间全反射、折线前进，本服务负责把这条折线路径算清楚：走一个来回（一个 skip）是多少声程、声束落在另一面的表面投影有多远、遇到回波时缺陷大概埋在多深。

支持两种几何模型，调用方用 `geometry` 字段声明（`plate` / `pipe`），**不声明一律按板材处理**：

- **板材（plate）**：厚度 T 的平行板，等腰折线；
- **管材（pipe）**：探头贴在管子外壁、沿周向斜射。外壁是凸的，声束打到内壁时入射角比折射角更大，声程、弧长、埋深都要按环形几何重算。

只经 HTTP 对外服务，无网页；不承担探伤委托单或质检流程，只专注折线声程几何本身。

## 板材几何模型

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

## 管材几何模型

调用方给外径与壁厚：外半径 `R = 外径 / 2`，内半径 `r = R − 壁厚`。折射角 β 仍相对入射点处的外壁法线计量。声束在材料里走直线，它到管心的最近距离守恒（`b = R·sin β`），因此：

| 量 | 公式 |
| --- | --- |
| 内壁入射角 θ | `sin θ = R · sin β / r`，恒大于 β |
| 一程斜边声程 ℓ | `√(R² − b²) − √(r² − b²)`，其中 `b = R·sin β` |
| 一个 skip 声程 | `2ℓ`（两段等长的程） |
| 一程扫过的圆心角 | `θ − β` |
| 半跨外壁弧长 | `R · (θ − β)`，沿外壁表面量（板材「地面距离」的对应量） |
| 最大允许折射角 | `arcsin(r / R)`；达到时声束贴内壁擦过，形不成折线 |

回波埋深反推：一程之内埋深与声程**不是**线性关系，不能按余弦折算。程内走了 x 时，所在点到管心的距离 `ρ = √(R² − 2x·R·cos β + x²)`，埋深 `d = R − ρ`。读数跨过内壁反射进入上行段、或超过两个 skip 时，按折回规则定位到对应那一程（上行段映射到等效下行程内位置 `x = ℓ − 程内余量`），再算这一程里的真实埋深；缺陷在外壁上的弧长位置 = `R × 累计圆心角`（程内已扫圆心角 = `asin(b/ρ) − β`）。反射次数口径与板材一致：半跨 0 次、一个 skip 1 次，读数恰好落在壁面上时落面本身不计。

手算基准（外径 200 mm、壁厚 20 mm、折射角 45°，已钉进回归测试，容差 1e-3）：一程声程 = 50√2 − 10√14 ≈ 33.2941 mm，一个 skip ≈ 66.5882 mm；内壁入射角 ≈ 62.114°；半跨弧长 ≈ 29.870 mm，一个 skip ≈ 59.741 mm；最大允许折射角 ≈ 53.130°；回波 20 mm 时埋深 ≈ 12.985 mm（同读数平板为 14.142 mm）。

单位约定：厚度 / 外径与声程 mm，折射角 度，声速 m/s，传播时间 µs。

## 运行

```bash
npm install
npm start          # 监听 PORT（默认 3000）
npm test           # node:test 全量测试
```

Docker 一键构建、启动即对外应答（板材与管材两种核算都可用）：

```bash
docker build -t skip-geometry .
docker run --rm -p 3000:3000 skip-geometry
```

随仓库的测试在容器里也能全部跑通：

```bash
docker run --rm skip-geometry npm test
```

## 接口

### `POST /api/skip-geometry` — 折线声程几何核算

```bash
curl -s localhost:3000/api/skip-geometry \
  -H 'content-type: application/json' \
  -d '{"thickness": 20, "angleDeg": 60, "velocity": 3230}'
```

返回半跨、一个 skip、一个半 skip 各自的斜边声程、地面距离、反射次数与单程传播时间，`geometry` 注明本次所用的几何模型：

```json
{
  "geometry": "plate",
  "input": { "thickness": 20, "angleDeg": 60, "velocity": 3230 },
  "halfSkip":        { "legs": 1, "path": 40,  "surfaceDistance": 34.641..., "reflections": 0, "timeOfFlightUs": 12.383... },
  "oneSkip":         { "legs": 2, "path": 80,  "surfaceDistance": 69.282..., "reflections": 1, "timeOfFlightUs": 24.767... },
  "oneAndHalfSkip":  { "legs": 3, "path": 120, "surfaceDistance": 103.923..., "reflections": 2, "timeOfFlightUs": 37.151... }
}
```

管材核算：声明 `geometry: "pipe"` 并给外径与壁厚。`surfaceDistance` 为沿外壁表面的弧长，另报内壁入射角 `innerAngleDeg`：

```bash
curl -s localhost:3000/api/skip-geometry \
  -H 'content-type: application/json' \
  -d '{"geometry": "pipe", "outerDiameter": 200, "thickness": 20, "angleDeg": 45, "velocity": 3230}'
```

```json
{
  "geometry": "pipe",
  "input": { "geometry": "pipe", "outerDiameter": 200, "thickness": 20, "angleDeg": 45, "velocity": 3230 },
  "halfSkip":        { "legs": 1, "path": 33.294..., "surfaceDistance": 29.870..., "reflections": 0, "timeOfFlightUs": 10.307... },
  "oneSkip":         { "legs": 2, "path": 66.588..., "surfaceDistance": 59.740..., "reflections": 1, "timeOfFlightUs": 20.615... },
  "oneAndHalfSkip":  { "legs": 3, "path": 99.882..., "surfaceDistance": 89.611..., "reflections": 2, "timeOfFlightUs": 30.923... },
  "innerAngleDeg": 62.114...
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
  "geometry": "plate",
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

管材反推（`geometry: "pipe"` + 外径 / 壁厚）：埋深按声束所在点到管心的真实距离计算，`surfaceDistance` 为缺陷在外壁上的弧长位置。外径 200、壁厚 20、45° 时回波 20 mm 给出埋深 ≈ 12.985 mm（同读数平板为 14.142 mm）。

### 探伤配置（命名存取，运行期有效，不跨重启保留）

```bash
curl -X PUT localhost:3000/api/configs/weld-a -H 'content-type: application/json' \
  -d '{"thickness": 20, "angleDeg": 60, "velocity": 3230}'
curl -X PUT localhost:3000/api/configs/pipe-b -H 'content-type: application/json' \
  -d '{"geometry": "pipe", "outerDiameter": 200, "thickness": 20, "angleDeg": 45, "velocity": 3230}'
curl localhost:3000/api/configs                      # 列出全部
curl localhost:3000/api/configs/weld-a               # 取出一套
curl -X DELETE localhost:3000/api/configs/weld-a     # 删除
curl -X POST localhost:3000/api/configs/weld-a/skip-geometry            # 按名核算
curl -X POST localhost:3000/api/configs/weld-a/echo-depth \
  -H 'content-type: application/json' -d '{"echoPath": 50}'             # 按名反推
```

老式只带板厚、角度、声速的配置仍按板材理解；板材配置与管材配置并存时，按名核算、按名反推各走各的几何，多套配置各自独立，互不干扰。

### 错误响应

非法输入在计算之前被拦截，返回 400 与全部原因：

```json
{ "error": "参数非法", "details": ["折射角必须位于 (0, 90) 开区间内（单位：度），收到 90；等于 90 度时声束贴着板面传播，无法形成折线声程"] }
```

拦截规则：板厚（壁厚）必须为正、折射角必须在 (0, 90) 开区间（含 90° 贴板面退化情形）、声速必须为正、回波声程不能为负——这些对板材与管材都有效。管材额外拦截：外径必须为正、壁厚必须小于外半径（外径的一半）、`R·sin(折射角)` 必须小于内半径（否则声束碰不到内壁、贴壁擦过，原因里会写明按该外径壁厚允许的最大折射角，即内半径/外半径的反正弦）。未声明几何类型时按板材处理；未找到的配置返回 404。

## 模块划分

```
src/
  geometry/skipPath.js        板材折线半跨与一个 skip 的声程几何
  geometry/groundDistance.js  板材地面投影距离与反射次数推算
  geometry/echoDepth.js       板材由回波声程按相似三角形反推埋深（折回规则）
  geometry/models/plate.js    板材几何模型（包装上述模块为统一能力）
  geometry/models/pipe.js     管材几何模型（环形几何：声程 / 弧长 / 真实埋深 / 专属拦截）
  geometry/models/index.js    几何模型注册表：按 geometry 字段挑实现，缺省板材
  validation/validate.js      共享参数拦截（板厚 / 折射角 / 声速 / 回波声程）
  config/store.js             探伤配置存取（纯内存，进程退出即失效）
  service/inspectionService.js 核算编排：先拦截、再按几何模型出报告（不含板/管分支）
  http/routes.js              路由：只做收发，不含核心算法
  http/app.js                 Express 装配与统一错误出口
  server.js                   进程入口
test/                         node:test 测试（几何不变量 / 管材 / 校验 / 配置 / HTTP）
```

几何模型是一层可替换的东西：板材与管材各自实现同一组能力（程声程、表面距离、埋深定位、自身合法性检查），编排层按几何类型挑实现；将来新增曲面几何时在 `geometry/models/` 登记即可，编排与路由不用动。

## 回归测试钉住的几何关系

- 板厚翻倍 ⇒ 一个 skip 的声程与地面距离都翻倍；
- 板厚不变、折射角增大 ⇒ 地面距离变大、单个 skip 声程变长；
- 折射角趋零 ⇒ 一个 skip 声程收敛到两倍板厚（正入射极限）；
- 斜射回波按相似三角形反算的埋深与几何自洽（且不等于正入射式垂直读数）；
- 45° 基准算例（T = 20 mm、声速固定）：一个 skip 声程 = 40·√2 ≈ 56.568542494923804 mm，与手算值一致；
- 管材基准（外径 200、壁厚 20、45°）：一程 50√2 − 10√14 ≈ 33.2941 mm、内壁入射角 ≈ 62.114°、半跨弧长 ≈ 29.870 mm、回波 20 mm 埋深 ≈ 12.985 mm（容差 1e-3）；
- 外径 ≥ 壁厚一万倍 ⇒ 管材的声程 / 弧长 / 埋深与板材相对偏差 < 1e-3（大管径退化回板材）；
- 外径有限 ⇒ 管材一程声程与半跨弧长不小于板材，内壁入射角严格大于折射角；
- 同一个 skip 内，离入射点 s 与离回到外壁 s 的读数埋深相同；
- 折射角逼近最大允许值 ⇒ 内壁入射角趋向 90°。
