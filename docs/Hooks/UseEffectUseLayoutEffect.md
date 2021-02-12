[点击](https://github.com/neroneroffy/react-source-code-debug)进入React源码调试仓库。

React在构建用户界面整体遵循函数式的编程理念，即固定的输入有固定的输出，尤其是在推出函数式组件之后，更加强化了组件纯函数的理念。但实际业务中编写的组件不免要产生请求数据、订阅事件、手动操作DOM这些副作用（effect），这样难免让函数组件变得不那么纯，于是React提供use(Layout)Effect的hook，给开发者提供专门管理副作用的方式。

下面我们会从effect的数据结构入手，梳理use(Layout)Effect在render和commit阶段的整体流程。

# Effect的数据结构
关于hook链表结构的基本概念我已经总结过一篇文章：[React hooks 的基础概念：hooks链表](https://github.com/neroneroffy/react-source-code-debug/blob/master/docs/Hooks/%E6%A6%82%E8%BF%B0.md) 。对函数组件来说，其fiber上的memorizedState专门用来存储hooks链表，每一个hook对应链表中的每一个元素。use(Layout)Effect产生的hook会放到fiber.memorizedState上，而它们调用后最终会生成一个effect对象，存储到它们对应hook的memoizedState中，与其他的effect连接成环形链表。

单个的effect对象包括以下几个属性：
* create: 传入use（Layout）Effect函数的第一个参数，即回调函数
* destroy: 回调函数return的函数，在该effect销毁的时候执行
* deps: 依赖项
* next: 指向下一个effect
* tag: effect的类型，区分是useEffect还是useLayoutEffect

单纯看effect对象中的字段，很容易和平时的用法联系起来。create函数即我们传入use(Layout)Effect的回调函数，而通过deps，可以控制create是否执行，如需清除effect，则在create函数中return一个新函数（即destroy）即可。

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

例如useEffect hook上的memoizedState存储了useEffect 的 effect对象（effect1），next指向useLayoutEffect的effect对象（effect2）。effect2的next又指回effect1.在下面的useLayoutEffect hook中，也是如此的结构。

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

现在，我们知道，调用use(Layout)Effect，最后会产生effect链表，这个链表保存在两个地方：
* fiber.memoizedState的hooks链表中，use(Layout)Effect对应hook元素的memoizedState中。
* fiber.updateQueue中，本次更新的updateQueue，它会在本次更新的commit阶段中被处理。

# 流程概述
基于上面的数据结构，对于use（Layout）Effect来说，React做的事情就是

* render阶段：函数组件开始渲染的时候，创建出对应的hook链表挂载到workInProgress的memoizedState上，并创建effect链表，但是基于上次和本次依赖项的比较结果，
创建的effect是有差异的。这一点暂且可以理解为：依赖项有变化，effect可以被处理，否则不会被处理。

* commit阶段：异步调度useEffect，layout阶段同步处理useLayoutEffect的effect。等到commit阶段完成，更新应用到页面上之后，开始处理useEffect产生的effect。

第二点提到了一个重点，就是useEffect和useLayoutEffect的执行时机不一样，前者被异步调度，当页面渲染完成后再去执行，不会阻塞页面渲染。
后者是在commit阶段新的DOM准备完成，但还未渲染到屏幕之前，同步执行。

# 实现细节
通过整体流程可以看出，effect的整个过程涉及到render阶段和commit阶段。render阶段只创建effect链表，commit阶段去处理这个链表。所有实现的细节都是在围绕effect链表。

## render阶段-创建effect链表
在实际的使用中，我们调用的use(Layout)Effect函数，在挂载和更新的过程是不同的。

挂载时，调用的是`mountEffectImpl`，它会为use(Layout)Effect这类hook创建一个hook对象，将workInProgressHook指向它，然后在这个fiber节点的flag中加入副作用相关的effectTag。最后，会构建effect链表挂载到fiber的updateQueue，并且也会在hook上的memorizedState挂载effect。
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


更新时，调用`updateEffectImpl`，完成effect链表的构建。这个过程中会根据前后依赖项是否变化，从而创建不同的effect对象。具体体现在effect的tag上，如果前后依赖未变，则effect的tag就赋值为传入的hookFlags，否则，在tag中加入HookHasEffect标志位。正是因为这样，在处理effect链表时才可以只处理依赖变化的effect，use(Layout)Effect可以根据它的依赖变化情况来决定是否执行回调。
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
> 在组件挂载和更新时，有一个区别，就是挂载期间调用pushEffect创建effect对象的时候并没有传destroy函数，而更新期间传了，这是因为每次effect执行时，都是先执行前一次的销毁函数，再执行新effect的创建函数。而挂载期间，上一次的effect并不存在，执行创建函数前也就无需先销毁。

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

  // 从workInProgress节点上获取到updateQueue，为构建链表做准备
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

以上，就是effect链表的构建过程。我们可以看到，effect对象创建出来最终会以两种形式放到两个地方：单个的effect，放到hook.memorizedState上；环状的effect链表，放到fiber节点的updateQueue中。两者各有用途，前者的effect会作为上次更新的effect，为本次创建effect对象提供参照（对比依赖项数组），后者的effect链表会作为最终被执行的主体，带到commit阶段处理。

## commit阶段-effect如何被处理
useEffect和useLayoutEffect，对它们的处理最终都落在处理fiber.updateQueue上，对前者来说，循环updateQueue时只处理包含useEffect这类tag的effect，对后者来说，只处理包含useLayoutEffect这类tag的effect，它们的处理过程都是先执行前一次更新时effect的销毁函数（destroy），再执行新effect的创建函数（create）。

以上是它们的处理过程在微观上的共性，宏观上的区别主要体现在执行时机上。useEffect是在beforeMutation或layout阶段异步调度，然后在本次的更新应用到屏幕上之后再执行，而useLayoutEffect是在layout阶段同步执行的。下面先分析useEffect的处理过程。


### useEffect的异步调度
> 与 componentDidMount、componentDidUpdate 不同的是，在浏览器完成布局与绘制之后，传给 useEffect 的函数会延迟调用。
这使得它适用于许多常见的副作用场景，比如设置订阅和事件处理等情况，因此不应在函数中执行阻塞浏览器更新屏幕的操作。

基于useEffect回调**延迟调用（实际上就是异步调用）** 的需求，在实现上利用scheduler的异步调度函数：`scheduleCallback`，将执行useEffect的动作作为一个任务去调度，这个任务会异步调用。

commit阶段和useEffect真正扯上关系的有三个地方：commit阶段的开始、beforeMutation、layout，涉及到异步调度的是后面两个。
```javascript

function commitRootImpl(root, renderPriorityLevel) {
  // 进入commit阶段，先执行一次之前未执行的useEffect
  do {
    flushPassiveEffects();
  } while (rootWithPendingPassiveEffects !== null);

  ...

  do {
    try {
      // beforeMutation阶段的处理函数：commitBeforeMutationEffects内部，
      // 异步调度useEffect
      commitBeforeMutationEffects();
    } catch (error) {
      ...
    }
  } while (nextEffect !== null);

  ...

  const rootDidHavePassiveEffects = rootDoesHavePassiveEffects;

  if (rootDoesHavePassiveEffects) {
    // 重点，记录有副作用的effect
    rootWithPendingPassiveEffects = root;
  }
}
```
这三个地方去执行或者调度useEffect有什么用意呢？我们分别来看。
* commit开始，先执行一下useEffect：这和useEffect异步调度的特点有关，它以一般的优先级被调度，这就意味着一旦有更高优先级的任务进入到commit阶段，上一次任务的useEffect还没得到执行。所以在本次更新开始前，需要先将之前的useEffect都执行掉，以保证本次调度的useEffect都是本次更新产生的。

* beforeMutation阶段异步调度useEffect：这个是实打实地针对effectList上有副作用的节点，去异步调度useEffect。
```javascript
function commitBeforeMutationEffects() {
  while (nextEffect !== null) {

    ...

    if ((flags & Passive) !== NoFlags) {
      // 如果fiber节点上的flags存在Passive调度useEffect
      if (!rootDoesHavePassiveEffects) {
        rootDoesHavePassiveEffects = true;
        scheduleCallback(NormalSchedulerPriority, () => {
          flushPassiveEffects();
          return null;
        });
      }
    }
    nextEffect = nextEffect.nextEffect;
  }
}
```
因为`rootDoesHavePassiveEffects`的限制，只会发起一次useEffect调度，相当于用一把锁锁住调度状态，避免发起多次调度。
* layout阶段填充effect执行数组：真正useEffect执行的时候，实际上是先执行上一次effect的销毁，再执行本次effect的创建。React用两个数组来分别存储销毁函数和
创建函数，这两个数组的填充就是在layout阶段，到时候循环释放执行两个数组中的函数即可。

```javascript
function commitLifeCycles(
  finishedRoot: FiberRoot,
  current: Fiber | null,
  finishedWork: Fiber,
  committedLanes: Lanes,
): void {
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent:
    case Block: {

      ...

      // layout阶段填充effect执行数组
      schedulePassiveEffects(finishedWork);
      return;
    }
}
```
在调用`schedulePassiveEffects`填充effect执行数组时，有一个重要的地方就是只在包含HasEffect的effectTag的时候，才将effect放到数组内，这一点保证了依赖项有变化再去处理effect。也就是：**如果前后依赖未变，则effect的tag就赋值为传入的hookFlags，否则，在tag中加入HookHasEffect标志位。正是因为这样，在处理effect链表时才可以只处理依赖变化的effect，use(Layout)Effect才可以根据它的依赖变化情况来决定是否执行回调。**

schedulePassiveEffects的实现：
```javascript
function schedulePassiveEffects(finishedWork: Fiber) {
  // 获取到函数组件的updateQueue
  const updateQueue: FunctionComponentUpdateQueue | null = (finishedWork.updateQueue: any);
  // 获取effect链表
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;
    // 循环effect链表
    do {
      const {next, tag} = effect;
      if (
        (tag & HookPassive) !== NoHookEffect &&
        (tag & HookHasEffect) !== NoHookEffect
      ) {
        // 当effect的tag含有HookPassive和HookHasEffect时，向数组中push effect
        enqueuePendingPassiveHookEffectUnmount(finishedWork, effect);
        enqueuePendingPassiveHookEffectMount(finishedWork, effect);
      }
      effect = next;
    } while (effect !== firstEffect);
  }
}
```
在调用`enqueuePendingPassiveHookEffectUnmount`和`enqueuePendingPassiveHookEffectMount`填充数组的时候，还会再异步调度一次useEffect，但这与beforeMutation的调度是互斥的，一旦之前调度过，就不会再调度了，同样是`rootDoesHavePassiveEffects`起的作用。

### 执行effect
此时我们已经知道，effect得以被处理是因为之前的调度以及effect数组的填充。现在到了最后的步骤，执行effect的destroy和create。过程就是先循环待销毁的effect数组，再循环待创建的effect数组，这一过程发生在`flushPassiveEffectsImpl`函数中。循环的时候每个两项去effect是由于奇数项存储的是当前的fiber。
```javascript
function flushPassiveEffectsImpl() {
  // 先校验，如果root上没有 Passive efectTag的节点，则直接return
  if (rootWithPendingPassiveEffects === null) {
    return false;
  }

  ...

  // 执行effect的销毁
  const unmountEffects = pendingPassiveHookEffectsUnmount;
  pendingPassiveHookEffectsUnmount = [];
  for (let i = 0; i < unmountEffects.length; i += 2) {
    const effect = ((unmountEffects[i]: any): HookEffect);
    const fiber = ((unmountEffects[i + 1]: any): Fiber);
    const destroy = effect.destroy;
    effect.destroy = undefined;

    if (typeof destroy === 'function') {
      try {
        destroy();
      } catch (error) {
        captureCommitPhaseError(fiber, error);
      }
    }
  }

  // 再执行effect的创建
  const mountEffects = pendingPassiveHookEffectsMount;
  pendingPassiveHookEffectsMount = [];
  for (let i = 0; i < mountEffects.length; i += 2) {
    const effect = ((mountEffects[i]: any): HookEffect);
    const fiber = ((mountEffects[i + 1]: any): Fiber);
    try {
      const create = effect.create;
      effect.destroy = create();
    } catch (error) {

      captureCommitPhaseError(fiber, error);
    }
  }

  ...

  return true;
}
```

### useLayoutEffect的同步执行
useLayoutEffect在执行的时候，也是先销毁，再创建。和useEffect不同的是这两者都是同步执行的，前者在mutation阶段执行，后者在layout阶段执行。
与useEffect不同的是，它不用数组去存储销毁和创建函数，而是直接操作fiber.updateQueue。

卸载上一次的effect，发生在mutation阶段
```javascript

// 调用卸载layout effect的函数，传入layout有关的effectTag和说明effect有变化的effectTag：HookLayout | HookHasEffect
commitHookEffectListUnmount(HookLayout | HookHasEffect, finishedWork);

function commitHookEffectListUnmount(tag: number, finishedWork: Fiber) {
  // 获取updateQueue
  const updateQueue: FunctionComponentUpdateQueue | null = (finishedWork.updateQueue: any);
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;

  // 循环updateQueue上的effect链表
  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;
    do {
      if ((effect.tag & tag) === tag) {
        // 执行销毁
        const destroy = effect.destroy;
        effect.destroy = undefined;
        if (destroy !== undefined) {
          destroy();
        }
      }
      effect = effect.next;
    } while (effect !== firstEffect);
  }
}
```

执行本次的effect创建，发生在layout阶段
```javascript
// 调用创建layout effect的函数
commitHookEffectListMount(HookLayout | HookHasEffect, finishedWork);

function commitHookEffectListMount(tag: number, finishedWork: Fiber) {
  const updateQueue: FunctionComponentUpdateQueue | null = (finishedWork.updateQueue: any);
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;
    do {
      if ((effect.tag & tag) === tag) {
        // 创建
        const create = effect.create;
        effect.destroy = create();
      }
      effect = effect.next;
    } while (effect !== firstEffect);
  }
}
```

# 总结
useEffect和useLayoutEffect作为组件的副作用，本质上是一样的。共用一套结构来存储effect链表。整体流程上都是先在render阶段，生成effect，并将它们拼接成链表，存到fiber.updateQueue上，最终带到commit阶段被处理。他们彼此的区别只是最终的执行时机不同，一个异步一个同步，这使得useEffect不会阻塞渲染，而useLayoutEffect会阻塞渲染。

欢迎扫码关注公众号，发现更多技术文章

![](https://neroht.com/qrcode-small.jpg)

