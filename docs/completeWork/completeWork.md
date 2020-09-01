# 概述
每个fiber节点都会经历两个阶段：beginWork和completeWork。节点进入complete的前提是已经完成了beginWork。这个时候拿到的WIP节点都是
经过diff算法调和过的，也就意味着对于某个WIP节点来说它的fiber类型的形态已经基本确定了。此时有两点需要注意：
* 需要变化的节点持有了effectTag
* 目前只有fiber形态变了，对于原生DOM组件（HostComponent）和文本节点（HostText）的fiber来说，对应的DOM节点（fiber.stateNode）并未变化。

基于这两个特点，completeWork的工作主要有：
* 自下而上收集effectList，最终收集到root上
* 构建或更新DOM节点，构建过程中，会自下而上将子节点的第一层第一层插入到当前节点

对于正常执行工作的WIP节点来说，会执行以上的任务。但由于是WIP节点的完成阶段，免不了之前的工作会出错，所以也会对出错的节点采取措施，
这就涉及到错误边界以及Suspense的概念了，本节只做简单描述，相关思想会在对应的文章里专门介绍。

# 流程
completeUnitOfWork是complete阶段的入口。它内部有一个循环，会自下而上地遍历workInProgress节点，依次处理节点。

对于正常的WIP节点，会执行completeWork。这其中会对HostComponent组件完成更新props、绑定事件、DOM相关的工作。



```javascript
function completeUnitOfWork(unitOfWork: Fiber): void {
  let completedWork = unitOfWork;
  do {
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;

    if ((completedWork.effectTag & Incomplete) === NoEffect) {
      // 如果fiber节点没有出错，走正常的complete流程
      ...

      let next;
      
      // 省略了判断逻辑
      // 对节点进行completeWork，更新props，生成DOM，绑定事件
      next = completeWork(current, completedWork, subtreeRenderLanes);

      if (next !== null) {
        // 任务被挂起的情况，
        workInProgress = next;
        return;
      }

      // 收集WIP节点的lanes，不漏掉被跳过的update的lanes，便于再次发起调度
      resetChildLanes(completedWork);

      // 将当前节点的effectList并入父级节点
       ...

      // 如果当前节点他自己也有effectTag，将它自己
      // 也并入到父级节点的effectList
    } else {
      // 执行到这个分支说明之前的更新有错误
      // 进入unwindWork
      const next = unwindWork(completedWork, subtreeRenderLanes);
      ...

    }
    
    // 查找兄弟节点，若有则进行beginWork -> completeWork
    // 的流程
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
     
      workInProgress = siblingFiber;
      return;
    }
    // 若没有兄弟节点，那么向上回到父级节点
    // 对父节点执行complete阶段
    completedWork = returnFiber;
    // 将WIP节点指向父级节点
    workInProgress = completedWork;
  } while (completedWork !== null);

  // 到达了root，整棵树完成了工作，标记完成状态
  if (workInProgressRootExitStatus === RootIncomplete) {
    workInProgressRootExitStatus = RootCompleted;
  }
}

```


由于React的大部分类型的fiber节点最终都要体现为DOM，所以该阶段对于HostComponent（原生DOM组件）的处理需要着重理解。
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
由completeWork的结构可以看出，就是依据fiber的tag做不同处理。对于HostComponent 和 HostText的处理是类似的，都是视情况来决定是更新或者是创建。
若current存在并且workInProgress.stateNode（WIP节点对应的DOM实例）存在，说明此fiber节点的DOM节点已经存在，走更新逻辑，否则进行创建。

**创建**

根据HostComponent（即此刻的WIP节点）上的type、props去创建真实的DOM节点，挂载到这个WIP节点的stateNode属性上。
然后对该它进行子DOM节点的插入，最后在它本身的DOM节点上进行props的处理以及事件的注册。

**更新**


## DOM节点的插入算法


这个过程中值得注意的一点是插入操作，由于此时处于completeWork阶段，会自下而上遍历WIP树到root，每经过一层WIP节点都会将它child节点的第一层DOM节点（child.stateNode）
插入到当前的这个WIP的stateNode中。

这是一棵fiber树的结构，workInProgress树最终要成为这个形态。我们来看一下dom节点是如何插入的
```
  1              App
                  |
                  |
  2              div
                /   \
               /     \
  3        <List/>--->span
            /   \
           /     \
  4       p ----> 'text node'
         /
        /
  5    h1
```
构建WIP树的DFS遍历对沿途节点一路beginWork，已经遍历到最深的h1节点，它的beginWork已经结束，开始进入completeWork阶段，此时所在的层级深度为第5层。
**第5层**

```
  1              App
                  |
                  |
  2              div
                /
               /
  3        <List/>
            /
           /
  4       p
         /
        /
  5--->h1
```

此时WIP节点指向h1的fiber，它对应的dom节点为h1，dom标签创建出来以后进入`appendAllChildren`，因为当前的workInProgress节点为h1，此时它的child为null，无需插入，所以退出。
h1节点完成工作往上返回到第4层的p节点

此时的dom树为
```
      h1
```

**第4层**

```
  1              App
                  |
                  |
  2              div
                /
               /
  3        <List/>
            /   \
           /     \
  4 --->  p ----> 'text node'
         /
        /
  5    h1
```


此时WIP节点指向p的fiber，它对应的dom节点为p，进入`appendAllChildren`，发现 p 的child为 h1，并且是HostComponent组件，将 h1 插入 p，然后寻找h1是否有同级的sibling节点。
发现没有，退出。

p节点的所有工作完成，它的兄弟节点：HostText类型的组件'text'会作为下一个工作单元，执行beginWork再进入completeWork。现在需要对它执行`appendAllChildren`，发现没有child，
不执行插入操作。它的工作也完成，return到父节点<List/>，进入第3层

此时的dom树为
```
        p      'text'
       /
      /
     h1
```

**第3层**

```
  1              App
                  |
                  |
  2              div
                /   \
               /     \
  3 --->   <List/>--->span
            /   \
           /     \
  4       p ----> 'text'
         /
        /
  5    h1
```


此时WIP节点指向List的fiber，对它进行completeWork，由于此时它是自定义组件，不属于HostComponent，所以不会对它进行子节点的插入操作。寻找它的兄弟节点span，beginWork再completeWork，执行子节点的插入操作，
发现它没有child，退出。return到父节点div，进入第二层。

此时的dom树为
```
                span

        p      'text'
       /
      /
     h1
```
**第2层**

```
  1              App
                  |
                  |
  2 --------->   div
                /   \
               /     \
  3        <List/>--->span
            /   \
           /     \
  4       p ---->'text'
         /
        /
  5    h1
```
此时WIP节点指向div的fiber，对它进行completeWork，执行子节点插入操作。由于它的child是<List/>，不满足`node.tag === HostComponent || node.tag === HostText`的条件，所以
不会将它插入到div中。继续向下找<List/>的child，发现是p，将P插入div，寻找p的sibling，发现了'text'，将它也插入div。之后再也找不到同级节点，此时回到第三层的<List/>节点。

<List/>有sibling节点span，将span插入到div。由于span没有子节点，所以退出。

此时的dom树为
```
             div
          /   |   \
         /    |    \
       p   'text'  span
      /
     /
    h1
```

**第1层**
此时WIP节点指向App的fiber，由于它是自定义节点，所以不会对它进行子节点的插入操作。

到此为止，dom树基本构建完成。在这个过程中我们可以总结出几个规律：
1. 向节点中插入dom节点时，只插入它子节点中第一层的dom。可以把这个插入可以看成是一个自下而上收集dom节点的过程。第一层之下的dom，在该dom节点执行插入时已经被插入了，类似于累加的
概念。
2. 总是优先看本身可否插入，再往下找，之后才是sibling节点。

这是由于fiber树和dom树的差异导致，每个fiber节点不一定对应一个dom节点，但一个dom节点一定对应一个fiber节点。
```
   fiber树      DOM树

   <App/>       div
     |           |
    div        input
     |
  <Input/>
     |
   input
```
由于一个原生DOM组件的子组件有可能是类组件或函数组件，优先检查自身，但它们不是原生DOM组件，不能被插入到父级的DOM组件对应的DOM节点中，所以下一步要往下找，直到找到原生DOM组件，执行插入，
最后再从这一层找同级的fiber节点，同级节点也会执行`先自检，再检查下级，再检查下级的同级`的操作。

可以看出，节点的插入也是深度优先。





更新




## HostText

更新

创建

## effect链的收集



# 错误处理
