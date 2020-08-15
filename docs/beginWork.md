# 概述
当工作循环开始时，React对每个WIP节点进行beginWork操作，对组件的新状态的计算、diff操作生成新Fiber、effectTag标记都在这个阶段。
它的入参是current节点、WIP节点、此次更新任务的渲染优先级。返回入参WIP节点的子节点，作为下一个工作单元继续这个过程；
若没有子节点返回null，返回null可进入节点的complete阶段。

工作流程主要如下图，图中简化了流程，只对App节点进行了beginWork处理，其余节点流程相似

![beginWork流程](https://neroht.com/beginWork.gif)

# 职责
通过概述可知beginWork函数主要负责对WIP节点进行更新。但它只是入口，不直接进行更新操作。作为入口，它的职责很明显，拦截无需
更新的节点。同时，它还会将context信息入到栈中（beginWork入栈，completeWork出栈），暂时先不关注，后续讲context时会讲到。
```javascript
function beginWork(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes
): Fiber | null {
  // 获取workInProgress.lanes，后边判断是否需要更新会用到
  const updateLanes = workInProgress.lanes;

  // 依据current是否存在判断是初始化还是更新过程
  if (current !== null) {
    const oldProps = current.memoizedProps;
    const newProps = workInProgress.pendingProps;
    if (
        oldProps !== newProps ||
        hasLegacyContextChanged()
    ) {
      didReceiveUpdate = true;
    } else if (!includesSomeLane(renderLanes, updateLanes)) {
      // 此时无需更新
      didReceiveUpdate = false;
      switch (workInProgress.tag) {
        case HostRoot:
          ...
        case HostComponent:
          ...
        case ClassComponent: 
          ...
        case HostPortal:
          ...
      }
      
      // 拦截无需更新的节点
      return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
    }
  } else {
    didReceiveUpdate = false;
  }
  
  // 将WIP节点上的lanes清空，因为更新过程中用不到，
  // 更新结束后会重新赋值
  workInProgress.lanes = NoLanes;

  // 依据不同的节点类型来处理更新
  switch (workInProgress.tag) {
    case IndeterminateComponent: 
      ...
    case LazyComponent:
      ...
    case FunctionComponent:
      ...
      return updateFunctionComponent(
          current,
          workInProgress,
          Component,
          resolvedProps,
          renderLanes,
      );
    }
    case ClassComponent:
      ...
      return updateClassComponent(
          current,
          workInProgress,
          Component,
          resolvedProps,
          renderLanes,
      );
    }
    case HostRoot:
      return updateHostRoot(current, workInProgress, renderLanes);
    case HostComponent:
      return updateHostComponent(current, workInProgress, renderLanes);
    case HostText:
      return updateHostText(current, workInProgress);
      
    ......
  }
}
```
代码结构不复杂，但仍有几个关键点需要注意
## 如何区分是更新与初始化过程
结论是区分是处在更新过程还是初始化过程是依据current是否存在。

首先要理解current的概念基于双缓冲的规则，调度更新时有两棵树，展示在屏幕上的current Tree和正在后台基于current树构建的
workInProgress Tree。

如果是React应用首次渲染，那么是没有current Tree的。此时的current节点就是null。如果是在更新过程，由于current树已经在
首次渲染时产生了，所以current不为null。

无论是更新还是首次，都会在最后调用函数去处理节点，最终会根据是首次挂载还是更新来决定是创建fiber还是diff fiber。只不过更新时，
节点的优先级不满足要求会直接复用已有节点，而不是去创建新节点。
## 复用节点过程
在上面的代码中可以看到，若节点自己的的优先级不满足要求，说明它自己不用更新，会调用`bailoutOnAlreadyFinishedWork`函数，
它就是复用节点的关键。
```javascript
if (!includesSomeLane(renderLanes, updateLanes)) {
  ...
  
  // 此时无需更新，拦截无需更新的节点
  return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
}
```
它的内部逻辑遵循beginWork的理念，在概述中提到的beginWork，它的返回值有两种情况：
* 返回当前节点的子节点，此时当前节点已经被处理过了（调用处理函数做的处理：更新状态 & diff & effectTag），然后会以该子节点作为下一个工作单元继续遍历。
* 返回null，当前子树的遍历就此终止，从当前fiber节点开始往回进行completeWork。

`bailoutOnAlreadyFinishedWork`函数，内部也是这个过程。
* 返回当前节点的子节点，前置条件是当前节点的子节点有更新，此时当前节点未经处理，是直接复用的。
* 返回null，前置条件是当前子节点没有更新，当前子树的遍历过程就此终止。开始completeWork。

从这个函数中，我们也可以意识到，在当前fiber节点上标记子节点有无更新（fiber.childLanes）显得尤为重要。它可以决定是否终止当前Fiber
子树的遍历。
**标记fiber.childLanes的过程是在开始调度时发生的，[markUpdateLaneFromFiberToRoot](https://github.com/neroneroffy/react-source-code-debug/blob/master/src/react/v17.0.0-alpha.0/react-reconciler/src/ReactFiberWorkLoop.new.js#L649) 函数中**

带着上边的认知，来看一下源码了解具体的复用过程：
```javascript
function bailoutOnAlreadyFinishedWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes
): Fiber | null {

  if (current !== null) {
    workInProgress.dependencies = current.dependencies;
  }
  
  // 标记有跳过的更新
  markSkippedUpdateLanes(workInProgress.lanes);

  // 如果子节点没有更新，返回null，终止往下遍历
  if (!includesSomeLane(renderLanes, workInProgress.childLanes)) {
    return null;
  } else {
    // 子节点有更新，那么从current上复制子节点，
    // 并return出去
    cloneChildFibers(current, workInProgress);
    return workInProgress.child;
  }
}
```
# 总结
beginWork的主要功能就是处理当前节点，并返回新的工作单元。它会遇到两种情况：挂载或者更新。无论哪种情况，最后都会依据fiber的类型来调用
不同的处理函数。需要注意的是在更新时，会有无需更新的节点，对于这种情况会判断它的子节点有无更新。然后依据判断结果返回下一个工作单元。

其实render阶段的重头戏并不在beginWork中，对节点的更新都在其调用的处理函数中，包含了对节点的state计算、diff操作、effectTag标记
的操作。之后我们将会以classComponent为主，详细讲解这三个操作。
```javascript
    case ClassComponent:
      ...
      return updateClassComponent(
          current,
          workInProgress,
          Component,
          resolvedProps,
          renderLanes,
      );
    }
```

对于类组件，会调用`updateClassComponent`去处理组件对应的fiber节点。接下来的文章会进入此类型fiber节点的更新过程。



