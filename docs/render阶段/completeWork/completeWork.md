[点击](https://github.com/neroneroffy/react-source-code-debug)进入React源码调试仓库。

# 概述
每个fiber节点在更新时都会经历两个阶段：beginWork和completeWork。在Diff之后（详见[深入理解Diff算法](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/render%E9%98%B6%E6%AE%B5/beginWork%E9%98%B6%E6%AE%B5/Diff%E7%AE%97%E6%B3%95.md) ），workInProgress节点就会进入complete阶段。这个时候拿到的workInProgress节点都是经过diff算法调和过的，也就意味着对于某个节点来说它fiber的形态已经基本确定了，但除此之外还有两点：

* 目前只有fiber形态变了，对于原生DOM组件（HostComponent）和文本节点（HostText）的fiber来说，对应的DOM节点（fiber.stateNode）并未变化。
* 经过Diff生成的新的workInProgress节点持有了flag(即effectTag)

基于这两个特点，completeWork的工作主要有：
* 构建或更新DOM节点，
     - 构建过程中，会自下而上将子节点的第一层第一层插入到当前节点。
     - 更新过程中，会计算DOM节点的属性，一旦属性需要更新，会为DOM节点对应的workInProgress节点标记Update的effectTag。
* 自下而上收集effectList，最终收集到root上

对于正常执行工作的workInProgress节点来说，会走以上的流程。但是免不了节点的更新会出错，所以对出错的节点会采取措施，这涉及到错误边界以及Suspense的概念，
本文只做简单流程分析。

这一节涉及的知识点有

* DOM节点的创建以及挂载
* DOM属性的处理
* effectList的收集
* 错误处理


# 流程
completeUnitOfWork是completeWork阶段的入口。它内部有一个循环，会自下而上地遍历workInProgress节点，依次处理节点。

对于正常的workInProgress节点，会执行completeWork。这其中会对HostComponent组件完成更新props、绑定事件等DOM相关的工作。

```javascript
function completeUnitOfWork(unitOfWork: Fiber): void {
  let completedWork = unitOfWork;
  do {
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;

    if ((completedWork.effectTag & Incomplete) === NoEffect) {
      // 如果workInProgress节点没有出错，走正常的complete流程
      ...

      let next;

      // 省略了判断逻辑
      // 对节点进行completeWork，生成DOM，更新props，绑定事件
      next = completeWork(current, completedWork, subtreeRenderLanes);

      if (next !== null) {
        // 任务被挂起的情况，
        workInProgress = next;
        return;
      }

      // 收集workInProgress节点的lanes，不漏掉被跳过的update的lanes，便于再次发起调度
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
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {

      workInProgress = siblingFiber;
      return;
    }
    // 若没有兄弟节点，那么向上回到父级节点
    // 父节点进入complete
    completedWork = returnFiber;
    // 将workInProgress节点指向父级节点
    workInProgress = completedWork;
  } while (completedWork !== null);

  // 到达了root，整棵树完成了工作，标记完成状态
  if (workInProgressRootExitStatus === RootIncomplete) {
    workInProgressRootExitStatus = RootCompleted;
  }
}

```

由于React的大部分的fiber节点最终都要体现为DOM，所以本文主要分析HostComponent相关的处理流程。
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
由completeWork的结构可以看出，就是依据fiber的tag做不同处理。对HostComponent 和 HostText的处理是类似的，都是针对它们的DOM节点，处理方法又会分为更新和创建。

若current存在并且workInProgress.stateNode（workInProgress节点对应的DOM实例）存在，说明此workInProgress节点的DOM节点已经存在，走更新逻辑，否则进行创建。

DOM节点的更新实则是属性的更新，会在下面的`DOM属性的处理 -> 属性的更新`中讲到，先来看一下DOM节点的创建和插入。

# DOM节点的创建和插入
我们知道，此时的completeWork处理的是经过diff算法之后产生的新fiber。对于HostComponent类型的新fiber来说，它可能有DOM节点，也可能没有。没有的话，就需要执行先创建，再插入的操作，由此引入DOM的插入算法。
```javascript
if (current !== null && workInProgress.stateNode != null) {
    // 表明fiber有dom节点，需要执行更新过程
} else {
    // fiber不存在DOM节点
    // 先创建DOM节点
    const instance = createInstance(
      type,
      newProps,
      rootContainerInstance,
      currentHostContext,
      workInProgress,
    );

    //DOM节点插入
    appendAllChildren(instance, workInProgress, false, false);

    // 将DOM节点挂载到fiber的stateNode上
    workInProgress.stateNode = instance;

    ...

}
```

**需要注意的是，DOM的插入并不是将当前DOM插入它的父节点，而是将当前这个DOM节点的第一层子节点插入到它自己的下面。**

## 图解算法
此时的completeWork阶段，会自下而上遍历workInProgress树到root，每经过一层都会按照上面的规则插入DOM。下边用一个例子来理解一下这个过程。

这是一棵fiber树的结构，workInProgress树最终要成为这个形态。
```
  1              App
                  |
                  |
  2              div
                /
               /
  3        <List/>--->span
            /
           /
  4       p ----> 'text node'
         /
        /
  5    h1
```
构建workInProgress树的DFS遍历对沿途节点一路beginWork，此时已经遍历到最深的h1节点，它的beginWork已经结束，开始进入completeWork阶段，此时所在的层级深度为第5层。

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

此时workInProgress节点指向h1的fiber，它对应的dom节点为h1，dom标签创建出来以后进入`appendAllChildren`，因为当前的workInProgress节点为h1，所以它的child为null，无子节点可插入，退出。

h1节点完成工作往上返回到第4层的p节点。

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
            /
           /
  4 --->  p ----> 'text node'
         /
        /
  5    h1
```

此时workInProgress节点指向p的fiber，它对应的dom节点为p，进入`appendAllChildren`，发现 p 的child为 h1，并且是HostComponent组件，将 h1 插入 p，然后寻找子节点h1是否有同级的sibling节点。
发现没有，退出。

p节点的所有工作完成，它的兄弟节点：HostText类型的组件'text'会作为下一个工作单元，执行beginWork再进入completeWork。现在需要对它执行`appendAllChildren`，发现没有child，不执行插入操作。它的工作也完成，return到父节点`<List/>`，进入第3层

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
                /
               /
  3 --->   <List/>--->span
            /
           /
  4       p ----> 'text'
         /
        /
  5    h1
```


此时workInProgress节点指向`<List/>`的fiber，对它进行completeWork，由于此时它是自定义组件，不属于HostComponent，所以不会对它进行子节点的插入操作。

寻找它的兄弟节点span，对span先进行beginWork再进行到completeWork，执行span子节点的插入操作，发现它没有child，退出。return到父节点div，进入第二层。

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
                /
               /
  3        <List/>--->span
            /
           /
  4       p ---->'text'
         /
        /
  5    h1
```
此时workInProgress节点指向div的fiber，对它进行completeWork，执行div的子节点插入。由于它的child是<List/>，不满足`node.tag === HostComponent || node.tag === HostText`的条件，所以不会将它插入到div中。继续向下找<List/>的child，发现是p，将P插入div，然后寻找p的sibling，发现了'text'，将它也插入div。之后再也找不到同级节点，此时回到第三层的<List/>节点。

<List/>有sibling节点span，将span插入到div。由于span没有子节点，退出。

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
此时workInProgress节点指向App的fiber，由于它是自定义节点，所以不会对它进行子节点的插入操作。

到此为止，dom树基本构建完成。在这个过程中我们可以总结出几个规律：
1. 向节点中插入dom节点时，只插入它子节点中第一层的dom。可以把这个插入可以看成是一个自下而上收集dom节点的过程。第一层子节点之下的dom，已经在第一层子节点执行插入时被插入第一层子节点了，从下往上逐层completeWork
的这个过程类似于dom节点的累加。

2. 总是优先看本身可否插入，再往下找，之后才是找sibling节点。

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
由于一个原生DOM组件的子组件有可能是类组件或函数组件，所以会优先检查自身，发现自己不是原生DOM组件，不能被插入到父级fiber节点对应的DOM中，所以要往下找，直到找到原生DOM组件，执行插入，最后再从这一层找同级的fiber节点，同级节点也会执行`先自检，再检查下级，再检查下级的同级`的操作。

可以看出，节点的插入也是深度优先。值得注意的是，这一整个插入的流程并没有真的将DOM插入到真实的页面上，它只是在操作fiber上的stateNode。真实的插入DOM操作发生在commit阶段。

## 节点插入源码
下面是插入节点算法的源码，可以对照上面的过程来看。
```javascript
  appendAllChildren = function(
    parent: Instance,
    workInProgress: Fiber,
    needsVisibilityToggle: boolean,
    isHidden: boolean,
  ) {
    // 找到当前节点的子fiber节点
    let node = workInProgress.child;
    // 当存在子节点时，去往下遍历
    while (node !== null) {
      if (node.tag === HostComponent || node.tag === HostText) {
        // 子节点是原生DOM 节点，直接可以插入
        appendInitialChild(parent, node.stateNode);
      } else if (enableFundamentalAPI && node.tag === FundamentalComponent) {
        appendInitialChild(parent, node.stateNode.instance);
      } else if (node.tag === HostPortal) {
        // 如果是HostPortal类型的节点，什么都不做
      } else if (node.child !== null) {
        // 代码执行到这，说明node不符合插入要求，
        // 继续寻找子节点
        node.child.return = node;
        node = node.child;
        continue;
      }
      if (node === workInProgress) {
        return;
      }
      // 当不存在兄弟节点时往上找，此过程发生在当前completeWork节点的子节点再无子节点的场景，
      // 并不是直接从当前completeWork的节点去往上找
      while (node.sibling === null) {
        if (node.return === null || node.return === workInProgress) {
          return;
        }
        node = node.return;
      }
      // 当不存在子节点时，从sibling节点入手开始找
      node.sibling.return = node.return;
      node = node.sibling;
    }
  };
```

# DOM属性的处理
上面的插入过程完成了DOM树的构建，这之后要做的就是为每个DOM节点计算它自己的属性（props）。由于节点存在创建和更新两种情况，所以对属性的处理也会区别对待。

## 属性的创建
属性的创建相对更新来说比较简单，这个过程发生在DOM节点构建的最后，调用`finalizeInitialChildren`函数完成新节点的属性设置。
```javascript
if (current !== null && workInProgress.stateNode != null) {
    // 更新
} else {
    ...
    // 创建、插入DOM节点的过程
    ...

    // DOM节点属性的初始化
    if (
      finalizeInitialChildren(
        instance,
        type,
        newProps,
        rootContainerInstance,
        currentHostContext,
      )
     ) {
       // 最终会依据textarea的autoFocus属性
       // 来决定是否更新fiber
       markUpdate(workInProgress);
     }
}

```
`finalizeInitialChildren`最终会调用`setInitialProperties`，来完成属性的设置。这个过程好理解，主要就是调用`setInitialDOMProperties`将属性直接设置进DOM节点（事件在这个阶段绑定）
```javascript
function setInitialDOMProperties(
  tag: string,
  domElement: Element,
  rootContainerElement: Element | Document,
  nextProps: Object,
  isCustomComponentTag: boolean,
): void {
  for (const propKey in nextProps) {
    const nextProp = nextProps[propKey];
    if (propKey === STYLE) {
      // 设置行内样式
      setValueForStyles(domElement, nextProp);
    } else if (propKey === DANGEROUSLY_SET_INNER_HTML) {
      // 设置innerHTML
      const nextHtml = nextProp ? nextProp[HTML] : undefined;
      if (nextHtml != null) {
        setInnerHTML(domElement, nextHtml);
      }
    }
     ...
     else if (registrationNameDependencies.hasOwnProperty(propKey)) {
      // 绑定事件
      if (nextProp != null) {
        ensureListeningTo(rootContainerElement, propKey);
      }
    } else if (nextProp != null) {
      // 设置其余属性
      setValueForProperty(domElement, propKey, nextProp, isCustomComponentTag);
    }
  }
}
```
## 属性的更新
若对已有DOM节点进行更新，说明只对属性进行更新即可，因为节点已经存在，不存在删除和新增的情况。`updateHostComponent`函数负责HostComponent对应DOM节点属性的更新，代码不多很好理解。
```
  updateHostComponent = function(
    current: Fiber,
    workInProgress: Fiber,
    type: Type,
    newProps: Props,
    rootContainerInstance: Container,
  ) {
    const oldProps = current.memoizedProps;
    // 新旧props相同，不更新
    if (oldProps === newProps) {
      return;
    }

    const instance: Instance = workInProgress.stateNode;
    const currentHostContext = getHostContext();

    // prepareUpdate计算新属性
    const updatePayload = prepareUpdate(
      instance,
      type,
      oldProps,
      newProps,
      rootContainerInstance,
      currentHostContext,
    );

    // 最终新属性被挂载到updateQueue中，供commit阶段使用
    workInProgress.updateQueue = (updatePayload: any);

    if (updatePayload) {
      // 标记workInProgress节点有更新
      markUpdate(workInProgress);
    }
  };
```

可以看出它只做了一件事，就是计算新的属性，并挂载到workInProgress节点的updateQueue中，它的形式是以2为单位，index为偶数的是key，为奇数的是value：
```
[ 'style', { color: 'blue' }, title, '测试标题' ]
```
这个结果由`diffProperties`计算产生，它对比lastProps和nextProps，计算出updatePayload。

举个例子来说，有如下组件，div上绑定的点击事件会改变它的props。
```javascript
class PropsDiff extends React.Component {
    state = {
        title: '更新前的标题',
        color: 'red',
        fontSize: 18
    }
    onClickDiv = () => {
        this.setState({
            title: '更新后的标题',
            color: 'blue'
        })
    }
    render() {
        const { color, fontSize, title } = this.state
        return <div
            className="test"
            onClick={this.onClickDiv}
            title={title}
            style={{color, fontSize}}
            {...this.state.color === 'red' && { props: '自定义旧属性' }}
        >
            测试div的Props变化
        </div>
    }
}
```
lastProps和nextProps分别为
```
lastProps
{
  "className": "test",
  "title": "更新前的标题",
  "style": { "color": "red", "fontSize": 18},
  "props": "自定义旧属性",
  "children": "测试div的Props变化",
  "onClick": () => {...}
}

nextProps
{
  "className": "test",
  "title": "更新后的标题",
  "style": { "color":"blue", "fontSize":18 },
  "children": "测试div的Props变化",
  "onClick": () => {...}
}
```
它们有变化的是propsKey是`style、title、props`，经过diff，最终打印出来的updatePayload为
```
[
   "props", null,
   "title", "更新后的标题",
   "style", {"color":"blue"}
]
```

`diffProperties`内部的规则可以概括为：

若有某个属性（propKey），它在

* lastProps中存在，nextProps中不存在，将propKey的value标记为null表示删除
* lastProps中不存在，nextProps中存在，将nextProps中的propKey和对应的value添加到updatePayload
* lastProps中存在，nextProps中也存在，将nextProps中的propKey和对应的value添加到updatePayload

对照这个规则看一下源码：
```javascript
export function diffProperties(
  domElement: Element,
  tag: string,
  lastRawProps: Object,
  nextRawProps: Object,
  rootContainerElement: Element | Document,
): null | Array<mixed> {

  let updatePayload: null | Array<any> = null;

  let lastProps: Object;
  let nextProps: Object;

  ...

  let propKey;
  let styleName;
  let styleUpdates = null;

  for (propKey in lastProps) {
    // 循环lastProps，找出需要标记删除的propKey
    if (
      nextProps.hasOwnProperty(propKey) ||
      !lastProps.hasOwnProperty(propKey) ||
      lastProps[propKey] == null
    ) {
      // 对propKey来说，如果nextProps也有，或者lastProps没有，那么
      // 就不需要标记为删除，跳出本次循环继续判断下一个propKey
      continue;
    }
    if (propKey === STYLE) {
      // 删除style
      const lastStyle = lastProps[propKey];
      for (styleName in lastStyle) {
        if (lastStyle.hasOwnProperty(styleName)) {
          if (!styleUpdates) {
            styleUpdates = {};
          }
          styleUpdates[styleName] = '';
        }
      }
    } else if(/*...*/) {
      ...
      // 一些特定种类的propKey的删除
    } else {
      // 将其他种类的propKey标记为删除
      (updatePayload = updatePayload || []).push(propKey, null);
    }
  }
  for (propKey in nextProps) {
    // 将新prop添加到updatePayload
    const nextProp = nextProps[propKey];
    const lastProp = lastProps != null ? lastProps[propKey] : undefined;
    if (
      !nextProps.hasOwnProperty(propKey) ||
      nextProp === lastProp ||
      (nextProp == null && lastProp == null)
    ) {
      // 如果nextProps不存在propKey，或者前后的value相同，或者前后的value都为null
      // 那么不需要添加进去，跳出本次循环继续处理下一个prop
      continue;
    }
    if (propKey === STYLE) {
      /*
      * lastProp: { color: 'red' }
      * nextProp: { color: 'blue' }
      * */
      // 如果style在lastProps和nextProps中都有
      // 那么需要删除lastProps中style的样式
      if (lastProp) {
        // 如果lastProps中也有style
        // 将style内的样式属性设置为空
        // styleUpdates = { color: '' }
        for (styleName in lastProp) {
          if (
            lastProp.hasOwnProperty(styleName) &&
            (!nextProp || !nextProp.hasOwnProperty(styleName))
          ) {
            if (!styleUpdates) {
              styleUpdates = {};
            }
            styleUpdates[styleName] = '';
          }
        }
        // 以nextProp的属性名为key设置新的style的value
        // styleUpdates = { color: 'blue' }
        for (styleName in nextProp) {
          if (
            nextProp.hasOwnProperty(styleName) &&
            lastProp[styleName] !== nextProp[styleName]
          ) {
            if (!styleUpdates) {
              styleUpdates = {};
            }
            styleUpdates[styleName] = nextProp[styleName];
          }
        }
      } else {
        // 如果lastProps中没有style，说明新增的
        // 属性全部可放入updatePayload
        if (!styleUpdates) {
          if (!updatePayload) {
            updatePayload = [];
          }
          updatePayload.push(propKey, styleUpdates);
          // updatePayload: [ style, null ]
        }
        styleUpdates = nextProp;
        // styleUpdates = { color: 'blue' }
      }
    } else if (/*...*/) {
      ...
      // 一些特定种类的propKey的处理
    } else if (registrationNameDependencies.hasOwnProperty(propKey)) {
      if (nextProp != null) {
        // 重新绑定事件
        ensureListeningTo(rootContainerElement, propKey);
      }
      if (!updatePayload && lastProp !== nextProp) {
        // 事件重新绑定后，需要赋值updatePayload，使这个节点得以被更新
        updatePayload = [];
      }
    } else if (
      typeof nextProp === 'object' &&
      nextProp !== null &&
      nextProp.$$typeof === REACT_OPAQUE_ID_TYPE
    ) {
      // 服务端渲染相关
      nextProp.toString();
    } else {
       // 将计算好的属性push到updatePayload
      (updatePayload = updatePayload || []).push(propKey, nextProp);
    }
  }
  if (styleUpdates) {
    // 将style和值push进updatePayload
    (updatePayload = updatePayload || []).push(STYLE, styleUpdates);
  }
  console.log('updatePayload', JSON.stringify(updatePayload));
  // [ 'style', { color: 'blue' }, title, '测试标题' ]
  return updatePayload;
}
```

DOM节点属性的diff为workInProgress节点挂载了带有新属性的updateQueue，一旦节点的updateQueue不为空，它就会被标记上Update的effectTag，commit阶段会处理updateQueue。
```javascript
if (updatePayload) {
  markUpdate(workInProgress);
}
```

# effect链的收集
经过beginWork和上面对于DOM的操作，有变化的workInProgress节点已经被打上了effectTag。

一旦workInProgress节点持有了effectTag，说明它需要在commit阶段被处理。每个workInProgress节点都有一个firstEffect和lastEffect，是一个单向链表，来表示它自身以及它的子节点上所有持有effectTag的workInProgress节点。completeWork阶段在向上遍历的过程中也会逐层收集effect链，最终收集到root上，供接下来的commit阶段使用。

实现上相对简单，对于某个workInProgress节点来说，先将它已有的effectList并入到父级节点，再判断它自己有没有effectTag，有的话也并入到父级节点。

```javascript
 /*
* effectList是一条单向链表，每完成一个工作单元上的任务，
* 都要将它产生的effect链表并入
* 上级工作单元。
* */
// 将当前节点的effectList并入到父节点的effectList
if (returnFiber.firstEffect === null) {
  returnFiber.firstEffect = completedWork.firstEffect;
}
if (completedWork.lastEffect !== null) {
  if (returnFiber.lastEffect !== null) {
    returnFiber.lastEffect.nextEffect = completedWork.firstEffect;
  }
  returnFiber.lastEffect = completedWork.lastEffect;
}

// 将自身添加到effect链，添加时跳过NoWork 和
// PerformedWork的effectTag，因为真正
// 的commit用不到
const effectTag = completedWork.effectTag;

if (effectTag > PerformedWork) {
  if (returnFiber.lastEffect !== null) {
    returnFiber.lastEffect.nextEffect = completedWork;
  } else {
    returnFiber.firstEffect = completedWork;
  }
  returnFiber.lastEffect = completedWork;
}
```
每个节点都会执行这样的操作，最终当回到root的时候，root上会有一条完整的effectList，包含了所有需要处理的fiber节点。

# 错误处理
completeUnitWork中的错误处理是错误边界机制的组成部分。

错误边界是一种React组件，一旦类组件中使用了`getDerivedStateFromError`或`componentDidCatch`，就可以捕获发生在其子树中的错误，那么它就是错误边界。

回到源码中，节点如果在更新的过程中报错，它就会被打上Incomplete的effectTag，说明节点的更新工作未完成，因此不能执行正常的completeWork，要走另一个判断分支进行处理。
```javascript
if ((completedWork.effectTag & Incomplete) === NoEffect) {

} else {
  // 有Incomplete的节点会进入到这个判断分支进行错误处理
}

```

## Incomplete从何而来

什么情况下节点会被标记上Incomplete呢？这还要从最外层的工作循环说起。

concurrent模式的渲染函数：renderRootConcurrent之中在构建workInProgress树时，使用了try...catch来包裹执行函数，这对处理报错节点提供了机会。
```javascript
do {
    try {
      workLoopConcurrent();
      break;
    } catch (thrownValue) {
      handleError(root, thrownValue);
    }
  } while (true);
```
一旦某个节点执行出错，会进入`handleError`函数处理。该函数中可以获取到当前出错的workInProgress节点，除此之外我们暂且不关注其他功能，只需清楚它调用了`throwException`。

`throwException`会为这个出错的workInProgress节点打上`Incomplete 的 effectTag`，表明未完成，在向上找到可以处理错误的节点（即错误边界），添加上ShouldCapture 的 effectTag。

另外，创建代表错误的update，`getDerivedStateFromError`放入payload，`componentDidCatch`放入callback。最后这个update入队节点的updateQueue。

`throwException`执行完毕，回到出错的workInProgress节点，执行`completeUnitOfWork`，目的是将错误终止到当前的节点，因为它本身都出错了，再向下渲染没有意义。
```javascript
function handleError(root, thrownValue):void {
  ...

  // 给当前出错的workInProgress节点添加上 Incomplete 的effectTag
  throwException(
    root,
    erroredWork.return,
    erroredWork,
    thrownValue,
    workInProgressRootRenderLanes,
  );

  // 开始对错误节点执行completeWork阶段
  completeUnitOfWork(erroredWork);

  ...

}
```
**重点：从发生错误的节点往上找到错误边界，做记号，记号就是ShouldCapture 的 effectTag。**

## 错误边界再次更新
当这个错误节点进入completeUnitOfWork时，因为持有了`Incomplete`，所以不会进入正常的complete流程，而是会进入错误处理的逻辑。

错误处理逻辑做的事情：
* 对出错节点执行`unwindWork`。
* 将出错节点的父节点（returnFiber）标记上`Incomplete`，目的是在父节点执行到completeUnitOfWork的时候，也能被执行unwindWork，进而验证它是否是错误边界。
* 清空出错节点父节点上的effect链。

这里的重点是`unwindWork`会验证节点是否是错误边界，来看一下unwindWork的关键代码：
```javascript
function unwindWork(workInProgress: Fiber, renderLanes: Lanes) {
  switch (workInProgress.tag) {
    case ClassComponent: {

      ...

      const effectTag = workInProgress.effectTag;
      if (effectTag & ShouldCapture) {
        // 删它上面的ShouldCapture，再打上DidCapture
        workInProgress.effectTag = (effectTag & ~ShouldCapture) | DidCapture;

        return workInProgress;
      }
      return null;
    }
    ...
    default:
      return null;
  }
}
```
`unwindWork`验证节点是错误边界的依据就是节点上是否有刚刚`throwException`的时候打上的ShouldCapture的effectTag。如果验证成功，最终会被return出去。return出去之后呢？会被赋值给workInProgress节点，我们往下看一下错误处理的整体逻辑：

```javascript
if ((completedWork.effectTag & Incomplete) === NoEffect) {

    // 正常流程
    ...

} else {
  // 验证节点是否是错误边界
  const next = unwindWork(completedWork, subtreeRenderLanes);

  if (next !== null) {
    // 如果找到了错误边界，删除与错误处理有关的effectTag，
    // 例如ShouldCapture、Incomplete，
    // 并将workInProgress指针指向next
    next.effectTag &= HostEffectMask;
    workInProgress = next;
    return;
  }

  // ...省略了React性能分析相关的代码

  if (returnFiber !== null) {
    // 将父Fiber的effect list清除，effectTag标记为Incomplete，
    // 便于它的父节点再completeWork的时候被unwindWork
    returnFiber.firstEffect = returnFiber.lastEffect = null;
    returnFiber.effectTag |= Incomplete;
  }
}

...
// 继续向上completeWork的过程
completedWork = returnFiber;

```

现在我们要有个认知，一旦unwindWork识别当前的workInProgress节点为错误边界，那么现在的workInProgress节点就是这个错误边界。然后会删除掉与错误处理有关的effectTag，DidCapture会被保留下来。

```javascript
  if (next !== null) {
    next.effectTag &= HostEffectMask;
    workInProgress = next;
    return;
  }
```

**重点：将workInProgress节点指向错误边界，这样可以对错误边界重新走更新流程。**

这个时候workInProgress节点有值，并且跳出了completeUnitOfWork，那么继续最外层的工作循环：
```javascript
function workLoopConcurrent() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}
```
此时，workInProgress节点，也就是错误边界，它会**再被performUnitOfWork处理，然后进入beginWork、completeWork！**

也就是说它会被重新更新一次。为什么说再被更新呢？因为构建workInProgress树的时候，beginWork是从上往下的，当时workInProgress指针指向它的时候，它只执行了beginWork。此时子节点出错导致向上completeUnitOfWork的时候，发现了他是错误边界，workInProgress又指向了它，所以它会再次进行beginWork。不同的是，这次节点上持有了
DidCapture的effectTag。所以流程上是不一样的。

还记得`throwException`阶段入队错误边界更新队列的表示错误的update吗？它在此次beginWork调用processUpdateQueue的时候，会被处理。
这样保证了`getDerivedStateFromError`和`componentDidCatch`的调用，然后产生新的state，这个state表示这次错误的状态。

错误边界是类组件，在beginWork阶段会执行`finishClassComponent`，如果判断组件有DidCapture，会卸载掉它所有的子节点，然后重新渲染新的子节点，这些子节点有可能是经过错误处理渲染的备用UI。

*示例代码来自React[错误边界介绍](https://zh-hans.reactjs.org/docs/error-boundaries.html)*

```javascript
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // 更新 state 使下一次渲染能够显示降级后的 UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // 你同样可以将错误日志上报给服务器
    logErrorToMyService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // 你可以自定义降级后的 UI 并渲染
      return <h1>Something went wrong.</h1>;
    }

    return this.props.children;
  }
}
```
对于上述情况来说，一旦ErrorBoundary的子树中有某个节点发生了错误，组件中的`getDerivedStateFromError` 和 `componentDidCatch`就会被触发，
此时的备用UI就是：
```javascript
<h1>Something went wrong.</h1>
```

## 流程梳理
上面的错误处理我们用图来梳理一下，假设`<Example/>`具有错误处理的能力。

```
  1              App
                  |
                  |
  2           <Example/>
                /
               /
  3 --->   <List/>--->span
            /
           /
  4       p ----> 'text'
         /
        /
  5    h1
```

1.如果`<List/>`更新出错，那么首先`throwException`会给它打上Incomplete的effectTag，然后以它的父节点为起点向上找到可以处理错误的节点。

2.找到了`<Example/>`，它可以处理错误，给他打上ShouldCapture的effectTag（做记号），创建错误的update，将`getDerivedStateFromError`放入payload，`componentDidCatch`放入callback。
，入队`<Example/>`的updateQueue。

3.从`<List/>`开始直接`completeUnitOfWork`。由于它有Incomplete，所以会走`unwindWork`，然后给它的父节点`<Example/>`打上Incomplete，`unwindWork`发现它不是刚刚做记号的错误边界，
继续向上`completeUnitOfWork`。

4.`<Example/>`有Incomplete，进入`unwindWork`，而它恰恰是刚刚做过记号的错误边界节点，去掉ShouldCapture打上DidCapture，将workInProgress的指针指向`<Example/>`

5.`<Example/>`重新进入beginWork处理updateQueue，调和子节点（卸载掉原有的子节点，渲染备用UI）。

我们可以看出来，React的错误边界的概念其实是对可以处理错误的组件重新进行更新。错误边界只能捕获它子树的错误，而不能捕获到它自己的错误，自己的错误要靠它上面的错误边界来捕获。我想这是由于出错的组件已经无法再渲染出它的子树，也就意味着它不能渲染出备用UI，所以即使它捕获到了自己的错误也于事无补。

这一点在`throwException`函数中有体现，是从它的父节点开始向上找错误边界：
```javascript
// 从当前节点的父节点开始向上找
let workInProgress = returnFiber;

do {
  ...
} while (workInProgress !== null);

```

回到completeWork，它在整体的错误处理中做的事情就是对错误边界内的节点进行处理：
* 检查当前节点是否是错误边界，是的话将workInProgress指针指向它，便于它再次走一遍更新。
* 置空节点上的effectList。

以上我们只是分析了一般场景下的错误处理，实际上在任务挂起（Suspense）时，也会走错误处理的逻辑，因为此时throw的错误值是个thenable对象，具体会在分析suspense时详细解释。

# 总结
workInProgress节点的completeWork阶段主要做的事情再来回顾一下：

* 真实DOM节点的创建以及挂载
* DOM属性的处理
* effectList的收集
* 错误处理

虽然用了不少的篇幅去讲错误处理，但是仍然需要重点关注正常节点的处理过程。completeWork阶段处在beginWork之后，commit之前，起到的是一个承上启下的作用。它接收到的是经过diff后的fiber节点，然后他自己要将DOM节点和effectList都准备好。因为commit阶段是不能被打断的，所以充分准备有利于commit阶段做更少的工作。

一旦workInProgress树的所有节点都完成complete，则说明workInProgress树已经构建完成，所有的更新工作已经做完，接下来这棵树会进入commit阶段，从下一篇文章开始，我们会分析commit阶段的各个过程。

欢迎扫码关注公众号，发现更多技术文章

![](https://neroht.com/qrcode-small.jpg)
