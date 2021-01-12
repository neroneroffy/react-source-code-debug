React源码调试[仓库](https://github.com/neroneroffy/react-source-code-debug)

UI产生交互的根本原因是各种事件，这也就意味着事件与更新有着直接关系。不同事件产生的更新，它们的优先级是有差异的，所以更新优先级的根源在于事件的优先级。
一个更新的产生可直接导致React生成一个更新任务，最终这个任务被Scheduler调度。

所以在React中，人为地将事件划分了等级，最终目的是决定调度任务的轻重缓急，因此，React有一套从事件到调度的优先级机制。

本文将围绕事件优先级、更新优先级、任务优先级、调度优先级，重点梳理它们之间的转化关系。

* 事件优先级：按照用户事件的交互紧急程度，划分的优先级
* 更新优先级：事件导致React产生的更新对象（update）的优先级（update.lane）
* 任务优先级：产生更新对象之后，React去执行一个更新任务，这个任务所持有的优先级
* 调度优先级：Scheduler依据React更新任务生成一个调度任务，这个调度任务所持有的优先级

前三者属于React的优先级机制，第四个属于Scheduler的优先级机制，Scheduler内部有自己的优先级机制，虽然与React有所区别，但等级的划分基本一致。下面我们从事件优先级开始说起。

# 优先级的起点：事件优先级
React按照事件的紧急程度，把它们划分成三个等级：
* 离散事件（DiscreteEvent）：click、keydown、focusin等，这些事件的触发不是连续的，优先级为0。
* 用户阻塞事件（UserBlockingEvent）：drag、scroll、mouseover等，特点是连续触发，阻塞渲染，优先级为1。
* 连续事件（ContinuousEvent）：canplay、error、audio标签的timeupdate和canplay，优先级最高，为2。

![事件优先级的Map](http://neroht.com/eventPriorities.jpg)

## 派发事件优先级
事件优先级是在注册阶段被确定的，在向root上注册事件时，会根据事件的类别，创建不同优先级的事件监听（listener），最终将它绑定到root上去。

```javascript
let listener = createEventListenerWrapperWithPriority(
    targetContainer,
    domEventName,
    eventSystemFlags,
    listenerPriority,
  );
```

`createEventListenerWrapperWithPriority`函数的名字已经把它做的事情交代得八九不离十了。它会首先根据事件的名称去找对应的事件优先级，然后依据优先级返回不同的事件监听函数。

```javascript
export function createEventListenerWrapperWithPriority(
  targetContainer: EventTarget,
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  priority?: EventPriority,
): Function {
  const eventPriority =
    priority === undefined
      ? getEventPriorityForPluginSystem(domEventName)
      : priority;
  let listenerWrapper;
  switch (eventPriority) {
    case DiscreteEvent:
      listenerWrapper = dispatchDiscreteEvent;
      break;
    case UserBlockingEvent:
      listenerWrapper = dispatchUserBlockingUpdate;
      break;
    case ContinuousEvent:
    default:
      listenerWrapper = dispatchEvent;
      break;
  }
  return listenerWrapper.bind(
    null,
    domEventName,
    eventSystemFlags,
    targetContainer,
  );
}

```
最终绑定到root上的事件监听其实是**dispatchDiscreteEvent**、**dispatchUserBlockingUpdate**、**dispatchEvent**这三个中的一个。它们做的事情都是一样的，以各自的事件优先级去执行真正的事件处理函数。
比如：`dispatchDiscreteEvent`和`dispatchUserBlockingUpdate`最终都会以UserBlockingEvent的事件级别去执行事件处理函数。

以某种优先级去执行事件处理函数其实要借助Scheduler中提供的`runWithPriority`函数来实现：

```javascript
function dispatchUserBlockingUpdate(
  domEventName,
  eventSystemFlags,
  container,
  nativeEvent,
) {

  ...

  runWithPriority(
    UserBlockingPriority,
    dispatchEvent.bind(
      null,
      domEventName,
      eventSystemFlags,
      container,
      nativeEvent,
    ),
  );

  ...

}
```
这么做可以将事件优先级记录到Scheduler中，相当于告诉Scheduler：你帮我记录一下当前事件派发的优先级，等React那边创建更新对象（即update）计算更新优先级时直接从你这拿就好了。
```javascript
function unstable_runWithPriority(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
    case LowPriority:
    case IdlePriority:
      break;
    default:
      priorityLevel = NormalPriority;
  }

  var previousPriorityLevel = currentPriorityLevel;
  // 记录优先级到Scheduler内部的变量里
  currentPriorityLevel = priorityLevel;

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}

```
# 更新优先级
以setState为例，事件的执行会导致setState执行，而setState本质上是调用enqueueSetState，生成一个update对象，这时候会计算它的更新优先级，即update.lane：
```javascript
const classComponentUpdater = {
  enqueueSetState(inst, payload, callback) {
    ...

    // 依据事件优先级创建update的优先级
    const lane = requestUpdateLane(fiber, suspenseConfig);

    const update = createUpdate(eventTime, lane, suspenseConfig);
    update.payload = payload;
    enqueueUpdate(fiber, update);

    // 开始调度
    scheduleUpdateOnFiber(fiber, lane, eventTime);
    ...
  },
};
```
重点关注**requestUpdateLane**，它首先找出Scheduler中记录的优先级：schedulerPriority，然后计算更新优先级：lane，具体的计算过程在findUpdateLane函数中，
计算过程是一个从高到低依次占用空闲位的操作，具体的代码在[这里](https://github.com/neroneroffy/react-source-code-debug/blob/master/src/react/v17/react-reconciler/src/ReactFiberLane.js#L585) ，这里就先不详细展开。

```javascript
export function requestUpdateLane(
  fiber: Fiber,
  suspenseConfig: SuspenseConfig | null,
): Lane {

  ...
  // 根据记录下的事件优先级，获取任务调度优先级
  const schedulerPriority = getCurrentPriorityLevel();

  let lane;
  if (
    (executionContext & DiscreteEventContext) !== NoContext &&
    schedulerPriority === UserBlockingSchedulerPriority
  ) {
    // 如果事件优先级是用户阻塞级别，则直接用InputDiscreteLanePriority去计算更新优先级
    lane = findUpdateLane(InputDiscreteLanePriority, currentEventWipLanes);
  } else {
    // 依据事件的优先级去计算schedulerLanePriority
    const schedulerLanePriority = schedulerPriorityToLanePriority(
      schedulerPriority,
    );
    ...
    // 根据事件优先级计算得来的schedulerLanePriority，去计算更新优先级
    lane = findUpdateLane(schedulerLanePriority, currentEventWipLanes);
  }
  return lane;
}
```
`getCurrentPriorityLevel`负责读取记录在Scheduler中的优先级：
```javascript
function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel;
}
```

update对象创建完成后意味着需要对页面进行更新，会调用scheduleUpdateOnFiber进入调度，而真正开始调度之前会计算本次产生的更新任务的任务优先级，目的是
与已有任务的任务优先级去做比较，便于做出多任务的调度决策。

*调度决策的逻辑在[ensureRootIsScheduled](https://github.com/neroneroffy/react-source-code-debug/blob/master/src/react/v17/react-reconciler/src/ReactFiberWorkLoop.old.js#L720) 函数中，这是一个非常重要的函数，控制着React任务进入Scheduler的大门。*


# 任务优先级
一个update会被一个React的更新任务执行掉，任务优先级被用来区分多个更新任务的紧急程度，它由更新优先级计算而来，举例来说：

假设产生一前一后两个update，它们持有各自的更新优先级，也会被各自的更新任务执行。经过优先级计算，如果后者的任务优先级高于前者的任务优先级，那么会让Scheduler取消前者的任务调度；如果后者的任务优先级等于前者的任务优先级，
后者不会导致前者被取消，而是会复用前者的更新任务，将两个同等优先级的更新收敛到一次任务中；如果后者的任务优先级低于前者的任务优先级，同样不会导致前者的任务被取消，而是在前者更新完成后，
再次用Scheduler对后者发起一次任务调度。

这是任务优先级存在的意义，保证高优先级任务及时响应，收敛同等优先级的任务调度。

任务优先级在即将调度的时候去计算，代码在`ensureRootIsScheduled`函数中：
```javascript
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {

  ...

  // 获取nextLanes，顺便计算任务优先级
  const nextLanes = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );

  // 获取上面计算得出的任务优先级
  const newCallbackPriority = returnNextLanesPriority();

  ...

}
```

通过调用getNextLanes去计算在本次更新中应该处理的这批lanes（nextLanes），getNextLanes会调用getHighestPriorityLanes去计算任务优先级。任务优先级计算的原理是这样：更新优先级（update的lane），
它会被并入root.pendingLanes，root.pendingLanes经过getNextLanes处理后，挑出那些应该处理的lanes，传入`getHighestPriorityLanes`，根据nextLanes找出这些lanes的优先级作为任务优先级。
```javascript
function getHighestPriorityLanes(lanes: Lanes | Lane): Lanes {
  ...
  // 都是这种比较赋值的过程，这里只保留两个以做简要说明
  const inputDiscreteLanes = InputDiscreteLanes & lanes;
  if (inputDiscreteLanes !== NoLanes) {
    return_highestLanePriority = InputDiscreteLanePriority;
    return inputDiscreteLanes;
  }
  if ((lanes & InputContinuousHydrationLane) !== NoLanes) {
    return_highestLanePriority = InputContinuousHydrationLanePriority;
    return InputContinuousHydrationLane;
  }
  ...
  return lanes;
}
```

*getHighestPriorityLanes的[源码](https://github.com/neroneroffy/react-source-code-debug/blob/master/src/react/v17/react-reconciler/src/ReactFiberLane.js#L121)在这里，getNextLanes的[源码](https://github.com/neroneroffy/react-source-code-debug/blob/master/src/react/v17/react-reconciler/src/ReactFiberLane.js#L266)在这里*

`return_highestLanePriority`就是任务优先级，它有如下这些值，值越大，优先级越高，暂时只理解任务优先级的作用即可。

```
export const SyncLanePriority: LanePriority = 17;
export const SyncBatchedLanePriority: LanePriority = 16;

const InputDiscreteHydrationLanePriority: LanePriority = 15;
export const InputDiscreteLanePriority: LanePriority = 14;

const InputContinuousHydrationLanePriority: LanePriority = 13;
export const InputContinuousLanePriority: LanePriority = 12;

const DefaultHydrationLanePriority: LanePriority = 11;
export const DefaultLanePriority: LanePriority = 10;

const TransitionShortHydrationLanePriority: LanePriority = 9;
export const TransitionShortLanePriority: LanePriority = 8;

const TransitionLongHydrationLanePriority: LanePriority = 7;
export const TransitionLongLanePriority: LanePriority = 6;

const RetryLanePriority: LanePriority = 5;

const SelectiveHydrationLanePriority: LanePriority = 4;

const IdleHydrationLanePriority: LanePriority = 3;
const IdleLanePriority: LanePriority = 2;

const OffscreenLanePriority: LanePriority = 1;

export const NoLanePriority: LanePriority = 0;
```
如果已经存在一个更新任务，`ensureRootIsScheduled`会在获取到新任务的任务优先级之后，去和旧任务的任务优先级去比较，从而做出是否需要重新发起调度的决定，若需要发起调度，那么会去计算调度优先级。

# 调度优先级
一旦任务被调度，那么它就会进入Scheduler，在Scheduler中，这个任务会被包装一下，生成一个属于Scheduler自己的task，这个task持有的优先级就是调度优先级。

它有什么作用呢？在Scheduler中，分别用过期任务队列和未过期任务的队列去管理它内部的task，过期任务的队列中的task根据过
期时间去排序，最早过期的排在前面，便于被最先处理。而过期时间是由调度优先级计算的出的，不同的调度优先级对应的过期时间不同。

调度优先级由**任务优先级**计算得出，在`ensureRootIsScheduled`更新真正让Scheduler发起调度的时候，会去计算调度优先级。
```javascript
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {

    ...

    // 根据任务优先级获取Scheduler的调度优先级
    const schedulerPriorityLevel = lanePriorityToSchedulerPriority(
      newCallbackPriority,
    );

    // 计算出调度优先级之后，开始让Scheduler调度React的更新任务
    newCallbackNode = scheduleCallback(
      schedulerPriorityLevel,
      performConcurrentWorkOnRoot.bind(null, root),
    );

    ...
}
```
`lanePriorityToSchedulerPriority`计算调度优先级的过程是根据任务优先级找出对应的调度优先级。

```javascript
export function lanePriorityToSchedulerPriority(
  lanePriority: LanePriority,
): ReactPriorityLevel {
  switch (lanePriority) {
    case SyncLanePriority:
    case SyncBatchedLanePriority:
      return ImmediateSchedulerPriority;
    case InputDiscreteHydrationLanePriority:
    case InputDiscreteLanePriority:
    case InputContinuousHydrationLanePriority:
    case InputContinuousLanePriority:
      return UserBlockingSchedulerPriority;
    case DefaultHydrationLanePriority:
    case DefaultLanePriority:
    case TransitionShortHydrationLanePriority:
    case TransitionShortLanePriority:
    case TransitionLongHydrationLanePriority:
    case TransitionLongLanePriority:
    case SelectiveHydrationLanePriority:
    case RetryLanePriority:
      return NormalSchedulerPriority;
    case IdleHydrationLanePriority:
    case IdleLanePriority:
    case OffscreenLanePriority:
      return IdleSchedulerPriority;
    case NoLanePriority:
      return NoSchedulerPriority;
    default:
      invariant(
        false,
        'Invalid update priority: %s. This is a bug in React.',
        lanePriority,
      );
  }
}
```

# 总结
本文一共提到了4种优先级：**事件优先级、更新优先级、任务优先级、调度优先级**，它们之间是递进的关系。事件优先级由事件本身决定，更新优先级由事件计算得出，然后放到root.pendingLanes，
任务优先级来自root.pendingLanes中最紧急的那些lanes对应的优先级，调度优先级根据任务优先级获取。几种优先级环环相扣，保证了高优任务的优先执行。

欢迎扫码关注公众号，发现更多技术文章

![](https://neroht.com/qrcode-small.jpg)

