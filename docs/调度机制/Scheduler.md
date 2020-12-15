Scheduler作为一个独立的包，可以独自承担起任务调度的职责，你只需要将任务和任务的优先级交给它，它就可以帮你安排任务的执行，这就是React和Scheduler配合的模式。

React任务的本质是各种函数调用，比如fiber树的构建、commit阶段、useEffect的调用，函数的调用需要占用线程，若执行任务的时候正好有用户交互进来，那么基于js单线程的特点，用户的交互就要等待任务完成才能被响应。从用户的角度
来看，这显然是不合理的。

# 基本概念
Scheduler的出现就是为了在一定程度上解决上面的问题。它引入两个概念：调度任务优先级 & 时间片。优先级让任务按照自身的紧急程度按序执行，保证及时响应高优先级任务；
时间片规定的是一个任务在这一帧内最大的执行时间，保证页面不会因为任务执行时间过长而产生卡顿。

# 原理概述
基于这两个概念，Scheduler围绕着它的核心目标 - 任务调度，衍生出了两大核心功能：任务队列管理 和 判断任务完成状态。

## 任务队列管理
在Scheduler内部，把任务分成了两种：未过期的和已过期的，分别用两个队列存储，前者存到timerQueue中，后者存到taskQueue中。
当一个任务进来的时候，会根据它的优先级（即调度任务优先级）计算过期时间，再决定放到哪个队列中。

如果放到了taskQueue，那么立即开始调度一个回调函数，去执行它。

如果放到了timerQueue，那么会调度一个timeOut，时间间隔为该任务的过期时间与当前时间的差，到期后检查它是否过期，是则放入taskQueue，调度一个回调开始执行它，否则继续调度timeout去定期检查。

这两种队列都是小顶堆的数据结构，可以很快找出过期时间最早的任务，任务的过期时间根据优先级得出，下面会提到。所以，任务队列的管理需要**调度任务优先级**重度参与，
这样才能实现多个任务按照优先级排序。

## 判断任务完成状态
在当前帧的时间内（一般为16ms），任务执行的最大执行时间不会超过单个时间片的长度，一旦超时，必须中断，让位给更重要的工作，例如浏览器为了响应用户输入的绘制工作，
直到这一帧完成，才在下一帧继续这个任务，能这样做的前提是知道任务在上一帧被中断时并未完成，才能做到在下一帧继续执行任务。这就需要判断任务的完成状态。

一个任务就是一个函数，如果这项任务没完成，是要重复执行这个函数的，直到它完成。这里有两个关键点：**重复执行任务函数、识别任务完成**。

我们可以用递归函数做类比，如果没到递归边界，就重复调用自己。这个递归边界，就是任务完成的标志。因为递归函数所处理的任务就是它本身，可以很方便地把任务完成作为递归边界去结束任务，但是Scheduler与递归不同的是，
它只是一个执行者，调度的任务并不是它自己产生的，而是外部的（比如它去调度React的工作循环渲染fiber树），它可以做到重复执行任务函数，但边界（即任务是否完成）却无法像递归那样直接获取，
只能依赖任务函数的返回值去判断。即：**若任务函数返回值为函数，那么就说明当前任务尚未完成，需要继续调用任务函数，否则停止调用**

例如下面的例子，有一个任务calculate，负责把currentResult每次加1，一直到3为止。当没到3的时候，calculate不是去调用它自身，而是将自身return出去，一旦到了3，return的是null。这样外部才可以知道
calculate是否已经完成了任务。
```javascript
const result = 3
let currentResult = 0
function calculate() {
    currentResult++
    if (currentResult < result) {
        return calculate
    }
    return null
}
```
上面是任务，接下来我们模拟一下调度，去执行calculate。但执行应该是基于时间片的，为了观察效果，只用setInterval去模拟一下，1秒只执行它一次，即全部任务的三分之一。另外Scheduler中有两个队列去管理任务，我们暂且只用一个队列（taskQueue）存储任务。
除此之外还需要另外三个角色：把任务加入调度的函数、开始调度的函数、执行任务的函数。
```javascript
const result = 3
let currentResult = 0

function calculate() {
    currentResult++
    if (currentResult < result) {
        return calculate
    }
    return null
}

// 存放任务的队列
const taskQueue = []
// 存放模拟时间片的定时器
let interval

// 把任务加入调度的函数-------------------------------
const scheduleCallback = (task, priority) => {
    // 创建一个专属于调度器的任务
    const taskItem = {
        callback: task,
        priority
    }

    // 向队列中添加任务
    taskQueue.push(taskItem)
    // 优先级影响到任务在队列中的排序，将优先级最高的任务排在最前面
    taskQueue.sort((a, b) => (a.priority - b.priority))
    // 开始执行任务，调度开始
    requestHostCallback(workLoop)
}
// 开始调度的函数------------------------------------
const requestHostCallback = cb => {
    interval = setInterval(cb, 1000)
}
// 执行任务的函数------------------------------------
const workLoop = () => {
    // 从队列中取出任务
    const currentTask = taskQueue[0]
    // 获取真正的任务函数，即calculate
    const taskCallback = currentTask.callback
    // 判断任务函数否是函数，若是，执行它，将返回值更新到currentTask的callback中
    // 所以，taskCallback是上一阶段执行的返回值，若它是函数类型，则说明上一次执行返回了函数
    // 类型，说明任务尚未完成，本次继续执行这个函数，否则说明任务完成。
    if (typeof taskCallback === 'function') {
        currentTask.callback = taskCallback()
        console.log('正在执行任务，当前的currentResult 是', currentResult);
    } else {
        // 任务完成。将当前的这个任务从taskQueue中移除，并清除定时器
        console.log('任务完成，最终的 currentResult 是', currentResult);
        taskQueue.unshift()
        clearInterval(interval)
    }
}

// 把calculate加入调度，也就意味着调度开始
scheduleCallback(calculate, 1)
```
最终的执行结果如下：
```
正在执行任务，当前的currentResult 是 1
正在执行任务，当前的currentResult 是 2
正在执行任务，当前的currentResult 是 3
任务完成，最终的 currentResult 是 3
```

## 原理小结
任务按照优先级，计算出过期时间，依据过期时间进行排序。

依据当前时间，判断任务是否过期，有两种情况：

任务进来了就过期了（比如立即执行的优先级计算出的任务过期时间，是当前时间 - 1），那么开始执行（分段执行）它

任务都未过期，那么任务都在timerQueue，之后定期去timerQueue中询问排在最前面的任务是否过期，如过期则将它转移到taskQueue，那么开始执行（分段执行）它。

现在具体到任务执行上，利用while循环，执行taskQueue中的每一项任务，最终会清空taskQueue。执行任务的时候，会根据任务函数的返回值去判断该任务是否执行完成，是否继续执行当前任务，
从而决定是否将该任务从taskQueue中剔除，便于处理下一个任务。

举例来说：由于concurrent模式下React的渲染函数在fiber树未构建完成时，总是返回渲染函数自身，否则返回null。这样在某一帧中，React由于时间片的限制不得不暂停fiber树的构建时，
渲染函数会返回它自身，所以Scheduler明白它应该继续这个任务，加上React中利用workInProgress指针，可以做到在下一帧中可以从原来暂停的地方继续往下构建fiber树，实现下图的效果。
![](http://neroht.com/step.png)

以上是Scheduler原理的概述，下面是对React和Scheduler联合工作机制的详细解读。涉及React与Scheduler的连接、调度入口、任务优先级、任务过期时间、调度通知、任务执行、调度取消等细节，可以作为一个完成的调度流程。

# React与Scheduler的连接
React通过Scheduler调度各种任务，但是它并不属于React，它有自己的优先级机制，这就需要针对Scheduler为React做一下兼容。实际上，在react-reconciler中提供了这样一个文件去做这样的工作，
它就是`SchedulerWithReactIntegration.old(new).js`。它将二者的优先级翻译了一下，让React和Scheduler能读懂对方。另外，封装了一些Scheduler中的函数供React使用，在执行React任务的
重要文件`ReactFiberWorkLoop.js`中，关于Scheduler的内容都是从`SchedulerWithReactIntegration.old(new).js`导入的，它可以理解成是React和Scheduler之间的桥梁。
```javascript
import {
  scheduleCallback,
  cancelCallback,
  getCurrentPriorityLevel,
  runWithPriority,
  shouldYield,
  requestPaint,
  now,
  NoPriority as NoSchedulerPriority,
  ImmediatePriority as ImmediateSchedulerPriority,
  UserBlockingPriority as UserBlockingSchedulerPriority,
  NormalPriority as NormalSchedulerPriority,
  flushSyncCallbackQueue,
  scheduleSyncCallback,
} from './SchedulerWithReactIntegration.old';

```
# 调度任务优先级
上面已经提到过，调度任务的优先级会决定任务的过期时间，从而进一步影响任务在过期任务队列中的排序。Scheduler为任务定义了以下几种级别的优先级：
```javascript
export const NoPriority = 0; // 没有任何优先级
export const ImmediatePriority = 1; // 立即执行的优先级，级别最高
export const UserBlockingPriority = 2; // 用户阻塞级别的优先级
export const NormalPriority = 3; // 正常的优先级
export const LowPriority = 4; // 较低的优先级
export const IdlePriority = 5; // 优先级最低，表示任务可以闲置

```

# 调度入口
`SchedulerWithReactIntegration.old(new).js`通过封装Scheduler的内容，对React提供两种调度入口函数：`scheduleCallback` 和 `scheduleSyncCallback`。任务通过调度入口函数进入调度过程。

例如，fiber树的构建任务在concurrentMode下的任务通过`scheduleCallback`完成调度，在同步渲染模式的任务由`scheduleSyncCallback`完成。

```javascript
// concurrentMode
// 将本次更新人物的优先级转化为调度优先级
// schedulerPriorityLevel为调度优先级
const schedulerPriorityLevel = lanePriorityToSchedulerPriority(
  newCallbackPriority,
);

scheduleCallback(
  schedulerPriorityLevel,
  performConcurrentWorkOnRoot.bind(null, root),
);

// 同步渲染模式
scheduleSyncCallback(
  performSyncWorkOnRoot.bind(null, root),
)
```
它们两个其实都是对Scheduler中scheduleCallback的封装，只不过传入的优先级不同而已，前者是传递的是已经本次更新的lane计算得出的调度优先级，后者传递的是最高级别的同步优先级。另外的区别是，前者
直接将任务交给Scheduler，而后者先将任务放到React自己的同步队列中，再将执行同步队列的函数交给Scheduler，以最高优先级进行调度，保证下一次事件循环执行掉任务。
```javascript
function scheduleCallback(
  reactPriorityLevel: ReactPriorityLevel,
  callback: SchedulerCallback,
  options: SchedulerCallbackOptions | void | null,
) {
  // 将react的优先级翻译成Scheduler的优先级
  const priorityLevel = reactPriorityToSchedulerPriority(reactPriorityLevel);
  // 调用Scheduler的scheduleCallback，传入优先级进行调度
  return Scheduler_scheduleCallback(priorityLevel, callback, options);
}

function scheduleSyncCallback(callback: SchedulerCallback) {
  if (syncQueue === null) {
    syncQueue = [callback];
    // 以最高优先级去调度刷新同步队列的函数
    immediateQueueCallbackNode = Scheduler_scheduleCallback(
      Scheduler_ImmediatePriority,
      flushSyncCallbackQueueImpl,
    );
  } else {
    syncQueue.push(callback);
  }
  return fakeCallbackNode;
}
```
# 开始调度
通过上面一步步的梳理，我们可以确定，Scheduler中的scheduleCallback是调度流程开始的关键点。它负责生成调度任务、根据任务是否过期将任务放入timerQueue或taskQueue，然后分别请求调度。
具体的过程我写在注释中了，理解起来不困难。
```javascript
function unstable_scheduleCallback(priorityLevel, callback, options) {
  // 获取当前时间，它是计算任务开始时间、过期时间和判断任务是否过期的依据
  var currentTime = getCurrentTime();
  // 确定任务开始时间
  var startTime;
  // 从options中尝试获取delay，也就是推迟时间
  if (typeof options === 'object' && options !== null) {
    var delay = options.delay;
    if (typeof delay === 'number' && delay > 0) {
      // 如果有delay，那么任务开始时间就是当前时间加上delay
      startTime = currentTime + delay;
    } else {
      // 没有delay，任务开始时间就是当前时间，也就是任务需要立刻开始
      startTime = currentTime;
    }
  } else {
    startTime = currentTime;
  }

  // 确定任务开始时间到过期时间的时间间隔
  var timeout;
  switch (priorityLevel) {
    case ImmediatePriority:
      timeout = IMMEDIATE_PRIORITY_TIMEOUT; // -1
      break;
    case UserBlockingPriority:
      timeout = USER_BLOCKING_PRIORITY_TIMEOUT; // 250
      break;
    case IdlePriority:
      timeout = IDLE_PRIORITY_TIMEOUT; // 1073741823 ms
      break;
    case LowPriority:
      timeout = LOW_PRIORITY_TIMEOUT; // 10000
      break;
    case NormalPriority:
    default:
      timeout = NORMAL_PRIORITY_TIMEOUT; // 5000
      break;
  }
  // 计算任务的过期时间，任务开始时间 + timeout
  // 若是立即执行的优先级（ImmediatePriority），
  // 它的过期时间是startTime - 1，意味着立刻就过期
  var expirationTime = startTime + timeout;

  // 创建调度任务
  var newTask = {
    id: taskIdCounter++,
    // 任务本体
    callback,
    // 任务优先级
    priorityLevel,
    // 任务开始的时间，表示任务何时才能执行
    startTime,
    // 任务的过期时间
    expirationTime,
    // 在小顶堆队列中排序的依据
    sortIndex: -1,
  };

  // 下面的if...else判断各自分支的含义是：

  // 如果是任务未过期，则将 newTask 放入timerQueue， 调用requestHostTimeout，
  // 目的是定时检查任务是否过期，过期则立刻将任务加入taskQueue

  // 如果是任务已过期，则将 newTask 放入taskQueue，调用requestHostCallback，
  // 开始执行taskQueue中的任务
  if (startTime > currentTime) {
    // 任务未过期，以开始时间作为timerQueue排序的依据
    newTask.sortIndex = startTime;
    push(timerQueue, newTask);
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // 如果现在taskQueue中没有任务，并且当前的任务是timerQueue中排名最靠前的那一个
      if (isHostTimeoutScheduled) {
        // 因为即将调度一个requestHostTimeout，所以如果之前已经调度了，那么取消掉
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true;
      }
      // 会把handleTimeout放到setTimeout里，等到了该任务的开始时间，检查任务是否过期，
      // 过期则将任务放入taskQueue，使得在清空taskQueue时，任务可以被执行到
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    // 任务已经过期，以过期时间作为taskQueue排序的依据
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);

    // 开始执行任务，使用flushWork去执行taskQueue
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    }
  }

  return newTask;
}
```
这个过程中重点是任务过期与否的处理。

针对未过期任务，会进入timerQueue，并按照开始时间排列，过期时间直接与任务的优先级挂钩。然后调用`requestHostTimeout`，为的是等一会，
等到了它的开始时间点，再去检查它是否过期，如果过期则放到taskQueue中，任务就可以被执行了。否则继续等。这个过程通过`handleTimeout`完成。

`handleTimeout`的职责是：
* 调用`advanceTimers`，检查timerQueue队列中过期的任务，放到taskQueue中。
* 检查是否已经开始调度，如尚未调度，检查taskQueue中是否已经有任务：
  - 如果有，而且现在是空闲的，说明之前的advanceTimers已经将过期任务放到taskQueue，那么现在立即开始调度，执行任务
  - 如果没有，而且现在是空闲的，说明之前的advanceTimers并没有检查到timerQueue中有过期任务，那么再次调用`requestHostTimeout`重复这一过程。

总之，要把timerQueue中的任务全部都转移到taskQueue中执行掉才行。

针对已过期任务，在将它放入taskQueue之后，调用`requestHostCallback`，循环执行taskQueue。

# 任务执行
任务执行的起点是`requestHostCallback`。
```javascript

if (!isHostCallbackScheduled && !isPerformingWork) {
  isHostCallbackScheduled = true;                                 
  // 开始执行任务
  requestHostCallback(flushWork);
}
```
本质上是通过调用`flushWork`循环taskQueue，逐一执行任务。我们暂且不管其他的，只看`flushWork`具体做了什么。
```javascript
function flushWork(hasTimeRemaining, initialTime) {

  ...

  return workLoop(hasTimeRemaining, initialTime);

  ...

}
```
它调用了`workLoop`，并将其调用的结果return了出去，那么现在任务执行的核心内容看来就在`workLoop`中了。要理解它，需要回归Scheduler的功能之一：时间切片。时间切片使得任务的执行具备下面的这个重要特点：
**任务会被中断，也会被恢复。**

![](http://neroht.com/stopstart.png)

所以不难推测出，`workLoop`作为实际执行任务的函数，它做的事情就是实现

```javascript
function workLoop(hasTimeRemaining, initialTime) {

  // 获取taskQueue中排在最前面的任务
  currentTask = peek(taskQueue);
  while (currentTask !== null) {
    
    if (到了时间片限制的时间) {
       break
    }

    ...   
    // 执行任务
    ...
    
    // 任务执行完毕，从队列中删除
    pop(taskQueue);    

    // 获取下一个任务，继续循环
    currentTask = peek(taskQueue);
  }
  
  // 到了时间片限制的时间，循环中断后，会执行到这里
  // 
  if (currentTask !== null) {
    return true;
  } else {
    ...
    return false;
  }
}
```

但是因为时间片限制了任务的最大执行时间，也就意味着一旦到时间，需要马上中止正在执行的任务。中止很容易，关键是如何恢复执行。



在Scheduler中，任务的中止和恢复在支持MessageChannel的环境中是

```javascript
  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;

  requestHostCallback = function(callback) {
    scheduledHostCallback = callback;
    if (!isMessageLoopRunning) {
      isMessageLoopRunning = true;
      port.postMessage(null);
    }
  };

```





# 取消调度

# 任务执行


