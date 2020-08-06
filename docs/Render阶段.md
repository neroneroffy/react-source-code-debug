# Render阶段
每个节点进行 beginWork - completeWork的处理
## beginWork
```javascript
function beginWork(
    current: Fiber | null,
    workInProgress: Fiber,
    renderLanes: Lanes,
):  Fiber | null{
  if (current !== null) {
    // React应用首次挂载
  } else {
    // 更新时
  }
  // 依据Fiber节点的不同tag，来做不同处理
  switch (workInProgress.tag) {
    ...
    case FunctionComponent: {
      return updateFunctionComponent(
        /* current,
        workInProgress,
        Component,
        resolvedProps,
        renderLanes, */
      );
    }
    case ClassComponent: {
      return updateClassComponent(
        /* current,
        workInProgress,
        Component,
        resolvedProps,
        renderLanes, */
      );
    }
    ...
  }
}
```

* current：当前处理的Fiber节点的上一次更新时的Fiber，就是workInProgress.alternate。
* workInProgress： 当前处理的Fiber节点
* renderLanes：本次渲染的优先级

基于双缓冲的概念，current是当前展示出来的结构对应的Fiber节点，workInProgress是正在后台构建的Fiber节点。上次更新完毕之后，
workInProgress会成为current被展示给用户，所以在这次更新时，current就是新的workInProgress再上次更新时对应的Fiber。
