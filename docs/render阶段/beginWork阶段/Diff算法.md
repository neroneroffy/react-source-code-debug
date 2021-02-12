[点击](https://github.com/neroneroffy/react-source-code-debug) 进入React源码调试仓库。

上一篇[扒一扒React计算状态的原理](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/render%E9%98%B6%E6%AE%B5/beginWork%E9%98%B6%E6%AE%B5/%E5%A4%84%E7%90%86%E6%9B%B4%E6%96%B0.md) 之后，我们来分析一下Diff的过程。

fiber上的updateQueue经过React的一番计算之后，这个fiber已经有了新的状态，也就是state，对于类组件来说，state是在render函数里被使用的，
既然已经得到了新的state，那么当务之急是执行一次render，得到持有新state的ReactElement。

假设render一次之后得到了大量的ReactElement，而这些ReactElement之中若只有少量需要更新的节点，那么显然不能全部去更新它们，此时就需要有一个diff过程来决定哪些节点是真正需要更新的。

## 源码结构
我们以类组件为例，state的计算发生在类组件对应的fiber节点beginWork中的`updateClassInstance`函数中，在状态计算完毕之后，紧跟着就是去调用`finishClassComponent`执行diff、
打上effectTag（即新版本的flag）。

> 打上effectTag可以标识这个fiber发生了怎样的变化，例如：新增（Placement）、更新（Update）、删除（Deletion），这些被打上flag的fiber会在complete阶段被收集起来，形成一个effectList链表，只包含这些需要操作的fiber，最后在commit阶段被更新掉。

```javascript
function updateClassComponent(
  current: Fiber | null,
  workInProgress: Fiber,
  Component: any,
  nextProps: any,
  renderLanes: Lanes,
) {
  
  ...
  
  // 计算状态
  shouldUpdate = updateClassInstance(
    current,
    workInProgress,
    Component,
    nextProps,
    renderLanes,
  );

  ...

  // 执行render，进入diff，为fiber打上effectTag
  const nextUnitOfWork = finishClassComponent(
    current,
    workInProgress,
    Component,
    shouldUpdate,
    hasContext,
    renderLanes,
  );
  return nextUnitOfWork;
}
```
在`finishClassComponent`函数中，调用`reconcileChildFibers`去做diff，而`reconcileChildFibers`实际上就是`ChildReconciler`，这是diff的核心函数，
该函数针对组件render生成的新节点的类型，调用不同的函数进行处理。
```javascript
function ChildReconciler(shouldTrackSideEffects) {
  ...
  function reconcileSingleElement(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    element: ReactElement,
    lanes: Lanes,
  ): Fiber {
    // 单节点diff
  }

  function reconcileChildrenArray(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChildren: Array<*>,
    lanes: Lanes,
  ): Fiber | null {
    // 多节点diff
  }

  ...

  function reconcileChildFibers(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChild: any,
    lanes: Lanes,
  ): Fiber | null {
    const isObject = typeof newChild === 'object' && newChild !== null;

    if (isObject) {
      // 处理单节点
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return placeSingleChild(
            reconcileSingleElement(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes,
            ),
          );
        case REACT_PORTAL_TYPE:
          ...
        case REACT_LAZY_TYPE:
          ...
      }
    }

    if (typeof newChild === 'string' || typeof newChild === 'number') {
      // 处理文本节点
    }

    if (isArray(newChild)) {
      // 处理多节点
      return reconcileChildrenArray(
        returnFiber,
        currentFirstChild,
        newChild,
        lanes,
      );
    }

    ...

  }

  return reconcileChildFibers;
}
```

# Diff的主体
关于Diff的参与者，在reconcileChildren函数的入参中可以看出
```javascript
workInProgress.child = reconcileChildFibers(
  workInProgress,
  current.child,
  nextChildren,
  renderLanes,
);
```

* workInProgress：作为父节点传入，新生成的第一个fiber的return会被指向它。
* **current.child**：旧fiber节点，diff生成新fiber节点时会用新生成的ReactElement和它作比较。
* **nextChildren**：新生成的ReactElement，会以它为标准生成新的fiber节点。
* renderLanes：本次的渲染优先级，最终会被挂载到新fiber的lanes属性上。

可以看出，diff的两个主体是：oldFiber（current.child）和newChildren（nextChildren，新的ReactElement），它们是两个不一样的数据结构。

比如现在有组件<Example/>，它计算完新的状态之后，要基于这两个东西去做diff,分别是**现有fiber树中（current树）<Example/>对应fiber的所有子fiber节点**和**<Example/>的render函数的执行结果，即那些ReactElements**。

<Example/>对应fiber的所有子fiber节点：oldFiber
```
    current树中

    <Example/> fiber
      |
      |
      A --sibling---> B --sibling---> C

```

<Example/>的render函数的执行结果，newChildren
```
  current fiber 对应的组件render的结果

    [
        {$$typeof: Symbol(react.element), type: "div", key: "A" },
        {$$typeof: Symbol(react.element), type: "div", key: "B" },
        {$$typeof: Symbol(react.element), type: "div", key: "B" },
    ]
```

# Diff的基本原则
对于新旧两种结构来说，场景有节点自身更新、节点增删、节点移动三种情况。面对复杂的情况，即使最前沿的算法，复杂度也极高。面对这种情况，React以如下策略应对：

* 即使两个元素的子树完全一样，但前后的父级元素不同，依照规则div元素及其子树会完全销毁，并重建一个p元素及其子树，不会尝试复用子树。
```html
旧
<div>
  <span>a</span>
  <span>b</span>
</div>

新
<p>
  <span>a</span>
  <span>b</span>
</p>
```
* 使用tag（标签名）和 key识别节点，区分出前后的节点是否变化，以达到尽量复用无变化的节点。
```html
旧
<p key="a">aa</p>
<h1 key="b">bb</h1>

新
<h1 key="b">bb</h1>
<p key="a">aa</p>
```
因为tag 和 key的存在，所以React可以知道这两个节点只是位置发生了变化。

# 场景
上面说到diff算法应对三种场景：`节点更新、节点增删、节点移动`，但一个fiber的子元素有可能是单节点，也有可能是多节点。所以依据这两类节点可以再细分为：
* 单节点更新、单节点增删。
* 多节点更新、多节点增删、多节点移动。

什么是节点的更新呢？对于DOM节点来说，在前后的节点类型（tag）和key都相同的情况下，节点的属性发生了变化，是节点更新。若前后的节点tag或者key不相同，Diff算法会认为新节点和旧节点毫无关系。

以下例子中，key为b的新节点的className发生了变化，是节点更新。

```
旧
<div className={'a'} key={'a'}>aa</div>
<div className={'b'} key={'b'}>bb</div>

新
<div className={'a'} key={'a'}>aa</div>
<div className={'bcd'} key={'b'}>bb</div>
```

以下例子中，新节点的className虽然有变化，但key也变化了，不属于节点更新
```
旧
<div className={'a'} key={'a'}>aa</div>
<div className={'b'} key={'b'}>bb</div>

新
<div className={'a'} key={'a'}>aa</div>
<div className={'bcd'} key={'bbb'}>bb</div>
```

以下例子中，新节点的className虽然有变化，但tag也变化了，不属于节点更新
```
旧
<div className={'a'} key={'a'}>aa</div>
<div className={'b'} key={'b'}>bb</div>

新
<div className={'a'} key={'a'}>aa</div>
<p className={'bcd'} key={'b'}>bb</p>
```

下面来分开叙述一下单节点和多节点它们各自的更新策略。

# 单节点
若组件产出的元素是如下的类型：
```html
<div key="a">aa</div>
```
那么它最终产出的ReactElement为下面这样（省略了一些与diff相关度不大的属性）
```
{
  $$typeof: Symbol(react.element),
  type: "div",
  key: "a"
  ...
}
```
单节点指newChildren为单一节点，但是oldFiber的数量不一定，所以实际有如下三种场景：
*为了降低理解成本，我们用简化的节点模型来说明问题，字母代表key。*

* 单个旧节点
```
旧： A

新： A

```
* 多个旧节点
```
旧： A - B - C

新： B
```
* 没有旧节点
```
旧： --

新： A
```

对于单节点的diff，其实就只有更新操作，不会涉及位移和位置的变化，单节点的更新会调用`reconcileSingleElement`函数处理。该函数中对以上三种场景都做了覆盖。但实际上面的情况对于React来说只是两种，oldFiber链是否为空。因此，在实现上也只处理了这两种情况。
## oldFiber链不为空
遍历它们，找到key相同的节点，然后删除剩下的oldFiber节点，再用匹配的oldFiber，newChildren中新节点的props来生成新的fiber节点。
```javascript
  function reconcileSingleElement(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    element: ReactElement,
    lanes: Lanes
  ): Fiber {
    const key = element.key;
    let child = currentFirstChild;
    while (child !== null) {
      if (child.key === key) {
        switch (child.tag) {
          case Fragment:
            ...
          case Block:
            ...
          default: {
            if (child.elementType === element.type) {
              // 先删除剩下的oldFiber节点
              deleteRemainingChildren(returnFiber, child.sibling);
              // 基于oldFiber节点和新节点的props新建新的fiber节点
              const existing = useFiber(child, element.props);
              existing.ref = coerceRef(returnFiber, child, element);
              existing.return = returnFiber;
              return existing;
            }
            break;
          }
        }

        deleteRemainingChildren(returnFiber, child);
        break;
      } else {
        // 没匹配到说明新的fiber节点无法从oldFiber节点新建
        // 删除掉所有oldFiber节点
        deleteChild(returnFiber, child);
      }
      child = child.sibling;
    }

    ...

  }
```
## oldFiber链为空
对于没有oldFiber节点的情况，只能新建newFiber节点。逻辑不复杂。
```javascript
  function reconcileSingleElement(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    element: ReactElement,
    lanes: Lanes
  ): Fiber {
    const key = element.key;
    let child = currentFirstChild;
    while (child !== null) {
      // oldFiber链非空的处理
      ...
    }
    if (element.type === REACT_FRAGMENT_TYPE) {
      // 处理Fragment类型的节点
      ...
    } else {
      // 用产生的ReactElement新建一个fiber节点
      const created = createFiberFromElement(element, returnFiber.mode, lanes);
      created.ref = coerceRef(returnFiber, currentFirstChild, element);
      created.return = returnFiber;
      return created;
    }

  }
```
单节点的更新就是这样的处理，真正比较复杂的情况是多节点的diff。因为它涉及到节点的增删和位移。
# 多节点
若组件最终产出的DOM元素是如下这样：
```html
<div key="a">aa</div>
<div key="b">bb</div>
<div key="c">cc</div>
<div key="d">dd</div>
```
那么最终的newChildren为下面这样（省略了一些与diff相关度不大的属性）
```javascript
[
    {$$typeof: Symbol(react.element), type: "div", key: "a" },
    {$$typeof: Symbol(react.element), type: "div", key: "b" },
    {$$typeof: Symbol(react.element), type: "div", key: "c" },
    {$$typeof: Symbol(react.element), type: "div", key: "d" }
]
```

多节点的变化有以下四种可能性。

* 节点更新
```
旧： A - B - C

新： `A - B - C`

```
* 新增节点
```
旧： A - B - C

新： A - B - C - `D - E`

```
* 删除节点
```
旧： A - B - C - `D - E`

新： A - B - C

```
* 节点移动
```
旧： A - B - C - D - E

新： A - B - `D - C - E`

```
多节点的情况一定是属于这四种情况的任意组合，这种情况会调用`reconcileChildrenArray`进行diff。按照以上四种情况，它会以newChildren为主体进行最多三轮遍历，但这三轮遍历并不是相互独立的，事实上只有第一轮是从头开始的，之后的每一轮都是上轮结束的断点继续。实际上在平时的实践中，节点自身的更新是最多的，所以Diff算法会优先处理更新的节点。因此四轮遍历又可以按照场景分为两部分：

第一轮是针对节点自身属性更新，剩下的两轮依次处理节点的新增、移动，而重点又在移动节点的处理上，所以本文会着重讲解节点更新和节点移动的处理，对删除和新增简单带过。

## 节点更新
第一轮从头开始遍历newChildren，会逐个与oldFiber链中的节点进行比较，判断节点的key或者tag是否有变化。

* 没变则从oldFiber节点clone一个props被更新的fiber节点，新的props来自newChildren中的新节点，这样就实现了节点更新。
* 有变化说明不满足复用条件，立即中断遍历进入下边的遍历。Diff算法的复杂度也因为这个操作大幅降低。

```javascript
let newIdx = 0;
for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
  ...

  // 更新节点，对于DOM节点来说，updateSlot内部会判断
  // key 和 tag。任意一个不同，则返回null
  const newFiber = updateSlot(
    returnFiber,
    oldFiber,
    newChildren[newIdx],
    lanes,
  );

  // newFiber为null则说明当前的节点不是更新的场景，中止这一轮循环
  if (newFiber === null) {
    if (oldFiber === null) {
      oldFiber = nextOldFiber;
    }
    break;
  }

  ...
}
```

我们来看一个例子，假设新旧的节点如下：

旧： A - B - `C - D` - E

新： A - B - `D - C`

在本轮遍历中，会遍历`A - B - D - C`。A和B都是key没变的节点，可以直接复用，但当遍历到D时，发现key变化了，跳出当前遍历。

例子中A 和 B是自身发生更新的节点，后面的D 和 C我们看到它的位置相对于oldFiber链发生了变化，会往下走到处理移动节点的循环中。

**关于移动节点的参照物**

为了方便说明，把保留在原位的节点称为固定节点。经过这次循环的处理，可以看出固定节点是A 和 B。在newChildren中，最靠右的固定节点的位置至关重要，对于后续的移动节点的处理来说，它的意义是提供参考位置。所以，每当处理到最后一个固定节点时，要记住此时它的位置，这个位置就是`lastPlacedIndex`。关键代码如下：

```
let newIdx = 0;
for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
   ...
   // 跳出逻辑
   ...
   // 如果不跳出，记录最新的固定节点的位置
   lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
   ...
}
```
`placeChild`方法实际上是移动节点的方法，但当节点无需移动的时候，会返回当前节点的位置，对于固定节点来说，因为无需移动，所以返回的就是固定节点的index。

## 节点删除
我们没有提到对删除节点的处理，实际上删除节点比较简单。

旧： A - B - C - `D - E`

新： A - B - C

因为遍历的是newChildren，当它遍历结束，但oldFiber链还没有遍历完，那么说明剩下的节点都要被删除。直接在oldFiber节点上标记Deletion的effectTag来实现删除。

```javascript
if (newIdx === newChildren.length) {

  // 新子节点遍历完，说明剩下的oldFiber都是没用的了，可以删除
  deleteRemainingChildren(returnFiber, oldFiber);

  return resultingFirstChild;
}
```
`deleteRemainingChildren`调用了`deleteChild`，值得注意的是，删除不仅仅是标记了effectTag为Deletion，还会将这个被删除的fiber节点添加到父级的effectList中。
```javascript
function deleteChild(returnFiber: Fiber, childToDelete: Fiber): void {
  ...
  const last = returnFiber.lastEffect;
  // 将要删除的child添加到父级fiber的effectList中，并添加上effectTag为删除
  if (last !== null) {
    last.nextEffect = childToDelete;
    returnFiber.lastEffect = childToDelete;
  } else {
    returnFiber.firstEffect = returnFiber.lastEffect = childToDelete;
  }
  childToDelete.nextEffect = null;
  childToDelete.effectTag = Deletion;
}
```

## 节点新增
新增节点的场景也很好理解，当oldFiber链遍历完，但newChildren还没遍历完，那么余下的节点都属于新插入的节点，会新建fiber节点并以sibling为指针连成fiber链。

旧： A - B - C

新： A - B - C - `D - E`

插入的逻辑（省略了相关度不高的代码）
```
if (oldFiber === null) {
  // 旧的遍历完了，意味着剩下的都是新增的了
  for (; newIdx < newChildren.length; newIdx++) {
    // 首先创建newFiber
    const newFiber = createChild(returnFiber, newChildren[newIdx], lanes);

    ...

    // 再将newFiber连接成以sibling为指针的单向链表
    if (previousNewFiber === null) {
      resultingFirstChild = newFiber;
    } else {
      previousNewFiber.sibling = newFiber;
    }
    previousNewFiber = newFiber;
  }

  return resultingFirstChild;
}
```

## 节点移动

节点的移动是如下场景：

旧 A - B - `C - D - E - F`

新 A - B - `D - C - E`

经过第一轮遍历的处理，固定节点为A B，最新的固定节点的位置（lastPlacedIndex）为1（B的位置）。此时oldFiber链中还剩C - D - E - F，newChildren中还剩D - C - E。

接下来的逻辑对于位置不一样的节点，它自己会先更新再移动。因为此时剩余的节点位置变了，更新又要复用oldFiber节点，所以为了在更新时方便查找，会将剩余的oldFiber节点
放入一个以key为键，值为oldFiber节点的map中。称为`existingChildren`。


由于newChildren 和 oldFiber节点都没遍历完，说明需要移动位置。此刻需要明确一点，就是**这些节点都在最新的固定节点的右边**。


移动的逻辑是：newChildren中剩余的节点，都是不确定要不要移动的，遍历它们，每一个都去看看这个节点在oldFiber链中的位置（旧位置），遍历到的节点有它在newChildren中的位置（新位置）：

如果旧位置在lastPlacedIndex的**右边**，说明这个节点位置不变。
原因是旧位置在lastPlacedIndex的**右边**，而新节点的位置也在它的**右边**，所以它的位置没变化。因为位置不变，所以它成了固定节点，把lastPlacedIndex更新成新位置。

如果旧位置在lastPlacedIndex的左边，当前这个节点的位置要往右挪。
原因是旧位置在lastPlacedIndex的**左边**，新位置却在lastPlacedIndex的**右边**，所以它要往右挪，但它不是固定节点。此时无需更新lastPlacedIndex。



我们来用上边的例子过一下这部分逻辑。

旧 A - B - `C - D - E - F`

新 A - B - `D - C - E`

位置固定部分 A - B，最右侧的固定节点为B，lastPlacedIndex为`1`。这时剩余oldFiber链为C - D - E - F，existingChildren为

```
{
    C: '节点C',
    D: '节点D',
    E: '节点E',
    F: '节点F'
}
```

newChildren的剩余部分D - C - E继续遍历。

首先遍历到D，D在oldFiber链中（A - B - C - D - E）的位置为3
3 > `1`，oldFiber中D的位置在B的右边，newChildren中也是如此，所以D的位置不动，此时最新的固定节点变成了`D`，更新lastPlacedIndex为`3`。

并从existingChildren中删除D，

```
{
    C: '节点C',
    E: '节点E',
    F: '节点F'
}
```

再遍历到C，C在oldFiber链中（A - B - C - D - E）的索引为2
2 < `3`，C原来在最新固定节点（`D`）的左边，newChildren中C在`D`的右边，所以要给它移动到右边。

并从existingChildren中删除C，

```
{
    E: '节点E',
    F: '节点F'
}
```

再遍历到E，E在oldFiber链中（A - B - C - D - E）的位置为4
4 > `3`，oldFiber链中E位置在`D`的位置的右边，新位置中也是如此，所以E的位置不动，此时最新的固定节点变成了`E`，更新lastPlacedIndex为`4`。

并从existingChildren中删除E，

```
{
    F: '节点F'
}
```

这个时候newChildren都处理完了，针对移动节点的遍历结束。

此时还剩一个F节点，是在oldFiber链中的，因为newChildren都处理完了，所以将它删除即可。

```
existingChildren.forEach(child => deleteChild(returnFiber, child));
```

可以看到，节点的移动是以最右侧的固定节点位置作为参照的。这些固定节点是指位置未发生变化的节点。每次对比节点是否需要移动之后，
及时更新固定节点非常重要。

## 源码
了解了上边的多节点diff原理后，将上边的关键点匹配到源码上更方便能进一步理解。下面放出带有详细注释的源码。
```javascript
  function reconcileChildrenArray(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChildren: Array<*>,
    lanes: Lanes,
  ): Fiber | null {
    /*
    * returnFiber：currentFirstChild的父级fiber节点
    * currentFirstChild：当前执行更新任务的WIP（fiber）节点
    * newChildren：组件的render方法渲染出的新的ReactElement节点
    * lanes：优先级相关
    * */

    // resultingFirstChild是diff之后的新fiber链表的第一个fiber。
    let resultingFirstChild: Fiber | null = null;
    // resultingFirstChild是新链表的第一个fiber。
    // previousNewFiber用来将后续的新fiber接到第一个fiber之后
    let previousNewFiber: Fiber | null = null;

    // oldFiber节点，新的child节点会和它进行比较
    let oldFiber = currentFirstChild;
    // 存储固定节点的位置
    let lastPlacedIndex = 0;
    // 存储遍历到的新节点的索引
    let newIdx = 0;
    // 记录目前遍历到的oldFiber的下一个节点
    let nextOldFiber = null;

    // 该轮遍历来处理节点更新，依据节点是否可复用来决定是否中断遍历
    for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
      // newChildren遍历完了，oldFiber链没有遍历完，此时需要中断遍历
      if (oldFiber.index > newIdx) {
        nextOldFiber = oldFiber;
        oldFiber = null;
      } else {
        // 用nextOldFiber存储当前遍历到的oldFiber的下一个节点
        nextOldFiber = oldFiber.sibling;
      }
      // 生成新的节点，判断key与tag是否相同就在updateSlot中
      // 对DOM类型的元素来说，key 和 tag都相同才会复用oldFiber
      // 并返回出去，否则返回null
      const newFiber = updateSlot(
        returnFiber,
        oldFiber,
        newChildren[newIdx],
        lanes,
      );

      // newFiber为 null说明 key 或 tag 不同，节点不
      // 可复用，中断遍历
      if (newFiber === null) {
        if (oldFiber === null) {
          // oldFiber 为null说明oldFiber此时也遍历完了
          // 是以下场景，D为新增节点
          // 旧 A - B - C
          // 新 A - B - C - D
          oldFiber = nextOldFiber;
        }
        break;
      }
      if (shouldTrackSideEffects) {
        // shouldTrackSideEffects 为true表示是更新过程
        if (oldFiber && newFiber.alternate === null) {
          // newFiber.alternate 等同于 oldFiber.alternate
          // oldFiber为WIP节点，它的alternate 就是 current节点

          // oldFiber存在，并且经过更新后的新fiber节点它还没有current节点,
          // 说明更新后展现在屏幕上不会有current节点，而更新后WIP
          // 节点会称为current节点，所以需要删除已有的WIP节点
          deleteChild(returnFiber, oldFiber);
        }
      }
      // 记录固定节点的位置
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      // 将新fiber连接成以sibling为指针的单向链表
      if (previousNewFiber === null) {
        resultingFirstChild = newFiber;
      } else {
        previousNewFiber.sibling = newFiber;
      }
      previousNewFiber = newFiber;

      // 将oldFiber节点指向下一个，与newChildren的遍历同步移动
      oldFiber = nextOldFiber;
    }

    // 处理节点删除。新子节点遍历完，说明剩下的oldFiber都是没用的了，可以删除.
    if (newIdx === newChildren.length) {
      // newChildren遍历结束，删除掉oldFiber链中的剩下的节点
      deleteRemainingChildren(returnFiber, oldFiber);
      return resultingFirstChild;
    }

    // 处理新增节点。旧的遍历完了，能复用的都复用了，所以意味着新的都是新插入的了
    if (oldFiber === null) {
      for (; newIdx < newChildren.length; newIdx++) {
        // 基于新生成的ReactElement创建新的Fiber节点
        const newFiber = createChild(returnFiber, newChildren[newIdx], lanes);
        if (newFiber === null) {
          continue;
        }
        // 记录固定节点的位置lastPlacedIndex
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        // 将新生成的fiber节点连接成以sibling为指针的单向链表
        if (previousNewFiber === null) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
      return resultingFirstChild;
    }
    // 执行到这是都没遍历完的情况，把剩余的旧子节点放入一个以key为键,值为oldFiber节点的map中
    // 这样在基于oldFiber节点新建新的fiber节点时，可以通过key快速地找出oldFiber
    const existingChildren = mapRemainingChildren(returnFiber, oldFiber);

    // 节点移动
    for (; newIdx < newChildren.length; newIdx++) {
      // 基于map中的oldFiber节点来创建新fiber
      const newFiber = updateFromMap(
        existingChildren,
        returnFiber,
        newIdx,
        newChildren[newIdx],
        lanes,
      );
      if (newFiber !== null) {
        if (shouldTrackSideEffects) {
          if (newFiber.alternate !== null) {
            // 因为newChildren中剩余的节点有可能和oldFiber节点一样,只是位置换了，
            // 但也有可能是是新增的.

            // 如果newFiber的alternate不为空，则说明newFiber不是新增的。
            // 也就说明着它是基于map中的oldFiber节点新建的,意味着oldFiber已经被使用了,所以需
            // 要从map中删去oldFiber
            existingChildren.delete(
              newFiber.key === null ? newIdx : newFiber.key,
            );
          }
        }

        // 移动节点，多节点diff的核心，这里真正会实现节点的移动
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        // 将新fiber连接成以sibling为指针的单向链表
        if (previousNewFiber === null) {
          resultingFirstChild = newFiber;
        } else {
          previousNewFiber.sibling = newFiber;
        }
        previousNewFiber = newFiber;
      }
    }

    if (shouldTrackSideEffects) {
      // 此时newChildren遍历完了，该移动的都移动了，那么删除剩下的oldFiber
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }
    return resultingFirstChild;
  }
```

# 总结
Diff算法通过key和tag来对节点进行取舍，可直接将复杂的比对拦截掉，然后降级成节点的移动和增删这样比较简单的操作。
对oldFiber和新的ReactElement节点的比对，将会生成新的fiber节点，同时标记上effectTag，这些fiber会被连到workInProgress树中，作为新的WIP节点。
树的结构因此被一点点地确定，而新的WIP节点也基本定型。

这意味着，在diff过后，workInProgress节点的beginWork节点就完成了。接下来会进入completeWork阶段。

欢迎扫码关注公众号，发现更多技术文章

![](https://neroht.com/qrcode-small.jpg)
