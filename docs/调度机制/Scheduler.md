Scheduler作为一个独立的包，可以独自承担起任务调度的职责，你只需要将任务和任务的优先级交给它，它就可以帮你管理任务，安排任务的执行。

安排任务的执行只是它的基本职责，它更重要的功能是，对于单个任务，它会有节制地去执行。换句话说，线程只有一个，它不会一直占用着线程去执行任务。而是执行一会，中断一下，如此往复。用这样的模式，来避免
一直占用有限的资源执行耗时较长的任务，解决用户操作时页面卡顿的问题。实现更快的响应。


到此，我们梳理出Scheduler中两个重要的行为：**多个任务的管理**、**单个任务的执行控制**。


# 基本概念
为了实现上述的两个行为，它引入两个概念：**调度任务优先级** 、 **时间片**。

调度优先级让任务按照自身的紧急程度按序排列，这样可以让优先级最高的任务最先被执行到。

时间片规定的是单个任务在这一帧内最大的执行时间，保证页面不会因为任务连续执行的时间过长而产生卡顿。

# 原理概述
基于调度任务优先级和时间片的概念，Scheduler围绕着它的核心目标 - 任务调度，衍生出了两大核心功能：任务队列管理 和 单个任务的中断以及恢复。

## 任务队列管理
任务队列管理对应了Scheduler的多任务管理这一行为。在Scheduler内部，把任务分成了两种：未过期的和已过期的，分别用两个队列存储，前者存到timerQueue中，后者存到taskQueue中。

**如何区分任务是否过期？**

用任务的开始时间（startTime）和当前时间（currentTime）作比较。开始时间大于当前时间，说明未过期，放到timerQueue；开始时间小于等于当前时间，说明已过期，放到taskQueue。

**不同队列中的任务如何排序？**
当任务一个个进来的时候，自然要对它们进行排序，保证紧急的任务排在前面，所以排序的依据就是任务的紧急程度。而taskQueue和timeQueue中任务的紧急程度判定标准是有区别的。

* taskQueue中，依据任务的过期时间（expirationTime）排序，过期时间越早，说明越紧急，过期时间小的排在前面。过期时间根据任务优先级计算得出，优先级越高，过期时间越早。
* timeQueue中，依据任务的开始时间（startTime）排序，开始时间越早，说明会越早开始，开始时间小的排在前面。任务进来的时候，开始时间默认是当前时间，如果调度的时候穿了延迟时间，则是当前时间与延迟时间的和。

**任务入队两个队列，之后呢？**
如果放到了taskQueue，那么立即调度一个函数去循环taskQueue，挨个执行里面的任务。

如果放到了timerQueue，那么说明它里面的任务都不会立即执行，那就过一会去检查它里面最早开始的那个任务，看它是否过期，如果是，则把它从timeQueue中拿出来放入taskQueue，
重复上一步；否则过一会继续检查。这个“过一会”对应的时间间隔，是最早开始的那个任务的开始时间与当前时间的差。

任务队列管理相对于单个任务的执行，是宏观层面的概念，它利用任务的调度优先级去管理任务队列中的任务顺序，始终让最紧急的任务被优先处理。

## 单个任务的中断以及恢复
单个任务的中断以及恢复对应了Scheduler的单个任务执行控制这一行为。它在循环taskQueue执行每一个任务时，如果某个任务执行时间过长，达到了时间片限制的时间，那么它必须中断，
以便于让位给更重要的事情，等事情完成，再恢复执行任务。

例如这个例子，点击按钮渲染140000个DOM节点，为的是让React通过scheduler调度一个耗时较长的更新任务。同时拖动方块，这是为了模拟用户交互。更新任务会占用线程去执行任务，
用户交互要也要占用线程去响应页面，这就决定了它们两个是互斥的关系。在React的concurrent模式下，通过Scheduler调度的更新任务遇到用户交互之后，会是下面动图里的效果。

![](http://neroht.com/schedulerTask.gif)

执行React任务和绘制页面响应用户交互这两件事情是互斥的，但因为Scheduler可以利用时间片中断更新任务，然后让出线程给浏览器的绘制，所以一开始在fiber树的构建阶段，
拖动方块会得到及时的反馈。虽然后面卡了一下，但这是因为fiber树构建完成，进入了同步的commit阶段，导致交互卡顿。分析页面的渲染过程可以非常直观地看到通过时间片的控制。主线程被让出
去进行页面的绘制（Painting和Rendering，绿色和紫色的部分）。

![](http://neroht.com/schedulerTask2.jpg)

Scheduler要实现这样的效果需要两个角色：任务的调度者、任务的执行者。调度者调度一个执行者，执行者去循环taskQueue，逐个执行任务。当某个任务的执行时间比较长，
执行者会根据时间片中断任务执行，然后告诉调度者：我现在正执行的这个任务被中断了，还有一部分没完成，
但现在必须让位给更重要的事情，你再调度一个执行者吧，好让这个任务能在之后被继续执行完（任务的恢复）。于是，调度者知道了任务还没完成，需要继续做，它会再调度一个执行者
去继续完成这个任务。

通过执行者和调度者的配合，可以实现任务的中断和恢复。


## 原理小结
Scheduler管理着taskQueue和timeQueue两个队列，它会定期将timerQueue中的过期任务放到taskQueue中，然后让调度者通知执行者循环taskQueue执行掉每一个任务。执行者控制着每个任务的执行，
一旦某个任务的执行时间超出时间片的限制。就会被中断，然后当前的执行者退场，退场之前会通知调度者再去调度一个新的执行者继续完成这个任务，新的执行者在执行任务时依旧会根据时间片中断任务，然后退场，
重复这一过程，直到当前这个任务彻底完成后，将它出队。taskQueue中每一个任务都被这样处理，最终完成所有任务，这就是Scheduler的完整工作流程。

这里面有一个关键点，就是执行者如何知道这个任务到底完成没完成呢？这是另一个话题了，也就是判断任务的完成状态。下面在讲解执行者的执行细节时会重点突出。


以上是Scheduler原理的概述，下面开始是对React和Scheduler联合工作机制的详细解读。涉及React与Scheduler的连接、调度入口、任务优先级、任务过期时间、调度通知、任务执行、判断任务的完成状态等内容，
你可以用下面的内容梳理出一个React任务的完整调度流程。

在开始之前，我们先看一下React和Scheduler它们二者构成的一个系统的示意图。

# Scheduler中的角色

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
它调用了`workLoop`，并将其调用的结果return了出去，那么现在任务执行的核心内容看来就在`workLoop`中了。要理解它，需要回顾Scheduler的功能之一：时间切片。时间切片使得任务的
执行具备下面的这个重要特点：
**任务会被中断，也会被恢复。**



所以不难推测出，`workLoop`作为实际执行任务的函数，它做的事情肯定与任务的中断恢复有关。我们先看一下workLoop的结构
```javascript
function workLoop(hasTimeRemaining, initialTime) {

  // 获取taskQueue中排在最前面的任务
  currentTask = peek(taskQueue);
  while (currentTask !== null) {

    if (currentTask.expirationTime > currentTime &&
     (!hasTimeRemaining || shouldYieldToHost())) {
       // break掉while循环
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


  if (currentTask !== null) {
    // 如果currentTask不为空，说明是时间片的限制导致了任务中断
    // return true告诉外部，此时任务还未执行完
    return true;
  } else {
    // 如果currentTask为空，说明taskQueue队列中的任务已经都
    // 执行完了，然后从timerQueue中找任务，调用requestHostTimeout
    // 去把task放到taskQueue中，到时会再次发起调度，但是这次，
    // 会先return false，告诉外部当前的taskQueue已经清空，
    // 先停止执行任务，也就是终止任务调度

    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }

    return false;
  }
}
```
workLoop中可以分为两大部分： 循环taskQueue执行任务 和 任务状态的判断。

**循环taskQueue执行任务**

暂且不管任务如何执行，只关注任务如何被时间片限制。
```javascript
if (currentTask.expirationTime > currentTime &&
     (!hasTimeRemaining || shouldYieldToHost())) {
   // break掉while循环
   break
}
```
currentTask就是当前正在执行的任务，它中止的判断条件是：任务并未过期，但已经没有剩余时间了，或者应该让出执行权给主线程（时间片），也就是说currentTask执行得好好的，可是时间不允许，
那只能先break掉本次while循环，使得本次循环下面currentTask执行的逻辑都不能被执行到（**此处是中断任务的关键**）。但是被break的只是while循环，while下部还是会判断currentTask的状态。
由于它只是被中止了，所以currentTask不可能是null，那么会return一个true告诉外部还没完事呢（**此处是恢复任务的关键**），否则说明全部的任务都已经执行完了，taskQueue已经被清空了，
return一个false好让外部终止本次调度。

## 判断单个任务完成状态
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


