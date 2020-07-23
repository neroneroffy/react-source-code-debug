这个项目是为了调试react源码而搭建的。

### 安装依赖
npm install

### 启动React不同版本的调试环境：
* 启动clone自官方仓库master分支的代码
```
 npm run dev:16.13.1
```
* 启动最新的稳定版
```
npm run dev:16.12.0
```
* 查看Lanes优先级模型的效果（除react、react-dom之外，其他包例如 scheduler、react-reconciler等引入自master分支的代码）

由于Lanes还未正式发布，master分支代码虽然开启concurrent模式之后优先级用的就是lanes，但它只是将expirationTime替换成了lanes去实现，
效果并无变化，真正的效果可以使用下边命令预览
```
npm run dev:lanes
```


