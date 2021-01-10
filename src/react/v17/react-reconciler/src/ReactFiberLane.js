/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {FiberRoot, ReactPriorityLevel} from './ReactInternalTypes';

export opaque type LanePriority =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17;
export opaque type Lanes = number;
export opaque type Lane = number;
export opaque type LaneMap<T> = Array<T>;

import invariant from 'shared/invariant';

import {
  ImmediatePriority as ImmediateSchedulerPriority,
  UserBlockingPriority as UserBlockingSchedulerPriority,
  NormalPriority as NormalSchedulerPriority,
  LowPriority as LowSchedulerPriority,
  IdlePriority as IdleSchedulerPriority,
  NoPriority as NoSchedulerPriority,
} from './SchedulerWithReactIntegration.new';

export const SyncLanePriority: LanePriority = 15;
export const SyncBatchedLanePriority: LanePriority = 14;

const InputDiscreteHydrationLanePriority: LanePriority = 13;
export const InputDiscreteLanePriority: LanePriority = 12;

const InputContinuousHydrationLanePriority: LanePriority = 11;
export const InputContinuousLanePriority: LanePriority = 10;

const DefaultHydrationLanePriority: LanePriority = 9;
export const DefaultLanePriority: LanePriority = 8;

const TransitionHydrationPriority: LanePriority = 7;
export const TransitionPriority: LanePriority = 6;

const RetryLanePriority: LanePriority = 5;

const SelectiveHydrationLanePriority: LanePriority = 4;

const IdleHydrationLanePriority: LanePriority = 3;
const IdleLanePriority: LanePriority = 2;

const OffscreenLanePriority: LanePriority = 1;

export const NoLanePriority: LanePriority = 0;

const TotalLanes = 31;
// 利用 Math.abs() 可将Lane转换为10进制
export const NoLanes: Lanes = /*                        */ 0b0000000000000000000000000000000;
export const NoLane: Lane = /*                          */ 0b0000000000000000000000000000000;

export const SyncLane: Lane = /*                        */ 0b0000000000000000000000000000001;
export const SyncBatchedLane: Lane = /*                 */ 0b0000000000000000000000000000010;

export const InputDiscreteHydrationLane: Lane = /*      */ 0b0000000000000000000000000000100;
const InputDiscreteLanes: Lanes = /*                    */ 0b0000000000000000000000000011000;

const InputContinuousHydrationLane: Lane = /*           */ 0b0000000000000000000000000100000;
const InputContinuousLanes: Lanes = /*                  */ 0b0000000000000000000000011000000;

export const DefaultHydrationLane: Lane = /*            */ 0b0000000000000000000000100000000;
export const DefaultLanes: Lanes = /*                   */ 0b0000000000000000000111000000000;

const TransitionHydrationLane: Lane = /*                */ 0b0000000000000000001000000000000;
const TransitionLanes: Lanes = /*                       */ 0b0000000001111111110000000000000;

const RetryLanes: Lanes = /*                            */ 0b0000011110000000000000000000000;

export const SomeRetryLane: Lanes = /*                  */ 0b0000010000000000000000000000000;

export const SelectiveHydrationLane: Lane = /*          */ 0b0000100000000000000000000000000;

const NonIdleLanes = /*                                 */ 0b0000111111111111111111111111111;

export const IdleHydrationLane: Lane = /*               */ 0b0001000000000000000000000000000;
const IdleLanes: Lanes = /*                             */ 0b0110000000000000000000000000000;

export const OffscreenLane: Lane = /*                   */ 0b1000000000000000000000000000000;

export const NoTimestamp = -1;

let currentUpdateLanePriority: LanePriority = NoLanePriority;

export function getCurrentUpdateLanePriority(): LanePriority {
  return currentUpdateLanePriority;
}

export function setCurrentUpdateLanePriority(newLanePriority: LanePriority) {
  currentUpdateLanePriority = newLanePriority;
}

// "Registers" used to "return" multiple values
// Used by getHighestPriorityLanes and getNextLanes:
let return_highestLanePriority: LanePriority = DefaultLanePriority;

function getHighestPriorityLanes(lanes: Lanes | Lane): Lanes {
  // 相关commit https://github.com/facebook/react/pull/19302
  // 该函数的目的是找到对应优先级范围内优先级最高的那一批lanes
  if ((SyncLane & lanes) !== NoLanes) {
    // 如果lanes中有同步优先级的任务
    return_highestLanePriority = SyncLanePriority;
    return SyncLane;
  }
  if ((SyncBatchedLane & lanes) !== NoLanes) {
    // 如果lanes中有批量同步的优先级
    return_highestLanePriority = SyncBatchedLanePriority;
    return SyncBatchedLane;
  }
  if ((InputDiscreteHydrationLane & lanes) !== NoLanes) {
    // 选出lanes中与InputDiscreteLanes重合的非0位
    return_highestLanePriority = InputDiscreteHydrationLanePriority;
    return InputDiscreteHydrationLane;
  }
  const inputDiscreteLanes = InputDiscreteLanes & lanes;
  if (inputDiscreteLanes !== NoLanes) {
    return_highestLanePriority = InputDiscreteLanePriority;
    return inputDiscreteLanes;
  }
  if ((lanes & InputContinuousHydrationLane) !== NoLanes) {
    // 如果InputDiscreteLanes 中包含 InputDiscreteHydrationLane
    return_highestLanePriority = InputContinuousHydrationLanePriority;
    return InputContinuousHydrationLane;
  }
  const inputContinuousLanes = InputContinuousLanes & lanes;
  if (inputContinuousLanes !== NoLanes) {
    return_highestLanePriority = InputContinuousLanePriority;
    return inputContinuousLanes;
  }
  if ((lanes & DefaultHydrationLane) !== NoLanes) {
    return_highestLanePriority = DefaultHydrationLanePriority;
    return DefaultHydrationLane;
  }
  const defaultLanes = DefaultLanes & lanes;
  if (defaultLanes !== NoLanes) {
    return_highestLanePriority = DefaultLanePriority;
    return defaultLanes;
  }
  if ((lanes & TransitionHydrationLane) !== NoLanes) {
    return_highestLanePriority = TransitionHydrationPriority;
    return TransitionHydrationLane;
  }
  const transitionLanes = TransitionLanes & lanes;
  if (transitionLanes !== NoLanes) {
    return_highestLanePriority = TransitionPriority;
    return transitionLanes;
  }
  const retryLanes = RetryLanes & lanes;
  if (retryLanes !== NoLanes) {
    return_highestLanePriority = RetryLanePriority;
    return retryLanes;
  }
  if (lanes & SelectiveHydrationLane) {
    return_highestLanePriority = SelectiveHydrationLanePriority;
    return SelectiveHydrationLane;
  }
  if ((lanes & IdleHydrationLane) !== NoLanes) {
    return_highestLanePriority = IdleHydrationLanePriority;
    return IdleHydrationLane;
  }
  const idleLanes = IdleLanes & lanes;
  if (idleLanes !== NoLanes) {
    return_highestLanePriority = IdleLanePriority;
    return idleLanes;
  }
  if ((OffscreenLane & lanes) !== NoLanes) {
    return_highestLanePriority = OffscreenLanePriority;
    return OffscreenLane;
  }
  if (__DEV__) {
    console.error('Should have found matching lanes. This is a bug in React.');
  }
  // This shouldn't be reachable, but as a fallback, return the entire bitmask.
  return_highestLanePriority = DefaultLanePriority;
  return lanes;
}

/**
* 将scheduler的优先级转化为lane的优先级。
 事件触发时，持有的事件优先级会被scheduler记录下变成scheduler的优先级
 这个优先级要参与到update.lane的计算中去，但参与之前，要先将这个scheduler的优先级
 转换为lane能够理解的优先级。
 * */
export function schedulerPriorityToLanePriority(
  schedulerPriorityLevel: ReactPriorityLevel,
): LanePriority {
  switch (schedulerPriorityLevel) {
    case ImmediateSchedulerPriority:
      return SyncLanePriority;
    case UserBlockingSchedulerPriority:
      return InputContinuousLanePriority;
    case NormalSchedulerPriority:
    case LowSchedulerPriority:
      // TODO: Handle LowSchedulerPriority, somehow. Maybe the same lane as hydration.
      return DefaultLanePriority;
    case IdleSchedulerPriority:
      return IdleLanePriority;
    default:
      return NoLanePriority;
  }
}

/**
 * Scheduler调度一个React任务的时候，要通过lane的优先级计算出Scheduler能够识别的优先级
 * 该函数就是做这个的
 *
 * */
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
    case TransitionHydrationPriority:
    case TransitionPriority:
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

export function getNextLanes(root: FiberRoot, wipLanes: Lanes): Lanes {
  // 该函数从root.pendingLanes中找出优先级最高的lane

  // Early bailout if there's no pending work left.
  // 在没有剩余任务的时候，跳出更新
  const pendingLanes = root.pendingLanes;
  if (pendingLanes === NoLanes) {
    return_highestLanePriority = NoLanePriority;
    return NoLanes;
  }

  let nextLanes = NoLanes;
  let nextLanePriority = NoLanePriority;

  const expiredLanes = root.expiredLanes;
  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes;

  // Check if any work has expired.
  // 检查是否有更新已经过期
  if (expiredLanes !== NoLanes) {
    // 已经过期了，就需要把渲染优先级设置为同步，来让更新立即执行
    nextLanes = expiredLanes;
    nextLanePriority = return_highestLanePriority = SyncLanePriority;
  } else {
    // Do not work on any idle work until all the non-idle work has finished,
    // even if the work is suspended.
    // 即使具有优先级的任务被挂起，也不要处理空闲的任务，除非有优先级的任务都被处理完了

    // nonIdlePendingLanes 是所有需要处理的优先级。然后判断这些优先级
    // （nonIdlePendingLanes）是不是为空。
    //
    // 不为空的话，把被挂起任务的优先级踢出去，只剩下那些真正待处理的任务的优先级集合。
    // 然后从这些优先级里找出最紧急的return出去。如果已经将挂起任务优先级踢出了之后还是
    // 为空，那么就说明需要处理这些被挂起的任务了。将它们重启。pingedLanes是那些被挂起
    // 任务的优先级

    const nonIdlePendingLanes = pendingLanes & NonIdleLanes;
    if (nonIdlePendingLanes !== NoLanes) {
      const nonIdleUnblockedLanes = nonIdlePendingLanes & ~suspendedLanes;
      // nonIdleUnblockedLanes也就是未被阻塞的那些lanes，未被阻塞，那就应该去处理。
      // 它等于所有未闲置的lanes中除去被挂起的那些lanes。& ~ 相当于删除
      if (nonIdleUnblockedLanes !== NoLanes) {
        // nonIdleUnblockedLanes不为空，说明如果有任务需要被处理。
        // 那么从这些任务中挑出最重要的
        nextLanes = getHighestPriorityLanes(nonIdleUnblockedLanes);
        nextLanePriority = return_highestLanePriority;
      } else {
        // 如果目前没有任务需要被处理，就从正在那些被挂起的lanes中找到优先级最高的
        const nonIdlePingedLanes = nonIdlePendingLanes & pingedLanes;
        if (nonIdlePingedLanes !== NoLanes) {
          nextLanes = getHighestPriorityLanes(nonIdlePingedLanes);
          nextLanePriority = return_highestLanePriority;
        }
      }
    } else {
      // The only remaining work is Idle.
      // 剩下的任务是闲置的任务。unblockedLanes是闲置任务的lanes
      const unblockedLanes = pendingLanes & ~suspendedLanes;
      if (unblockedLanes !== NoLanes) {
        // 从这些未被阻塞的闲置任务中挑出最重要的
        nextLanes = getHighestPriorityLanes(unblockedLanes);
        nextLanePriority = return_highestLanePriority;
      } else {
        if (pingedLanes !== NoLanes) {
          // 找到被挂起的那些任务中优先级最高的
          nextLanes = getHighestPriorityLanes(pingedLanes);
          nextLanePriority = return_highestLanePriority;
        }
      }
    }
  }

  if (nextLanes === NoLanes) {
    // 找了一圈之后发现nextLanes是空的，return一个空
    // This should only be reachable if we're suspended
    // TODO: Consider warning in this path if a fallback timer is not scheduled.
    return NoLanes;
  }

  // If there are higher priority lanes, we'll include them even if they
  // are suspended.
  // 如果有更高优先级的lanes，即使它们被挂起，也会放到nextLanes里。
  nextLanes = pendingLanes & getEqualOrHigherPriorityLanes(nextLanes);
  // nextLanes 实际上是待处理的lanes中优先级较高的那些lanes

  // If we're already in the middle of a render, switching lanes will interrupt
  // it and we'll lose our progress. We should only do this if the new lanes are
  // higher priority.
  /*
   * 翻译：如果已经在渲染过程中，切换lanes会中断渲染，将会丢失进程。
   * 只有在新lanes有更高优先级的情况下，才应该这样做。（只有在高优先级的任务插队时，才会这样做）
   *
   * 理解：如果正在渲染，但是新任务的优先级不足，那么不管它，继续往下渲染，只有在新的优先级比当前的正在
   * 渲染的优先级高的时候，才去打断（高优先级任务插队）
  * */

  if (
    wipLanes !== NoLanes &&
    wipLanes !== nextLanes &&
    // If we already suspended with a delay, then interrupting is fine. Don't
    // bother waiting until the root is complete.
    (wipLanes & suspendedLanes) === NoLanes
  ) {
    getHighestPriorityLanes(wipLanes);
    const wipLanePriority = return_highestLanePriority;
    if (nextLanePriority <= wipLanePriority) {
      return wipLanes;
    } else {
      return_highestLanePriority = nextLanePriority;
    }
  }

  // 以下内容暂时未完全理解，翻译仅供参考
  // Check for entangled lanes and add them to the batch.
  // 检查entangled lanes并把它们加入到批处理中
  //
  // A lane is said to be entangled with another when it's not allowed to render
  // in a batch that does not also include the other lane. Typically we do this
  // when multiple updates have the same source, and we only want to respond to
  // the most recent event from that source.
  /*
    * 当一个lane禁止在不包括其他lane的批处理中渲染时，它被称为与另一个lane纠缠在一起。通常，当多个更
    * 新具有相同的源时，我们会这样做，并且我们只想响应来自该源的最新事件。
    * */

  //
  // Note that we apply entanglements *after* checking for partial work above.
  // This means that if a lane is entangled during an interleaved event while
  // it's already rendering, we won't interrupt it. This is intentional, since
  // entanglement is usually "best effort": we'll try our best to render the
  // lanes in the same batch, but it's not worth throwing out partially
  // completed work in order to do it.
  //
  /*
  * 注意，我们在检查了上面的部分工作之后应用了纠缠。
    这意味着如果一个lane在交替事件中被纠缠，而它已经被渲染，我们不会中断它。这是有意为之，因为纠缠通常
    是“最好的努力”:我们将尽最大努力在同一批中渲染lanes，但不值得为了这样做而放弃部分完成的工作。
  * */

  // For those exceptions where entanglement is semantically important, like
  // useMutableSource, we should ensure that there is no partial work at the
  // time we apply the entanglement.
  /*
    * 对于那些纠缠在语义上很重要的例外，比如useMutableSource，我们应该确保在应用纠缠时没有部分工作。
    * */
  const entangledLanes = root.entangledLanes;
  if (entangledLanes !== NoLanes) {
    const entanglements = root.entanglements;
    let lanes = nextLanes & entangledLanes;
    while (lanes > 0) {
      const index = pickArbitraryLaneIndex(lanes);
      const lane = 1 << index;

      nextLanes |= entanglements[index];

      lanes &= ~lane;
    }
  }

  return nextLanes;
}

export function getMostRecentEventTime(root: FiberRoot, lanes: Lanes): number {
  const eventTimes = root.eventTimes;

  let mostRecentEventTime = NoTimestamp;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;

    const eventTime = eventTimes[index];
    if (eventTime > mostRecentEventTime) {
      mostRecentEventTime = eventTime;
    }

    lanes &= ~lane;
  }

  return mostRecentEventTime;
}

function computeExpirationTime(lane: Lane, currentTime: number) {
/**
 *   这个函数是计算lane的过期时间的，与饥饿问题相关
 * */

  // TODO: Expiration heuristic is constant per lane, so could use a map.
  getHighestPriorityLanes(lane);
  const priority = return_highestLanePriority;
  if (priority >= InputContinuousLanePriority) {
    // User interactions should expire slightly more quickly.
    //
    // NOTE: This is set to the corresponding constant as in Scheduler.js. When
    // we made it larger, a product metric in www regressed, suggesting there's
    // a user interaction that's being starved by a series of synchronous
    // updates. If that theory is correct, the proper solution is to fix the
    // starvation. However, this scenario supports the idea that expiration
    // times are an important safeguard when starvation does happen.
    //
    // Also note that, in the case of user input specifically, this will soon no
    // longer be an issue because we plan to make user input synchronous by
    // default (until you enter `startTransition`, of course.)
    //
    // If weren't planning to make these updates synchronous soon anyway, I
    // would probably make this number a configurable parameter.
    return currentTime + 250;
  } else if (priority >= TransitionPriority) {
    return currentTime + 5000;
  } else {
    // Anything idle priority or lower should never expire.
    // 任何空闲或更低的优先级都不应该过期。
    return NoTimestamp;
  }
}

export function markStarvedLanesAsExpired(
  root: FiberRoot,
  currentTime: number,
): void {
  /**
  * 计算lane的过期时间，饥饿问题（过期的lane被立即执行）的关键所在
   * 模型是这样的，假设lanes有7个二进制位（实际是31个）：
     0b0011000
     对应一个7个元素的数组，每个元素表示一个过期时间，与lanes中的位相对应
     [ -1, -1, 4395.2254, -1, -1, -1, -1 ]
     -1表示任务未过期。root.expirationTimes就是这个数组
   *
  * */
  // TODO: This gets called every time we yield. We can optimize by storing
  // the earliest expiration time on the root. Then use that to quickly bail out
  // of this function.
  const pendingLanes = root.pendingLanes;
  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes;
  const expirationTimes = root.expirationTimes;

  // Iterate through the pending lanes and check if we've reached their
  // expiration time. If so, we'll assume the update is being starved and mark
  // it as expired to force it to finish.
  // 遍历待处理的lanes，检查是否到了过期时间，如果过期，
  // 将这个更新视为饥饿状态并把它们标记成过期，强制更新

  let lanes = pendingLanes;
  while (lanes > 0) {
    // pickArbitraryLaneIndex是找到lanes中最靠左的那个1在lanes中的index
    // 意味着标记饥饿lane是从优先级最低的部分开始的

    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;
    // 上边两行的计算过程举例如下：
    //   lanes = 0b0000000000000000000000000011100
    //   index = 4

    //       1 = 0b0000000000000000000000000000001
    //  1 << 4 = 0b0000000000000000000000000001000

    //    lane = 0b0000000000000000000000000001000

    const expirationTime = expirationTimes[index];
    if (expirationTime === NoTimestamp) {
      // Found a pending lane with no expiration time. If it's not suspended, or
      // if it's pinged, assume it's CPU-bound. Compute a new expiration time
      // using the current time.
      // 发现一个没有过期时间并且待处理的lane，如果它没被挂起或者被触发，那么将它视为CPU密集型的任务，
      // 用当前时间计算一个新的过期时间
      if (
        (lane & suspendedLanes) === NoLanes ||
        (lane & pingedLanes) !== NoLanes
      ) {
        // Assumes timestamps are monotonically increasing.
        // 实际上这里是在计算当前lane的过期时间
        expirationTimes[index] = computeExpirationTime(lane, currentTime);
      }
    } else if (expirationTime <= currentTime) {
      // This lane expired
      // 已经过期，将lane并入到expiredLanes中，实现了将lanes标记为过期
      root.expiredLanes |= lane;
    }
    // 将lane从lanes中删除，每循环一次删除一个，直到lanes清空成0，结束循环
    lanes &= ~lane;
  }
}

// This returns the highest priority pending lanes regardless of whether they
// are suspended.
export function getHighestPriorityPendingLanes(root: FiberRoot) {
  return getHighestPriorityLanes(root.pendingLanes);
}

export function getLanesToRetrySynchronouslyOnError(root: FiberRoot): Lanes {
  const everythingButOffscreen = root.pendingLanes & ~OffscreenLane;
  if (everythingButOffscreen !== NoLanes) {
    return everythingButOffscreen;
  }
  if (everythingButOffscreen & OffscreenLane) {
    return OffscreenLane;
  }
  return NoLanes;
}

export function returnNextLanesPriority() {
  return return_highestLanePriority;
}
export function includesNonIdleWork(lanes: Lanes) {
  return (lanes & NonIdleLanes) !== NoLanes;
}
export function includesOnlyRetries(lanes: Lanes) {
  return (lanes & RetryLanes) === lanes;
}
export function includesOnlyTransitions(lanes: Lanes) {
  return (lanes & TransitionLanes) === lanes;
}

// To ensure consistency across multiple updates in the same event, this should
// be a pure function, so that it always returns the same lane for given inputs.
// 确保同一事件中多个更新之间的一致性
// 对于同一个事件中的多次更新，如果一个优先级范围的lanes占满了，那么到相邻的较低优先级范围内寻找
// 多个更新，优先级依次降低的是不会打断原有更新任务的调度过程的，只有高优先级的更新才会打断
export function findUpdateLane(
  lanePriority: LanePriority,
  wipLanes: Lanes,
): Lane {
  switch (lanePriority) {
    case NoLanePriority:
      break;
    case SyncLanePriority:
      return SyncLane;
    case SyncBatchedLanePriority:
      return SyncBatchedLane;
    case InputDiscreteLanePriority: {
      const lane = pickArbitraryLane(InputDiscreteLanes & ~wipLanes);
      if (lane === NoLane) {
        // 下移到下个优先级范围内寻找空闲的lane
        return findUpdateLane(InputContinuousLanePriority, wipLanes);
      }
      return lane;
    }
    case InputContinuousLanePriority: {
      const lane = pickArbitraryLane(InputContinuousLanes & ~wipLanes);
      if (lane === NoLane) {
        // 下移到下个优先级范围内寻找空闲的lane
        return findUpdateLane(DefaultLanePriority, wipLanes);
      }
      return lane;
    }
    case DefaultLanePriority: {
      let lane = pickArbitraryLane(DefaultLanes & ~wipLanes);
      if (lane === NoLane) {
        // If all the default lanes are already being worked on, look for a
        // lane in the transition range.
        // 如果所有的位都被占用了，那么去transition的区间中去寻找空闲的位，因为
        // transition范围内的可用位数更多
        lane = pickArbitraryLane(TransitionLanes & ~wipLanes);
        if (lane === NoLane) {
          // All the transition lanes are taken, too. This should be very
          // rare, but as a last resort, pick a default lane. This will have
          // the effect of interrupting the current work-in-progress render.
          // 基本不会出现的一种场景是所有的lane位都被占用了，那么这时候赋值一个默认优先级级别的lane，
          // 但是这将会打断正在渲染的工作
          lane = pickArbitraryLane(DefaultLanes);
        }
      }
      return lane;
    }
    case TransitionPriority: // Should be handled by findTransitionLane instead
    case RetryLanePriority: // Should be handled by findRetryLane instead
      break;
    case IdleLanePriority:
      let lane = pickArbitraryLane(IdleLanes & ~wipLanes);
      if (lane === NoLane) {
        lane = pickArbitraryLane(IdleLanes);
      }
      return lane;
    default:
      // The remaining priorities are not valid for updates
      break;
  }
  invariant(
    false,
    'Invalid update priority: %s. This is a bug in React.',
    lanePriority,
  );
}

// To ensure consistency across multiple updates in the same event, this should
// be pure function, so that it always returns the same lane for given inputs.
export function findTransitionLane(wipLanes: Lanes, pendingLanes: Lanes): Lane {
  // First look for lanes that are completely unclaimed, i.e. have no
  // pending work.
  let lane = pickArbitraryLane(TransitionLanes & ~pendingLanes);
  if (lane === NoLane) {
    // If all lanes have pending work, look for a lane that isn't currently
    // being worked on.
    lane = pickArbitraryLane(TransitionLanes & ~wipLanes);
    if (lane === NoLane) {
      // If everything is being worked on, pick any lane. This has the
      // effect of interrupting the current work-in-progress.
      lane = pickArbitraryLane(TransitionLanes);
    }
  }
  return lane;
}

// To ensure consistency across multiple updates in the same event, this should
// be pure function, so that it always returns the same lane for given inputs.
export function findRetryLane(wipLanes: Lanes): Lane {
  // This is a fork of `findUpdateLane` designed specifically for Suspense
  // "retries" — a special update that attempts to flip a Suspense boundary
  // from its placeholder state to its primary/resolved state.
  let lane = pickArbitraryLane(RetryLanes & ~wipLanes);
  if (lane === NoLane) {
    lane = pickArbitraryLane(RetryLanes);
  }
  return lane;
}

function getHighestPriorityLane(lanes: Lanes) {
  return lanes & -lanes;
}

function getLowestPriorityLane(lanes: Lanes): Lane {
  // This finds the most significant non-zero bit.
  // 找到lanes中优先级最低的那一个lane
  /**
   * @From MDN https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32
   * Math.clz32() 函数返回一个数字在转换成 32 无符号整形数字的二进制形式后,
   * 开头的 0 的个数, 比如 0b0000000000000000000000011100000, 开头的
   * 0 的个数是 24 个, 则
   * Math.clz32(0b0000000000000000000000011100000) 返回 24.
   *        1 => 0b0000000000000000000000000000001
   * 1 << 24  =  0b0000001000000000000000000000000
   *
   * */

  const index = 31 - clz32(lanes);
  return index < 0 ? NoLanes : 1 << index;
}

function getEqualOrHigherPriorityLanes(lanes: Lanes | Lane): Lanes {
  /**
   *
     假设lanes：0b001100
     通过getLowestPriorityLane(lanes)找到lanes中优先级最低的那一个lane：
     0b001000

     将这个lane再向左移动一位：
     0b001000 << 1 = 0b010000

     将结果再减1操作：
     0b010000 - 1 = 0b001111


                最终的结果为    -------- 0b001111
lanes中优先级最低的那个lane为  ---------- 0b001000

     0b001111中1的位总是在0b001000中的位的右边，且包含它

   * */
  return (getLowestPriorityLane(lanes) << 1) - 1;
}

export function pickArbitraryLane(lanes: Lanes): Lane {
  // This wrapper function gets inlined. Only exists so to communicate that it
  // doesn't matter which bit is selected; you can pick any bit without
  // affecting the algorithms where its used. Here I'm using
  // getHighestPriorityLane because it requires the fewest operations.
  return getHighestPriorityLane(lanes);
}

function pickArbitraryLaneIndex(lanes: Lanes) {
  // 找到lanes中优先级最低的lane(最靠左的那个1的index)
  return 31 - clz32(lanes);
}

function laneToIndex(lane: Lane) {
  return pickArbitraryLaneIndex(lane);
}

export function includesSomeLane(a: Lanes | Lane, b: Lanes | Lane) {
  return (a & b) !== NoLanes;
}

export function isSubsetOfLanes(set: Lanes, subset: Lanes | Lane) {
  /*
    * 校验set中有没有subset
    * 按位或 &：对每个 bit 执行 & 操作, 如果相同位数的 bit 都为 1, 则结果为 1
    *
    *         set   &  subset === subset
    * 二进制  10    &  2      = 2
    * 十进制  1010  &  0010   = 0010
    *
    * 上述操作是在1010（Lanes）中尝试取0010（Lane）的子集，如果子集等于 0010 （Lane）本身，说明
    * set 中包含 subset
    *
    *
* */

  return (set & subset) === subset;
}

export function mergeLanes(a: Lanes | Lane, b: Lanes | Lane): Lanes {
  // | 可实现授权的功能。可理解成此函数的返回值是 a 和 b。
  // 也就是相当于把 a 和 b合并成一个Lanes（优先级分组），生成
  // 一个新的优先级范围

  return a | b;
}

export function removeLanes(set: Lanes, subset: Lanes | Lane): Lanes {
  // 从一个lanes中删除某个lane
  return set & ~subset;
}

// Seems redundant, but it changes the type from a single lane (used for
// updates) to a group of lanes (used for flushing work).
// 看起来有些多余，但它将类型从单个lane(用于更新)更改为一组Lanes(用于刷新工作)。
export function laneToLanes(lane: Lane): Lanes {
  return lane;
}

export function higherPriorityLane(a: Lane, b: Lane) {
  // This works because the bit ranges decrease in priority as you go left.
  // 优先级在位中是从从右往左递减，优先级越低。
  return a !== NoLane && a < b ? a : b;
}

export function higherLanePriority(
  a: LanePriority,
  b: LanePriority,
): LanePriority {
  return a !== NoLanePriority && a > b ? a : b;
}

export function createLaneMap<T>(initial: T): LaneMap<T> {
  return new Array(TotalLanes).fill(initial);
}

export function markRootUpdated(
  root: FiberRoot,
  updateLane: Lane,
  eventTime: number,
) {

  // 将本次更新的lane放入root的pendingLanes
  root.pendingLanes |= updateLane;

  // TODO: Theoretically, any update to any lane can unblock any other lane. But
  // it's not practical to try every single possible combination. We need a
  // heuristic to decide which lanes to attempt to render, and in which batches.
  // For now, we use the same heuristic as in the old ExpirationTimes model:
  // retry any lane at equal or lower priority, but don't try updates at higher
  // priority without also including the lower priority updates. This works well
  // when considering updates across different priority levels, but isn't
  // sufficient for updates within the same priority, since we want to treat
  // those updates as parallel.
  // 理论上，对任何lane的任何更新都可以解除对其他lane的封锁。但是尝试每一个可能的组合是不实际的。
  // 我们需要一种启发式算法来决定渲染哪些lanes要被尝试渲染，以及在哪个批次中处理它。当前是用的是
  // 与之前的过期时间模式相同的方式：对于优先级相同或者较低的lane进行重新处理，但是如果没有包含较
  // 低优先级的更新，就不会去处理高优先级的更新。当考虑跨不同优先级级别的更新时，这种方法很合适，但
  // 对于相同优先级的更新来说，这是不够的，因为我们希望对这些update并行处理。

  // 上面的意思是，现有的lanes优先级机制是模拟expirationTime的优先级机制，若在lanes中存在高低两种
  // 优先级的任务，那么会在高优先级任务完成后，再回来做低优先级的任务。比如lanes: 0b001100，React会
  // 优先处理倒数第三个1，完事之后再处理倒数第四个1，如果这两个1属于不同的优先级级别倒还好说，比如倒数
  // 第三个是A优先级集合中的一个lane，倒数第四个是B优先级集合中的一个lane，那么这是跨优先级层级的正常
  // 更新行为，但是如果这两个1都是属于B优先级集合中的lane，那么问题来了，现有的行为还是沿用上面提到的
  // 模拟expirationTime优先级机制下的更新行为，即做完高优任务回过头重做低优任务，但是React的希望是在
  // 一次更新任务中把两个1都处理掉，所以这里写了个Todo

  // Unsuspend any update at equal or lower priority.
  // 取消同等或较低优先级的更新。

  const higherPriorityLanes = updateLane - 1; // Turns 0b1000 into 0b0111
  // (before) suspendedLanes 0b10100
  //                         &
  // higherPriorityLanes     0b01111
  // ----------------------------------
  // (after)  suspendedLanes 0b00100
  // 目的是剔除掉suspendedLanes 和 pingedLanes中优先级低于本次更新优先级（updateLane）的lane
  // 实现上方注释中的 “取消同等或较低优先级的更新。”
  root.suspendedLanes &= higherPriorityLanes;
  root.pingedLanes &= higherPriorityLanes;

  /*
  * 假设 lanes：0b000100
  * 那么eventTimes是这种形式： [ -1, -1, -1, 44573.3452, -1, -1 ]
  * 用一个数组去存储eventTimes，-1表示空位，非-1的位置与lanes中的1的位置相同
  * */
  const eventTimes = root.eventTimes;
  const index = laneToIndex(updateLane);
  // We can always overwrite an existing timestamp because we prefer the most
  // recent event, and we assume time is monotonically increasing.
  eventTimes[index] = eventTime;
}

export function markRootSuspended(root: FiberRoot, suspendedLanes: Lanes) {
  root.suspendedLanes |= suspendedLanes;
  root.pingedLanes &= ~suspendedLanes;

  // The suspended lanes are no longer CPU-bound. Clear their expiration times.
  const expirationTimes = root.expirationTimes;
  let lanes = suspendedLanes;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;

    expirationTimes[index] = NoTimestamp;

    lanes &= ~lane;
  }
}

export function markRootPinged(
  root: FiberRoot,
  pingedLanes: Lanes,
  eventTime: number,
) {
  root.pingedLanes |= root.suspendedLanes & pingedLanes;
}

export function markRootExpired(root: FiberRoot, expiredLanes: Lanes) {
  /**
   * root.expiredLanes |= expiredLanes & root.pendingLanes
   * 这种形式相当于 root.expiredLanes = root.expiredLanes | (expiredLanes & root.pendingLanes)
   * 目的是将pendingLanes 合并到 root.expiredLanes 中
   *
   * 例如：
        expiredLanes = 0101
   root.pendingLanes = 0100
   const result = expiredLanes & root.pendingLanes = 0100

   root.expiredLanes = 0010
   root.expiredLanes = root.expiredLanes | result = 0110
   * */

  root.expiredLanes |= expiredLanes & root.pendingLanes;
}

export function markDiscreteUpdatesExpired(root: FiberRoot) {
  root.expiredLanes |= InputDiscreteLanes & root.pendingLanes;
}

export function hasDiscreteLanes(lanes: Lanes) {
  return (lanes & InputDiscreteLanes) !== NoLanes;
}

export function markRootMutableRead(root: FiberRoot, updateLane: Lane) {
  root.mutableReadLanes |= updateLane & root.pendingLanes;
}

export function markRootFinished(root: FiberRoot, remainingLanes: Lanes) {
  // 从root.pendingLanes中删除remainingLanes
  /**
   * const a = 0b100
   const b = 0b010
   const c = a | b // 此时c是包含 a 和 b 的

   // -- c = 0b110
   ~b = 0b101
   c = c & ~b = 0b100 // 此时的c只有a
   * */

  const noLongerPendingLanes = root.pendingLanes & ~remainingLanes;

  root.pendingLanes = remainingLanes;

  // Let's try everything again
  root.suspendedLanes = 0;
  root.pingedLanes = 0;

  root.expiredLanes &= remainingLanes;
  root.mutableReadLanes &= remainingLanes;

  root.entangledLanes &= remainingLanes;

  const entanglements = root.entanglements;
  const eventTimes = root.eventTimes;
  const expirationTimes = root.expirationTimes;
  /**
   * 假设 lanes = 0b0000000000000000000000000011100      // 十进制为10
   *     index = pickArbitraryLaneIndex(lanes)          // index = 4
   *                       // 1 为 0b0000000000000000000000000000001
   *     lane = 1 << 4  //        0b0000000000000000000000000001000
   * 经过
   * lanes &= ~lane
   * 的位运算
   *
   * lanes =0b0000000000000000000000000010100
   *
   * 我们只看后几位
   * 开始的   lanes 为 11100
   * 算出的    lane 为 01000
   * 最终的结果为       10100
   * ...
   * 最终计算到lanes 为 00000 结束
   * -----------------------------------------------------
   * 补充说明：
   *
   * lanes &= ~lane
   * 等价于
   * lanes = lanes & ~lane
   *
   * 例：
   *          lane = 0100
   *         ~lane = 1011
   *         lanes = 0101
   * lanes & ~lane = 0001
   * 相当于将 lane 从 lanes 中删除，直到删除到lanes全部是0

   * */

  // Clear the lanes that no longer have pending work
  let lanes = noLongerPendingLanes;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;

    entanglements[index] = NoLanes;
    eventTimes[index] = NoTimestamp;
    expirationTimes[index] = NoTimestamp;

    lanes &= ~lane;
  }
}

export function markRootEntangled(root: FiberRoot, entangledLanes: Lanes) {
  root.entangledLanes |= entangledLanes;

  const entanglements = root.entanglements;
  let lanes = entangledLanes;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;

    entanglements[index] |= entangledLanes;

    lanes &= ~lane;
  }
}

export function getBumpedLaneForHydration(
  root: FiberRoot,
  renderLanes: Lanes,
): Lane {
  getHighestPriorityLanes(renderLanes);
  const highestLanePriority = return_highestLanePriority;

  let lane;
  switch (highestLanePriority) {
    case SyncLanePriority:
    case SyncBatchedLanePriority:
      lane = NoLane;
      break;
    case InputDiscreteHydrationLanePriority:
    case InputDiscreteLanePriority:
      lane = InputDiscreteHydrationLane;
      break;
    case InputContinuousHydrationLanePriority:
    case InputContinuousLanePriority:
      lane = InputContinuousHydrationLane;
      break;
    case DefaultHydrationLanePriority:
    case DefaultLanePriority:
      lane = DefaultHydrationLane;
      break;
    case TransitionHydrationPriority:
    case TransitionPriority:
      lane = TransitionHydrationLane;
      break;
    case RetryLanePriority:
      // Shouldn't be reachable under normal circumstances, so there's no
      // dedicated lane for retry priority. Use the one for long transitions.
      lane = TransitionHydrationLane;
      break;
    case SelectiveHydrationLanePriority:
      lane = SelectiveHydrationLane;
      break;
    case IdleHydrationLanePriority:
    case IdleLanePriority:
      lane = IdleHydrationLane;
      break;
    case OffscreenLanePriority:
    case NoLanePriority:
      lane = NoLane;
      break;
    default:
      invariant(false, 'Invalid lane: %s. This is a bug in React.', lane);
  }

  // Check if the lane we chose is suspended. If so, that indicates that we
  // already attempted and failed to hydrate at that level. Also check if we're
  // already rendering that lane, which is rare but could happen.
  if ((lane & (root.suspendedLanes | renderLanes)) !== NoLane) {
    // Give up trying to hydrate and fall back to client render.
    return NoLane;
  }

  return lane;
}

const clz32 = Math.clz32 ? Math.clz32 : clz32Fallback;

// Count leading zeros. Only used on lanes, so assume input is an integer.
// Based on:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32
const log = Math.log;
const LN2 = Math.LN2;
function clz32Fallback(lanes: Lanes | Lane) {
  if (lanes === 0) {
    return 32;
  }
  return (31 - ((log(lanes) / LN2) | 0)) | 0;
}
