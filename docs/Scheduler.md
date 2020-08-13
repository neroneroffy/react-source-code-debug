## 让出执行权
哪些因素决定是否让出执行权？
在需要绘制页面或者检测到用户输入被打断（用户输入属于高优先级任务）的时候。
```javascript
shouldYieldToHost = function() {
  const currentTime = getCurrentTime();
  if (currentTime >= deadline) {
    // 如果这一帧没有剩余时间了
    if (needsPaint || scheduling.isInputPending()) {
      // 检查是否需要绘制，或者用户输入是否被打断。是的话就让出执行权
      return true;
    }
    // React定义了一个最大的让出控制权的时间，如果到了deadline，
    // 但没有紧急任务，可以先不让出执行权，目前最大为300ms，后续
    // 可能会支持配置或者根据优先级来决定这个最大时间
    return currentTime >= maxYieldInterval;
  } else {
    // 在当前这一帧仍然有剩余时间，不应交回控制权
    return false;
  }
};
```
## 何时判断让出控制权？
构建workInProgress树的时候以及执行taskQueue队列中任务的时候。
从root开始构建workInProgress树的整体行为是taskQueue队列中的一个任务。

如果判断让出执行权之后，没有紧急的任务，那么继续执行任务

## 任务调度协调
关于React的任务调度优先级和更新优先级（update.lane）的区别：

任务调度优先级callbackPriority表示本次任务调度的优先级级别，React有可能调度不同的任务，例如更新阶段的render阶段，和commit，都会被当作任务被调度。

而更新优先级，它的粒度更细，是React应用产生的更新所持有的优先级。举例来说，render阶段会以它的调度优先级被调度，在构建WIP树时，依据渲染优先级和更新优先
级处理更新。

理论上React的每次更新任务都希望被调度，但不能来一个就调度一个，任务是分轻重缓急的。假设现在正有一个更新任务在执行，此时产生了一个新
的任务，那两个任务该如何协调呢？这就是`ensureRootIsScheduled`要做的事情。
```javascript
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {
  // 获取上次的调度任务
  const existingCallbackNode = root.callbackNode;

  // 如果有更新任务过期了，将它标记到root.expiredLanes中，以便能够立即更新
  markStarvedLanesAsExpired(root, currentTime);

  // 获取新任务的渲染优先级
  const nextLanes = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );

  // 获取新任务的调度优先级
  const newCallbackPriority = returnNextLanesPriority();

  // 新任务没有任何渲染优先级，退出
  if (nextLanes === NoLanes) {
    if (existingCallbackNode !== null) {
      cancelCallback(existingCallbackNode);
      root.callbackNode = null;
      root.callbackPriority = NoLanePriority;
    }
    return;
  }

  // 检查已有任务的调度优先级
  if (existingCallbackNode !== null) {
    const existingCallbackPriority = root.callbackPriority;
  // 新旧任务优先级相同，退出
    if (existingCallbackPriority === newCallbackPriority) {
      // 新旧任务的优先级相同，可以复用旧任务，退出
      return;
    }
    cancelCallback(existingCallbackNode);
  }

  // 为新任务发起调度
  let newCallbackNode;
  if (newCallbackPriority === SyncLanePriority) {
    newCallbackNode = scheduleSyncCallback(
      performSyncWorkOnRoot.bind(null, root),
    );
  } else if (newCallbackPriority === SyncBatchedLanePriority) {
    newCallbackNode = scheduleCallback(
      ImmediateSchedulerPriority,
      performSyncWorkOnRoot.bind(null, root),
    );
  } else {
    const schedulerPriorityLevel = lanePriorityToSchedulerPriority(
      newCallbackPriority,
    );
    newCallbackNode = scheduleCallback(
      schedulerPriorityLevel,
      performConcurrentWorkOnRoot.bind(null, root),
    );
  }

  root.callbackPriority = newCallbackPriority;
  root.callbackNode = newCallbackNode;
}
```
要明确`ensureRootIsScheduled`的调用时机是在每个任务每次更新以及退出之前的时候，这样做的目的是为了确保将root上的更新能够被及时处理，
处理更新将会发起新任务，但此时已有任务可能还存在，而root上只允许有一个调度任务。所以协调的主体就很明显了：**即将发起的新任务与旧任务**。

协调的依据是新旧任务的调度优先级，和新任务的渲染优先级。

* 新任务没有渲染优先级，退出不进行调度，同时说明root上已经无任务可做，清理掉旧任务。
* 旧任务的优先级与新任务的优先级相同，无需调度新任务，直接利用旧任务去完成工作。
* 新旧任务优先级不同，取消旧任务，带着新任务的调度优先级重新安排一个调度。



