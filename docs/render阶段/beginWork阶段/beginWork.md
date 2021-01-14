
# React更新任务
React的更新任务主要是调用一个叫做workLoop的工作循环去构建workInProgress树，
构建过程分为两个阶段：向下遍历和向上回溯，向下和向上的过程中会对途径的每个节点进行beginWork和completeWork。

本文即将提到的beginWork是处理节点更新的入口，它会依据fiber节点的类型去调用不同的处理函数。

React对current树的每个节点进行beginWork操作，进入beginWork后，首先判断节点及其子树是否有更新，若有更新，则会在计算新状态和diff之后生成新的Fiber，
然后在新的fiber上标记effectTag，最后return它的子节点，以便继续针对子节点进行beginWork。若它没有子节点，则返回null，这样说明这个节点是末端节点，
可以进行向上回溯，进入completeWork阶段。

*[点击](https://github.com/neroneroffy/react-source-code-debug)进入React源码调试仓库。*

beginWork的工作流程如下图，图中简化了流程，只对App节点进行了beginWork处理，其余节点流程相似

![beginWork流程](http://neroht.com/beginWork2.gif)

# 职责
通过概述可知beginWork阶段的工作是会去更新节点，并返回子树，但真正的beginWork函数只是节点更新的入口，不会直接进行更新操作。作为入口，它的职责很明显，拦截无需
更新的节点。同时，它还会将context信息入到栈中（beginWork入栈，completeWork出栈），暂时先不关注。
```javascript
function beginWork(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes
): Fiber | null {
  // 获取workInProgress.lanes，可通过判断它是否为空去判断该节点是否需要更新
  const updateLanes = workInProgress.lanes;

  // 依据current是否存在判断当前是首次挂载还是后续的更新
  // 如果是更新，先看优先级够不够，不够的话就能调用bailoutOnAlreadyFinishedWork
  // 复用fiber节点来跳出对当前这个节点的处理了。
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

  // 代码走到这里说明确实要去处理节点了，此时会根据不同fiber的类型
  // 去调用它们各自的处理函数

  // 先清空workInProgress节点上的lanes，因为更新过程中用不到，
  // 在处理完updateQueue之后会重新赋值
  workInProgress.lanes = NoLanes;

  // 依据不同的节点类型来处理节点的更新
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
可以看出，一旦节点进入beginWork，会先去识别该节点是否需要处理，若无需处理，则调用`bailoutOnAlreadyFinishedWork`复用节点，否则才真正去更新。
## 如何区分首次渲染与更新
**区分首次渲染与更新的依据current是否存在。**

这首先要理解current是什么，基于双缓冲的规则，调度更新时有两棵树，展示在屏幕上的current Tree和正在后台基于current树构建的
workInProgress Tree。那么，current和workInProgress可以理解为镜像的关系。workLoop循环当前遍历到的workInProgress节点来自于它对应的current节点父级fiber的子节点，
即workInProgress节点和current节点也是镜像的关系。

如果是首次渲染，对具体的workInProgress节点来说，它是没有current节点的，如果是在更新过程，由于current节点已经在
首次渲染时产生了，所以workInProgress节点有对应的current节点存在。

最终会根据节点是首次渲染还是更新来决定是创建fiber还是diff fiber。只不过更新时，
如果节点的优先级不够会直接复用已有节点，而不是去走下面的更新逻辑，即走跳出（bailout）的逻辑。
## 复用节点过程
节点可复用表示它无需更新。在上面的代码中可以看到，若节点的优先级不满足要求，说明它不用更新，会调用`bailoutOnAlreadyFinishedWork`函数，去复用current节点作为新的workInProgress树的节点。

*beginWork函数中拦截无需更新节点的逻辑*
```javascript
if (!includesSomeLane(renderLanes, updateLanes)) {
  ...

  // 此时无需更新，拦截无需更新的节点
  return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
}
```
beginWork它的返回值有两种情况：
* 返回当前节点的子节点，然后会以该子节点作为下一个工作单元继续beginWork，不断往下生成fiber节点，构建workInProgress树。
* 返回null，当前fiber子树的遍历就此终止，从当前fiber节点开始往回进行completeWork。

`bailoutOnAlreadyFinishedWork`函数的返回值也是如此。
* 返回当前节点的子节点，前置条件是当前节点的子节点有更新，此时当前节点未经处理，是可以直接复用的，复用的过程就是复制一份current节点的子节点，并把它return出去。
* 返回null，前提是当前子节点没有更新，当前子树的遍历过程就此终止。开始completeWork。

从这个函数中，我们也可以意识到，识别当前fiber节点的子树有无更新显得尤为重要，这可以决定是否终止当前Fiber子树的遍历，将复杂度直接降低。实际上可以通过fiber.childLanes去识别，childLanes如果不为空，
表明子树中有需要更新的节点，那么需要继续往下走。

*标记fiber.childLanes的过程是在开始调度时发生的，在[markUpdateLaneFromFiberToRoot](https://github.com/neroneroffy/react-source-code-debug/blob/master/src/react/v17/react-reconciler/src/ReactFiberWorkLoop.old.js#L668) 函数中*

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

  // 如果子节点没有更新，返回null，终止遍历
  if (!includesSomeLane(renderLanes, workInProgress.childLanes)) {
    return null;
  } else {
    // 子节点有更新，那么从current上复制子节点，并return出去
    cloneChildFibers(current, workInProgress);
    return workInProgress.child;
  }
}
```
# 总结
beginWork的主要功能就是处理当前遍历到的fiber，经过一番处理之后返回它的子fiber，一个一个地往外吐出fiber节点，那么workInProgress树也就会被一点一点地构建出来。
这是beginWork地大致流程，但实际上，核心更新的工作都是在各个更新函数中，这些函数会安排fiber节点依次进入两大处理流程：计算新状态和Diff算法，限于篇幅，这两个内容会分两篇文章详细讲解。
可以持续关注。

欢迎扫码关注公众号，发现更多技术文章

![](https://neroht.com/qrcode-small.jpg)
