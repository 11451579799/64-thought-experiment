# 64 重思想实验

## 1. 64 象沉没成本转化漏斗

**序言 → 64 次选择 → 八次显影 → 四秒演算 → 免费精神侧写与海报 → 双档收银台 → 火漆解封。**

开屏明确给出 64 题、约 6–8 分钟、免费侧写和可选付费档案。六爻各有两种形态，组合为 64 卦。莱布尼茨在 1703 年的论文中将已有的二进制方法与伏羲卦象相对照。序言用这层对应解释题量，也把 64 次答题设计成同一件逐步完成的作品。[莱布尼茨《二进制算术的说明》](https://kastalia.medienhaus.udk-berlin.de/odl/Leibniz.pdf)

用户每作答一次，界面点亮一个炼金节点并保存进度。八次显影把长流程拆成短目标。终幕显影后，四秒演算把答题与揭晓连起来。用户先拿到可保存、可分享的完整公开侧写，再决定要不要阅读三份深度解读。¥9.9 对应单次精神解码，¥19.9 对应三份解读、64 重抉择回望和 8 张高清壁纸。已购解码可补 ¥10.0 升级。

| 幕 | 题号 | 体验节奏 |
| --- | --- | --- |
| 存在与虚无 | 01–08 | 从镜面和影子入场，问自我何以成立 |
| 时间与记忆 | 09–16 | 让过去变成能剪裁、冲洗、搬运的材料 |
| 自由与宿命 | 17–24 | 摆出预设的终点，追问谁签下选择 |
| 他者与孤独 | 25–32 | 用缺席、误寄和共梦改变亲密距离 |
| 语言与边界 | 33–40 | 让一种表达规则失效，迫使用户重新理解词义 |
| 道德与深渊 | 41–48 | 让善意产生成本，追问代价由谁承担 |
| 审美与荒诞 | 49–56 | 把缺口、杂音和偶然重新放入视线 |
| 终局与永恒 | 57–64 | 把选择压缩到最后一道光、一次寄存和一通电话 |

## 2. 四个专业角色的实现

### A · 题库与叙事

源码中的 `QUIZ` 包含全部 64 条题干和 256 条选项。每个选项为两个不同派别分别计 3 与 1 分。每派在全卷各有 32 次主映射与 32 次副映射，且每章在 A、B、C、D 四个位置各作为主派别出现一次。总分决定派别，平分按题库中约定的固定顺序取其一。专属档案号由本机随机种子和作答生成，刷新恢复相同结果。

八种判词为第七封印式荒诞观测者、第欧根尼式犬儒游荡者、维特根斯坦式语言边界守望者、记忆考古者、自由的签署者、他者的渡口人、深渊持灯者、残缺的造物者。每份公开结果自带箴言、专属编号和约 60 字侧写。三份深度模块分别处理惯常盲区、可尝试的现实练习与关系中的相处模式。完整档案逐题配一条回望提示。

### B · 动态 SVG 与图像

`Sigil.mount(container)` 生成 64 个带 `data-sigil-node` 的独立 `<path>`。`Sigil.update(answered)` 点亮索引 `< answered` 的节点，在 `Math.floor(answered / 8)` 变化时逐帧重算路径和内部编织曲线，并旋转星盘。`Sigil.collapse()` 构建 8 × 8 SVG 矩阵。火漆由五个独立裁切片组成，核验成功时各片按自己的位移和角度碎开。全站底纹由内联 `feTurbulence` 生成。

`Sigil.poster(result)` 把最终徽章、档案号、判词和侧写画进 1080 × 1620 Canvas。`Sigil.wallpaper(result, index)` 按需导出八款 1080 × 1920 图像。两者都输出 PNG `<img>` 并提供下载入口。HTTPS 部署后，海报落款包含页面入口地址，结果页可复制带 `?from=poster` 的入口。小红书引流可使用同一页面的 `?from=xhs`。页面把入口标记留在本机进度中。

### C · 支付与权益

`WeChatPayBridge` 接收服务端签名的 JSAPI 参数并调用 `WeixinJSBridge.invoke('getBrandWCPayRequest', ...)`。聚合渠道使用服务端创建的收银台地址，返回页面后按同一订单协议查单。订单确认后，服务端凭证可缓存到 `localStorage.unlock_token`，页面重开后带凭证重新取档。客户端通过 Web Crypto 的 AES-GCM 解密已验权的档案信封。详见下方路由和字段约定。[微信支付 JSAPI 调起支付](https://pay.wechatpay.cn/doc/v3/merchant/4012791857)

```js
const pay = new WeChatPayBridge({endpoint: '/api/sixty-four', preview: false})
const order = await pay.buy({profileId, factionId, plan: 'archive'})
if (order.state === 'unlocked') renderArchive(order.content)
```

### D · 单文件集成

CSS、JavaScript、SVG 和题库全部内联。页面使用 `100dvh` 和安全区内边距，长题、档案与收银台可纵向滚动。每次作答即时写入 `cursor`、逐题作答、章节显影状态和八维分数。刷新恢复时按已保存的选项复算分数。用户可返回修改前题，已经作答的后续选项继续保留。最终演算和支付均有刷新恢复路径。

## 3. 本地体验与正式接入

1. 用浏览器直接打开 `64-thought-experiment.html`。答完后点「揭开火漆封印」，选择档次，展开「本地预览工具」并点「模拟支付成功」。本地演示档案的密文和演示密钥随文件一起交付。
2. 制作公网版时，删除 HTML 中 `// BEGIN LOCAL PREVIEW` 至 `// END LOCAL PREVIEW` 的整个段落，将 `CONFIG.preview` 改为 `false`，再配置 `endpoint` 和允许的聚合收银台 HTTPS 源。正式档案、商户签名密钥和订单数据库放在后端。
3. 根据下方接口约定实现商户端，接入开通的微信商户或聚合渠道，配置授权目录与回跳地址。公共链接用于朋友圈或小红书入口。本地测试用例已覆盖完整答题、续答、模拟解封及档案档次，微信内长按保存和真实交易仍需在商户环境中验收。


## 4. 商户端接口约定

`WeChatPayBridge` 默认请求同源 `/api/sixty-four`，以下路径都以该前缀为根。上线页面使用 HTTPS，微信商户配置公众号 AppID、JSAPI 权限、网页支付授权目录以及 OAuth 取得的对应 OpenID。订单、计费、平台密钥、签名、通知和真实档案均由服务端处理。[微信支付 JSAPI 开发指引](https://pay.wechatpay.cn/doc/v3/merchant/4012791870)

### 前端接口

- `new WeChatPayBridge({endpoint, redirectOrigins, preview, loadPreview, onUpdate})`。同源 `endpoint` 可省略。聚合收银台使用同源跳转地址，或在 `redirectOrigins` 中配置准确的 HTTPS 源。
- `buy({profileId,factionId,plan})` 开启或重开当前订单。`restore({profileId,factionId})` 恢复凭证或查单。在结果页初次展示及 `pageshow`、前台可见时调用恢复。
- `simulate({profileId,factionId,plan})` 适用于显式启用且位于 `file://`、`localhost`、`127.0.0.1` 或 IPv6 回环的预览。只读 `previewEnabled` 用于展示本地调试入口。公网构建去掉演示内容和加载器，并设 `preview:false`。
- `onUpdate` 接收带 `state,message,profileId,factionId` 的对象。过程状态为 `creating`、`checkout`、`checking`。返回可为 `locked`、`preview`、`busy`、`pending`、`redirecting`、`closed`、`error` 或 `unlocked`。`unlocked` 另有 `plan,content`，演示态额外带 `simulated:true`。支付结束前保留核验入口；只对当前 `profileId` 渲染异步结果。

### 同源 JSON 协议

所有应用端接口使用 POST、JSON、`Cache-Control: no-store`，校验同源请求及服务端创建的会话。以 HTTPS 下的 HttpOnly 安全 Cookie 或等效可信会话绑定用户与订单。各接口都校验结果档案与会话关系，`profileId` 仅作关联键，识别用户需要已验证的会话。

| 路径 | 请求字段 | 返回 |
| --- | --- | --- |
| `/orders` | `profileId,factionId,plan,requestId` | `{state:"pending",orderId,plan,amountFen,checkout}`。也可返回下方定义的 `paid` 或已经确认不可支付的 `{state:"closed"}` |
| `/orders/status` | `profileId,factionId,requestId,orderId`。创建结果丢失时 `orderId` 为 `null`，按会话与 `requestId` 查找 | `{state:"pending"}`、`{state:"closed"}`，或服务端已核验的 `{state:"paid",profileId,factionId,plan,unlockToken}` |
| `/content` | `profileId,factionId,unlockToken` | 合法权益返回 `{state:"unlocked",profileId,factionId,plan,envelope}`。凭证无效、归属错误或已吊销使用 401/403/404/410 |

`plan` 取 `decode`（990 分）或 `archive`（1990 分），价格以服务端商品表为准。已拥有完整档案时直接返回已有权益。此前已经持有解码权益时，完整档案的升级差额为 1000 分。客户端显示补差价时会在调起收银台前核对 1000 分。对于同一会话和档案只保留一个可支付订单，使用 `requestId` 保证重试幂等，同时用档案与会话约束处理跨标签页重复意图。后台确认旧单关单后才允许新单，已支付订单始终归档已有权益。只有明确不会创建订单或已完成关单时返回 `closed`。`orderId` 采用不含个人数据的 ASCII 标识符，长度至多 128。

### 收银渠道

- JSAPI 使用 `checkout = {kind:"jsapi",params:{appId,timeStamp,nonceStr,package,signType:"RSA",paySign}}`。参数为服务端生成的字符串，`package` 含 `prepay_id=`。前端事件触发查单。服务端根据已验签通知或服务端查单确认到账。[微信支付 JSAPI 调起支付](https://pay.wechatpay.cn/doc/v3/merchant/4012791857)
- PayJS、蓝兔等聚合支付使用 `checkout = {kind:"redirect",url}`，由商户服务端按实际开通产品签名下单、验证回调并查单，统一映射到上述三个订单状态。供应商参数、通知格式和商户密钥由后端适配层保存。同源跳转网关需限制供应商目的地，官方授权、聚合收银台的回跳目的地使用服务端预配置的页面地址。
- 先验证平台签名，再校验商户、应用、订单、交易状态、币种和金额。对同一商户订单和平台交易号去重，在同一事务提交付款状态与权益。通知延迟时使用平台查单并限制频率，客户端返回值不作为发放凭证的依据。[微信支付成功回调通知](https://pay.wechatpay.cn/doc/v3/merchant/4012791861) · [支付回调与查单实现指引](https://pay.wechatpay.cn/doc/v3/merchant/4012075249)

### 权益信封

`unlockToken` 由服务端生成，推荐使用高熵不透明令牌或带有效期的签名令牌。每次加载校验凭证、会话、档案、已确认的商品和撤销状态。正式接口拒绝 `preview-` 前缀。浏览器仅在 `localStorage.unlock_token` 缓存分档案凭证，在 `sixty_four_pending_orders` 缓存订单关联信息，正文和密钥只在内存使用。

`envelope = {alg:"A256GCM",key,iv,ciphertext}`，后面三项为标准 Base64。每次生成独立的 32 字节密钥及 12 字节 IV。密文尾部拼接 16 字节认证标签，AAD 使用 UTF-8 编码的 `profileId + "|" + factionId + "|" + plan`。明文为 UTF-8 JSON，`modules` 为三个非空字符串，完整档案另含 64 条非空 `slices`。生产构建只含免费题库和结果；档案明文、生产密文和生产密钥由校验权益后的接口下发。解锁后的内容可被持有合法权益的用户保存。
