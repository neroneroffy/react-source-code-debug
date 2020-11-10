/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Thenable, Wakeable} from 'shared/ReactTypes';
import type {Fiber, FiberRoot} from './ReactInternalTypes';
import type {Lanes, Lane} from './ReactFiberLane';
import type {ReactPriorityLevel} from './ReactInternalTypes';
import type {Interaction} from '../../scheduler/src/Tracing';
import type {SuspenseConfig} from './ReactFiberSuspenseConfig';
import type {SuspenseState} from './ReactFiberSuspenseComponent.new';
import type {Effect as HookEffect} from './ReactFiberHooks.new';
import type {StackCursor} from './ReactFiberStack.new';

import {
  warnAboutDeprecatedLifecycles,
  enableSuspenseServerRenderer,
  replayFailedUnitOfWorkWithInvokeGuardedCallback,
  enableProfilerTimer,
  enableProfilerCommitHooks,
  enableSchedulerTracing,
  warnAboutUnmockedScheduler,
  deferRenderPhaseUpdateToNextBatch,
} from 'shared/ReactFeatureFlags';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import invariant from 'shared/invariant';

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
} from './SchedulerWithReactIntegration.new';

// The scheduler is imported here *only* to detect whether it's been mocked
import * as Scheduler from '../../scheduler';

import {__interactionsRef, __subscriberRef} from '../../scheduler/tracing';

import {
  prepareForCommit,
  resetAfterCommit,
  scheduleTimeout,
  cancelTimeout,
  noTimeout,
  warnsIfNotActing,
  beforeActiveInstanceBlur,
  afterActiveInstanceBlur,
  clearContainer,
} from './ReactFiberHostConfig';

import {
  createWorkInProgress,
  assignFiberPropertiesInDEV,
} from './ReactFiber.new';
import {
  NoMode,
  StrictMode,
  ProfileMode,
  BlockingMode,
  ConcurrentMode,
} from './ReactTypeOfMode';
import {
  HostRoot,
  IndeterminateComponent,
  ClassComponent,
  SuspenseComponent,
  SuspenseListComponent,
  FunctionComponent,
  ForwardRef,
  MemoComponent,
  SimpleMemoComponent,
  Block,
  OffscreenComponent,
  LegacyHiddenComponent,
} from './ReactWorkTags';
import {LegacyRoot} from './ReactRootTags';
import {
  NoEffect,
  PerformedWork,
  Placement,
  Update,
  PlacementAndUpdate,
  Deletion,
  Ref,
  ContentReset,
  Snapshot,
  Callback,
  Passive,
  PassiveUnmountPendingDev,
  Incomplete,
  HostEffectMask,
  Hydrating,
  HydratingAndUpdate,
} from './ReactSideEffectTags';
import {
  NoLanePriority,
  SyncLanePriority,
  InputDiscreteLanePriority,
  TransitionShortLanePriority,
  TransitionLongLanePriority,
  NoLanes,
  NoLane,
  SyncLane,
  SyncBatchedLane,
  OffscreenLane,
  NoTimestamp,
  findUpdateLane,
  findTransitionLane,
  includesSomeLane,
  isSubsetOfLanes,
  mergeLanes,
  removeLanes,
  pickArbitraryLane,
  hasDiscreteLanes,
  hasUpdatePriority,
  getNextLanes,
  returnNextLanesPriority,
  markStarvedLanesAsExpired,
  getLanesToRetrySynchronouslyOnError,
  markRootUpdated,
  markRootSuspended as markRootSuspended_dontCallThisOneDirectly,
  markRootPinged,
  markRootExpired,
  markDiscreteUpdatesExpired,
  markRootFinished,
  schedulerPriorityToLanePriority,
  lanePriorityToSchedulerPriority,
} from './ReactFiberLane';
import {beginWork as originalBeginWork} from './ReactFiberBeginWork.new';
import {completeWork} from './ReactFiberCompleteWork.new';
import {unwindWork, unwindInterruptedWork} from './ReactFiberUnwindWork.new';
import {
  throwException,
  createRootErrorUpdate,
  createClassErrorUpdate,
} from './ReactFiberThrow.new';
import {
  commitBeforeMutationLifeCycles as commitBeforeMutationEffectOnFiber,
  commitLifeCycles as commitLayoutEffectOnFiber,
  commitPlacement,
  commitWork,
  commitDeletion,
  commitDetachRef,
  commitAttachRef,
  commitPassiveEffectDurations,
  commitResetTextContent,
  isSuspenseBoundaryBeingHidden,
} from './ReactFiberCommitWork.new';
import {enqueueUpdate} from './ReactUpdateQueue.new';
import {resetContextDependencies} from './ReactFiberNewContext.new';
import {
  resetHooksAfterThrow,
  ContextOnlyDispatcher,
  getIsUpdatingOpaqueValueInRenderPhaseInDEV,
} from './ReactFiberHooks.new';
import {createCapturedValue} from './ReactCapturedValue';
import {
  push as pushToStack,
  pop as popFromStack,
  createCursor,
} from './ReactFiberStack.new';

import {
  recordCommitTime,
  recordPassiveEffectDuration,
  startPassiveEffectTimer,
  startProfilerTimer,
  stopProfilerTimerIfRunningAndRecordDelta,
} from './ReactProfilerTimer.new';

// DEV stuff
import getComponentName from 'shared/getComponentName';
import ReactStrictModeWarnings from './ReactStrictModeWarnings.new';
import {
  isRendering as ReactCurrentDebugFiberIsRenderingInDEV,
  current as ReactCurrentFiberCurrent,
  resetCurrentFiber as resetCurrentDebugFiberInDEV,
  setCurrentFiber as setCurrentDebugFiberInDEV,
} from './ReactCurrentFiber';
import {
  invokeGuardedCallback,
  hasCaughtError,
  clearCaughtError,
} from 'shared/ReactErrorUtils';
import {onCommitRoot as onCommitRootDevTools} from './ReactFiberDevToolsHook.new';
import {onCommitRoot as onCommitRootTestSelector} from './ReactTestSelectors';

// Used by `act`
import enqueueTask from 'shared/enqueueTask';
import {doesFiberContain} from './ReactFiberTreeReflection';

const ceil = Math.ceil;

const {
  ReactCurrentDispatcher,
  ReactCurrentOwner,
  IsSomeRendererActing,
} = ReactSharedInternals;

type ExecutionContext = number;

export const NoContext = /*             */ 0b0000000;
const BatchedContext = /*               */ 0b0000001;
const EventContext = /*                 */ 0b0000010;
const DiscreteEventContext = /*         */ 0b0000100;
const LegacyUnbatchedContext = /*       */ 0b0001000;
const RenderContext = /*                */ 0b0010000;
const CommitContext = /*                */ 0b0100000;
export const RetryAfterError = /*       */ 0b1000000;

type RootExitStatus = 0 | 1 | 2 | 3 | 4 | 5;
const RootIncomplete = 0;
const RootFatalErrored = 1;
const RootErrored = 2;
const RootSuspended = 3;
const RootSuspendedWithDelay = 4;
const RootCompleted = 5;

// Describes where we are in the React execution stack
// 描述我们在react执行栈的哪个位置
let executionContext: ExecutionContext = NoContext;
// The root we're working on
let workInProgressRoot: FiberRoot | null = null;
// The fiber we're working on
let workInProgress: Fiber | null = null;
// The lanes we're rendering
// 正在渲染的lanes
let workInProgressRootRenderLanes: Lanes = NoLanes;

// Stack that allows components to change the render lanes for its subtree
// This is a superset of the lanes we started working on at the root. The only
// case where it's different from `workInProgressRootRenderLanes` is when we
// enter a subtree that is hidden and needs to be unhidden: Suspense and
// Offscreen component.
// 允许组件为它们的子树改变渲染的lanes。这是我们在root上执行的lanes的超集。和
// workInProgressRootRenderLanes唯一的不同是当我们进入一个需要被显示的隐藏的子
// 树的时候（被挂起或者屏幕之外的组件）
// Most things in the work loop should deal with workInProgressRootRenderLanes.
// 工作循环的大多数事情应该使用workInProgressRootRenderLanes
// Most things in begin/complete phases should deal with subtreeRenderLanes.
// 开始或者完成阶段应该使用subtreeRenderLanes
let subtreeRenderLanes: Lanes = NoLanes;
const subtreeRenderLanesCursor: StackCursor<Lanes> = createCursor(NoLanes);

// Whether to root completed, errored, suspended, etc.
let workInProgressRootExitStatus: RootExitStatus = RootIncomplete;
// A fatal error, if one is thrown
let workInProgressRootFatalError: mixed = null;
// Most recent event time among processed updates during this render.
let workInProgressRootLatestProcessedEventTime: number = NoTimestamp;
let workInProgressRootLatestSuspenseTimeout: number = NoTimestamp;
let workInProgressRootCanSuspendUsingConfig: null | SuspenseConfig = null;
// "Included" lanes refer to lanes that were worked on during this render. It's
// slightly different than `renderLanes` because `renderLanes` can change as you
// enter and exit an Offscreen tree. This value is the combination of all render
// lanes for the entire render phase.
let workInProgressRootIncludedLanes: Lanes = NoLanes;
// The work left over by components that were visited during this render. Only
// includes unprocessed updates, not work in bailed out children.
let workInProgressRootSkippedLanes: Lanes = NoLanes;
// Lanes that were updated (in an interleaved event) during this render.
let workInProgressRootUpdatedLanes: Lanes = NoLanes;
// Lanes that were pinged (in an interleaved event) during this render.
let workInProgressRootPingedLanes: Lanes = NoLanes;

let mostRecentlyUpdatedRoot: FiberRoot | null = null;

// The most recent time we committed a fallback. This lets us ensure a train
// model where we don't commit new loading states in too quick succession.
let globalMostRecentFallbackTime: number = 0;
const FALLBACK_THROTTLE_MS: number = 500;
const DEFAULT_TIMEOUT_MS: number = 5000;

let nextEffect: Fiber | null = null;
let hasUncaughtError = false;
let firstUncaughtError = null;
let legacyErrorBoundariesThatAlreadyFailed: Set<mixed> | null = null;

let rootDoesHavePassiveEffects: boolean = false;
let rootWithPendingPassiveEffects: FiberRoot | null = null;
let pendingPassiveEffectsRenderPriority: ReactPriorityLevel = NoSchedulerPriority;
let pendingPassiveEffectsLanes: Lanes = NoLanes;
let pendingPassiveHookEffectsMount: Array<HookEffect | Fiber> = [];
let pendingPassiveHookEffectsUnmount: Array<HookEffect | Fiber> = [];
let pendingPassiveProfilerEffects: Array<Fiber> = [];

let rootsWithPendingDiscreteUpdates: Set<FiberRoot> | null = null;

// Use these to prevent an infinite loop of nested updates
const NESTED_UPDATE_LIMIT = 50;
let nestedUpdateCount: number = 0;
let rootWithNestedUpdates: FiberRoot | null = null;

const NESTED_PASSIVE_UPDATE_LIMIT = 50;
let nestedPassiveUpdateCount: number = 0;

// Marks the need to reschedule pending interactions at these lanes
// during the commit phase. This enables them to be traced across components
// that spawn new work during render. E.g. hidden boundaries, suspended SSR
// hydration or SuspenseList.
// TODO: Can use a bitmask instead of an array
let spawnedWorkDuringRender: null | Array<Lane | Lanes> = null;

// If two updates are scheduled within the same event, we should treat their
// event times as simultaneous, even if the actual clock time has advanced
// between the first and second call.
/*
* 如果在同一个事件中调度了两次更新，我们应该将它们的事件时间视为同时发生的，即使在第一次和第
* 二次调用之间实际的时钟时间已经提前。
* */
let currentEventTime: number = NoTimestamp;
let currentEventWipLanes: Lanes = NoLanes;
let currentEventPendingLanes: Lanes = NoLanes;

// Dev only flag that tracks if passive effects are currently being flushed.
// We warn about state updates for unmounted components differently in this case.
let isFlushingPassiveEffects = false;

let focusedInstanceHandle: null | Fiber = null;
let shouldFireAfterActiveInstanceBlur: boolean = false;

export function getWorkInProgressRoot(): FiberRoot | null {
  return workInProgressRoot;
}

export function requestEventTime() {
  if ((executionContext & (RenderContext | CommitContext)) !== NoContext) {
    // We're inside React, so it's fine to read the actual time.
    return now();
  }
  // We're not inside React, so we may be in the middle of a browser event.
  if (currentEventTime !== NoTimestamp) {
    // Use the same start time for all updates until we enter React again.
    return currentEventTime;
  }
  // This is the first update since React yielded. Compute a new start time.
  currentEventTime = now();
  return currentEventTime;
}

export function getCurrentTime() {
  return now();
}

export function requestUpdateLane(
  fiber: Fiber,
  suspenseConfig: SuspenseConfig | null,
): Lane {
  // Special cases
  const mode = fiber.mode;
  if ((mode & BlockingMode) === NoMode) {
    return (SyncLane: Lane);
  } else if ((mode & ConcurrentMode) === NoMode) {
    return getCurrentPriorityLevel() === ImmediateSchedulerPriority
      ? (SyncLane: Lane)
      : (SyncBatchedLane: Lane);
  } else if (
    !deferRenderPhaseUpdateToNextBatch &&
    (executionContext & RenderContext) !== NoContext &&
    workInProgressRootRenderLanes !== NoLanes
  ) {
    // This is a render phase update. These are not officially supported. The
    // old behavior is to give this the same "thread" (expiration time) as
    // whatever is currently rendering. So if you call `setState` on a component
    // that happens later in the same render, it will flush. Ideally, we want to
    // remove the special case and treat them as if they came from an
    // interleaved event. Regardless, this pattern is not officially supported.
    // This behavior is only a fallback. The flag only exists until we can roll
    // out the setState warning, since existing code might accidentally rely on
    // the current behavior.
    /** 机翻待整理
    * 这是一个渲染阶段的更新。这些都不受官方支持。旧的做法是给当前呈现的内容相同的“线程”(过期时间)。
     * 如果你在一个组件上调用setState，它会刷新。理想情况下，我们希望删除特殊情况，并将它们视为来
     * 自交叉事件。无论如何，此模式不受官方支持。这种行为只是一种退路。因为现有代码可能会意外地依赖
     * 于当前行为，所以该标志只在我们可以推出setState警告之前存在。
    * */
    return pickArbitraryLane(workInProgressRootRenderLanes);
  }

  // The algorithm for assigning an update to a lane should be stable for all
  // updates at the same priority within the same event. To do this, the inputs
  // to the algorithm must be the same. For example, we use the `renderLanes`
  // to avoid choosing a lane that is already in the middle of rendering.
  //
  // However, the "included" lanes could be mutated in between updates in the
  // same event, like if you perform an update inside `flushSync`. Or any other
  // code path that might call `prepareFreshStack`.
  //
  // The trick we use is to cache the first of each of these inputs within an
  // event. Then reset the cached values once we can be sure the event is over.
  // Our heuristic for that is whenever we enter a concurrent work loop.
  //
  // We'll do the same for `currentEventPendingLanes` below.
  /** 机翻待整理
   * 对于同一事件中具有相同优先级的所有更新，分配更新给lane的算法应该是稳定的。要做到这一点，
   * 算法的输入必须是相同的。例如，我们使用“渲染车道”来避免选择已经在渲染中间的车道。但是，
   * “包括”的车道可能会在同一事件的更新之间发生变化，比如在' flushSync '中执行更新。或者
   * 任何其他可能调用" prepareFreshStack "的代码路径。我们使用的技巧是将这些输入中的第
   * 一个缓存到一个事件中。然后在确定事件结束后重置缓存的值。我们的启发式是当我们进入一个并
   * 发的工作循环时。我们将对下面的' currentEventPendingLanes '做同样的操作。
   *
   * */

  if (currentEventWipLanes === NoLanes) {
    currentEventWipLanes = workInProgressRootIncludedLanes;
  }

  let lane;
  if (suspenseConfig !== null) {
    // Use the size of the timeout as a heuristic to prioritize shorter
    // transitions over longer ones.
    // TODO: This will coerce numbers larger than 31 bits to 0.
    const timeoutMs = suspenseConfig.timeoutMs;
    const transitionLanePriority =
      timeoutMs === undefined || (timeoutMs | 0) < 10000
        ? TransitionShortLanePriority
        : TransitionLongLanePriority;

    if (currentEventPendingLanes !== NoLanes) {
      currentEventPendingLanes =
        mostRecentlyUpdatedRoot !== null
          ? mostRecentlyUpdatedRoot.pendingLanes
          : NoLanes;
    }

    lane = findTransitionLane(
      transitionLanePriority,
      currentEventWipLanes,
      currentEventPendingLanes,
    );
  } else {
    // TODO: If we're not inside `runWithPriority`, this returns the priority
    // of the currently running task. That's probably not what we want.
    const schedulerPriority = getCurrentPriorityLevel();

    if (
      // TODO: Temporary. We're removing the concept of discrete updates.
      (executionContext & DiscreteEventContext) !== NoContext &&
      schedulerPriority === UserBlockingSchedulerPriority
    ) {
      lane = findUpdateLane(InputDiscreteLanePriority, currentEventWipLanes);
    } else {
      const lanePriority = schedulerPriorityToLanePriority(schedulerPriority);
      lane = findUpdateLane(lanePriority, currentEventWipLanes);
    }
  }

  return lane;
}

export function scheduleUpdateOnFiber(
  fiber: Fiber,
  lane: Lane,
  eventTime: number,
) {
  console.log('本轮渲染的渲染优先级：', lane);
  // 判断是否是无限循环的update
  checkForNestedUpdates();
  warnAboutRenderPhaseUpdatesInDEV(fiber);
  // 找到rootFiber并遍历更新子节点的优先级
  const root = markUpdateLaneFromFiberToRoot(fiber, lane);
  console.log(root);
  console.log('root.pendingLanes：', root.pendingLanes);
  if (root === null) {
    warnAboutUpdateOnUnmountedFiberInDEV(fiber);
    return null;
  }

  // TODO: requestUpdateLanePriority also reads the priority. Pass the
  // priority as an argument to that function and this one.
  const priorityLevel = getCurrentPriorityLevel();
  // 获取到当前的优先级
  if (lane === SyncLane) {
    if (
      // Check if we're inside unbatchedUpdates
      (executionContext & LegacyUnbatchedContext) !== NoContext &&
      // Check if we're not already rendering
      (executionContext & (RenderContext | CommitContext)) === NoContext
    ) {
      // Register pending interactions on the root to avoid losing traced interaction data.
      // 没处在渲染过程中，没有进行批量更新，在root
      // 上注册那些待处理的交互，来避免丢失已跟踪的
      // 交互数据
      schedulePendingInteractions(root, lane);
      // This is a legacy edge case. The initial mount of a ReactDOM.render-ed
      // root inside of batchedUpdates should be synchronous, but layout updates
      // should be deferred until the end of the batch.
      // 初始挂载，ReactDOM渲染的root节点的批量更新
      // 应该是同步的，但布局更新应该延迟到批处理结束。
      performSyncWorkOnRoot(root);
    } else {
      // 更新组件时，需要确保root组件已经被调度。
      // 如被已经被调度了，则检查它的优先级有没有变化
      // 有变化，就取消上一个调度，重新安排一个调度任务
      // 没变化则直接退出
      ensureRootIsScheduled(root, eventTime);
      schedulePendingInteractions(root, lane);
      if (executionContext === NoContext) {
        // Flush the synchronous work now, unless we're already working or inside
        // a batch. This is intentionally inside scheduleUpdateOnFiber instead of
        // scheduleCallbackForFiber to preserve the ability to schedule a callback
        // without immediately flushing it. We only do this for user-initiated
        // updates, to preserve historical behavior of legacy mode.
        /**
         * 只有在执行上下文为空的时候，才去刷新同步回调队列，这样可以保证刚才调度的回调不会立即执行
         * */
        // 刷新同步回调队列
        flushSyncCallbackQueue();
      }
    }
  } else {
    // Schedule a discrete update but only if it's not Sync.
    // 调度一个离散的更新，只是因为它不是同步的
    if (
      (executionContext & DiscreteEventContext) !== NoContext &&
      // Only updates at user-blocking priority or greater are considered
      // discrete, even inside a discrete event.
      // 只有用户阻塞优先级或更高的更新被认为是离散的，即使在离散事件中也是如此。
      (priorityLevel === UserBlockingSchedulerPriority ||
        priorityLevel === ImmediateSchedulerPriority)
    ) {
      // This is the result of a discrete event. Track the lowest priority
      // discrete update per root so we can flush them early, if needed.
      if (rootsWithPendingDiscreteUpdates === null) {
        rootsWithPendingDiscreteUpdates = new Set([root]);
      } else {
        rootsWithPendingDiscreteUpdates.add(root);
      }
    }
    // Schedule other updates after in case the callback is sync.
    ensureRootIsScheduled(root, eventTime);
    schedulePendingInteractions(root, lane);
  }

  // We use this when assigning a lane for a transition inside
  // `requestUpdateLane`. We assume it's the same as the root being updated,
  // since in the common case of a single root app it probably is. If it's not
  // the same root, then it's not a huge deal, we just might batch more stuff
  // together more than necessary.
  mostRecentlyUpdatedRoot = root;
}

// This is split into a separate function so we can mark a fiber with pending
// work without treating it as a typical update that originates from an event;
// e.g. retrying a Suspense boundary isn't an update, but it does schedule work
// on a fiber.
function markUpdateLaneFromFiberToRoot(
  fiber: Fiber,
  lane: Lane,
): FiberRoot | null {
  // Update the source fiber's lanes
  // 更新当前fiber的优先级
  fiber.lanes = mergeLanes(fiber.lanes, lane);
  let alternate = fiber.alternate;
  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }
  if (__DEV__) {
    if (
      alternate === null &&
      (fiber.effectTag & (Placement | Hydrating)) !== NoEffect
    ) {
      warnAboutUpdateOnNotYetMountedFiberInDEV(fiber);
    }
  }
  // Walk the parent path to the root and update the child expiration time.
  // 一直向上遍历到root，并更新子节点的过期时间。
  let node = fiber.return;
  let root = null;
  if (node === null && fiber.tag === HostRoot) {
    root = fiber.stateNode;
  } else {
    while (node !== null) {
      alternate = node.alternate;
      if (__DEV__) {
        if (
          alternate === null &&
          (node.effectTag & (Placement | Hydrating)) !== NoEffect
        ) {
          warnAboutUpdateOnNotYetMountedFiberInDEV(fiber);
        }
      }
      node.childLanes = mergeLanes(node.childLanes, lane);
      if (alternate !== null) {
        alternate.childLanes = mergeLanes(alternate.childLanes, lane);
      }
      if (node.return === null && node.tag === HostRoot) {
        root = node.stateNode;
        break;
      }
      node = node.return;
    }
  }

  if (root !== null) {
    // Mark that the root has a pending update.
    // 标记根节点有一个等待的更新
    markRootUpdated(root, lane);
    if (workInProgressRoot === root) {
    // Received an update to a tree that's in the middle of rendering. Mark
    // that there was an interleaved update work on this root. Unless the
    // `deferRenderPhaseUpdateToNextBatch` flag is off and this is a render
    // phase update. In that case, we don't treat render phase updates as if
    // they were interleaved, for backwards compat reasons.
      /*
      https://github.com/facebook/react/commit/47ebc90b08be7a2e6955dd3cfd468318e0b8fdfd
      * 当开始渲染的时候，由于会从根节点构建workInProgress树，所以 workInProgressRoot === root 说明了正在渲染(render + commit)，
      * 如果这个时候来了一个更新，那么除非需要将这个更新推迟到下次再处理，否则在root行标记一下有一个更新任务。
      * */
      if (
        deferRenderPhaseUpdateToNextBatch ||
        (executionContext & RenderContext) === NoContext
      ) {
        // 假设现在没在渲染，或者需要将update推迟到下次再渲染，那么把lane放进workInProgressRootUpdatedLanes中
        workInProgressRootUpdatedLanes = mergeLanes(
          workInProgressRootUpdatedLanes,
          lane,
        );
      }
      if (workInProgressRootExitStatus === RootSuspendedWithDelay) {
        // The root already suspended with a delay, which means this render
        // definitely won't finish. Since we have a new update, let's mark it as
        // suspended now, right before marking the incoming update. This has the
        // effect of interrupting the current render and switching to the update.
        // TODO: Make sure this doesn't override pings that happen while we've
        // already started rendering.

        /**
         * root已经挂起并延迟，这意味着这次渲染肯定不会完成。由于我们有一个新的update，在标记下
         * 一个update之前将它标记为挂起。这样做的效果是中断当前的渲染并切换到更新。
         * TODO 确保这不会覆盖在我们之前已经开始渲染的工作。
        * */
        markRootSuspended(root, workInProgressRootRenderLanes);
      }
    }
  }

  return root;
}

// Use this function to schedule a task for a root. There's only one task per
// root; if a task was already scheduled, we'll check to make sure the
// expiration time of the existing task is the same as the expiration time of
// the next level that the root has work on. This function is called on every
// update, and right before exiting a task.
/**
 * 使用此函数为root节点调度任务。每个root节点
 * 只有一个任务；如果任务已经被调度，将进行校验
 * 以确保现有任务的过时间与root节点所处理的下
 * 一个级别的过期时间相同。在每次更新时以及退出
 * 任务之前都会调用此函数。
* */
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {
  // 先取到已经被调度的任务 existingCallbackNode是正在进行调度的任务
  const existingCallbackNode = root.callbackNode;
  // Check if any lanes are being starved by other work. If so, mark them as
  // expired so we know to work on those next.
  // 如果有被阻塞的优先级，标记到root.expiredLanes中，这样这些update就可以被立即处理了
  markStarvedLanesAsExpired(root, currentTime);
  // Determine the next lanes to work on, and their priority.
  // 确定新更新任务的渲染优先级
  const newCallbackId = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );
  // This returns the priority level computed during the `getNextLanes` call.
  // returnNextLanesPriority的返回值在上边调用getNextLanes的时候会被计算出来
  // 获取新更新任务的任务优先级
  const newCallbackPriority = returnNextLanesPriority();
  // 没有新任务，退出调度
  if (newCallbackId === NoLanes) {
    // Special case: There's nothing to work on.
    // 不需要有所更新的话
    if (existingCallbackNode !== null) {
      cancelCallback(existingCallbackNode);
      root.callbackNode = null;
      root.callbackPriority = NoLanePriority;
      root.callbackId = NoLanes;
    }
    return;
  }

  // Check if there's an existing task. We may be able to reuse it.
  // 检查现有任务的渲染优先级
  const existingCallbackId = root.callbackId;
  const existingCallbackPriority = root.callbackPriority;
  // console.log(newCallbackId, newCallbackPriority, existingCallbackId, existingCallbackPriority);
  if (existingCallbackId !== NoLanes) {
    if (newCallbackId === existingCallbackId) {
      // This task is already scheduled. Let's check its priority.
      // 任务已经被调度，检查它的优先级
      // 新旧任务的优先级相等，且旧任务的优先级等于新任务的优先级，return ，不用对
      // 现有的新任务做插队操作，因为优先级相同
      if (existingCallbackPriority === newCallbackPriority) {
        return;
      }
      // The task ID is the same but the priority changed. Cancel the existing
      // callback. We'll schedule a new one below.
    }
    // 优先级变化了，取消之前的调度，然后在下边重新调度一个任务，实现高优先级插队
    cancelCallback(existingCallbackNode);
  }
  // Schedule a new callback.
  let newCallbackNode;
  if (newCallbackPriority === SyncLanePriority) {
    // 如果是同步优先级任务，要同步执行render阶段
    // Special case: Sync React callbacks are scheduled on a special internal queue
    // 特例：同步的react回调调度在一个特殊的内部队列上
    newCallbackNode = scheduleSyncCallback(
      performSyncWorkOnRoot.bind(null, root),
    );
  } else {
    // 获取本次调度的优先级，它由本次更新的优先级计算得出
    const schedulerPriorityLevel = lanePriorityToSchedulerPriority(
      newCallbackPriority,
    );
    // 根据任务优先级异步执行render阶段
    newCallbackNode = scheduleCallback(
      schedulerPriorityLevel,
      performConcurrentWorkOnRoot.bind(null, root),
    );
  }
  root.callbackId = newCallbackId;
  root.callbackPriority = newCallbackPriority;
  root.callbackNode = newCallbackNode;
}

// This is the entry point for every concurrent task, i.e. anything that
// goes through Scheduler.
// 这是每个并发任务进入调度的入口，会被作为task放入taskQueue中，然后请求主线程回调来执行taskQueue中的任务
function performConcurrentWorkOnRoot(root, didTimeout) {
  // Since we know we're in a React event, we can clear the current
  // console.log(root.expirationTimes);
  // event time. The next update will compute a new event time.
  currentEventTime = NoTimestamp;
  // currentEventTime 是事件触发时计算的时间，会被用来计算过期时间。如果在执行工作
  // 循环，那么由于调度更新的时候已经计算了本次更新的过期时间，那么再计算就没有意义了，
  // 下次更新的时候再计算
  currentEventWipLanes = NoLanes;

  currentEventPendingLanes = NoLanes;

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Should not already be working.',
  );

  // Flush any pending passive effects before deciding which lanes to work on,
  // in case they schedule additional work.
  flushPassiveEffects();

  // Determine the next expiration time to work on, using the fields stored on the root.
  /*
  * 获取渲染优先级
  * */
  let lanes = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );
  if (lanes === NoLanes) {
    return null;
  }

  // TODO: We only check `didTimeout` defensively, to account for a Scheduler
  // bug where `shouldYield` sometimes returns `true` even if `didTimeout` is
  // true, which leads to an infinite loop. Once the bug in Scheduler is
  // fixed, we can remove this, since we track expiration ourselves.
  if (didTimeout) {
    // Something expired. Flush synchronously until there's no expired
    // work left.
    markRootExpired(root, lanes);
    // This will schedule a synchronous callback.
    ensureRootIsScheduled(root, now());
    return null;
  }

  const originalCallbackNode = root.callbackNode;
  let exitStatus = renderRootConcurrent(root, lanes);

  if (
    includesSomeLane(
      workInProgressRootIncludedLanes,
      workInProgressRootUpdatedLanes,
    )
  ) {
    // The render included lanes that were updated during the render phase.
    // For example, when unhiding a hidden tree, we include all the lanes
    // that were previously skipped when the tree was hidden. That set of
    // lanes is a superset of the lanes we started rendering with.
    //
    // So we'll throw out the current work and restart.
    prepareFreshStack(root, NoLanes);
  } else if (exitStatus !== RootIncomplete) {
    if (exitStatus === RootErrored) {
      executionContext |= RetryAfterError;

      // If an error occurred during hydration,
      // discard server response and fall back to client side render.
      if (root.hydrate) {
        root.hydrate = false;
        clearContainer(root.containerInfo);
      }

      // If something threw an error, try rendering one more time. We'll render
      // synchronously to block concurrent data mutations, and we'll includes
      // all pending updates are included. If it still fails after the second
      // attempt, we'll give up and commit the resulting tree.
      lanes = getLanesToRetrySynchronouslyOnError(root);
      if (lanes !== NoLanes) {
        exitStatus = renderRootSync(root, lanes);
      }
    }

    if (exitStatus === RootFatalErrored) {
      const fatalError = workInProgressRootFatalError;
      prepareFreshStack(root, NoLanes);
      markRootSuspended(root, lanes);
      ensureRootIsScheduled(root, now());
      throw fatalError;
    }

    // We now have a consistent tree. The next step is either to commit it,
    // or, if something suspended, wait to commit it after a timeout.
    const finishedWork: Fiber = (root.current.alternate: any);
    root.finishedWork = finishedWork;
    root.finishedLanes = lanes;
    finishConcurrentRender(root, finishedWork, exitStatus, lanes);
  }

  ensureRootIsScheduled(root, now());
  // console.log('root.callbackNode', root.callbackNode);
  if (root.callbackNode === originalCallbackNode) {
    // The task node scheduled for this root is the same one that's
    // currently executed. Need to return a continuation.
    // 如果为root调度的任务节点和当前执行的是同一个，
    // 说明是正在从root开始处理，那么就要接着往下处理，
    // 所以要继续执行任务
    return performConcurrentWorkOnRoot.bind(null, root);
  }
  return null;
}

function finishConcurrentRender(root, finishedWork, exitStatus, lanes) {
  switch (exitStatus) {
    case RootIncomplete:
    case RootFatalErrored: {
      invariant(false, 'Root did not complete. This is a bug in React.');
    }
    // Flow knows about invariant, so it complains if I add a break
    // statement, but eslint doesn't know about invariant, so it complains
    // if I do. eslint-disable-next-line no-fallthrough
    case RootErrored: {
      // We should have already attempted to retry this tree. If we reached
      // this point, it errored again. Commit it.
      commitRoot(root);
      break;
    }
    case RootSuspended: {
      markRootSuspended(root, lanes);

      // We have an acceptable loading state. We need to figure out if we
      // should immediately commit it or wait a bit.
      // 加载状态可以被接受，需要考虑的是应该立即提交还是等一会再提交
      // If we have processed new updates during this render, we may now
      // have a new loading state ready. We want to ensure that we commit
      // that as soon as possible.
      // 如果我们在渲染期间处理了新的更新，现在可能有一个新的加载状态准备好了。我们希望确保我们尽快commit。
      const hasNotProcessedNewUpdates =
        workInProgressRootLatestProcessedEventTime === NoTimestamp;
      if (
        hasNotProcessedNewUpdates &&
        // do not delay if we're inside an act() scope
        !shouldForceFlushFallbacksInDEV()
      ) {
        // If we have not processed any new updates during this pass, then
        // this is either a retry of an existing fallback state or a
        // hidden tree. Hidden trees shouldn't be batched with other work
        // and after that's fixed it can only be a retry. We're going to
        // throttle committing retries so that we don't show too many
        // loading states too quickly.
        /*
        * 如果我们在此过程中没有处理任何新的更新，那么这要么是对现有的回退状态的重试，
        * 要么是对隐藏树的重试。隐藏的树不应该与其他工作批处理，在那之后，只能重试。
        * 我们将限制提交重试，这样就不会太快地显示太多加载状态。
        * */
        const msUntilTimeout =
          globalMostRecentFallbackTime + FALLBACK_THROTTLE_MS - now();
        // Don't bother with a very short suspense time.
        if (msUntilTimeout > 10) {
          const nextLanes = getNextLanes(root, NoLanes);
          if (nextLanes !== NoLanes) {
            // There's additional work on this root.
            break;
          }
          const suspendedLanes = root.suspendedLanes;
          if (!isSubsetOfLanes(suspendedLanes, lanes)) {
            // We should prefer to render the fallback of at the last
            // suspended level. Ping the last suspended level to try
            // rendering it again.
            // FIXME: What if the suspended lanes are Idle? Should not restart.
            const eventTime = requestEventTime();
            markRootPinged(root, suspendedLanes, eventTime);
            break;
          }

          // The render is suspended, it hasn't timed out, and there's no
          // lower priority work to do. Instead of committing the fallback
          // immediately, wait for more data to arrive.
          root.timeoutHandle = scheduleTimeout(
            commitRoot.bind(null, root),
            msUntilTimeout,
          );
          break;
        }
      }
      // The work expired. Commit immediately.
      commitRoot(root);
      break;
    }
    case RootSuspendedWithDelay: {
      markRootSuspended(root, lanes);

      if (
        // do not delay if we're inside an act() scope
        !shouldForceFlushFallbacksInDEV()
      ) {
        // We're suspended in a state that should be avoided. We'll try to
        // avoid committing it for as long as the timeouts let us.
        const nextLanes = getNextLanes(root, NoLanes);
        if (nextLanes !== NoLanes) {
          // There's additional work on this root.
          break;
        }
        const suspendedLanes = root.suspendedLanes;
        if (!isSubsetOfLanes(suspendedLanes, lanes)) {
          // We should prefer to render the fallback of at the last
          // suspended level. Ping the last suspended level to try
          // rendering it again.
          // FIXME: What if the suspended lanes are Idle? Should not restart.
          const eventTime = requestEventTime();
          markRootPinged(root, suspendedLanes, eventTime);
          break;
        }

        let msUntilTimeout;
        if (workInProgressRootLatestSuspenseTimeout !== NoTimestamp) {
          // We have processed a suspense config whose expiration time we
          // can use as the timeout.
          msUntilTimeout = workInProgressRootLatestSuspenseTimeout - now();
        } else if (workInProgressRootLatestProcessedEventTime === NoTimestamp) {
          // This should never normally happen because only new updates
          // cause delayed states, so we should have processed something.
          // However, this could also happen in an offscreen tree.
          msUntilTimeout = 0;
        } else {
          // If we didn't process a suspense config, compute a JND based on
          // the amount of time elapsed since the most recent event time.
          const eventTimeMs = workInProgressRootLatestProcessedEventTime;
          const timeElapsedMs = now() - eventTimeMs;
          msUntilTimeout = jnd(timeElapsedMs) - timeElapsedMs;
        }

        // Don't bother with a very short suspense time.
        if (msUntilTimeout > 10) {
          // The render is suspended, it hasn't timed out, and there's no
          // lower priority work to do. Instead of committing the fallback
          // immediately, wait for more data to arrive.
          root.timeoutHandle = scheduleTimeout(
            commitRoot.bind(null, root),
            msUntilTimeout,
          );
          break;
        }
      }
      // The work expired. Commit immediately.
      commitRoot(root);
      break;
    }
    case RootCompleted: {
      // The work completed. Ready to commit.
      if (
        // do not delay if we're inside an act() scope
        !shouldForceFlushFallbacksInDEV() &&
        workInProgressRootLatestProcessedEventTime !== NoTimestamp &&
        workInProgressRootCanSuspendUsingConfig !== null
      ) {
        // If we have exceeded the minimum loading delay, which probably
        // means we have shown a spinner already, we might have to suspend
        // a bit longer to ensure that the spinner is shown for
        // enough time.
        const msUntilTimeout = computeMsUntilSuspenseLoadingDelay(
          workInProgressRootLatestProcessedEventTime,
          workInProgressRootCanSuspendUsingConfig,
        );
        if (msUntilTimeout > 10) {
          markRootSuspended(root, lanes);
          root.timeoutHandle = scheduleTimeout(
            commitRoot.bind(null, root),
            msUntilTimeout,
          );
          break;
        }
      }
      commitRoot(root);
      break;
    }
    default: {
      invariant(false, 'Unknown root exit status.');
    }
  }
}

function markRootSuspended(root, suspendedLanes) {
  // When suspending, we should always exclude lanes that were pinged or (more
  // rarely, since we try to avoid it) updated during the render phase.
  // TODO: Lol maybe there's a better way to factor this besides this
  // obnoxiously named function :)
  // 当挂起时，需要把那些在渲染阶段被触发或者被更新的lanes除去。
  suspendedLanes = removeLanes(suspendedLanes, workInProgressRootPingedLanes);
  suspendedLanes = removeLanes(suspendedLanes, workInProgressRootUpdatedLanes);
  markRootSuspended_dontCallThisOneDirectly(root, suspendedLanes);
}

// This is the entry point for synchronous tasks that don't go through Scheduler
// 这是不经过Scheduler的同步任务的入口点

function performSyncWorkOnRoot(root) {
  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Should not already be working.',
  );
  // 刷新被动的副作用
  flushPassiveEffects();
  let lanes;
  let exitStatus; // 声明一个状态，来保存render阶段完成时的状态，对某些错误做特定处理
  if (
    root === workInProgressRoot &&
    includesSomeLane(root.expiredLanes, workInProgressRootRenderLanes)
  ) {
    // There's a partial tree, and at least one of its lanes has expired. Finish
    // rendering it before rendering the rest of the expired work.
    // 这是一个不完整的tree，至少有一个lanes已经过期了，在渲染剩余的过期任务之前完成渲染
    lanes = workInProgressRootRenderLanes;
    exitStatus = renderRootSync(root, lanes);
    if (
      includesSomeLane(
        workInProgressRootIncludedLanes,
        workInProgressRootUpdatedLanes,
      )
    ) {
      // The render included lanes that were updated during the render phase.
      // For example, when unhiding a hidden tree, we include all the lanes
      // that were previously skipped when the tree was hidden. That set of
      // lanes is a superset of the lanes we started rendering with.
      // 本次渲染包含渲染阶段被更新的lanes，例如，当显示一个隐藏的树的时候，将会包含
      // 这棵树当时被隐藏时跳过的所有lanes。这组lanes是开始渲染时的lanes的超集。
      //
      // Note that this only happens when part of the tree is rendered
      // concurrently. If the whole tree is rendered synchronously, then there
      // are no interleaved events.
      // 只有当树的一部分是并发渲染的时候才会发生这种情况，如果整棵树是同步渲染的，
      // 将不会发生交叉事件
      lanes = getNextLanes(root, lanes);
      exitStatus = renderRootSync(root, lanes);
    }
  } else {
    lanes = getNextLanes(root, NoLanes);
    exitStatus = renderRootSync(root, lanes);
  }
  // 有错误的情况
  if (root.tag !== LegacyRoot && exitStatus === RootErrored) {
    executionContext |= RetryAfterError;

    // If an error occurred during hydration,
    // discard server response and fall back to client side render.
    // 一旦hydrate过程中出现了错误，放弃服务端返回的内容并启用客户端渲染。
    // 这是服务端渲染相关的逻辑，ReactDOM.hydrate会复用服务端发来的HTML结构。
    if (root.hydrate) {
      root.hydrate = false;
      clearContainer(root.containerInfo);
    }

    // If something threw an error, try rendering one more time. We'll render
    // synchronously to block concurrent data mutations, and we'll includes
    // all pending updates are included. If it still fails after the second
    // attempt, we'll give up and commit the resulting tree.
    // 如果有错误，再重新渲染一次，使用同步渲染来阻止并发的数据变化。这将包括所有
    // 等待处理的更新，如果在第二次尝试后仍然失败，那么直接放弃，然后提交当前已
    // 经渲染的tree。
    lanes = getLanesToRetrySynchronouslyOnError(root);
    if (lanes !== NoLanes) {
      exitStatus = renderRootSync(root, lanes);
    }
  }

  if (exitStatus === RootFatalErrored)  {
    const fatalError = workInProgressRootFatalError;
    prepareFreshStack(root, NoLanes);
    markRootSuspended(root, lanes);
    ensureRootIsScheduled(root, now());
    throw fatalError;
  }

  // We now have a consistent tree. Because this is a sync render, we
  // will commit it even if something suspended.
  const finishedWork: Fiber = (root.current.alternate: any);
  root.finishedWork = finishedWork;
  root.finishedLanes = lanes;
  // 进入commit阶段
  commitRoot(root);

  // Before exiting, make sure there's a callback scheduled for the next
  // pending level.
  // 再次对fiberRoot进行调度(退出之前保证fiberRoot没有需要调度的任务)
  ensureRootIsScheduled(root, now());
  return null;
}

export function flushRoot(root: FiberRoot, lanes: Lanes) {
  markRootExpired(root, lanes);
  ensureRootIsScheduled(root, now());
  if ((executionContext & (RenderContext | CommitContext)) === NoContext) {
    flushSyncCallbackQueue();
  }
}

export function getExecutionContext(): ExecutionContext {
  return executionContext;
}

export function flushDiscreteUpdates() {
  // TODO: Should be able to flush inside batchedUpdates, but not inside `act`.
  // However, `act` uses `batchedUpdates`, so there's no way to distinguish
  // those two cases. Need to fix this before exposing flushDiscreteUpdates
  // as a public API.
  if (
    (executionContext & (BatchedContext | RenderContext | CommitContext)) !==
    NoContext
  ) {
    if (__DEV__) {
      if ((executionContext & RenderContext) !== NoContext) {
        console.error(
          'unstable_flushDiscreteUpdates: Cannot flush updates when React is ' +
            'already rendering.',
        );
      }
    }
    // We're already rendering, so we can't synchronously flush pending work.
    // This is probably a nested event dispatch triggered by a lifecycle/effect,
    // like `el.focus()`. Exit.
    return;
  }
  flushPendingDiscreteUpdates();
  // If the discrete updates scheduled passive effects, flush them now so that
  // they fire before the next serial event.
  flushPassiveEffects();
}

export function deferredUpdates<A>(fn: () => A): A {
  // TODO: Remove in favor of Scheduler.next
  return runWithPriority(NormalSchedulerPriority, fn);
}

function flushPendingDiscreteUpdates() {
  if (rootsWithPendingDiscreteUpdates !== null) {
    // For each root with pending discrete updates, schedule a callback to
    // immediately flush them.
    const roots = rootsWithPendingDiscreteUpdates;
    rootsWithPendingDiscreteUpdates = null;
    roots.forEach(root => {
      markDiscreteUpdatesExpired(root);
      ensureRootIsScheduled(root, now());
    });
  }
  // Now flush the immediate queue.
  flushSyncCallbackQueue();
}

export function batchedUpdates<A, R>(fn: A => R, a: A): R {
  const prevExecutionContext = executionContext;
  executionContext |= BatchedContext;
  try {
    return fn(a);
  } finally {
    executionContext = prevExecutionContext;
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      flushSyncCallbackQueue();
    }
  }
}

export function batchedEventUpdates<A, R>(fn: A => R, a: A): R {
  const prevExecutionContext = executionContext;
  executionContext |= EventContext;
  try {
    return fn(a);
  } finally {
    executionContext = prevExecutionContext;
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      flushSyncCallbackQueue();
    }
  }
}

export function discreteUpdates<A, B, C, D, R>(
  fn: (A, B, C) => R,
  a: A,
  b: B,
  c: C,
  d: D,
): R {
  /*
  * fn: dispatchEvent
  * a: 'click'
  * b: 1
  * c: App组件的原生DOM节点
  * d: 事件对象
  * */
  const prevExecutionContext = executionContext;
  executionContext |= DiscreteEventContext;
  try {
    // Should this
    return runWithPriority(
      UserBlockingSchedulerPriority,
      fn.bind(null, a, b, c, d),
    );
  } finally {
    executionContext = prevExecutionContext;
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      flushSyncCallbackQueue();
    }
  }
}

export function unbatchedUpdates<A, R>(fn: (a: A) => R, a: A): R {
  const prevExecutionContext = executionContext;
  executionContext &= ~BatchedContext;
  executionContext |= LegacyUnbatchedContext;
  try {
    return fn(a);
  } finally {
    executionContext = prevExecutionContext;
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      flushSyncCallbackQueue();
    }
  }
}

export function flushSync<A, R>(fn: A => R, a: A): R {
  const prevExecutionContext = executionContext;
  if ((prevExecutionContext & (RenderContext | CommitContext)) !== NoContext) {
    if (__DEV__) {
      console.error(
        'flushSync was called from inside a lifecycle method. React cannot ' +
          'flush when React is already rendering. Consider moving this call to ' +
          'a scheduler task or micro task.',
      );
    }
    return fn(a);
  }
  executionContext |= BatchedContext;
  try {
    if (fn) {
      return runWithPriority(ImmediateSchedulerPriority, fn.bind(null, a));
    } else {
      return (undefined: $FlowFixMe);
    }
  } finally {
    executionContext = prevExecutionContext;
    // Flush the immediate callbacks that were scheduled during this batch.
    // Note that this will happen even if batchedUpdates is higher up
    // the stack.
    flushSyncCallbackQueue();
  }
}

export function flushControlled(fn: () => mixed): void {
  const prevExecutionContext = executionContext;
  executionContext |= BatchedContext;
  try {
    runWithPriority(ImmediateSchedulerPriority, fn);
  } finally {
    executionContext = prevExecutionContext;
    if (executionContext === NoContext) {
      // Flush the immediate callbacks that were scheduled during this batch
      flushSyncCallbackQueue();
    }
  }
}

export function pushRenderLanes(fiber: Fiber, lanes: Lanes) {
  pushToStack(subtreeRenderLanesCursor, subtreeRenderLanes, fiber);
  subtreeRenderLanes = mergeLanes(subtreeRenderLanes, lanes);
  workInProgressRootIncludedLanes = mergeLanes(
    workInProgressRootIncludedLanes,
    lanes,
  );
}

export function popRenderLanes(fiber: Fiber) {
  subtreeRenderLanes = subtreeRenderLanesCursor.current;
  popFromStack(subtreeRenderLanesCursor, fiber);
}

function prepareFreshStack(root: FiberRoot, lanes: Lanes) {
  root.finishedWork = null;
  root.finishedLanes = NoLanes;

  const timeoutHandle = root.timeoutHandle;
  if (timeoutHandle !== noTimeout) {
    // The root previous suspended and scheduled a timeout to commit a fallback
    // state. Now that we have additional work, cancel the timeout.
    root.timeoutHandle = noTimeout;
    // $FlowFixMe Complains noTimeout is not a TimeoutID, despite the check above
    cancelTimeout(timeoutHandle);
  }

  if (workInProgress !== null) {
    let interruptedWork = workInProgress.return;
    while (interruptedWork !== null) {
      unwindInterruptedWork(interruptedWork);
      interruptedWork = interruptedWork.return;
    }
  }
  workInProgressRoot = root;
  workInProgress = createWorkInProgress(root.current, null);
  workInProgressRootRenderLanes = subtreeRenderLanes = workInProgressRootIncludedLanes = lanes;
  workInProgressRootExitStatus = RootIncomplete;
  workInProgressRootFatalError = null;
  workInProgressRootLatestProcessedEventTime = NoTimestamp;
  workInProgressRootLatestSuspenseTimeout = NoTimestamp;
  workInProgressRootCanSuspendUsingConfig = null;
  workInProgressRootSkippedLanes = NoLanes;
  workInProgressRootUpdatedLanes = NoLanes;
  workInProgressRootPingedLanes = NoLanes;

  if (enableSchedulerTracing) {
    spawnedWorkDuringRender = null;
  }

  if (__DEV__) {
    ReactStrictModeWarnings.discardPendingWarnings();
  }
}

function handleError(root, thrownValue): void {
  do {
    // 记录下当前出错的WIP节点
    let erroredWork = workInProgress;
    try {
      // Reset module-level state that was set during the render phase.
      resetContextDependencies();
      resetHooksAfterThrow();
      resetCurrentDebugFiberInDEV();
      // TODO: I found and added this missing line while investigating a
      // separate issue. Write a regression test using string refs.
      ReactCurrentOwner.current = null;

      if (erroredWork === null || erroredWork.return === null) {
        // 致命错误，要么是当前的WIP节点为null，要么是WIP的父级节点为null。
        // Expected to be working on a non-root fiber. This is a fatal error
        // because there's no ancestor that can handle it; the root is
        // supposed to capture all errors that weren't caught by an error
        // boundary.
        workInProgressRootExitStatus = RootFatalErrored;
        workInProgressRootFatalError = thrownValue;
        // Set `workInProgress` to null. This represents advancing to the next
        // sibling, or the parent if there are no siblings. But since the root
        // has no siblings nor a parent, we set it to null. Usually this is
        // handled by `completeUnitOfWork` or `unwindWork`, but since we're
        // intentionally not calling those, we need set it here.
        /*
        * 将WIP节点设置为null，这表示将处理它的sibling，如果没有sibling，则返回到父级。
        * 但是由于根节点既没有sibling也没有父级，所以我们将它设置成null，
        * */
        // TODO: Consider calling `unwindWork` to pop the contexts.
        workInProgress = null;
        return;
      }

      if (enableProfilerTimer && erroredWork.mode & ProfileMode) {
        // 开启React性能分析工具相关，暂时不管
        // Record the time spent rendering before an error was thrown. This
        // avoids inaccurate Profiler durations in the case of a
        // suspended render.
        stopProfilerTimerIfRunningAndRecordDelta(erroredWork, true);
      }
      /*
      * 给当前出错的WIP节点添加上 Incomplete 的effectTag
      * 置空它上面的effectList，对于可以处理错误的组件，添加上ShouldCapture 的 effectTag
      * */
      throwException(
        root,
        erroredWork.return,
        erroredWork,
        thrownValue,
        workInProgressRootRenderLanes,
      );
      // 将错误终止到当前出错的节点
      completeUnitOfWork(erroredWork);
    } catch (yetAnotherThrownValue) {
      // Something in the return path also threw.
      thrownValue = yetAnotherThrownValue;
      if (workInProgress === erroredWork && erroredWork !== null) {
        // If this boundary has already errored, then we had trouble processing
        // the error. Bubble it to the next boundary.
        erroredWork = erroredWork.return;
        workInProgress = erroredWork;
      } else {
        erroredWork = workInProgress;
      }
      continue;
    }
    // Return to the normal work loop.
    return;
  } while (true);
}

function pushDispatcher(root) {
  const prevDispatcher = ReactCurrentDispatcher.current;
  ReactCurrentDispatcher.current = ContextOnlyDispatcher;
  if (prevDispatcher === null) {
    // The React isomorphic package does not include a default dispatcher.
    // Instead the first renderer will lazily attach one, in order to give
    // nicer error messages.
    return ContextOnlyDispatcher;
  } else {
    return prevDispatcher;
  }
}

function popDispatcher(prevDispatcher) {
  ReactCurrentDispatcher.current = prevDispatcher;
}

function pushInteractions(root) {
  if (enableSchedulerTracing) {
    const prevInteractions: Set<Interaction> | null = __interactionsRef.current;
    __interactionsRef.current = root.memoizedInteractions;
    return prevInteractions;
  }
  return null;
}

function popInteractions(prevInteractions) {
  if (enableSchedulerTracing) {
    __interactionsRef.current = prevInteractions;
  }
}

export function markCommitTimeOfFallback() {
  globalMostRecentFallbackTime = now();
}

export function markRenderEventTimeAndConfig(
  eventTime: number,
  suspenseConfig: null | SuspenseConfig,
): void {
  // Track the most recent event time of all updates processed in this batch.
  if (workInProgressRootLatestProcessedEventTime < eventTime) {
    workInProgressRootLatestProcessedEventTime = eventTime;
  }

  // Track the largest/latest timeout deadline in this batch.
  // TODO: If there are two transitions in the same batch, shouldn't we
  // choose the smaller one? Maybe this is because when an intermediate
  // transition is superseded, we should ignore its suspense config, but
  // we don't currently.
  if (suspenseConfig !== null) {
    // If `timeoutMs` is not specified, we default to 5 seconds. We have to
    // resolve this default here because `suspenseConfig` is owned
    // by userspace.
    // TODO: Store this on the root instead (transition -> timeoutMs)
    // TODO: Should this default to a JND instead?
    const timeoutMs = suspenseConfig.timeoutMs | 0 || DEFAULT_TIMEOUT_MS;
    const timeoutTime = eventTime + timeoutMs;
    if (timeoutTime > workInProgressRootLatestSuspenseTimeout) {
      workInProgressRootLatestSuspenseTimeout = timeoutTime;
      workInProgressRootCanSuspendUsingConfig = suspenseConfig;
    }
  }
}

export function markSkippedUpdateLanes(lane: Lane | Lanes): void {
  workInProgressRootSkippedLanes = mergeLanes(
    lane,
    workInProgressRootSkippedLanes,
  );
}

export function renderDidSuspend(): void {
  if (workInProgressRootExitStatus === RootIncomplete) {
    workInProgressRootExitStatus = RootSuspended;
  }
}

export function renderDidSuspendDelayIfPossible(): void {
  if (
    workInProgressRootExitStatus === RootIncomplete ||
    workInProgressRootExitStatus === RootSuspended
  ) {
    workInProgressRootExitStatus = RootSuspendedWithDelay;
  }

  // Check if there are updates that we skipped tree that might have unblocked
  // this render.
  if (
    workInProgressRoot !== null &&
    (hasUpdatePriority(workInProgressRootSkippedLanes) ||
      hasUpdatePriority(workInProgressRootUpdatedLanes))
  ) {
    // Mark the current render as suspended so that we switch to working on
    // the updates that were skipped. Usually we only suspend at the end of
    // the render phase.
    // TODO: We should probably always mark the root as suspended immediately
    // (inside this function), since by suspending at the end of the render
    // phase introduces a potential mistake where we suspend lanes that were
    // pinged or updated while we were rendering.
    markRootSuspended(workInProgressRoot, workInProgressRootRenderLanes);
  }
}

export function renderDidError() {
  if (workInProgressRootExitStatus !== RootCompleted) {
    workInProgressRootExitStatus = RootErrored;
  }
}

// Called during render to determine if anything has suspended.
// Returns false if we're not sure.
export function renderHasNotSuspendedYet(): boolean {
  // If something errored or completed, we can't really be sure,
  // so those are false.
  return workInProgressRootExitStatus === RootIncomplete;
}

function renderRootSync(root: FiberRoot, lanes: Lanes) {
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;
  const prevDispatcher = pushDispatcher(root);

  // If the root or lanes have changed, throw out the existing stack
  // and prepare a fresh one. Otherwise we'll continue where we left off.
  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    prepareFreshStack(root, lanes);
    startWorkOnPendingInteractions(root, lanes);
  }

  const prevInteractions = pushInteractions(root);

  do {
    try {
      workLoopSync();
      break;
    } catch (thrownValue) {
      // 渲染报错
      handleError(root, thrownValue);
    }
  } while (true);
  resetContextDependencies();
  if (enableSchedulerTracing) {
    popInteractions(((prevInteractions: any): Set<Interaction>));
  }

  executionContext = prevExecutionContext;
  popDispatcher(prevDispatcher);

  if (workInProgress !== null) {
    // This is a sync render, so we should have finished the whole tree.
    invariant(
      false,
      'Cannot commit an incomplete root. This error is likely caused by a ' +
        'bug in React. Please file an issue.',
    );
  }

  // Set this to null to indicate there's no in-progress render.
  workInProgressRoot = null;
  workInProgressRootRenderLanes = NoLanes;

  return workInProgressRootExitStatus;
}

// The work loop is an extremely hot path. Tell Closure not to inline it.
/** @noinline */
function workLoopSync() {
  // Already timed out, so perform work without checking if we need to yield.
  // 已经超时了，所以不用检查是否需要让出执行权
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

function renderRootConcurrent(root: FiberRoot, lanes: Lanes) {
  const prevExecutionContext = executionContext;
  executionContext |= RenderContext;
  const prevDispatcher = pushDispatcher(root);

  // If the root or lanes have changed, throw out the existing stack
  // and prepare a fresh one. Otherwise we'll continue where we left off.
  // workInProgressRoot表示起点，由于是从root开始向下处理任务，当上次处理完成时，
  // workInProgressRoot会被置为null，所以本次处理需要将起点重新设置为root
  /*
  * prepareFreshStack会做一些本次任务循环相关的初始化工作
  * */
  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    prepareFreshStack(root, lanes);
    startWorkOnPendingInteractions(root, lanes);
  }

  const prevInteractions = pushInteractions(root);

  do {
    try {
      workLoopConcurrent();
      break;
    } catch (thrownValue) {
      handleError(root, thrownValue);
    }
  } while (true);
  resetContextDependencies();
  if (enableSchedulerTracing) {
    popInteractions(((prevInteractions: any): Set<Interaction>));
  }

  popDispatcher(prevDispatcher);
  executionContext = prevExecutionContext;

  // Check if the tree has completed.
  // 判断渲染是否结束
  if (workInProgress !== null) {
    // Still work remaining.
    return RootIncomplete;
  } else {
    // Completed the tree.
    // Set this to null to indicate there's no in-progress render.
    // 完成渲染之后，将workInProgressRoot 和 workInProgressRoot上正在渲染的lanes置为空，
    // 表示渲染已经结束
    workInProgressRoot = null;
    workInProgressRootRenderLanes = NoLanes;
    // Return the final exit status.
    // 返回最终的结束状态
    // 最终再completeUnitOfWork中，当处理到root节点时，
    // workInProgressRootExitStatus 会被赋值为RootCompleted，
    // 表示已经完成整棵树的任务
    return workInProgressRootExitStatus;
  }
}

/** @noinline */
function workLoopConcurrent() {
  // Perform work until Scheduler asks us to yield
  // 构建workInProgress Fiber树的循环，直到Scheduler通知需要让出执行权
  // workInProgress会记录上一次处理到的fiber节点，方便让出执行权恢复后再继续处理
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}

function performUnitOfWork(unitOfWork: Fiber): void {
  // The current, flushed, state of this fiber is the alternate. Ideally
  // nothing should rely on this, but relying on it here means that we don't
  // need an additional field on the work in progress.
  const current = unitOfWork.alternate;
  setCurrentDebugFiberInDEV(unitOfWork);

  let next;
  // beginWork阶段
  if (enableProfilerTimer && (unitOfWork.mode & ProfileMode) !== NoMode) {
    startProfilerTimer(unitOfWork);
    next = beginWork(current, unitOfWork, subtreeRenderLanes);
    stopProfilerTimerIfRunningAndRecordDelta(unitOfWork, true);
  } else {
    next = beginWork(current, unitOfWork, subtreeRenderLanes);
  }

  resetCurrentDebugFiberInDEV();
  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  if (next === null) {
    // If this doesn't spawn new work, complete the current work.
    // complete阶段
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }

  ReactCurrentOwner.current = null;
}

function completeUnitOfWork(unitOfWork: Fiber): void {
  // Attempt to complete the current unit of work, then move to the next
  // sibling. If there are no more siblings, return to the parent fiber.
  /*
  * 完成当前的工作单元，然后去处理下一个兄弟节点，如果没有兄弟节点，return到上级
  * Fiber节点
  * */
  let completedWork = unitOfWork;
  do {
    // The current, flushed, state of this fiber is the alternate. Ideally
    // nothing should rely on this, but relying on it here means that we don't
    // need an additional field on the work in progress.
    // 获取到current节点
    const current = completedWork.alternate;
    // 获取到父级节点
    const returnFiber = completedWork.return;

    // Check if the work completed or if something threw.
    if ((completedWork.effectTag & Incomplete) === NoEffect) {
      // 当前工作单元（Fiber）的任务已经完成
      setCurrentDebugFiberInDEV(completedWork);
      let next;
      // 是否开启React性能分析工具相关
      if (
        !enableProfilerTimer ||
        (completedWork.mode & ProfileMode) === NoMode
      ) {
        next = completeWork(current, completedWork, subtreeRenderLanes);
      } else {
        startProfilerTimer(completedWork);
        // 更新节点的属性，绑定事件等，将属性作为updateQueue挂载到WIP节点上
        // 结构为：[ 'style', { color: 'blue' }, onClick, this.handleClick ]
        next = completeWork(current, completedWork, subtreeRenderLanes);
        // Update render duration assuming we didn't error.
        stopProfilerTimerIfRunningAndRecordDelta(completedWork, false);
      }
      resetCurrentDebugFiberInDEV();

      if (next !== null) {
        // Completing this fiber spawned new work. Work on that next.
        workInProgress = next;
        return;
      }
      // 收集WIP节点的lanes，不漏掉被跳过的update的lanes，便于再次发起调度
      resetChildLanes(completedWork);

      if (
        returnFiber !== null &&
        // Do not append effects to parents if a sibling failed to complete
        (returnFiber.effectTag & Incomplete) === NoEffect
      ) {
        // Append all the effects of the subtree and this fiber onto the effect
        // list of the parent. The completion order of the children affects the
        // side-effect order.
        /*
        * effectList是一条单向链表，每完成一个工作单元上的任务，都要将它产生的effect链表并入
        * 上级工作单元。
        * */
        // 链表的并入操作
        // 将当前节点的effectList并入到父节点的effectList
        if (returnFiber.firstEffect === null) {
          returnFiber.firstEffect = completedWork.firstEffect;
        }
        if (completedWork.lastEffect !== null) {
          if (returnFiber.lastEffect !== null) {
            returnFiber.lastEffect.nextEffect = completedWork.firstEffect;
          }
          returnFiber.lastEffect = completedWork.lastEffect;
        }

        // If this fiber had side-effects, we append it AFTER the children's
        // side-effects. We can perform certain side-effects earlier if needed,
        // by doing multiple passes over the effect list. We don't want to
        // schedule our own side-effect on our own list because if end up
        // reusing children we'll schedule this effect onto itself since we're
        // at the end.
        /*
        * 如果这个Fiber有副作用，我们会在子Fiber的副作用之后添加它。如果需要，我们可以通过对效果列
        * 表进行多次传递，提前执行某些副作用。我们不想把自己的副作用放在自己的effect-list上，因为如
        * 果最终复用了子Fiber，我们将把这个效果安排在自己身上，因为我们已经到了最后。
        * */
        const effectTag = completedWork.effectTag;

        // Skip both NoWork and PerformedWork tags when creating the effect
        // list. PerformedWork effect is read by React DevTools but shouldn't be
        // committed.
        // 链表元素的实际添加，添加时跳过NoWork 和 PerformedWork的effectTag，因为真正
        // 的commit用不到
        if (effectTag > PerformedWork) {
          if (returnFiber.lastEffect !== null) {
            returnFiber.lastEffect.nextEffect = completedWork;
          } else {
            returnFiber.firstEffect = completedWork;
          }
          returnFiber.lastEffect = completedWork;
        }
      }
    } else {
      // This fiber did not complete because something threw. Pop values off
      // the stack without entering the complete phase. If this is a boundary,
      // capture values if possible.
      /*
      * 这Fiber不完整，因为抛出了一些错误。在进入完成阶段之前从堆栈中弹出。如果这是一个边界，
      * 尽可能捕获错误。
      * */
      // 因为出错后会被添加上Incomplete 类型的effectTag，所以会被执行到这里
      // unwindWork主要是将WIP节点上的ShouldCapture去掉，换成 DidCapture
      const next = unwindWork(completedWork, subtreeRenderLanes);

      // Because this fiber did not complete, don't reset its expiration time.
      // 逐层往上标记effectTag |= Incomplete
      if (next !== null) {
        // If completing this work spawned new work, do that next. We'll come
        // back here again.
        // Since we're restarting, remove anything that is not a host effect
        // from the effect tag.
        // 如果完成此工作产生了新任务，则执行下一步，之后会再回到这里，由于需要重启，所以从effect
        // 标签中删除所有不是host effect的effectTag。
        next.effectTag &= HostEffectMask;
        workInProgress = next;
        return;
      }

      if (
        enableProfilerTimer &&
        (completedWork.mode & ProfileMode) !== NoMode
      ) {
        // Record the render duration for the fiber that errored.
        stopProfilerTimerIfRunningAndRecordDelta(completedWork, false);

        // Include the time spent working on failed children before continuing.
        let actualDuration = completedWork.actualDuration;
        let child = completedWork.child;
        while (child !== null) {
          actualDuration += child.actualDuration;
          child = child.sibling;
        }
        completedWork.actualDuration = actualDuration;
      }

      if (returnFiber !== null) {
        // Mark the parent fiber as incomplete and clear its effect list.
        // 将父Fiber的effect list清除，effectTag标记成未完成，便于它的父节点再completeWork的时候
        // 被unwindWork
        returnFiber.firstEffect = returnFiber.lastEffect = null;
        returnFiber.effectTag |= Incomplete;
      }
    }

    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      // If there is more work to do in this returnFiber, do that next.
      workInProgress = siblingFiber;
      return;
    }
    // Otherwise, return to the parent
    completedWork = returnFiber;
    // Update the next thing we're working on in case something throws.
    workInProgress = completedWork;
  } while (completedWork !== null);

  // We've reached the root.
  if (workInProgressRootExitStatus === RootIncomplete) {
    workInProgressRootExitStatus = RootCompleted;
  }
}

function resetChildLanes(completedWork: Fiber) {
  if (
    // TODO: Move this check out of the hot path by moving `resetChildLanes`
    // to switch statement in `completeWork`.
    (completedWork.tag === LegacyHiddenComponent ||
      completedWork.tag === OffscreenComponent) &&
    completedWork.memoizedState !== null &&
    !includesSomeLane(subtreeRenderLanes, (OffscreenLane: Lane)) &&
    (completedWork.mode & ConcurrentMode) !== NoLanes
  ) {
    // The children of this component are hidden. Don't bubble their
    // expiration times.
    return;
  }

  let newChildLanes = NoLanes;

  // Bubble up the earliest expiration time.
  if (enableProfilerTimer && (completedWork.mode & ProfileMode) !== NoMode) {
    // In profiling mode, resetChildExpirationTime is also used to reset
    // profiler durations.
    let actualDuration = completedWork.actualDuration;
    let treeBaseDuration = ((completedWork.selfBaseDuration: any): number);

    // When a fiber is cloned, its actualDuration is reset to 0. This value will
    // only be updated if work is done on the fiber (i.e. it doesn't bailout).
    // When work is done, it should bubble to the parent's actualDuration. If
    // the fiber has not been cloned though, (meaning no work was done), then
    // this value will reflect the amount of time spent working on a previous
    // render. In that case it should not bubble. We determine whether it was
    // cloned by comparing the child pointer.
    const shouldBubbleActualDurations =
      completedWork.alternate === null ||
      completedWork.child !== completedWork.alternate.child;

    let child = completedWork.child;
    while (child !== null) {
      newChildLanes = mergeLanes(
        newChildLanes,
        mergeLanes(child.lanes, child.childLanes),
      );
      if (shouldBubbleActualDurations) {
        actualDuration += child.actualDuration;
      }
      treeBaseDuration += child.treeBaseDuration;
      child = child.sibling;
    }

    const isTimedOutSuspense =
      completedWork.tag === SuspenseComponent &&
      completedWork.memoizedState !== null;
    if (isTimedOutSuspense) {
      // Don't count time spent in a timed out Suspense subtree as part of the base duration.
      const primaryChildFragment = completedWork.child;
      if (primaryChildFragment !== null) {
        treeBaseDuration -= ((primaryChildFragment.treeBaseDuration: any): number);
      }
    }

    completedWork.actualDuration = actualDuration;
    completedWork.treeBaseDuration = treeBaseDuration;
  } else {
    let child = completedWork.child;
    // 向上收集的childLanes不漏掉被跳过的update的lanes
    while (child !== null) {
      newChildLanes = mergeLanes(
        newChildLanes,
        mergeLanes(child.lanes, child.childLanes),
      );
      child = child.sibling;
    }
  }

  completedWork.childLanes = newChildLanes;
}

function commitRoot(root) {
  const renderPriorityLevel = getCurrentPriorityLevel();
  runWithPriority(
    ImmediateSchedulerPriority,
    commitRootImpl.bind(null, root, renderPriorityLevel),
  );
  return null;
}

function commitRootImpl(root, renderPriorityLevel) {
  // https://zh-hans.reactjs.org/docs/hooks-reference.html#timing-of-effects
  // effect会保证在任何新的渲染前执行。React 将在组件更新前刷新上一轮渲染的 effect。
  do {
    // `flushPassiveEffects` will call `flushSyncUpdateQueue` at the end, which
    // means `flushPassiveEffects` will sometimes result in additional
    // passive effects. So we need to keep flushing in a loop until there are
    // no more pending effects.
    // TODO: Might be better if `flushPassiveEffects` did not automatically
    // flush synchronous work at the end, to avoid factoring hazards like this.
    flushPassiveEffects();
  } while (rootWithPendingPassiveEffects !== null);
  flushRenderPhaseStrictModeWarningsInDEV();

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Should not already be working.',
  );

  const finishedWork = root.finishedWork;
  const lanes = root.finishedLanes;
  if (finishedWork === null) {
    return null;
  }
  root.finishedWork = null;
  root.finishedLanes = NoLanes;

  invariant(
    finishedWork !== root.current,
    'Cannot commit the same tree as before. This error is likely caused by ' +
      'a bug in React. Please file an issue.',
  );

  // commitRoot never returns a continuation; it always finishes synchronously.
  // So we can clear these now to allow a new callback to be scheduled.
  /*
  * commitRoot是同步完成的，所以现在能清理掉这些，便于让一个新的回调被调度
  * */
  root.callbackNode = null;
  root.callbackId = NoLanes;

  // Update the first and last pending times on this root. The new first
  // pending time is whatever is left on the root fiber.
  let remainingLanes = mergeLanes(finishedWork.lanes, finishedWork.childLanes);
  markRootFinished(root, remainingLanes);
  console.log('更新完成后的渲染优先级（root.pendingLanes）：', root.pendingLanes);
  // Clear already finished discrete updates in case that a later call of
  // `flushDiscreteUpdates` starts a useless render pass which may cancels
  // a scheduled timeout.
  /*
  * 清除已经完成的离散的更新，万一flushDiscreteUpdates被延迟调用启动了一次不必要的渲染，
  * 这可能会取消timeout
  * */
  if (rootsWithPendingDiscreteUpdates !== null) {
    if (
      !hasDiscreteLanes(remainingLanes) &&
      rootsWithPendingDiscreteUpdates.has(root)
    ) {
      rootsWithPendingDiscreteUpdates.delete(root);
    }
  }

  if (root === workInProgressRoot) {
    // We can reset these now that they are finished.
    workInProgressRoot = null;
    workInProgress = null;
    workInProgressRootRenderLanes = NoLanes;
  } else {
    // This indicates that the last root we worked on is not the same one that
    // we're committing now. This most commonly happens when a suspended root
    // times out.
  }

  // Get the list of effects.
  let firstEffect;
  if (finishedWork.effectTag > PerformedWork) {
    // A fiber's effect list consists only of its children, not itself. So if
    // the root has an effect, we need to add it to the end of the list. The
    // resulting list is the set that would belong to the root's parent, if it
    // had one; that is, all the effects in the tree including the root.
    /*
    * fiber的effectList只包含子节点的effect，不包含它自身的，所以如果root节点有
    * 一个effect，需要把它放到effectList 的末尾，保证effectList里包含了所有的有
    * effect的fiber
    * */
    if (finishedWork.lastEffect !== null) {
      finishedWork.lastEffect.nextEffect = finishedWork;
      firstEffect = finishedWork.firstEffect;
    } else {
      firstEffect = finishedWork;
    }
  } else {
    // There is no effect on the root.
    firstEffect = finishedWork.firstEffect;
  }

  if (firstEffect !== null) {
    const prevExecutionContext = executionContext;
    executionContext |= CommitContext;
    const prevInteractions = pushInteractions(root);

    // Reset this to null before calling lifecycles
    ReactCurrentOwner.current = null;

    // The commit phase is broken into several sub-phases. We do a separate pass
    // of the effect list for each phase: all mutation effects come before all
    // layout effects, and so on.

    // The first phase a "before mutation" phase. We use this phase to read the
    // state of the host tree right before we mutate it. This is where
    // getSnapshotBeforeUpdate is called.
    focusedInstanceHandle = prepareForCommit(root.containerInfo);
    shouldFireAfterActiveInstanceBlur = false;

    nextEffect = firstEffect;
    do {
      if (__DEV__) {
        invokeGuardedCallback(null, commitBeforeMutationEffects, null);
        if (hasCaughtError()) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          const error = clearCaughtError();
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      } else {
        try {
          // 调用getSnapshotBeforeUpdate，在即将更新前获取DOM信息
          commitBeforeMutationEffects();
        } catch (error) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      }
    } while (nextEffect !== null);

    // We no longer need to track the active instance fiber
    focusedInstanceHandle = null;

    if (enableProfilerTimer) {
      // Mark the current commit time to be shared by all Profilers in this
      // batch. This enables them to be grouped later.
      recordCommitTime();
    }

    // The next phase is the mutation phase, where we mutate the host tree.
    // 更新DOM阶段
    nextEffect = firstEffect;
    do {
      if (__DEV__) {
        invokeGuardedCallback(
          null,
          commitMutationEffects,
          null,
          root,
          renderPriorityLevel,
        );
        if (hasCaughtError()) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          const error = clearCaughtError();
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      } else {
        try {
          commitMutationEffects(root, renderPriorityLevel);
        } catch (error) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      }
    } while (nextEffect !== null);

    if (shouldFireAfterActiveInstanceBlur) {
      afterActiveInstanceBlur();
    }
    resetAfterCommit(root.containerInfo);

    // The work-in-progress tree is now the current tree. This must come after
    // the mutation phase, so that the previous tree is still current during
    // componentWillUnmount, but before the layout phase, so that the finished
    // work is current during componentDidMount/Update.
    root.current = finishedWork;

    // The next phase is the layout phase, where we call effects that read
    // the host tree after it's been mutated. The idiomatic use case for this is
    // layout, but class component lifecycles also fire here for legacy reasons.
    nextEffect = firstEffect;
    do {
      if (__DEV__) {
        invokeGuardedCallback(null, commitLayoutEffects, null, root, lanes);
        if (hasCaughtError()) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          const error = clearCaughtError();
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      } else {
        try {
          commitLayoutEffects(root, lanes);
        } catch (error) {
          invariant(nextEffect !== null, 'Should be working on an effect.');
          captureCommitPhaseError(nextEffect, error);
          nextEffect = nextEffect.nextEffect;
        }
      }
    } while (nextEffect !== null);

    nextEffect = null;

    // Tell Scheduler to yield at the end of the frame, so the browser has an
    // opportunity to paint.
    // 通知Scheduler在帧的结尾让出执行权，来让浏览器有机会去绘制
    requestPaint();

    if (enableSchedulerTracing) {
      popInteractions(((prevInteractions: any): Set<Interaction>));
    }
    executionContext = prevExecutionContext;
  } else {
    // No effects.
    root.current = finishedWork;
    // Measure these anyway so the flamegraph explicitly shows that there were
    // no effects.
    // TODO: Maybe there's a better way to report this.
    if (enableProfilerTimer) {
      recordCommitTime();
    }
  }

  const rootDidHavePassiveEffects = rootDoesHavePassiveEffects;

  if (rootDoesHavePassiveEffects) {
    // This commit has passive effects. Stash a reference to them. But don't
    // schedule a callback until after flushing layout work.
    rootDoesHavePassiveEffects = false;
    rootWithPendingPassiveEffects = root;
    pendingPassiveEffectsLanes = lanes;
    pendingPassiveEffectsRenderPriority = renderPriorityLevel;
  } else {
    // We are done with the effect chain at this point so let's clear the
    // nextEffect pointers to assist with GC. If we have passive effects, we'll
    // clear this in flushPassiveEffects.
    nextEffect = firstEffect;
    while (nextEffect !== null) {
      const nextNextEffect = nextEffect.nextEffect;
      nextEffect.nextEffect = null;
      if (nextEffect.effectTag & Deletion) {
        detachFiberAfterEffects(nextEffect);
      }
      nextEffect = nextNextEffect;
    }
  }

  // Read this again, since an effect might have updated it
  remainingLanes = root.pendingLanes;

  // Check if there's remaining work on this root
  if (remainingLanes !== NoLanes) {
    if (enableSchedulerTracing) {
      if (spawnedWorkDuringRender !== null) {
        const expirationTimes = spawnedWorkDuringRender;
        spawnedWorkDuringRender = null;
        for (let i = 0; i < expirationTimes.length; i++) {
          scheduleInteractions(
            root,
            expirationTimes[i],
            root.memoizedInteractions,
          );
        }
      }
      schedulePendingInteractions(root, remainingLanes);
    }
  } else {
    // If there's no remaining work, we can clear the set of already failed
    // error boundaries.
    legacyErrorBoundariesThatAlreadyFailed = null;
  }

  if (enableSchedulerTracing) {
    if (!rootDidHavePassiveEffects) {
      // If there are no passive effects, then we can complete the pending interactions.
      // Otherwise, we'll wait until after the passive effects are flushed.
      // Wait to do this until after remaining work has been scheduled,
      // so that we don't prematurely signal complete for interactions when there's e.g. hidden work.
      finishPendingInteractions(root, lanes);
    }
  }

  if (remainingLanes === SyncLane) {
    // Count the number of times the root synchronously re-renders without
    // finishing. If there are too many, it indicates an infinite update loop.
    if (root === rootWithNestedUpdates) {
      nestedUpdateCount++;
    } else {
      nestedUpdateCount = 0;
      rootWithNestedUpdates = root;
    }
  } else {
    nestedUpdateCount = 0;
  }

  onCommitRootDevTools(finishedWork.stateNode, renderPriorityLevel);

  if (__DEV__) {
    onCommitRootTestSelector();
  }

  // Always call this before exiting `commitRoot`, to ensure that any
  // additional work on this root is scheduled.
  /*
  * 每次commit阶段完成后，再执行一遍ensureRootIsScheduled，确保是否还有任务需要被调度。
  * 例如，高优先级插队的更新完成后，最后commit掉，还会再执行一遍，保证之前跳过的低优先级任务
  * 重新执行
  *
  * */
  ensureRootIsScheduled(root, now());

  if (hasUncaughtError) {
    hasUncaughtError = false;
    const error = firstUncaughtError;
    firstUncaughtError = null;
    throw error;
  }

  if ((executionContext & LegacyUnbatchedContext) !== NoContext) {
    // This is a legacy edge case. We just committed the initial mount of
    // a ReactDOM.render-ed root inside of batchedUpdates. The commit fired
    // synchronously, but layout updates should be deferred until the end
    // of the batch.
    return null;
  }

  // If layout work was scheduled, flush it now.
  flushSyncCallbackQueue();

  return null;
}

function commitBeforeMutationEffects() {
  while (nextEffect !== null) {
    const current = nextEffect.alternate;

    if (!shouldFireAfterActiveInstanceBlur && focusedInstanceHandle !== null) {
      if ((nextEffect.effectTag & Deletion) !== NoEffect) {
        if (doesFiberContain(nextEffect, focusedInstanceHandle)) {
          shouldFireAfterActiveInstanceBlur = true;
          beforeActiveInstanceBlur();
        }
      } else {
        // TODO: Move this out of the hot path using a dedicated effect tag.
        if (
          nextEffect.tag === SuspenseComponent &&
          isSuspenseBoundaryBeingHidden(current, nextEffect) &&
          doesFiberContain(nextEffect, focusedInstanceHandle)
        ) {
          shouldFireAfterActiveInstanceBlur = true;
          beforeActiveInstanceBlur();
        }
      }
    }

    const effectTag = nextEffect.effectTag;
    if ((effectTag & Snapshot) !== NoEffect) {
      setCurrentDebugFiberInDEV(nextEffect);
      // 调用getSnapshotBeforeUpdate
      commitBeforeMutationEffectOnFiber(current, nextEffect);

      resetCurrentDebugFiberInDEV();
    }
    if ((effectTag & Passive) !== NoEffect) {
      // 调度useEffect
      // If there are passive effects, schedule a callback to flush at
      // the earliest opportunity.
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

function commitMutationEffects(root: FiberRoot, renderPriorityLevel) {
  // TODO: Should probably move the bulk of this function to commitWork.
  while (nextEffect !== null) {
    setCurrentDebugFiberInDEV(nextEffect);

    const effectTag = nextEffect.effectTag;

    if (effectTag & ContentReset) {
      commitResetTextContent(nextEffect);
    }

    if (effectTag & Ref) {
      const current = nextEffect.alternate;
      if (current !== null) {
        commitDetachRef(current);
      }
    }

    // The following switch statement is only concerned about placement,
    // updates, and deletions. To avoid needing to add a case for every possible
    // bitmap value, we remove the secondary effects from the effect tag and
    // switch on that value.
    const primaryEffectTag =
      effectTag & (Placement | Update | Deletion | Hydrating);
    switch (primaryEffectTag) {
      case Placement: {
        commitPlacement(nextEffect);
        // Clear the "placement" from effect tag so that we know that this is
        // inserted, before any life-cycles like componentDidMount gets called.
        // TODO: findDOMNode doesn't rely on this any more but isMounted does
        // and isMounted is deprecated anyway so we should be able to kill this.
        nextEffect.effectTag &= ~Placement;
        break;
      }
      case PlacementAndUpdate: {
        // Placement
        commitPlacement(nextEffect);
        // Clear the "placement" from effect tag so that we know that this is
        // inserted, before any life-cycles like componentDidMount gets called.
        nextEffect.effectTag &= ~Placement;

        // Update
        const current = nextEffect.alternate;
        commitWork(current, nextEffect);
        break;
      }
      case Hydrating: {
        nextEffect.effectTag &= ~Hydrating;
        break;
      }
      case HydratingAndUpdate: {
        nextEffect.effectTag &= ~Hydrating;

        // Update
        const current = nextEffect.alternate;
        commitWork(current, nextEffect);
        break;
      }
      case Update: {
        const current = nextEffect.alternate;
        commitWork(current, nextEffect);
        break;
      }
      case Deletion: {
        commitDeletion(root, nextEffect, renderPriorityLevel);
        break;
      }
    }

    resetCurrentDebugFiberInDEV();
    nextEffect = nextEffect.nextEffect;
  }
}

function commitLayoutEffects(root: FiberRoot, committedLanes: Lanes) {
  // TODO: Should probably move the bulk of this function to commitWork.
  while (nextEffect !== null) {
    setCurrentDebugFiberInDEV(nextEffect);

    const effectTag = nextEffect.effectTag;

    if (effectTag & (Update | Callback)) {
      const current = nextEffect.alternate;
      commitLayoutEffectOnFiber(root, current, nextEffect, committedLanes);
    }

    if (effectTag & Ref) {
      commitAttachRef(nextEffect);
    }

    resetCurrentDebugFiberInDEV();
    nextEffect = nextEffect.nextEffect;
  }
}

export function flushPassiveEffects() {
  if (pendingPassiveEffectsRenderPriority !== NoSchedulerPriority) {
    const priorityLevel =
      pendingPassiveEffectsRenderPriority > NormalSchedulerPriority
        ? NormalSchedulerPriority
        : pendingPassiveEffectsRenderPriority;
    pendingPassiveEffectsRenderPriority = NoSchedulerPriority;
    return runWithPriority(priorityLevel, flushPassiveEffectsImpl);
  }
}

export function enqueuePendingPassiveProfilerEffect(fiber: Fiber): void {
  if (enableProfilerTimer && enableProfilerCommitHooks) {
    pendingPassiveProfilerEffects.push(fiber);
    if (!rootDoesHavePassiveEffects) {
      rootDoesHavePassiveEffects = true;
      scheduleCallback(NormalSchedulerPriority, () => {
        flushPassiveEffects();
        return null;
      });
    }
  }
}

export function enqueuePendingPassiveHookEffectMount(
  fiber: Fiber,
  effect: HookEffect,
): void {
  pendingPassiveHookEffectsMount.push(effect, fiber);
  if (!rootDoesHavePassiveEffects) {
    rootDoesHavePassiveEffects = true;
    scheduleCallback(NormalSchedulerPriority, () => {
      flushPassiveEffects();
      return null;
    });
  }
}

export function enqueuePendingPassiveHookEffectUnmount(
  fiber: Fiber,
  effect: HookEffect,
): void {
  pendingPassiveHookEffectsUnmount.push(effect, fiber);
  if (__DEV__) {
    fiber.effectTag |= PassiveUnmountPendingDev;
    const alternate = fiber.alternate;
    if (alternate !== null) {
      alternate.effectTag |= PassiveUnmountPendingDev;
    }
  }
  if (!rootDoesHavePassiveEffects) {
    rootDoesHavePassiveEffects = true;
    scheduleCallback(NormalSchedulerPriority, () => {
      flushPassiveEffects();
      return null;
    });
  }
}

function invokePassiveEffectCreate(effect: HookEffect): void {
  const create = effect.create;
  effect.destroy = create();
}

function flushPassiveEffectsImpl() {
  if (rootWithPendingPassiveEffects === null) {
    return false;
  }

  const root = rootWithPendingPassiveEffects;
  const lanes = pendingPassiveEffectsLanes;
  rootWithPendingPassiveEffects = null;
  pendingPassiveEffectsLanes = NoLanes;

  invariant(
    (executionContext & (RenderContext | CommitContext)) === NoContext,
    'Cannot flush passive effects while already rendering.',
  );

  if (__DEV__) {
    isFlushingPassiveEffects = true;
  }

  const prevExecutionContext = executionContext;
  executionContext |= CommitContext;
  const prevInteractions = pushInteractions(root);

  // It's important that ALL pending passive effect destroy functions are called
  // before ANY passive effect create functions are called.
  // Otherwise effects in sibling components might interfere with each other.
  // e.g. a destroy function in one component may unintentionally override a ref
  // value set by a create function in another component.
  // Layout effects have the same constraint.

  // First pass: Destroy stale passive effects.
  const unmountEffects = pendingPassiveHookEffectsUnmount;
  pendingPassiveHookEffectsUnmount = [];
  for (let i = 0; i < unmountEffects.length; i += 2) {
    const effect = ((unmountEffects[i]: any): HookEffect);
    const fiber = ((unmountEffects[i + 1]: any): Fiber);
    const destroy = effect.destroy;
    effect.destroy = undefined;

    if (__DEV__) {
      fiber.effectTag &= ~PassiveUnmountPendingDev;
      const alternate = fiber.alternate;
      if (alternate !== null) {
        alternate.effectTag &= ~PassiveUnmountPendingDev;
      }
    }

    if (typeof destroy === 'function') {
      if (__DEV__) {
        setCurrentDebugFiberInDEV(fiber);
        if (
          enableProfilerTimer &&
          enableProfilerCommitHooks &&
          fiber.mode & ProfileMode
        ) {
          startPassiveEffectTimer();
          invokeGuardedCallback(null, destroy, null);
          recordPassiveEffectDuration(fiber);
        } else {
          invokeGuardedCallback(null, destroy, null);
        }
        if (hasCaughtError()) {
          invariant(fiber !== null, 'Should be working on an effect.');
          const error = clearCaughtError();
          captureCommitPhaseError(fiber, error);
        }
        resetCurrentDebugFiberInDEV();
      } else {
        try {
          if (
            enableProfilerTimer &&
            enableProfilerCommitHooks &&
            fiber.mode & ProfileMode
          ) {
            try {
              startPassiveEffectTimer();
              destroy();
            } finally {
              recordPassiveEffectDuration(fiber);
            }
          } else {
            destroy();
          }
        } catch (error) {
          invariant(fiber !== null, 'Should be working on an effect.');
          captureCommitPhaseError(fiber, error);
        }
      }
    }
  }
  // Second pass: Create new passive effects.
  const mountEffects = pendingPassiveHookEffectsMount;
  pendingPassiveHookEffectsMount = [];
  for (let i = 0; i < mountEffects.length; i += 2) {
    const effect = ((mountEffects[i]: any): HookEffect);
    const fiber = ((mountEffects[i + 1]: any): Fiber);
    if (__DEV__) {
      setCurrentDebugFiberInDEV(fiber);
      if (
        enableProfilerTimer &&
        enableProfilerCommitHooks &&
        fiber.mode & ProfileMode
      ) {
        startPassiveEffectTimer();
        invokeGuardedCallback(null, invokePassiveEffectCreate, null, effect);
        recordPassiveEffectDuration(fiber);
      } else {
        invokeGuardedCallback(null, invokePassiveEffectCreate, null, effect);
      }
      if (hasCaughtError()) {
        invariant(fiber !== null, 'Should be working on an effect.');
        const error = clearCaughtError();
        captureCommitPhaseError(fiber, error);
      }
      resetCurrentDebugFiberInDEV();
    } else {
      try {
        const create = effect.create;
        if (
          enableProfilerTimer &&
          enableProfilerCommitHooks &&
          fiber.mode & ProfileMode
        ) {
          try {
            startPassiveEffectTimer();
            effect.destroy = create();
          } finally {
            recordPassiveEffectDuration(fiber);
          }
        } else {
          effect.destroy = create();
        }
      } catch (error) {
        invariant(fiber !== null, 'Should be working on an effect.');
        captureCommitPhaseError(fiber, error);
      }
    }
  }

  // Note: This currently assumes there are no passive effects on the root fiber
  // because the root is not part of its own effect list.
  // This could change in the future.
  let effect = root.current.firstEffect;
  while (effect !== null) {
    const nextNextEffect = effect.nextEffect;
    // Remove nextEffect pointer to assist GC
    effect.nextEffect = null;
    if (effect.effectTag & Deletion) {
      detachFiberAfterEffects(effect);
    }
    effect = nextNextEffect;
  }

  if (enableProfilerTimer && enableProfilerCommitHooks) {
    const profilerEffects = pendingPassiveProfilerEffects;
    pendingPassiveProfilerEffects = [];
    for (let i = 0; i < profilerEffects.length; i++) {
      const fiber = ((profilerEffects[i]: any): Fiber);
      commitPassiveEffectDurations(root, fiber);
    }
  }

  if (enableSchedulerTracing) {
    popInteractions(((prevInteractions: any): Set<Interaction>));
    finishPendingInteractions(root, lanes);
  }

  if (__DEV__) {
    isFlushingPassiveEffects = false;
  }

  executionContext = prevExecutionContext;

  flushSyncCallbackQueue();

  // If additional passive effects were scheduled, increment a counter. If this
  // exceeds the limit, we'll fire a warning.
  nestedPassiveUpdateCount =
    rootWithPendingPassiveEffects === null ? 0 : nestedPassiveUpdateCount + 1;

  return true;
}

export function isAlreadyFailedLegacyErrorBoundary(instance: mixed): boolean {
  return (
    legacyErrorBoundariesThatAlreadyFailed !== null &&
    legacyErrorBoundariesThatAlreadyFailed.has(instance)
  );
}

export function markLegacyErrorBoundaryAsFailed(instance: mixed) {
  if (legacyErrorBoundariesThatAlreadyFailed === null) {
    legacyErrorBoundariesThatAlreadyFailed = new Set([instance]);
  } else {
    legacyErrorBoundariesThatAlreadyFailed.add(instance);
  }
}

function prepareToThrowUncaughtError(error: mixed) {
  if (!hasUncaughtError) {
    hasUncaughtError = true;
    firstUncaughtError = error;
  }
}
export const onUncaughtError = prepareToThrowUncaughtError;

function captureCommitPhaseErrorOnRoot(
  rootFiber: Fiber,
  sourceFiber: Fiber,
  error: mixed,
) {
  const errorInfo = createCapturedValue(error, sourceFiber);
  const update = createRootErrorUpdate(rootFiber, errorInfo, (SyncLane: Lane));
  enqueueUpdate(rootFiber, update);
  const eventTime = requestEventTime();
  const root = markUpdateLaneFromFiberToRoot(rootFiber, (SyncLane: Lane));
  if (root !== null) {
    ensureRootIsScheduled(root, eventTime);
    schedulePendingInteractions(root, SyncLane);
  }
}

export function captureCommitPhaseError(sourceFiber: Fiber, error: mixed) {
  if (sourceFiber.tag === HostRoot) {
    // Error was thrown at the root. There is no parent, so the root
    // itself should capture it.
    captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
    return;
  }

  let fiber = sourceFiber.return;
  while (fiber !== null) {
    if (fiber.tag === HostRoot) {
      captureCommitPhaseErrorOnRoot(fiber, sourceFiber, error);
      return;
    } else if (fiber.tag === ClassComponent) {
      const ctor = fiber.type;
      const instance = fiber.stateNode;
      if (
        typeof ctor.getDerivedStateFromError === 'function' ||
        (typeof instance.componentDidCatch === 'function' &&
          !isAlreadyFailedLegacyErrorBoundary(instance))
      ) {
        const errorInfo = createCapturedValue(error, sourceFiber);
        const update = createClassErrorUpdate(
          fiber,
          errorInfo,
          (SyncLane: Lane),
        );
        enqueueUpdate(fiber, update);
        const eventTime = requestEventTime();
        const root = markUpdateLaneFromFiberToRoot(fiber, (SyncLane: Lane));
        if (root !== null) {
          ensureRootIsScheduled(root, eventTime);
          schedulePendingInteractions(root, SyncLane);
        }
        return;
      }
    }
    fiber = fiber.return;
  }
}

export function pingSuspendedRoot(
  root: FiberRoot,
  wakeable: Wakeable,
  pingedLanes: Lanes,
) {
  const pingCache = root.pingCache;
  if (pingCache !== null) {
    // The wakeable resolved, so we no longer need to memoize, because it will
    // never be thrown again.
    pingCache.delete(wakeable);
  }

  const eventTime = requestEventTime();
  markRootPinged(root, pingedLanes, eventTime);

  if (
    workInProgressRoot === root &&
    isSubsetOfLanes(workInProgressRootRenderLanes, pingedLanes)
  ) {
    // Received a ping at the same priority level at which we're currently
    // rendering. We might want to restart this render. This should mirror
    // the logic of whether or not a root suspends once it completes.
    /*
    * 接收到与我们当前渲染的优先级相同的ping。我们可能需要重新启动这个渲染。这应该反映root
    * 完成后是否挂起的逻辑。
    * */
    // TODO: If we're rendering sync either due to Sync, Batched or expired,
    // we should probably never restart.

    // 如果由于同步、批处理或过期而进行同步渲染，可能永远都不应该重新启动。

    // If we're suspended with delay, we'll always suspend so we can always
    // restart. If we're suspended without any updates, it might be a retry.
    // If it's early in the retry we can restart. We can't know for sure
    // whether we'll eventually process an update during this render pass,
    // but it's somewhat unlikely that we get to a ping before that, since
    // getting to the root most update is usually very fast.


    if (
      workInProgressRootExitStatus === RootSuspendedWithDelay ||
      (workInProgressRootExitStatus === RootSuspended &&
        workInProgressRootLatestProcessedEventTime === NoTimestamp &&
        now() - globalMostRecentFallbackTime < FALLBACK_THROTTLE_MS)
    ) {
      // Restart from the root.
      prepareFreshStack(root, NoLanes);
    } else {
      // Even though we can't restart right now, we might get an
      // opportunity later. So we mark this render as having a ping.
      workInProgressRootPingedLanes = mergeLanes(
        workInProgressRootPingedLanes,
        pingedLanes,
      );
    }
  }

  ensureRootIsScheduled(root, eventTime);
  schedulePendingInteractions(root, pingedLanes);
}

function retryTimedOutBoundary(boundaryFiber: Fiber, retryLane: Lane) {
  // The boundary fiber (a Suspense component or SuspenseList component)
  // previously was rendered in its fallback state. One of the promises that
  // suspended it has resolved, which means at least part of the tree was
  // likely unblocked. Try rendering again, at a new expiration time.
  if (retryLane === NoLane) {
    const suspenseConfig = null; // Retries don't carry over the already committed update.
    // TODO: Should retries get their own lane? Maybe it could share with
    // transitions.
    retryLane = requestUpdateLane(boundaryFiber, suspenseConfig);
  }
  // TODO: Special case idle priority?
  const eventTime = requestEventTime();
  const root = markUpdateLaneFromFiberToRoot(boundaryFiber, retryLane);
  if (root !== null) {
    ensureRootIsScheduled(root, eventTime);
    schedulePendingInteractions(root, retryLane);
  }
}

export function retryDehydratedSuspenseBoundary(boundaryFiber: Fiber) {
  const suspenseState: null | SuspenseState = boundaryFiber.memoizedState;
  let retryLane = NoLane;
  if (suspenseState !== null) {
    retryLane = suspenseState.retryLane;
  }
  retryTimedOutBoundary(boundaryFiber, retryLane);
}

export function resolveRetryWakeable(boundaryFiber: Fiber, wakeable: Wakeable) {
  let retryLane = NoLane; // Default
  let retryCache: WeakSet<Wakeable> | Set<Wakeable> | null;
  if (enableSuspenseServerRenderer) {
    switch (boundaryFiber.tag) {
      case SuspenseComponent:
        retryCache = boundaryFiber.stateNode;
        const suspenseState: null | SuspenseState = boundaryFiber.memoizedState;
        if (suspenseState !== null) {
          retryLane = suspenseState.retryLane;
        }
        break;
      case SuspenseListComponent:
        retryCache = boundaryFiber.stateNode;
        break;
      default:
        invariant(
          false,
          'Pinged unknown suspense boundary type. ' +
            'This is probably a bug in React.',
        );
    }
  } else {
    retryCache = boundaryFiber.stateNode;
  }

  if (retryCache !== null) {
    // The wakeable resolved, so we no longer need to memoize, because it will
    // never be thrown again.
    retryCache.delete(wakeable);
  }

  retryTimedOutBoundary(boundaryFiber, retryLane);
}

// Computes the next Just Noticeable Difference (JND) boundary.
// The theory is that a person can't tell the difference between small differences in time.
// Therefore, if we wait a bit longer than necessary that won't translate to a noticeable
// difference in the experience. However, waiting for longer might mean that we can avoid
// showing an intermediate loading state. The longer we have already waited, the harder it
// is to tell small differences in time. Therefore, the longer we've already waited,
// the longer we can wait additionally. At some point we have to give up though.
// We pick a train model where the next boundary commits at a consistent schedule.
// These particular numbers are vague estimates. We expect to adjust them based on research.
function jnd(timeElapsed: number) {
  return timeElapsed < 120
    ? 120
    : timeElapsed < 480
    ? 480
    : timeElapsed < 1080
    ? 1080
    : timeElapsed < 1920
    ? 1920
    : timeElapsed < 3000
    ? 3000
    : timeElapsed < 4320
    ? 4320
    : ceil(timeElapsed / 1960) * 1960;
}

function computeMsUntilSuspenseLoadingDelay(
  mostRecentEventTime: number,
  suspenseConfig: SuspenseConfig,
) {
  const busyMinDurationMs = (suspenseConfig.busyMinDurationMs: any) | 0;
  if (busyMinDurationMs <= 0) {
    return 0;
  }
  const busyDelayMs = (suspenseConfig.busyDelayMs: any) | 0;

  // Compute the time until this render pass would expire.
  const currentTimeMs: number = now();
  const eventTimeMs: number = mostRecentEventTime;
  const timeElapsed = currentTimeMs - eventTimeMs;
  if (timeElapsed <= busyDelayMs) {
    // If we haven't yet waited longer than the initial delay, we don't
    // have to wait any additional time.
    return 0;
  }
  const msUntilTimeout = busyDelayMs + busyMinDurationMs - timeElapsed;
  // This is the value that is passed to `setTimeout`.
  return msUntilTimeout;
}

function checkForNestedUpdates() {
  if (nestedUpdateCount > NESTED_UPDATE_LIMIT) {
    nestedUpdateCount = 0;
    rootWithNestedUpdates = null;
    invariant(
      false,
      'Maximum update depth exceeded. This can happen when a component ' +
        'repeatedly calls setState inside componentWillUpdate or ' +
        'componentDidUpdate. React limits the number of nested updates to ' +
        'prevent infinite loops.',
    );
  }

  if (__DEV__) {
    if (nestedPassiveUpdateCount > NESTED_PASSIVE_UPDATE_LIMIT) {
      nestedPassiveUpdateCount = 0;
      console.error(
        'Maximum update depth exceeded. This can happen when a component ' +
          "calls setState inside useEffect, but useEffect either doesn't " +
          'have a dependency array, or one of the dependencies changes on ' +
          'every render.',
      );
    }
  }
}

function flushRenderPhaseStrictModeWarningsInDEV() {
  if (__DEV__) {
    ReactStrictModeWarnings.flushLegacyContextWarning();

    if (warnAboutDeprecatedLifecycles) {
      ReactStrictModeWarnings.flushPendingUnsafeLifecycleWarnings();
    }
  }
}

let didWarnStateUpdateForNotYetMountedComponent: Set<string> | null = null;
function warnAboutUpdateOnNotYetMountedFiberInDEV(fiber) {
  if (__DEV__) {
    if ((executionContext & RenderContext) !== NoContext) {
      // We let the other warning about render phase updates deal with this one.
      return;
    }

    if (!(fiber.mode & (BlockingMode | ConcurrentMode))) {
      return;
    }

    const tag = fiber.tag;
    if (
      tag !== IndeterminateComponent &&
      tag !== HostRoot &&
      tag !== ClassComponent &&
      tag !== FunctionComponent &&
      tag !== ForwardRef &&
      tag !== MemoComponent &&
      tag !== SimpleMemoComponent &&
      tag !== Block
    ) {
      // Only warn for user-defined components, not internal ones like Suspense.
      return;
    }

    // We show the whole stack but dedupe on the top component's name because
    // the problematic code almost always lies inside that component.
    const componentName = getComponentName(fiber.type) || 'ReactComponent';
    if (didWarnStateUpdateForNotYetMountedComponent !== null) {
      if (didWarnStateUpdateForNotYetMountedComponent.has(componentName)) {
        return;
      }
      didWarnStateUpdateForNotYetMountedComponent.add(componentName);
    } else {
      didWarnStateUpdateForNotYetMountedComponent = new Set([componentName]);
    }

    const previousFiber = ReactCurrentFiberCurrent;
    try {
      setCurrentDebugFiberInDEV(fiber);
      console.error(
        "Can't perform a React state update on a component that hasn't mounted yet. " +
          'This indicates that you have a side-effect in your render function that ' +
          'asynchronously later calls tries to update the component. Move this work to ' +
          'useEffect instead.',
      );
    } finally {
      if (previousFiber) {
        setCurrentDebugFiberInDEV(fiber);
      } else {
        resetCurrentDebugFiberInDEV();
      }
    }
  }
}

let didWarnStateUpdateForUnmountedComponent: Set<string> | null = null;
function warnAboutUpdateOnUnmountedFiberInDEV(fiber) {
  if (__DEV__) {
    const tag = fiber.tag;
    if (
      tag !== HostRoot &&
      tag !== ClassComponent &&
      tag !== FunctionComponent &&
      tag !== ForwardRef &&
      tag !== MemoComponent &&
      tag !== SimpleMemoComponent &&
      tag !== Block
    ) {
      // Only warn for user-defined components, not internal ones like Suspense.
      return;
    }

    // If there are pending passive effects unmounts for this Fiber,
    // we can assume that they would have prevented this update.
    if ((fiber.effectTag & PassiveUnmountPendingDev) !== NoEffect) {
      return;
    }

    // We show the whole stack but dedupe on the top component's name because
    // the problematic code almost always lies inside that component.
    const componentName = getComponentName(fiber.type) || 'ReactComponent';
    if (didWarnStateUpdateForUnmountedComponent !== null) {
      if (didWarnStateUpdateForUnmountedComponent.has(componentName)) {
        return;
      }
      didWarnStateUpdateForUnmountedComponent.add(componentName);
    } else {
      didWarnStateUpdateForUnmountedComponent = new Set([componentName]);
    }

    if (isFlushingPassiveEffects) {
      // Do not warn if we are currently flushing passive effects!
      //
      // React can't directly detect a memory leak, but there are some clues that warn about one.
      // One of these clues is when an unmounted React component tries to update its state.
      // For example, if a component forgets to remove an event listener when unmounting,
      // that listener may be called later and try to update state,
      // at which point React would warn about the potential leak.
      //
      // Warning signals are the most useful when they're strong.
      // (So we should avoid false positive warnings.)
      // Updating state from within an effect cleanup function is sometimes a necessary pattern, e.g.:
      // 1. Updating an ancestor that a component had registered itself with on mount.
      // 2. Resetting state when a component is hidden after going offscreen.
    } else {
      const previousFiber = ReactCurrentFiberCurrent;
      try {
        setCurrentDebugFiberInDEV(fiber);
        console.error(
          "Can't perform a React state update on an unmounted component. This " +
            'is a no-op, but it indicates a memory leak in your application. To ' +
            'fix, cancel all subscriptions and asynchronous tasks in %s.',
          tag === ClassComponent
            ? 'the componentWillUnmount method'
            : 'a useEffect cleanup function',
        );
      } finally {
        if (previousFiber) {
          setCurrentDebugFiberInDEV(fiber);
        } else {
          resetCurrentDebugFiberInDEV();
        }
      }
    }
  }
}

let beginWork;
if (__DEV__ && replayFailedUnitOfWorkWithInvokeGuardedCallback) {
  const dummyFiber = null;
  beginWork = (current, unitOfWork, lanes) => {
    // If a component throws an error, we replay it again in a synchronously
    // dispatched event, so that the debugger will treat it as an uncaught
    // error See ReactErrorUtils for more information.

    // Before entering the begin phase, copy the work-in-progress onto a dummy
    // fiber. If beginWork throws, we'll use this to reset the state.
    const originalWorkInProgressCopy = assignFiberPropertiesInDEV(
      dummyFiber,
      unitOfWork,
    );
    try {
      return originalBeginWork(current, unitOfWork, lanes);
    } catch (originalError) {
      if (
        originalError !== null &&
        typeof originalError === 'object' &&
        typeof originalError.then === 'function'
      ) {
        // Don't replay promises. Treat everything else like an error.
        throw originalError;
      }

      // Keep this code in sync with handleError; any changes here must have
      // corresponding changes there.
      resetContextDependencies();
      resetHooksAfterThrow();
      // Don't reset current debug fiber, since we're about to work on the
      // same fiber again.

      // Unwind the failed stack frame
      unwindInterruptedWork(unitOfWork);

      // Restore the original properties of the fiber.
      assignFiberPropertiesInDEV(unitOfWork, originalWorkInProgressCopy);

      if (enableProfilerTimer && unitOfWork.mode & ProfileMode) {
        // Reset the profiler timer.
        startProfilerTimer(unitOfWork);
      }

      // Run beginWork again.
      invokeGuardedCallback(
        null,
        originalBeginWork,
        null,
        current,
        unitOfWork,
        lanes,
      );

      if (hasCaughtError()) {
        const replayError = clearCaughtError();
        // `invokeGuardedCallback` sometimes sets an expando `_suppressLogging`.
        // Rethrow this error instead of the original one.
        throw replayError;
      } else {
        // This branch is reachable if the render phase is impure.
        throw originalError;
      }
    }
  };
} else {
  beginWork = originalBeginWork;
}

let didWarnAboutUpdateInRender = false;
let didWarnAboutUpdateInRenderForAnotherComponent;
if (__DEV__) {
  didWarnAboutUpdateInRenderForAnotherComponent = new Set();
}

function warnAboutRenderPhaseUpdatesInDEV(fiber) {
  if (__DEV__) {
    if (
      ReactCurrentDebugFiberIsRenderingInDEV &&
      (executionContext & RenderContext) !== NoContext &&
      !getIsUpdatingOpaqueValueInRenderPhaseInDEV()
    ) {
      switch (fiber.tag) {
        case FunctionComponent:
        case ForwardRef:
        case SimpleMemoComponent: {
          const renderingComponentName =
            (workInProgress && getComponentName(workInProgress.type)) ||
            'Unknown';
          // Dedupe by the rendering component because it's the one that needs to be fixed.
          const dedupeKey = renderingComponentName;
          if (!didWarnAboutUpdateInRenderForAnotherComponent.has(dedupeKey)) {
            didWarnAboutUpdateInRenderForAnotherComponent.add(dedupeKey);
            const setStateComponentName =
              getComponentName(fiber.type) || 'Unknown';
            console.error(
              'Cannot update a component (`%s`) while rendering a ' +
                'different component (`%s`). To locate the bad setState() call inside `%s`, ' +
                'follow the stack trace as described in https://fb.me/setstate-in-render',
              setStateComponentName,
              renderingComponentName,
              renderingComponentName,
            );
          }
          break;
        }
        case ClassComponent: {
          if (!didWarnAboutUpdateInRender) {
            console.error(
              'Cannot update during an existing state transition (such as ' +
                'within `render`). Render methods should be a pure ' +
                'function of props and state.',
            );
            didWarnAboutUpdateInRender = true;
          }
          break;
        }
      }
    }
  }
}

// a 'shared' variable that changes when act() opens/closes in tests.
export const IsThisRendererActing = {current: (false: boolean)};

export function warnIfNotScopedWithMatchingAct(fiber: Fiber): void {
  if (__DEV__) {
    if (
      warnsIfNotActing === true &&
      IsSomeRendererActing.current === true &&
      IsThisRendererActing.current !== true
    ) {
      const previousFiber = ReactCurrentFiberCurrent;
      try {
        setCurrentDebugFiberInDEV(fiber);
        console.error(
          "It looks like you're using the wrong act() around your test interactions.\n" +
            'Be sure to use the matching version of act() corresponding to your renderer:\n\n' +
            '// for react-dom:\n' +
            // Break up imports to avoid accidentally parsing them as dependencies.
            'import {act} fr' +
            "om 'react-dom/test-utils';\n" +
            '// ...\n' +
            'act(() => ...);\n\n' +
            '// for react-test-renderer:\n' +
            // Break up imports to avoid accidentally parsing them as dependencies.
            'import TestRenderer fr' +
            "om react-test-renderer';\n" +
            'const {act} = TestRenderer;\n' +
            '// ...\n' +
            'act(() => ...);',
        );
      } finally {
        if (previousFiber) {
          setCurrentDebugFiberInDEV(fiber);
        } else {
          resetCurrentDebugFiberInDEV();
        }
      }
    }
  }
}

export function warnIfNotCurrentlyActingEffectsInDEV(fiber: Fiber): void {
  if (__DEV__) {
    if (
      warnsIfNotActing === true &&
      (fiber.mode & StrictMode) !== NoMode &&
      IsSomeRendererActing.current === false &&
      IsThisRendererActing.current === false
    ) {
      console.error(
        'An update to %s ran an effect, but was not wrapped in act(...).\n\n' +
          'When testing, code that causes React state updates should be ' +
          'wrapped into act(...):\n\n' +
          'act(() => {\n' +
          '  /* fire events that update state */\n' +
          '});\n' +
          '/* assert on the output */\n\n' +
          "This ensures that you're testing the behavior the user would see " +
          'in the browser.' +
          ' Learn more at https://fb.me/react-wrap-tests-with-act',
        getComponentName(fiber.type),
      );
    }
  }
}

function warnIfNotCurrentlyActingUpdatesInDEV(fiber: Fiber): void {
  if (__DEV__) {
    if (
      warnsIfNotActing === true &&
      executionContext === NoContext &&
      IsSomeRendererActing.current === false &&
      IsThisRendererActing.current === false
    ) {
      const previousFiber = ReactCurrentFiberCurrent;
      try {
        setCurrentDebugFiberInDEV(fiber);
        console.error(
          'An update to %s inside a test was not wrapped in act(...).\n\n' +
            'When testing, code that causes React state updates should be ' +
            'wrapped into act(...):\n\n' +
            'act(() => {\n' +
            '  /* fire events that update state */\n' +
            '});\n' +
            '/* assert on the output */\n\n' +
            "This ensures that you're testing the behavior the user would see " +
            'in the browser.' +
            ' Learn more at https://fb.me/react-wrap-tests-with-act',
          getComponentName(fiber.type),
        );
      } finally {
        if (previousFiber) {
          setCurrentDebugFiberInDEV(fiber);
        } else {
          resetCurrentDebugFiberInDEV();
        }
      }
    }
  }
}

export const warnIfNotCurrentlyActingUpdatesInDev = warnIfNotCurrentlyActingUpdatesInDEV;

// In tests, we want to enforce a mocked scheduler.
let didWarnAboutUnmockedScheduler = false;
// TODO Before we release concurrent mode, revisit this and decide whether a mocked
// scheduler is the actual recommendation. The alternative could be a testing build,
// a new lib, or whatever; we dunno just yet. This message is for early adopters
// to get their tests right.

export function warnIfUnmockedScheduler(fiber: Fiber) {
  if (__DEV__) {
    if (
      didWarnAboutUnmockedScheduler === false &&
      Scheduler.unstable_flushAllWithoutAsserting === undefined
    ) {
      if (fiber.mode & BlockingMode || fiber.mode & ConcurrentMode) {
        didWarnAboutUnmockedScheduler = true;
        console.error(
          'In Concurrent or Sync modes, the "scheduler" module needs to be mocked ' +
            'to guarantee consistent behaviour across tests and browsers. ' +
            'For example, with jest: \n' +
            // Break up requires to avoid accidentally parsing them as dependencies.
            "jest.mock('scheduler', () => require" +
            "('scheduler/unstable_mock'));\n\n" +
            'For more info, visit https://fb.me/react-mock-scheduler',
        );
      } else if (warnAboutUnmockedScheduler === true) {
        didWarnAboutUnmockedScheduler = true;
        console.error(
          'Starting from React v18, the "scheduler" module will need to be mocked ' +
            'to guarantee consistent behaviour across tests and browsers. ' +
            'For example, with jest: \n' +
            // Break up requires to avoid accidentally parsing them as dependencies.
            "jest.mock('scheduler', () => require" +
            "('scheduler/unstable_mock'));\n\n" +
            'For more info, visit https://fb.me/react-mock-scheduler',
        );
      }
    }
  }
}

function computeThreadID(root: FiberRoot, lane: Lane | Lanes) {
  // Interaction threads are unique per root and expiration time.
  // NOTE: Intentionally unsound cast. All that matters is that it's a number
  // and it represents a batch of work. Could make a helper function instead,
  // but meh this is fine for now.
  return (lane: any) * 1000 + root.interactionThreadID;
}

export function markSpawnedWork(lane: Lane | Lanes) {
  if (!enableSchedulerTracing) {
    return;
  }
  if (spawnedWorkDuringRender === null) {
    spawnedWorkDuringRender = [lane];
  } else {
    spawnedWorkDuringRender.push(lane);
  }
}

function scheduleInteractions(
  root: FiberRoot,
  lane: Lane | Lanes,
  interactions: Set<Interaction>,
) {
  if (!enableSchedulerTracing) {
    return;
  }
  if (interactions.size > 0) {
    const pendingInteractionMap = root.pendingInteractionMap;
    const pendingInteractions = pendingInteractionMap.get(lane);
    if (pendingInteractions != null) {
      interactions.forEach(interaction => {
        if (!pendingInteractions.has(interaction)) {
          // Update the pending async work count for previously unscheduled interaction.
          interaction.__count++;
        }

        pendingInteractions.add(interaction);
      });
    } else {
      pendingInteractionMap.set(lane, new Set(interactions));

      // Update the pending async work count for the current interactions.
      interactions.forEach(interaction => {
        interaction.__count++;
      });
    }

    const subscriber = __subscriberRef.current;
    if (subscriber !== null) {
      const threadID = computeThreadID(root, lane);
      subscriber.onWorkScheduled(interactions, threadID);
    }
  }
}

function schedulePendingInteractions(root: FiberRoot, lane: Lane | Lanes) {
  // This is called when work is scheduled on a root.
  // 当在根节点上被调度任务时被调用
  // It associates the current interactions with the newly-scheduled expiration.
  // They will be restored when that expiration is later committed.
  if (!enableSchedulerTracing) {
    return;
  }
  scheduleInteractions(root, lane, __interactionsRef.current);
}

function startWorkOnPendingInteractions(root: FiberRoot, lanes: Lanes) {
  // This is called when new work is started on a root.
  if (!enableSchedulerTracing) {
    return;
  }

  // Determine which interactions this batch of work currently includes, So that
  // we can accurately attribute time spent working on it, And so that cascading
  // work triggered during the render phase will be associated with it.
  const interactions: Set<Interaction> = new Set();
  root.pendingInteractionMap.forEach((scheduledInteractions, scheduledLane) => {
    if (includesSomeLane(lanes, scheduledLane)) {
      scheduledInteractions.forEach(interaction =>
        interactions.add(interaction),
      );
    }
  });

  // Store the current set of interactions on the FiberRoot for a few reasons:
  // We can re-use it in hot functions like performConcurrentWorkOnRoot()
  // without having to recalculate it. We will also use it in commitWork() to
  // pass to any Profiler onRender() hooks. This also provides DevTools with a
  // way to access it when the onCommitRoot() hook is called.
  root.memoizedInteractions = interactions;

  if (interactions.size > 0) {
    const subscriber = __subscriberRef.current;
    if (subscriber !== null) {
      const threadID = computeThreadID(root, lanes);
      try {
        subscriber.onWorkStarted(interactions, threadID);
      } catch (error) {
        // If the subscriber throws, rethrow it in a separate task
        scheduleCallback(ImmediateSchedulerPriority, () => {
          throw error;
        });
      }
    }
  }
}

function finishPendingInteractions(root, committedLanes) {
  if (!enableSchedulerTracing) {
    return;
  }

  const remainingLanesAfterCommit = root.pendingLanes;

  let subscriber;

  try {
    subscriber = __subscriberRef.current;
    if (subscriber !== null && root.memoizedInteractions.size > 0) {
      // FIXME: More than one lane can finish in a single commit.
      const threadID = computeThreadID(root, committedLanes);
      subscriber.onWorkStopped(root.memoizedInteractions, threadID);
    }
  } catch (error) {
    // If the subscriber throws, rethrow it in a separate task
    scheduleCallback(ImmediateSchedulerPriority, () => {
      throw error;
    });
  } finally {
    // Clear completed interactions from the pending Map.
    // Unless the render was suspended or cascading work was scheduled,
    // In which case– leave pending interactions until the subsequent render.
    const pendingInteractionMap = root.pendingInteractionMap;
    pendingInteractionMap.forEach((scheduledInteractions, lane) => {
      // Only decrement the pending interaction count if we're done.
      // If there's still work at the current priority,
      // That indicates that we are waiting for suspense data.
      if (!includesSomeLane(remainingLanesAfterCommit, lane)) {
        pendingInteractionMap.delete(lane);

        scheduledInteractions.forEach(interaction => {
          interaction.__count--;

          if (subscriber !== null && interaction.__count === 0) {
            try {
              subscriber.onInteractionScheduledWorkCompleted(interaction);
            } catch (error) {
              // If the subscriber throws, rethrow it in a separate task
              scheduleCallback(ImmediateSchedulerPriority, () => {
                throw error;
              });
            }
          }
        });
      }
    });
  }
}

// `act` testing API
//
// TODO: This is mostly a copy-paste from the legacy `act`, which does not have
// access to the same internals that we do here. Some trade offs in the
// implementation no longer make sense.

let isFlushingAct = false;
let isInsideThisAct = false;

// TODO: Yes, this is confusing. See above comment. We'll refactor it.
function shouldForceFlushFallbacksInDEV() {
  if (!__DEV__) {
    // Never force flush in production. This function should get stripped out.
    return false;
  }
  // `IsThisRendererActing.current` is used by ReactTestUtils version of `act`.
  if (IsThisRendererActing.current) {
    // `isInsideAct` is only used by the reconciler implementation of `act`.
    // We don't want to flush suspense fallbacks until the end.
    return !isInsideThisAct;
  }
  // Flush callbacks at the end.
  return isFlushingAct;
}

const flushMockScheduler = Scheduler.unstable_flushAllWithoutAsserting;
const isSchedulerMocked = typeof flushMockScheduler === 'function';

// Returns whether additional work was scheduled. Caller should keep flushing
// until there's no work left.
function flushActWork(): boolean {
  if (flushMockScheduler !== undefined) {
    const prevIsFlushing = isFlushingAct;
    isFlushingAct = true;
    try {
      return flushMockScheduler();
    } finally {
      isFlushingAct = prevIsFlushing;
    }
  } else {
    // No mock scheduler available. However, the only type of pending work is
    // passive effects, which we control. So we can flush that.
    const prevIsFlushing = isFlushingAct;
    isFlushingAct = true;
    try {
      let didFlushWork = false;
      while (flushPassiveEffects()) {
        didFlushWork = true;
      }
      return didFlushWork;
    } finally {
      isFlushingAct = prevIsFlushing;
    }
  }
}

function flushWorkAndMicroTasks(onDone: (err: ?Error) => void) {
  try {
    flushActWork();
    enqueueTask(() => {
      if (flushActWork()) {
        flushWorkAndMicroTasks(onDone);
      } else {
        onDone();
      }
    });
  } catch (err) {
    onDone(err);
  }
}

// we track the 'depth' of the act() calls with this counter,
// so we can tell if any async act() calls try to run in parallel.

let actingUpdatesScopeDepth = 0;
let didWarnAboutUsingActInProd = false;

export function act(callback: () => Thenable<mixed>): Thenable<void> {
  if (!__DEV__) {
    if (didWarnAboutUsingActInProd === false) {
      didWarnAboutUsingActInProd = true;
      // eslint-disable-next-line react-internal/no-production-logging
      console.error(
        'act(...) is not supported in production builds of React, and might not behave as expected.',
      );
    }
  }

  const previousActingUpdatesScopeDepth = actingUpdatesScopeDepth;
  actingUpdatesScopeDepth++;

  const previousIsSomeRendererActing = IsSomeRendererActing.current;
  const previousIsThisRendererActing = IsThisRendererActing.current;
  const previousIsInsideThisAct = isInsideThisAct;
  IsSomeRendererActing.current = true;
  IsThisRendererActing.current = true;
  isInsideThisAct = true;

  function onDone() {
    actingUpdatesScopeDepth--;
    IsSomeRendererActing.current = previousIsSomeRendererActing;
    IsThisRendererActing.current = previousIsThisRendererActing;
    isInsideThisAct = previousIsInsideThisAct;
    if (__DEV__) {
      if (actingUpdatesScopeDepth > previousActingUpdatesScopeDepth) {
        // if it's _less than_ previousActingUpdatesScopeDepth, then we can assume the 'other' one has warned
        console.error(
          'You seem to have overlapping act() calls, this is not supported. ' +
            'Be sure to await previous act() calls before making a new one. ',
        );
      }
    }
  }

  let result;
  try {
    result = batchedUpdates(callback);
  } catch (error) {
    // on sync errors, we still want to 'cleanup' and decrement actingUpdatesScopeDepth
    onDone();
    throw error;
  }

  if (
    result !== null &&
    typeof result === 'object' &&
    typeof result.then === 'function'
  ) {
    // setup a boolean that gets set to true only
    // once this act() call is await-ed
    let called = false;
    if (__DEV__) {
      if (typeof Promise !== 'undefined') {
        //eslint-disable-next-line no-undef
        Promise.resolve()
          .then(() => {})
          .then(() => {
            if (called === false) {
              console.error(
                'You called act(async () => ...) without await. ' +
                  'This could lead to unexpected testing behaviour, interleaving multiple act ' +
                  'calls and mixing their scopes. You should - await act(async () => ...);',
              );
            }
          });
      }
    }

    // in the async case, the returned thenable runs the callback, flushes
    // effects and  microtasks in a loop until flushPassiveEffects() === false,
    // and cleans up
    return {
      then(resolve, reject) {
        called = true;
        result.then(
          () => {
            if (
              actingUpdatesScopeDepth > 1 ||
              (isSchedulerMocked === true &&
                previousIsSomeRendererActing === true)
            ) {
              onDone();
              resolve();
              return;
            }
            // we're about to exit the act() scope,
            // now's the time to flush tasks/effects
            flushWorkAndMicroTasks((err: ?Error) => {
              onDone();
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          },
          err => {
            onDone();
            reject(err);
          },
        );
      },
    };
  } else {
    if (__DEV__) {
      if (result !== undefined) {
        console.error(
          'The callback passed to act(...) function ' +
            'must return undefined, or a Promise. You returned %s',
          result,
        );
      }
    }

    // flush effects until none remain, and cleanup
    try {
      if (
        actingUpdatesScopeDepth === 1 &&
        (isSchedulerMocked === false || previousIsSomeRendererActing === false)
      ) {
        // we're about to exit the act() scope,
        // now's the time to flush effects
        flushActWork();
      }
      onDone();
    } catch (err) {
      onDone();
      throw err;
    }

    // in the sync case, the returned thenable only warns *if* await-ed
    return {
      then(resolve) {
        if (__DEV__) {
          console.error(
            'Do not await the result of calling act(...) with sync logic, it is not a Promise.',
          );
        }
        resolve();
      },
    };
  }
}

function detachFiberAfterEffects(fiber: Fiber): void {
  fiber.sibling = null;
}
