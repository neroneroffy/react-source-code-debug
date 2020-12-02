

React在构建用户界面整体遵循函数式的编程理念，即固定的输入有固定的输出，尤其是在推出函数式组件之后，更加强化了组件纯函数的理念。
但实际业务中编写的组件不免要产生请求数据、订阅事件、手动操作DOM这些副作用（effect），这样难免让函数组件变得不那么纯，于是React
提供use(Layout)Effect的hook，给开发者提供专门管理副作用的地方。

下面我们会从effect的数据结构入手，梳理use(Layout)Effect在render和commit阶段的整体流程。

# 数据结构
对函数组件来说，其fiber上的memorizedState专门用来存储hooks链表，每一个hook对应链表中的每一个元素。
use(Layout)Effect作为一类hook，它们的结构与useState的基本相同，不同的是它们调用后会生成一个effect对象，存储到该hook的memoizedState中，并连接成环形链表。

单个的effect对象包括以下几个属性：
* create: 传入use（Layout）Effect函数的第一个参数，即回调函数
* destroy: 回调函数return的函数，在组件卸载的时候执行
* deps: 依赖项
* next: 指向下一个effect
* tag: effect的类型，区分是useEffect还是useLayoutEffect

单纯看effect对象中的字段，很容易和平时的用法联系起来。create函数即我们传入use(Layout)Effect的回调函数，
而通过deps，可以控制create是否执行，如需清除effect，则在create函数中return一个新函数（即destroy）即可。

为了理解effect的数据结构，假设有如下组件：
```javascript
const UseEffectExp = () => {
  const [ text, setText ] = useState('hello')
    useEffect(() => {
        console.log('effect1')
        return () => {
            console.log('destory1');
        }
    })
    useLayoutEffect(() => {
        console.log('effect2')
        return () => {
            console.log('destory2');
        }
    })
    return <div>effect</div>
}
```
挂载到它fiber上memoizedState的hooks链表结构如下

![hooks链表结构](http://neroht.com/hooksLinkedList.png)

例如useEffect hook上的memoizedState存储了useEffect 的 effect对象（effect1），next指向useLayoutEffect的effect对象（effect2）。effect2的next又指回effect1.
在下面的useLayoutEffect hook中，也是如此的结构。

```
fiber.memoizedState ---> useState hook
                             |
                             |
                            next
                             |
                             ↓
                        useEffect hook
                        memoizedState: useEffect的effect对象 ---> useLayoutEffect的effect对象
                             |              ↑__________________________________|
                             |
                            next
                             |
                             ↓
                        useLayoutffect hook
                        memoizedState: useLayoutEffect的effect对象 ---> useEffect的effect对象
                                            ↑___________________________________|

```

effect除了保存在fiber.memoizedState对应的hook中，还会保存在fiber的updateQueue中。
```
fiber.updateQueue ---> useLayoutEffect ----next----> useEffect
                             ↑                          |
                             |__________________________|
```

现在，我们知道，调用use(Layout)Effect，会产生effect链表，它会保存在两个地方：
* fiber.memoizedState的hooks链表的hook元素的memoizedState中，以本次更新为基准，这些effects会作为上次的effect
* fiber.updateQueue中，本次更新的updateQueue，它会在本次更新的commit阶段中被处理。

# 流程概述
基于上面的数据结构，对于use（Layout）Effect来说，React做的事情就是

* render阶段：函数组件开始渲染的时候，创建出对应的hook链表挂载到workInProgress的memoizedState上，并创建effect链表，但基于上次和本次依赖项的比较结果，
创建的effect是有差异的，可以理解为：依赖项有变化，effect可以被处理，否则不会被处理。

* commit阶段：异步调度useEffect，layout阶段同步处理useLayoutEffect的effect。等到commit阶段完成，更新应用到页面上之后，
开始处理useEffect产生的effect。

这里的重点是useEffect和useLayoutEffect的执行时机不一样，前者被异步调度，当页面渲染完成后再去执行，不会阻塞页面渲染。
后者是commit阶段新的DOM准备完成，但还未应用到屏幕之前，同步执行。

# 实现细节
通过整体流程可以看出，effect的整个过程涉及到render阶段和commit阶段。render阶段只创建effect链表，commit阶段去处理这个链表。整个实现细节是在effect链表
这个基础上展开的。

## render阶段-创建effect链表
在实际的使用中，我们调用的use(Layout)Effect函数，在挂载和更新的过程是不同的。

挂载时，调用的是`mountEffectImpl`，它会为use(Layout)Effect这类hook创建一个hook对象，将workInProgressHook指向它，
然后在这个fiber节点的flag中加入副作用相关的effectTag。最后，会构建effect链表挂载到fiber的updateQueue，并且也会在hook上的memoizedState挂载effect。
```javascript
function mountEffectImpl(fiberFlags, hookFlags, create, deps): void {
  // 创建hook对象
  const hook = mountWorkInProgressHook();
  // 获取依赖
  const nextDeps = deps === undefined ? null : deps;

  // 为fiber打上副作用的effectTag
  currentlyRenderingFiber.flags |= fiberFlags;

  // 创建effect链表，挂载到hook的memoizedState上和fiber的updateQueue
  hook.memoizedState = pushEffect(
    HookHasEffect | hookFlags,
    create,
    undefined,
    nextDeps,
  );
}
```
> currentlyRenderingFiber 即 workInProgress节点


更新时，调用`updateEffectImpl`，完成effect链表的构建。这个过程中会根据前后依赖项是否变化，从而创建不同的effect对象。具体体现在effect的tag上，如果
前后依赖未变，则effect的tag就赋值为传入的hookFlags，否则，在tag中加入HookHasEffect标志位。正是因为这样，在处理effect链表时才可以只处理依赖变化的effect，
use(Layout)Effect可以根据它的依赖变化情况来决定是否执行回调。
```javascript
function updateEffectImpl(fiberFlags, hookFlags, create, deps): void {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  let destroy = undefined;

  if (currentHook !== null) {
    // 从currentHook中获取上一次的effect
    const prevEffect = currentHook.memoizedState;
    // 获取上一次effect的destory函数，也就是useEffect回调中return的函数
    destroy = prevEffect.destroy;
    if (nextDeps !== null) {
      const prevDeps = prevEffect.deps;
      // 比较前后依赖，push一个不带HookHasEffect的effect
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        pushEffect(hookFlags, create, destroy, nextDeps);
        return;
      }
    }
  }

  currentlyRenderingFiber.flags |= fiberFlags;
  // 如果前后依赖有变，在effect的tag中加入HookHasEffect
  // 并将新的effect更新到hook.memoizedState上
  hook.memoizedState = pushEffect(
    HookHasEffect | hookFlags,
    create,
    destroy,
    nextDeps,
  );
}
```
> 在组件挂载和更新时，有一个区别，就是挂载期间调用pushEffect创建effect对象的时候并没有传destroy函数，而更新期间传了，这是因为每次effect执行时，都是先执行前一次的销毁函数，
  再执行新effect的创建函数。而挂载期间，上一次的effect并不存在，执行创建函数前也就无需先销毁。

挂载和更新，都调用了pushEffect，它的职责很单纯，就是创建effect对象，构建effect链表，挂到WIP节点的updateQueue上。

```javascript
function pushEffect(tag, create, destroy, deps) {
  // 创建effect对象
  const effect: Effect = {
    tag,
    create,
    destroy,
    deps,
    // Circular
    next: (null: any),
  };

  // 从WIP节点上获取到updateQueue，为构建链表做准备
  let componentUpdateQueue: null | FunctionComponentUpdateQueue = (currentlyRenderingFiber.updateQueue: any);
  if (componentUpdateQueue === null) {
    // 如果updateQueue为空，把effect放到链表中，和它自己形成闭环
    componentUpdateQueue = createFunctionComponentUpdateQueue();
    // 将updateQueue赋值给WIP节点的updateQueue，实现effect链表的挂载
    currentlyRenderingFiber.updateQueue = (componentUpdateQueue: any);
    componentUpdateQueue.lastEffect = effect.next = effect;
  } else {
    // updateQueue不为空，将effect接到链表的后边
    const lastEffect = componentUpdateQueue.lastEffect;
    if (lastEffect === null) {
      componentUpdateQueue.lastEffect = effect.next = effect;
    } else {
      const firstEffect = lastEffect.next;
      lastEffect.next = effect;
      effect.next = firstEffect;
      componentUpdateQueue.lastEffect = effect;
    }
  }
  return effect;
}
```
> 函数组件和类组件的updateQueue都是环状链表

以上，就是effect链表的构建过程。可以认识到，effect对象创建出来最终会以两种形式放到两个地方：单个的effect，放到hook.memorizedState上；
环状的effect链表，放到fiber节点的updateQueue中。两个行为各有用途，前者的effect会作为上次更新的effect，为本次创建effect对象提供参照（对比依赖项数组），后者的effect链表
会作为最终被执行的主体，带到commit阶段处理。

## commit阶段-effect如何被处理
标记root上有副作用是在commit阶段，且只会在异步调度useEffect的时候会被清除，commit完成，真正的useEffect执行之前，有可能再次有一个更新，进入更新流程。
所以每次commit之前都要将之前遗留的useEffect刷新干净，以保证本地调度的useEffect都是本次更新产生的


### 记录有副作用的root

### 调度useEffect

### 同步执行useLayoutEffect

### useEffect执行






# effect hooks结构的创建时机
稍加思考就可以想到，函数组件本质上是一个函数，那么自然是函数执行的时候去创建effect hooks。
通过前面的文章我们知道，在fiber节点的beginWork阶段会根据组件的类型进行实例化，函数组件的这个过程发生在`renderWithHooks`函数中。

# effect hooks结构的执行时机

useEffect和useLayoutEffect都是在commit阶段进行处理的，不同的是useEffect采取commit阶段异步调度，在DOM的变化渲染到页面之后再执行。
> 使用 useEffect 完成副作用操作。赋值给 useEffect 的函数会在组件渲染到屏幕之后执行。

而useLayoutEffect是在React完成DOM操作，渲染出来之前这一段时间内同步执行，它会阻塞渲染。
> 它会在所有的 DOM 变更之后同步调用 effect。可以使用它来读取 DOM 布局并同步触发重渲染。在浏览器执行绘制之前，useLayoutEffect 内部的更新计划将被同步刷新。

* useEffect：
before mutation阶段和layout阶段异步调度flushPassiveEffects
layout阶段一旦识别到root含有effect，则将root赋值给rootWithPendingPassiveEffects
layout阶段之后，flushPassiveEffects从rootWithPendingPassiveEffects中找出有useEffect的fiber，循环updateQueue执行掉

