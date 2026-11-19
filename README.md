# 64 重思想实验

面向移动浏览器的原创互动哲学问卷。八章共 64 道题，包含断点续答、八种公开侧写、动态 SVG 星盘和 Canvas 分享海报。

## 本地运行

直接用现代浏览器打开 [64-thought-experiment.html](outputs/64-thought-experiment.html)。答完后可在收银台使用「本地预览工具」模拟解封。

使用 Node.js 20 或更新版本可重建单文件并运行验证。项目无需安装第三方依赖。

```sh
node work/build.cjs
node work/test-flow.cjs
node work/test-payment.cjs
```

`work/` 包含 HTML 模板、CSS、JavaScript、完整题库、演示档案、构建程序和测试。`outputs/` 包含单文件和接入说明。

## 收款状态

收银台链接至爱发电月度档位。页面中的解锁仍为本地演示，正式核验需要接入爱发电订单和会员有效期核验后端，并配置买家与档案的安全关联。详见 [设计与支付接入说明](outputs/64-design-and-payment.md)。
