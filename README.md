这个项目是为了调试react源码而搭建的。[点击查看](https://github.com/neroneroffy/react-source-code-debug/tree/master/docs/setUpDebugEnv.md)搭建调试环境教程

### 安装依赖
npm install

### 启动React不同版本的调试环境：
* 启动17.0.0-alpha.0（clone自关方仓库master分支）
```
 npm run dev:17.0.0-alpha.0
```
* 启动16.13.1版本
```
 npm run dev:16.13.1
```
* 启动16.12.0版本
```
npm run dev:16.12.0
```
* 查看Lanes优先级模型的效果（除react、react-dom之外，其他包例如 scheduler、react-reconciler等引入自master分支的代码）

由于Lanes还未正式发布，master分支代码虽然开启concurrent模式之后优先级用的就是lanes，但它只是将expirationTime替换成了lanes去实现，
效果并无变化，真正的效果可以使用下边命令预览，启动命令之前需要将config/env.js 中的__PROFILE__环境变量置为true
```
npm run dev:lanes
```


