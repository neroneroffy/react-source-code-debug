## fiber.updateQueue
fiber节点更新生成的中间产物或衍生品的载体。最常用的组件分为三类：类组件、函数组件、原生DOM组件，对这三类组件来说，它们产生的更新往往会带来一些中间产物或衍生品，
而updateQueue正是这些产物的载体，存储下来以备将来使用。举例来说：

* 类组件（<ClassComponent />）: setState产生的更新（update）会以链表的形式存储在updateQueue中，所以fiber节点在render阶段的beginWork中，能利用这个update链表计算出类组件的新状态
* 函数组件（<FunctionComponent />）：函数组件每次更新，都会诱发useEffect或者useLayoutEffect的执行（即使依赖项传了空数组，useEffect或者useLayoutEffect也会触发，
只不过内部会根据依赖项的比较结果去决定是否执行回调），我们可以理解为，函数组件每次更新，都会产生副作用（effect），交由use（Layout）Effect处理，所以这些副作用就作为更新的衍生品存储到updateQueue中，
形式是单向环状链表。在fiber树进入commit阶段后，会被处理。
* 原生DOM组件（HostComponent 如 <div><div/>）：以上两个类型的fiber的更新最终要落实到原生DOM组件的更新上，而它的更新如何体现呢？自然是通过DOM节点的变化。所以原生DOM组件fiber节点上
的updateQueue存储的是变化的DOM。值得注意的是，**它的updateQueue存储的是它子节点的DOM树，并不存储它自身的DOM变化**。这些DOM树会在commit阶段被真正地应用到页面上。