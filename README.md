# React的秘密
本仓库是我在阅读React源码过程中搭建的调试环境，并记录了一些我自己的理解与思考，输出成了一个系列文章。React的源码庞大且复杂，希望这个仓库可以帮助到学习源码的你，本仓库会中的源码会随官方发布的主要版本进行更新。

*可clone本仓库到本地直接运行，快速获取源码调试环境，或者 [点击查看](https://github.com/neroneroffy/react-source-code-debug/tree/master/docs/setUpDebugEnv.md) 调试环境搭建教程*

## 安装依赖
npm install

## 启动React不同版本的调试环境：
* 启动17正式版
```
 npm run dev:17
```
* 启动17.0.0-alpha.0
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

*在此感谢[yisar](https://github.com/yisar)提供Lanes模型的源码包*

由于Lanes还未正式发布，master分支代码虽然开启concurrent模式之后优先级用的就是lanes，但它只是将expirationTime替换成了lanes去实现，
效果并无变化，真正的效果可以使用下边命令预览，启动命令之前需要将config/env.js 中的__PROFILE__环境变量置为true
```
npm run dev:lanes
```

# React源码解析系列文章目录：

## 前置知识
* [位运算](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/%E5%89%8D%E7%BD%AE%E7%9F%A5%E8%AF%86/%E4%BD%8D%E8%BF%90%E7%AE%97.md)
* [React中的优先级]()

## Render阶段
* beginWork阶段
  * [扒一扒React的state计算原理](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/render%E9%98%B6%E6%AE%B5/beginWork%E9%98%B6%E6%AE%B5/%E5%A4%84%E7%90%86%E6%9B%B4%E6%96%B0.md)
  * [深入理解Diff算法](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/render%E9%98%B6%E6%AE%B5/beginWork%E9%98%B6%E6%AE%B5/Diff%E7%AE%97%E6%B3%95.md)
* completeWork阶段
  * [React的completeWork：承上启下 & 错误处理](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/render%E9%98%B6%E6%AE%B5/completeWork/completeWork.md)

## Commit阶段
* [React Commit阶段都做了什么](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/commit%E9%98%B6%E6%AE%B5/%E6%A6%82%E8%A7%88.md)
* DOM操作系列：
  * [节点插入算法](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/commit%E9%98%B6%E6%AE%B5/mutation/%E8%8A%82%E7%82%B9%E6%8F%92%E5%85%A5.md)
  * [节点删除算法](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/commit%E9%98%B6%E6%AE%B5/mutation/%E8%8A%82%E7%82%B9%E5%88%A0%E9%99%A4.md)
  * [节点更新](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/commit%E9%98%B6%E6%AE%B5/mutation/%E8%8A%82%E7%82%B9%E6%9B%B4%E6%96%B0.md)

## 其余核心功能
* [React中的事件机制](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/%E4%BA%8B%E4%BB%B6%E7%B3%BB%E7%BB%9F/%E6%A6%82%E8%A7%88.md)
* [一篇文章搞懂React的任务调度机制](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/%E8%B0%83%E5%BA%A6%E6%9C%BA%E5%88%B6/Scheduler.md)

## Hooks
* [React hooks 的基础概念：hooks链表](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Hooks/%E6%A6%82%E8%BF%B0.md)
* [梳理useEffect和useLayoutEffect的原理与区别](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Hooks/UseEffectUseLayoutEffect.md)
* 更多文章酝酿中...

## Concurrent模式下React的更新行为
* [概述](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Concurrent%E6%A8%A1%E5%BC%8F%E4%B8%8BReact%E7%9A%84%E6%9B%B4%E6%96%B0%E8%A1%8C%E4%B8%BA/%E6%A6%82%E8%BF%B0.md)
* [高优先级任务插队](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Concurrent%E6%A8%A1%E5%BC%8F%E4%B8%8BReact%E7%9A%84%E6%9B%B4%E6%96%B0%E8%A1%8C%E4%B8%BA/%E9%AB%98%E4%BC%98%E5%85%88%E7%BA%A7%E4%BB%BB%E5%8A%A1%E6%8F%92%E9%98%9F.md)
* [任务饥饿问题](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Concurrent%E6%A8%A1%E5%BC%8F%E4%B8%8BReact%E7%9A%84%E6%9B%B4%E6%96%B0%E8%A1%8C%E4%B8%BA/%E9%A5%A5%E9%A5%BF%E9%97%AE%E9%A2%98.md)




