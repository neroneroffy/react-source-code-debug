# React的秘密
本仓库是我在阅读React源码过程中搭建的调试环境，学习过程中对源码添加了较为详细的注释，并记录了一些我自己的理解与思考，输出了十几篇文章。React的源码庞大且复杂，希望这个仓库可以帮助到学习源码的你，本仓库会中的源码会随官方发布的主要版本进行更新。

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

# React源码解析系列文章目录
React源码体系较为复杂，在了解了整体流程之后，我编排的内容顺序如下。

## 前置知识
有一些知识需要了解，因为React17的优先级模型由expirationTime换成了Lanes模型，而Lanes模型涉及大量的位运算，所以需要先了解位运算。另外，贯穿React更新完整周期的优先级机制也是绕不开的话题。
* [基础概念](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/%E6%A6%82%E8%BF%B0.md)
* [位运算](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/%E5%89%8D%E7%BD%AE%E7%9F%A5%E8%AF%86/%E4%BD%8D%E8%BF%90%E7%AE%97.md)
* [React中的优先级](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/%E5%89%8D%E7%BD%AE%E7%9F%A5%E8%AF%86/React%E4%B8%AD%E7%9A%84%E4%BC%98%E5%85%88%E7%BA%A7.md)

## Render阶段
产生更新后，React会渲染一棵离屏Fiber树（workInProgress树），Render阶段正是这棵Fiber树的构建阶段。构建过程分为深度优先的向下beginWork阶段，以及触碰到叶子节点之后的向上completeWork回溯阶段。在Concurrent模式下，Render阶段是可以被打断的。
### beginWork阶段
  * [beginWork阶段概述](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/render%E9%98%B6%E6%AE%B5/beginWork%E9%98%B6%E6%AE%B5/beginWork.md)
  * [扒一扒React的state计算原理](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/render%E9%98%B6%E6%AE%B5/beginWork%E9%98%B6%E6%AE%B5/%E5%A4%84%E7%90%86%E6%9B%B4%E6%96%B0.md)
  * [深入理解Diff算法](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/render%E9%98%B6%E6%AE%B5/beginWork%E9%98%B6%E6%AE%B5/Diff%E7%AE%97%E6%B3%95.md)
### completeWork阶段
  * [React的completeWork：承上启下 & 错误处理](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/render%E9%98%B6%E6%AE%B5/completeWork/completeWork.md)

## Commit阶段
在Render阶段完成后，离屏的Fiber树构建完成，此时需要进行实际的DOM操作，来将更新应用到DOM上。除此之外，还会有use(Layout)Effect这类Hook函数的处理。
* [React Commit阶段都做了什么](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/commit%E9%98%B6%E6%AE%B5/%E6%A6%82%E8%A7%88.md)
### DOM操作系列：
下面的三面文章，可以帮助你深入理解Commit阶段React操作DOM的细节。
* [节点插入算法](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/commit%E9%98%B6%E6%AE%B5/mutation/%E8%8A%82%E7%82%B9%E6%8F%92%E5%85%A5.md)
* [节点删除算法](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/commit%E9%98%B6%E6%AE%B5/mutation/%E8%8A%82%E7%82%B9%E5%88%A0%E9%99%A4.md)
* [节点更新](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/commit%E9%98%B6%E6%AE%B5/mutation/%E8%8A%82%E7%82%B9%E6%9B%B4%E6%96%B0.md)

## 其余核心功能
以上是主流程，其余的重要功能不容忽视，例如React事件机制，还有Concurrent模式下的任务调度机制，都值得深入研究。
* [React中的事件机制](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/%E4%BA%8B%E4%BB%B6%E7%B3%BB%E7%BB%9F/%E6%A6%82%E8%A7%88.md)
* [一篇文章搞懂React的任务调度机制](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/%E8%B0%83%E5%BA%A6%E6%9C%BA%E5%88%B6/Scheduler.md)
* Context原理酝酿中...

## Hooks
Hooks作为革命性的新功能，必然要深入学习，下面的文章从基本的hooks链表开始，展开讲解各个Hooks的原理
* [React hooks 的基础概念：hooks链表](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Hooks/%E6%A6%82%E8%BF%B0.md)
* [梳理useEffect和useLayoutEffect的原理与区别](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Hooks/UseEffectUseLayoutEffect.md)
* 更多Hooks文章酝酿中...

## Concurrent模式下React的更新行为
下面三篇文章通过梳理Concurrent模式下React任务的更新行为，总结了上面所有文章的重要知识点，其中**高优先级任务插队**这篇文章涉及React中重要的多任务协调机制，内容不容错过。
* [概述](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Concurrent%E6%A8%A1%E5%BC%8F%E4%B8%8BReact%E7%9A%84%E6%9B%B4%E6%96%B0%E8%A1%8C%E4%B8%BA/%E6%A6%82%E8%BF%B0.md)
* [高优先级任务插队](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Concurrent%E6%A8%A1%E5%BC%8F%E4%B8%8BReact%E7%9A%84%E6%9B%B4%E6%96%B0%E8%A1%8C%E4%B8%BA/%E9%AB%98%E4%BC%98%E5%85%88%E7%BA%A7%E4%BB%BB%E5%8A%A1%E6%8F%92%E9%98%9F.md)
* [任务饥饿问题](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Concurrent%E6%A8%A1%E5%BC%8F%E4%B8%8BReact%E7%9A%84%E6%9B%B4%E6%96%B0%E8%A1%8C%E4%B8%BA/%E9%A5%A5%E9%A5%BF%E9%97%AE%E9%A2%98.md)


本系列文章在之后会继续更新未完成的部分，会同步发到我的[个人网站](https://www.neroht.com/) 以及segmentFault专栏 [React的秘密](https://segmentfault.com/blog/react-secret?_ea=101930838) 上。

