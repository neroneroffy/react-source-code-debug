# 概述
我们知道，每次组件渲染后，会产生新的ReactElement，另外组件也有对应的fiber节点。Diff算法就是通过对比新产生的ReactElement和
已有的fiber节点的child节点，来生成新的child。最终将其挂载到组件对应的fiber上。

# Diff的主体

# 基本原则
对于新旧两种结构来说，场景有节点自身更新、节点增删、节点移动三种情况。面对复杂的情况，即使最前沿的算法，复杂度也极高。面对这种情况，
React以如下策略应对：
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
* 使用key识别节点，区分出前后的节点是否变化，以达到尽量复用无变化的节点。
```html
旧
<p key="a">aa</p>
<h1 key="b">bb</h1>

新
<h1 key="b">bb</h1>
<p key="a">aa</p>
```
因为key的存在，所以React可以知道这两个节点只是位置发生了变化。

# 场景
上面说到diff算法面对三种场景：`节点更新、节点增删、节点移动`，但一个fiber的子元素有可能是单节点，也有可能是多节点。
所以依据这两类节点可以再细分为：
* 单节点更新、单节点增删。
* 多节点更新、多节点增删、多节点移动。

什么是节点的更新呢？对于DOM节点来说，在前后的节点类型（tag）和key都相同的情况下，节点的属性发生了变化，是节点更新。
若前后的节点类型或者key不相同，Diff算法会认为发生变化的新节点和旧节点毫无关系。

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

下面来分开叙述一下单节点和多节点它们各自的更新策略。因为DOM节点最为普遍，所以本文的讲解以DOM节点的diff为主。

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

# 多节点
若组件产出的元素是如下的类型：
```html
<div key="a">aa</div>
<div key="b">bb</div>
<div key="c">cc</div>
<div key="d">dd</div>
```
那么它最终产出的新节点为下面这样（省略了一些与diff相关度不大的属性）
```javascript
[
    {$$typeof: Symbol(react.element), type: "div", key: "a" },
    {$$typeof: Symbol(react.element), type: "div", key: "b" },
    {$$typeof: Symbol(react.element), type: "div", key: "c" },
    {$$typeof: Symbol(react.element), type: "div", key: "d" }
]
```

多节点的变化有以下四种可能性。为了降低理解成本，我们用简化的节点模型来说明问题，字母代表key。

* 无新增节点，但节点有更新

旧： A - B - C

新： `A - B - C`

* 新增节点

旧： A - B - C

新： A - B - C - `D - E`

* 删除节点

旧： A - B - C - `D - E`

新： A - B - C

* 节点移动

旧： A - B - C - D - E

新： A - B - `D - C - E`

多节点的情况一定是属于这四种情况的任意组合，会调用`reconcileChildrenArray`进行diff计算。这个过程按照以上四种情况，会以新节点为主体进行最多三轮遍历，
但这三轮遍历并不是相互独立的，事实上只有第一轮是从头开始的，之后的每一轮都是上轮结束的断点继续。实际上在平时的实践中，节点自身的更新是最多的，所以Diff算法会优先处理更新的节点。因此四轮遍历又可以按照场
景分为两部分：

第一轮是针对节点自身属性更新，剩下的两轮依次处理节点的新增、移动，而重点又在移动节点的处理上，所以本文会着重讲解节点更新和节点移动的处理，对删除和新增简单带过。

## 节点更新
第一轮从头开始遍历新节点，会逐个与旧节点进行比较，判断节点的key或者tag是否有变化。

* 没变则从旧节点clone一个props被更新的fiber节点，新的props来自新节点，这样就实现了节点更新。
* 有变化说明不满足复用条件，立即中断遍历进入下边的遍历。Diff算法的复杂度也因为这个操作大幅降低。

```
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

我们来看一个例子，假设新旧节点如下：

旧： A - B - `C - D` - E

新： A - B - `D - C`

在本轮遍历中，会遍历`A - B - D - C`。A和B都是key没变的节点，可以直接复用，但当遍历到D时，发现key变化了，跳出当前遍历。

例子中A 和 B是发生自身更新的节点，之后的D 和 C会我们看到它的位置相对于旧节点发生了变化，会往下走到处理移动节点的循环中。

**关于移动节点的参照物**

为了方便说明，把保留在原位的节点称为固定节点。经过这次循环的处理，可以看出固定节点是A 和 B。在新节点中，最靠右的固定节点的
位置至关重要，对于后续的移动节点的处理来说，它的意义是提供参考位置。所以，每当处理到最后一个固定节点时，要记住此时它的位置，
这个位置就是`lastPlacedIndex`。关键代码如下：

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

因为遍历的是新节点，当它遍历结束，但旧节点还没有遍历完，那么说明剩下的节点都要被删除。直接在旧节点上标记Deletion的effectTag来实现删除。

```
if (newIdx === newChildren.length) {

  新子节点遍历完，说明剩下的旧fiber都是没用的了，可以删除
  deleteRemainingChildren(returnFiber, oldFiber);

  return resultingFirstChild;
}
```

## 节点新增
新增节点的场景也很好理解，当旧节点遍历完，但新节点还没遍历完，那么余下的新节点都属于新插入的节点，会新建fiber节点并以sibling为指针连成fiber链。

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

经过第一轮遍历的处理，固定节点为A B，最新的固定节点的位置（lastPlacedIndex）为1（B的位置）。此时旧节点中还剩C - D - E - F，新节点中还剩D - C - E。

接下来的逻辑是先更新再移动。因为此时剩余的新旧节点位置不一样，为了在更新时方便查找旧节点，会将剩余的旧节点放入一个以key为键，值为旧节点的map中。称为
`existingChildren`。


由于新旧节点都没遍历完，说明需要移动位置。此刻需要明确一点，就是**这些节点都在最新的固定节点的右边**。


移动的逻辑是：新节点中剩余的节点，都是不确定要不要移动的，遍历它们，每一个都去看看这个节点在旧节点中的位置（旧位置），遍历到的新节点有它在本次中的位（新位置）置：

如果旧位置在lastPlacedIndex的**右边**，说明这个节点位置不变。
原因是旧位置在lastPlacedIndex的**右边**，而新节点此时的位置也在它的**右边**，所以它的位置没变化。因为位置不变，所以它成了固定节点，把lastPlacedIndex更新成新位置。

如果旧位置在lastPlacedIndex的左边，当前这个节点的位置要往右挪。
原因是旧位置在lastPlacedIndex的**左边**，新位置却在lastPlacedIndex的**右边**，所以它要往右挪，但它不是固定节点。此时无需更新lastPlacedIndex。



我们来用上边的例子过一下这部分逻辑。

旧 A - B - `C - D - E - F`

新 A - B - `D - C - E`

位置固定部分 A - B，最右侧的固定节点为B，lastPlacedIndex为`1`。这时剩余旧节点为C - D - E - F，existingChildren为

```
{
    C: '节点C',
    D: '节点D',
    E: '节点E',
    F: '节点F'
}
```

newChildren的剩余部分D - C - E继续遍历。

首先遍历到D，D在旧节点中（A - B - C - D - E）的位置为3
3 > `1`，旧节点中D的位置在B的右边，新节点中也是如此，所以D的位置不动，此时最新的固定节点变成了`D`，更新lastPlacedIndex为`3`。

并从existingChildren中删除D，

```
{
    C: '节点C',
    E: '节点E',
    F: '节点F'
}
```

再遍历到C，C在旧节点中（A - B - C - D - E）的索引为2
2 < `3`，C原来在最新固定节点（`D`）的左边，新节点中C在`D`的右边，所以要给它移动到右边。

并从existingChildren中删除C，

```
{
    E: '节点E',
    F: '节点F'
}
```

再遍历到E，E旧节点中（A - B - C - D - E）的位置为4
4 > `3`，旧节点中E位置在`D`的位置的右边，新位置中也是如此，所以E的位置不动，此时最新的固定节点变成了`E`，更新lastPlacedIndex为`4`。

并从existingChildren中删除E，

```
{
    F: '节点F'
}
```

这个时候新节点都处理完了，针对移动节点的遍历结束。

此时还剩一个F节点，是在旧节点中的，因为新节点都处理完了，所以将它删除即可。

```
existingChildren.forEach(child => deleteChild(returnFiber, child));
```
