UI产生交互的根本原因是各种事件，这也就意味着事件与渲染有着直接关系。在React中，人为地将事件划分了等级。另外为了及时响应高优任务，
各种更新任务和调度也需要一套优先级规则，以此保证高优任务先于低优任务执行。更新任务本质由事件产生，因此更新任务的优先级本质上是来自于事件的优先级。

React执行任务的重要依据是优先级，这里的任务不只是更新任务，还包括调度任务。优先级共分为三种：事件优先级、调度优先级、更新优先级。

# 事件优先级
在如此多的事件中，按照事件的紧急程度，一共有三个等级：
* 离散事件（DiscreteEvent）：click、keydown、focusin等，这些事件的触发不是连续的，优先级为0。
* 用户阻塞事件（UserBlockingEvent）：drag、scroll、mouseover等，特点是连续触发，阻塞渲染，优先级为1。
* 连续事件（ContinuousEvent）：canplay、error、audio标签的timeupdate和canplay，优先级最高，为2。

![事件优先级的Map](http://neroht.com/eventPriorities.jpg)

事件往往是更新任务的诱因，更新任务要经过Scheduler调度，因此事件优先级是计算调度优先级和更新优先级的基础。事件的优先级在注册阶段就已经被确定了，在向root上注册事件时，会
根据事件的类别，为root创建不同优先级的listener，最终绑定上去。
```javascript
let listener = createEventListenerWrapperWithPriority(
    targetContainer,
    domEventName,
    eventSystemFlags,
    listenerPriority,
  );
```

`createEventListenerWrapperWithPriority`函数中按照不同事件，返回事件监听函数：listenerWrapper

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

最终事件的执行是这个listenerWrapper以不同的优先级来执行事件处理函数。在ReactDOM中，`dispatchDiscreteEvent`和`dispatchUserBlockingUpdate`最终都会以
UserBlockingEvent的级别去执行事件处理函数。
# 更新优先级
事件触发，产生更新（update），它会持有一个优先级，此优先级是由事件优先级计算得来。
这如何理解呢？我们上面说过，**最终事件的执行是listenerWrapper以不同的优先级来执行事件处理函数**，也就是事件的执行会伴随着一个优先级。以drag事件为例，
它的listenerWrapper是`dispatchUserBlockingUpdate`:
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
可以看到**runWithPriority**方法以**UserBlockingPriority**的优先级执行事件，而事件处理函数一旦调用了setState，就会创建update，
更新优先级也会在此时计算：
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
重点关注**requestUpdateLane**，它根据事件优先级计算update的优先级。由于update的优先级粒度更细，有可能多个update是由同一类事件产生的，那
么它们就要持有相同的优先级，所以在事件优先级和update优先级之间需要有一层转换关系，这就是`schedulerLanePriority`。
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
这个过程有两个参与者，分别是`事件优先级（schedulerPriority）、schedulerLanePriority`。转化过程是：
```
事件优先级 -> schedulerLanePriority -> update的优先级
```
update对象创建完成后意味着需要对页面进行更新，会进入调度，随即会产生一个调度任务。

# 调度相关的优先级
与调度相关的优先级有两种：调度任务优先级 和 调度优先级。

## 调度任务优先级
我们知道，update产生的更新会被scheduler调度，调度行为和更新任务本身构成了调度任务，假设一前一后产生两个update，若后者的优先级大于前者，前者的任务调度会被取消，这也是
调度任务优先级的意义所在，对update产生的更新任务进行取舍。调度任务和其优先级可以用下面的模型理解：
```
调度任务 = scheduler(调度优先级, 更新任务)

调度任务优先级 = 调度任务 的 优先级
```
它由update的优先级计算得来。
```javascript
function getHighestPriorityLanes(lanes: Lanes | Lane): Lanes {
  ...
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

`return_highestLanePriority`会最终作为调度任务的优先级。它有如下这些值，值越大，优先级越高。理解调度优先级的作用即可。

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


## 调度优先级
调度优先级指的是调度行为它的优先级，与更新任务本身无关，在上面的模型中，可以看到调度优先级参与了任务调度。
```
调度任务 = scheduler(调度优先级, 更新任务)
```
它的作用是更新任务过期时间的分配依据，在Scheduler中，任务队列根据过
期时间对更新任务进行小顶堆排序，保证高优任务先执行。

调度优先级由**调度任务的优先级**计算得出，在更新真正发起调度之前，会去计算调度优先级。
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
我们看到，计算结果实际会根据**调度任务的优先级**收敛为如下几种：
* NoSchedulerPriority（90）：无任何优先级
* ImmediateSchedulerPriority（99）：立即执行，优先级最高
* UserBlockingSchedulerPriority（98）：用户阻塞，用户操作引起的调度任务采用该优先级调度
* NormalSchedulerPriority（97）：默认的优先级
* IdleSchedulerPriority（95）：优先级最低，闲置的任务

注意这只是计算结果。还会在scheduler中将以上优先级转化为最终的**调度优先级**
* NoPriority（0）：无任何优先级
* ImmediatePriority（1）：立即执行，优先级最高，Sync模式采用这种优先级进行调度
* UserBlockingPriority（2）：用户阻塞，用户操作引起的调度任务采用该优先级调度
* NormalPriority（3）：默认的优先级
* LowPriority（4）：低优先级
* IdlePriority（5）：优先级最低，闲置的任务

**调度任务优先级**决定新任务能否取消已有的调度，重新发起一次。**调度优先级**决定任务被调度的顺序，高优任务总会排在前面被调度。后者基于前者计算得出。
这里和任务调度的整体流程相关，在任务调度的介绍中有涉及。下面展示的是这两者实际的应用过程。

```javascript
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {
  // 获取当前的调度任务优先级
  const existingCallbackNode = root.callbackNode;

  // 获取下一批更新的优先级
  const nextLanes = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );

  // 获取新调度任务的优先级，在调用getNextLanes计算nextLanes是会将
  // 调度任务的优先级也计算出来，returnNextLanesPriority直接返回这个优先级
  const newCallbackPriority = returnNextLanesPriority();

  // 新任务没有任何渲染优先级，取消掉现有调度，退出
  ...

  // 检查现有调度任务的优先级和新调度任务的优先级，如果优先级不同，
  // 则取消现有的重新调度
  if (existingCallbackNode !== null) {
    ...
    cancelCallback(existingCallbackNode);
  }
  ...
  // 重新调度...
  const schedulerPriorityLevel = lanePriorityToSchedulerPriority(
    newCallbackPriority,
  );
  newCallbackNode = scheduleCallback(
    schedulerPriorityLevel,
    performConcurrentWorkOnRoot.bind(null, root),
  );
}
```
*为了简单说明问题，以上代码相当简化，请以实际[代码](https://github.com/neroneroffy/react-source-code-debug/blob/master/src/react/v17.0.0-alpha.0/react-reconciler/src/ReactFiberWorkLoop.new.js#L697)为准*

# 总结
本文一共提到了三种React的优先级：**事件优先级、更新优先级、调度优先级**。它们之间是递进的因果关系。

以setState引发的更新过程为例，事件触发后，带着事件优先级去执行事件处理函数，setState会用事件优先级去创建更新优先级，挂载到update上，由此产生不同优先级的update。
随后进入调度流程，使用当前最紧急的update的优先级去计算本次新调度任务的优先级，该优先级决定是否取消已有的任务调度，这么做的原因是保证紧急的更新任务先被处理。真正发起调度之前
会用调度任务的优先级计算调度优先级，保证紧急的更新任务在scheduler中的任务队列中排在最前面。

几种优先级环环相扣，保证了高优任务的优先执行。
