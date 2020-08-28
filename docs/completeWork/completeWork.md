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
**创建**
原生DOM组件在创建时会以当前的WIP节点为基础，主要根据它的type、props去创建真实的DOM节点。挂载到WIP节点的stateNode属性上。
此后进行节点的插入操作，最后在节点上进行props的处理以及事件的注册。

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