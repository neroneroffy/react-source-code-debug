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
此时会调用`reconcileChildrenArray`进行diff计算。这个过程总体会有四轮遍历，但这四轮遍历并不是相互独立的，事实上只有第一轮是从头开始的，之后的每一轮都是从之前结束的断点继续。
这四轮遍历又可以分为两部分：

第一轮是一部分，它以新节点为遍历主体，逐个与旧节点进行比较，判断节点是否可复用，一旦不满足复用条件，立即中断遍历进入下边的遍历。
剩下的三轮是另一部分，依次处理节点的删除、新增、移动。

## 复用节点并标记位置
判断复用的条件是新旧节点的key是否一样，key相同可以复用，不同则不可以复用。对于普通dom节点来说，若key一样，还会比较tag是否一样，key和tag都相同才可以复用。复用节点的同时，还会
标记最后一个可复用节点在那些旧节点中的索引，这个标记是移动节点的参照物（下方会讲到）。

为了降低理解成本，我们用简化的节点模型来说明问题。

旧节点： A - B - `C - D` - E

新节点： A - B - `D - C`










为了降低理解成本，我们用简化的节点模型来说明问题。

* 旧节点： A - B - C - D - E
* 

## 节点移动
移动的目标是newChildren的节点。

移动的参照物是newChildren里可以复用的节点中最靠右的那一个的位置索引（lastPlacedIndex）.这个索引是newChildren

中能确定的最新的无需移动的节点的位置。也就是说newChildren中未遍历的节点都在它的右边。

移动的逻辑是：newChildren中剩余的节点，都是不确定要不要移动的，遍历它们，每一个都去看看这个节点在旧fiber中的索引（上一次索引）。

如果上一次的索引在lastPlacedIndex的右边，说明newChildren中的节点位置没变，并更新lastPlacedIndex为上一次索引。
没变的原因是上次的索引在lastPlacedIndex的右边，本次这个节点在newChildren中的新索引依然在lastPlacedIndex的右边。

如果上一次的索引在lastPlacedIndex的左边，当前这个节点的位置要往右挪。
原因是上次的索引在lastPlacedIndex的左边，本次这个节点在newChildren中的新索引却跑到了在lastPlacedIndex的右边

旧 A - B - C - D - E

新 A - B - D - C - E

可复用部分 A - B，newChildren里可以复用的节点中最靠右的位置为1（lastPlacedIndex），该节点为B
旧fiber中的剩余部分C - D - E放入map
newChildren的剩余部分D - C - E继续遍历

首先遍历到D，从map中找到D在旧fiber中（A - B - C - D - E）的索引为3
3 > 1，原来D的位置在B的位置的右边，本次的newChildren中也是如此，所以D的位置不动，更新lastPlacedIndex为3，此时可复用节点变成了D

再遍历到C，从map中找到C在旧fiber中（A - B - C - D - E）的索引为2
2 < 3，C 原来在最新固定位置的左边，本次的newChildren中C在D的右边，所以要给它移动到右边
