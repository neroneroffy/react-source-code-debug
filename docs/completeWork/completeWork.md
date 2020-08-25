# 概述
当workInProgress树的beginWork执行到叶子节点时，会从叶子节点往上开始对节点执行completeWork。此阶段的任务主要有两个：effectList的收集与
fiber节点的属性更新工作的落实。另外会有错误处理相关的工作。

# DOM节点相关
由于React的大部分类型的fiber节点最终都要体现为DOM，所以该阶段对于HostComponent（原生DOM组件）和HostText（文本节点）的处理需要着重理解。
```javascript
function completeWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
): Fiber | null {

  ...

  switch (workInProgress.tag) {
    ...
    case HostComponent: {
      ...
      if (current !== null && workInProgress.stateNode != null) {
        // 更新
      } else {
        // 创建
      }
      return null;
    }
    case HostText: {
      const newText = newProps;
      if (current && workInProgress.stateNode != null) {
        // 更新
      } else {
        // 创建
      }
      return null;
    }
    case SuspenseComponent:
    ...
  }
}
```
由completeWork的结构可以看出，就是依据fiber的tag做不同处理。对于HostComponent 和 HostText的处理是类似的。

若current存在并且workInProgress.stateNode（WIP节点对应的DOM实例）存在，说明节点已经存在于DOM中了，需要更新，否则进行创建。

## HostComponent
更新

创建


## HostText

更新

创建




# 错误处理