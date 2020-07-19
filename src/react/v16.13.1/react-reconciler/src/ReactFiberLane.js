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
  | 16;
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

export const SyncLanePriority: LanePriority = 16;
const SyncBatchedLanePriority: LanePriority = 15;

const InputDiscreteHydrationLanePriority: LanePriority = 14;
export const InputDiscreteLanePriority: LanePriority = 13;

const InputContinuousHydrationLanePriority: LanePriority = 12;
const InputContinuousLanePriority: LanePriority = 11;

const DefaultHydrationLanePriority: LanePriority = 10;
const DefaultLanePriority: LanePriority = 9;

const TransitionShortHydrationLanePriority: LanePriority = 8;
export const TransitionShortLanePriority: LanePriority = 7;

const TransitionLongHydrationLanePriority: LanePriority = 6;
export const TransitionLongLanePriority: LanePriority = 5;

const SelectiveHydrationLanePriority: LanePriority = 4;

const IdleHydrationLanePriority: LanePriority = 3;
const IdleLanePriority: LanePriority = 2;

const OffscreenLanePriority: LanePriority = 1;

export const NoLanePriority: LanePriority = 0;

const TotalLanes = 31;

// 利用 Math.abs() 可将Lane转换为10进制
export const NoLanes: Lanes = /*                        */ 0b0000000000000000000000000000000; // 0
export const NoLane: Lane = /*                          */ 0b0000000000000000000000000000000; // 0

export const SyncLane: Lane = /*                        */ 0b0000000000000000000000000000001; // 1
const SyncUpdateRangeEnd = 1;
export const SyncBatchedLane: Lane = /*                 */ 0b0000000000000000000000000000010; // 2
const SyncBatchedUpdateRangeEnd = 2;

export const InputDiscreteHydrationLane: Lane = /*      */ 0b0000000000000000000000000000100; // 4
const InputDiscreteLanes: Lanes = /*                    */ 0b0000000000000000000000000011100;
const InputDiscreteUpdateRangeStart = 3;
const InputDiscreteUpdateRangeEnd = 5;

const InputContinuousHydrationLane: Lane = /*           */ 0b0000000000000000000000000100000;
const InputContinuousLanes: Lanes = /*                  */ 0b0000000000000000000000011100000;
const InputContinuousUpdateRangeStart = 6;
const InputContinuousUpdateRangeEnd = 8;

export const DefaultHydrationLane: Lane = /*            */ 0b0000000000000000000000100000000;
const DefaultLanes: Lanes = /*                          */ 0b0000000000000000011111100000000;
const DefaultUpdateRangeStart = 9;
const DefaultUpdateRangeEnd = 14;

const TransitionShortHydrationLane: Lane = /*           */ 0b0000000000000000100000000000000;
const TransitionShortLanes: Lanes = /*                  */ 0b0000000000011111100000000000000;
const TransitionShortUpdateRangeStart = 15;
const TransitionShortUpdateRangeEnd = 20;

const TransitionLongHydrationLane: Lane = /*            */ 0b0000000000100000000000000000000;
const TransitionLongLanes: Lanes = /*                   */ 0b0000011111100000000000000000000;
const TransitionLongUpdateRangeStart = 21;
const TransitionLongUpdateRangeEnd = 26;

export const SelectiveHydrationLane: Lane = /*          */ 0b0000110000000000000000000000000;
const SelectiveHydrationRangeEnd = 27;

// Includes all non-Idle updates
const UpdateRangeEnd = 27;
const NonIdleLanes = /*                                 */ 0b0000111111111111111111111111111;

export const IdleHydrationLane: Lane = /*               */ 0b0001000000000000000000000000000;
const IdleLanes: Lanes = /*                             */ 0b0111000000000000000000000000000;
const IdleUpdateRangeStart = 28;
const IdleUpdateRangeEnd = 30;

export const OffscreenLane: Lane = /*                   */ 0b1000000000000000000000000000000;

export const NoTimestamp = -1;

// "Registers" used to "return" multiple values
// Used by getHighestPriorityLanes and getNextLanes:
let return_highestLanePriority: LanePriority = DefaultLanePriority;
let return_updateRangeEnd: number = -1;

function getHighestPriorityLanes(lanes: Lanes | Lane): Lanes {
  // 相关commit https://github.com/facebook/react/pull/19302
  if ((SyncLane & lanes) !== NoLanes) {
    // 如果lanes中有同步优先级的任务
    return_highestLanePriority = SyncLanePriority;
    return_updateRangeEnd = SyncUpdateRangeEnd;
    return SyncLane;
  }
  if ((SyncBatchedLane & lanes) !== NoLanes) {
    // 如果lanes中有批量同步的优先级
    return_highestLanePriority = SyncBatchedLanePriority;
    return_updateRangeEnd = SyncBatchedUpdateRangeEnd;
    return SyncBatchedLane;
  }
  // 选出lanes中与InputDiscreteLanes重合的非0位
  const inputDiscreteLanes = InputDiscreteLanes & lanes;
  if (inputDiscreteLanes !== NoLanes) {
    // 判断条件的含义是如果InputDiscreteLanes中含有lanes
    if (inputDiscreteLanes & InputDiscreteHydrationLane) {
      // 如果InputDiscreteLanes 中包含 InputDiscreteHydrationLane
      return_highestLanePriority = InputDiscreteHydrationLanePriority;
      return_updateRangeEnd = InputDiscreteUpdateRangeStart;
      return InputDiscreteHydrationLane;
    } else {
      return_highestLanePriority = InputDiscreteLanePriority;
      return_updateRangeEnd = InputDiscreteUpdateRangeEnd;
      return inputDiscreteLanes;
    }
  }
  const inputContinuousLanes = InputContinuousLanes & lanes;
  if (inputContinuousLanes !== NoLanes) {
    if (inputContinuousLanes & InputContinuousHydrationLane) {
      return_highestLanePriority = InputContinuousHydrationLanePriority;
      return_updateRangeEnd = InputContinuousUpdateRangeStart;
      return InputContinuousHydrationLane;
    } else {
      return_highestLanePriority = InputContinuousLanePriority;
      return_updateRangeEnd = InputContinuousUpdateRangeEnd;
      return inputContinuousLanes;
    }
  }
  const defaultLanes = DefaultLanes & lanes;
  if (defaultLanes !== NoLanes) {
    if (defaultLanes & DefaultHydrationLane) {
      return_highestLanePriority = DefaultHydrationLanePriority;
      return_updateRangeEnd = DefaultUpdateRangeStart;
      return DefaultHydrationLane;
    } else {
      return_highestLanePriority = DefaultLanePriority;
      return_updateRangeEnd = DefaultUpdateRangeEnd;
      return defaultLanes;
    }
  }
  const transitionShortLanes = TransitionShortLanes & lanes;
  if (transitionShortLanes !== NoLanes) {
    if (transitionShortLanes & TransitionShortHydrationLane) {
      return_highestLanePriority = TransitionShortHydrationLanePriority;
      return_updateRangeEnd = TransitionShortUpdateRangeStart;
      return TransitionShortHydrationLane;
    } else {
      return_highestLanePriority = TransitionShortLanePriority;
      return_updateRangeEnd = TransitionShortUpdateRangeEnd;
      return transitionShortLanes;
    }
  }
  const transitionLongLanes = TransitionLongLanes & lanes;
  if (transitionLongLanes !== NoLanes) {
    if (transitionLongLanes & TransitionLongHydrationLane) {
      return_highestLanePriority = TransitionLongHydrationLanePriority;
      return_updateRangeEnd = TransitionLongUpdateRangeStart;
      return TransitionLongHydrationLane;
    } else {
      return_highestLanePriority = TransitionLongLanePriority;
      return_updateRangeEnd = TransitionLongUpdateRangeEnd;
      return transitionLongLanes;
    }
  }
  if (lanes & SelectiveHydrationLane) {
    return_highestLanePriority = SelectiveHydrationLanePriority;
    return_updateRangeEnd = SelectiveHydrationRangeEnd;
    return SelectiveHydrationLane;
  }
  const idleLanes = IdleLanes & lanes;
  if (idleLanes !== NoLanes) {
    if (idleLanes & IdleHydrationLane) {
      return_highestLanePriority = IdleHydrationLanePriority;
      return_updateRangeEnd = IdleUpdateRangeStart;
      return IdleHydrationLane;
    } else {
      return_highestLanePriority = IdleLanePriority;
      return_updateRangeEnd = IdleUpdateRangeEnd;
      return idleLanes;
    }
  }
  if ((OffscreenLane & lanes) !== NoLanes) {
    return_highestLanePriority = OffscreenLanePriority;
    return_updateRangeEnd = TotalLanes;
    return OffscreenLane;
  }
  if (__DEV__) {
    console.error('Should have found matching lanes. This is a bug in React.');
  }
  // This shouldn't be reachable, but as a fallback, return the entire bitmask.
  return_highestLanePriority = DefaultLanePriority;
  return_updateRangeEnd = DefaultUpdateRangeEnd;
  return lanes;
}

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
  // Early bailout if there's no pending work left.
  // 在没有剩余任务的时候，跳出更新
  const pendingLanes = root.pendingLanes;
  if (pendingLanes === NoLanes) {
    return_highestLanePriority = NoLanePriority;
    return NoLanes;
  }

  let nextLanes = NoLanes;
  let nextLanePriority = NoLanePriority;
  let equalOrHigherPriorityLanes = NoLanes;

  const expiredLanes = root.expiredLanes;
  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes;

  // Check if any work has expired.
  // 检查是否有过期的任务
  if (expiredLanes !== NoLanes) {
    nextLanes = expiredLanes;
    // 已经过期了，就需要把优先级设置为同步，来让更新立即执行
    nextLanePriority = return_highestLanePriority = SyncLanePriority;
    equalOrHigherPriorityLanes = (getLowestPriorityLane(nextLanes) << 1) - 1;
    /*
    * 位运算中，减1，可以将非0位的右侧都变为1
      例如：0b001000 - 1 = 0b000111
      equalOrHigherPriorityLanes 意为相对于nextLanes优先级较高或相等的位，
      具体的意思解释如下：
      以同步优先级            SyncLane = 0b0000000000000000000000000000001
                                                                         ^
      和屏幕隐藏的优先级 OffscreenLane = 0b1000000000000000000000000000000
                                           ^
      为例，SyncLane肯定高于OffscreenLane，可见1越靠左，优先级越低。

      回到代码中，getLowestPriorityLane(nextLanes)做的事情就是找到nextLanes中
      最低优先级的位置。getLowestPriorityLane(nextLanes) << 1 又将这个位置向左
      挪了一位，这样当前这个位置（假设为P）的右边如果有位置是1就表示比nextLanes
      的最低优先级要高。

      接下来的减1操作将位置P的右侧全部都置为1，举例如下：
      0b001000 - 1 = 0b000111
      位置P在nextLanes最左侧的1（非0位）的左边一位，所以P右侧的那些1肯定包含nextLanes
      中的1的位置，例如：
      nextLanes为-------- 0b001100
      计算结果 ---------- 0b001111
      证明了equalOrHigherPriorityLanes中的优先级相对于nextLanes相等或较高
    * */
  } else {
    // 如果没有过期的任务，就检查有没有被挂起的任务，如果有挂起的任务，
    // nextLanes就被赋值成挂起的任务里优先级最高的。要是没有，
    // Do not work on any idle work until all the non-idle work has finished,
    // even if the work is suspended.
    // 不要在任何空闲任务上工作，直到所有非空闲任务完成，即使任务被挂起

    const nonIdlePendingLanes = pendingLanes & NonIdleLanes;
    if (nonIdlePendingLanes !== NoLanes) {
      // 未被阻塞的lanes，它等于有优先级的lanes中除去被挂起的lanes
      // & ~ 相当于删除
      const nonIdleUnblockedLanes = nonIdlePendingLanes & ~suspendedLanes;

      // 如果有任务被阻塞了
      if (nonIdleUnblockedLanes !== NoLanes) {
        // 那么从这些被阻塞的任务中挑出最重要的
        nextLanes = getHighestPriorityLanes(nonIdleUnblockedLanes);
        nextLanePriority = return_highestLanePriority;
        // return_updateRangeEnd 在上边调用getHighestPriorityLanes时候已经被赋值成了
        // 最高优先级（如“0b0000000000000000000000000011100”）从右数到最左侧的非零
        // 位的位置（如上边的优先级，return_updateRangeEnd就是5）
        // equalOrHigherPriorityLanes依然计算的是相对于nextLanes相等或较高的优先级
        equalOrHigherPriorityLanes = (1 << return_updateRangeEnd) - 1;
      } else {
        // 如果没有任务被阻塞，从正在处理的lanes中找到优先级最高的
        const nonIdlePingedLanes = nonIdlePendingLanes & pingedLanes;
        if (nonIdlePingedLanes !== NoLanes) {
          nextLanes = getHighestPriorityLanes(nonIdlePingedLanes);
          nextLanePriority = return_highestLanePriority;
          equalOrHigherPriorityLanes = (1 << return_updateRangeEnd) - 1;
        }
      }
    } else {
      // The only remaining work is Idle.
      // 剩下的任务是闲置的优先级不高的任务。unblockedLanes是未被阻塞的闲置任务
      const unblockedLanes = pendingLanes & ~suspendedLanes;
      if (unblockedLanes !== NoLanes) {
        // 从这些未被阻塞的闲置任务中挑出最重要的
        nextLanes = getHighestPriorityLanes(unblockedLanes);
        nextLanePriority = return_highestLanePriority;
        equalOrHigherPriorityLanes = (1 << return_updateRangeEnd) - 1;
      } else {
        // pingedLanes中已经都是那些闲置的，优先级不高的任务了
        if (pingedLanes !== NoLanes) {
          nextLanes = getHighestPriorityLanes(pingedLanes);
          nextLanePriority = return_highestLanePriority;
          equalOrHigherPriorityLanes = (1 << return_updateRangeEnd) - 1;
        }
      }
    }
  }

  if (nextLanes === NoLanes) {
    // This should only be reachable if we're suspended
    // TODO: Consider warning in this path if a fallback timer is not scheduled.
    return NoLanes;
  }

  // If there are higher priority lanes, we'll include them even if they are suspended.
  // 如果有更高优先级的lanes，即使它们被暂停，也会被包含在内。
  nextLanes = pendingLanes & equalOrHigherPriorityLanes;
  // nextLanes 实际上是待处理的lanes中优先级较高的那些lanes

  // If we're already in the middle of a render, switching lanes will interrupt
  // it and we'll lose our progress. We should only do this if the new lanes are
  // higher priority.
  /**
   * 如果我们已经在渲染中，切换lanes会中断它，我们会失去我们的进程。
   * 只有在新lanes有更高优先级的情况下，才应该这样做。
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

  // Check for entangled lanes and add them to the batch.
  //
  // A lane is said to be entangled with another when it's not allowed to render
  // in a batch that does not also include the other lane. Typically we do this
  // when multiple updates have the same source, and we only want to respond to
  // the most recent event from that source.
  //
  // Note that we apply entanglements *after* checking for partial work above.
  // This means that if a lane is entangled during an interleaved event while
  // it's already rendering, we won't interrupt it. This is intentional, since
  // entanglement is usually "best effort": we'll try our best to render the
  // lanes in the same batch, but it's not worth throwing out partially
  // completed work in order to do it.
  //
  // For those exceptions where entanglement is semantically important, like
  // useMutableSource, we should ensure that there is no partial work at the
  // time we apply the entanglement.
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

function computeExpirationTime(lane: Lane, currentTime: number) {
  // TODO: Expiration heuristic is constant per lane, so could use a map.
  getHighestPriorityLanes(lane);
  const priority = return_highestLanePriority;
  if (priority >= InputContinuousLanePriority) {
    // User interactions should expire slightly more quickly.
    // 用户交互的过期时间应该更快
    return currentTime + 1000;
  } else if (priority >= TransitionLongLanePriority) {
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
  // TODO: This gets called every time we yield. We can optimize by storing
  // the earliest expiration time on the root. Then use that to quickly bail out of this function.
  // root节点上最早的过期时间，然后用它来快速跳出该函数
  const pendingLanes = root.pendingLanes;
  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes;
  const expirationTimes = root.expirationTimes;

  // Iterate through the pending lanes and check if we've reached their
  // expiration time. If so, we'll assume the update is being starved and mark
  // it as expired to force it to finish.

  // 遍历待处理的lanes，检查是否到了过期时间，如果过期，
  // 将这个更新视为被占用并把它们标记成过期，强制更新
  let lanes = pendingLanes;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    //       1 = 0b0000000000000000000000000000001
    //   lanes = 0b0000000000000000000000000011100
    //   index = 4
    //  1 << 4 = 0b0000000000000000000000000001000
    const lane = 1 << index;
    //    lane = 0b0000000000000000000000000001000
    const expirationTime = expirationTimes[index];
    if (expirationTime === NoTimestamp) {
      // Found a pending lane with no expiration time. If it's not suspended, or
      // if it's pinged, assume it's CPU-bound. Compute a new expiration time
      // using the current time.
      // 发现一个没有过期时间并且待处理的lane，如果它没被挂起或者被触发，那么将它视为CPU相关的任务，
      // 用当前时间计算一个新的过期时间
      if (
        (lane & suspendedLanes) === NoLanes ||
        (lane & pingedLanes) !== NoLanes
      ) {
        // Assumes timestamps are monotonically increasing.
        // 假设时间戳是单调递增的
        expirationTimes[index] = computeExpirationTime(lane, currentTime);
      }
    } else if (expirationTime <= currentTime) {
      // This lane expired
      // 已经过期，将lane并入到expiredLanes中，实现了将lanes标记为过期
      root.expiredLanes |= lane;
    }
    // 将lane从lanes中删除，每循环一次删除一个，直到lanes清空成0
    lanes &= ~lane;
    // 此时 lanes = 0b0000000000000000000000000010100
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
export function hasUpdatePriority(lanes: Lanes) {
  return (lanes & NonIdleLanes) !== NoLanes;
}

// To ensure consistency across multiple updates in the same event, this should
// be a pure function, so that it always returns the same lane for given inputs.
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
      let lane = findLane(
        InputDiscreteUpdateRangeStart,
        UpdateRangeEnd,
        wipLanes,
      );
      if (lane === NoLane) {
        lane = InputDiscreteHydrationLane;
      }
      return lane;
    }
    case InputContinuousLanePriority: {
      let lane = findLane(
        InputContinuousUpdateRangeStart,
        UpdateRangeEnd,
        wipLanes,
      );
      if (lane === NoLane) {
        lane = InputContinuousHydrationLane;
      }
      return lane;
    }
    case DefaultLanePriority: {
      let lane = findLane(DefaultUpdateRangeStart, UpdateRangeEnd, wipLanes);
      if (lane === NoLane) {
        lane = DefaultHydrationLane;
      }
      return lane;
    }
    case TransitionShortLanePriority:
    case TransitionLongLanePriority:
      // Should be handled by findTransitionLane instead
      break;
    case IdleLanePriority:
      let lane = findLane(IdleUpdateRangeStart, IdleUpdateRangeEnd, wipLanes);
      if (lane === NoLane) {
        lane = IdleHydrationLane;
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
export function findTransitionLane(
  lanePriority: LanePriority,
  wipLanes: Lanes,
  pendingLanes: Lanes,
): Lane {
  if (lanePriority === TransitionShortLanePriority) {
    let lane = findLane(
      TransitionShortUpdateRangeStart,
      TransitionShortUpdateRangeEnd,
      wipLanes | pendingLanes,
    );
    if (lane === NoLane) {
      lane = findLane(
        TransitionShortUpdateRangeStart,
        TransitionShortUpdateRangeEnd,
        wipLanes,
      );
      if (lane === NoLane) {
        lane = TransitionShortHydrationLane;
      }
    }
    return lane;
  }
  if (lanePriority === TransitionLongLanePriority) {
    let lane = findLane(
      TransitionLongUpdateRangeStart,
      TransitionLongUpdateRangeEnd,
      wipLanes | pendingLanes,
    );
    if (lane === NoLane) {
      lane = findLane(
        TransitionLongUpdateRangeStart,
        TransitionLongUpdateRangeEnd,
        wipLanes,
      );
      if (lane === NoLane) {
        lane = TransitionLongHydrationLane;
      }
    }
    return lane;
  }
  invariant(
    false,
    'Invalid transition priority: %s. This is a bug in React.',
    lanePriority,
  );
}

function findLane(start, end, skipLanes) {
  // This finds the first bit between the `start` and `end` positions that isn't
  // in `skipLanes`.
  // 找出第一个范围在start和end之间但却不在skipLanes中的字节
  // TODO: This will always favor the rightmost bits. That's usually fine
  // because any bit that's pending will be part of `skipLanes`, so we'll do our
  // best to avoid accidental entanglement. However, lanes that are pending
  // inside an Offscreen tree aren't considered "pending" at the root level. So
  // they aren't included in `skipLanes`. So we should try not to favor any
  // particular part of the range, perhaps by incrementing an offset for each
  // distinct event. Must be the same within a single event, though.
  const bitsInRange = ((1 << (end - start)) - 1) << start;
  const possibleBits = bitsInRange & ~skipLanes;
  const leastSignificantBit = possibleBits & -possibleBits;
  return leastSignificantBit;
}

function getLowestPriorityLane(lanes: Lanes): Lane {
  // This finds the most significant non-zero bit.
  // 找到最重要的非零位
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

export function pickArbitraryLane(lanes: Lanes): Lane {
  return getLowestPriorityLane(lanes);
}

function pickArbitraryLaneIndex(lanes: Lane | Lanes) {
  return 31 - clz32(lanes);
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
  // 从一个优先级组中删除某个优先级
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
  // 优先级是从从右往左递减，数越小，优先级越低。没想通，因为这里总是返回优先级低的
  return a !== NoLane && a < b ? a : b;
}

export function createLaneMap<T>(initial: T): LaneMap<T> {
  return new Array(TotalLanes).fill(initial);
}

export function markRootUpdated(root: FiberRoot, updateLane: Lane) {
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
  // 我们需要一种方式来决定渲染哪个lanes以及在哪个批处理中渲染它。当前是用的是与之前的过期时间模
  // 式相同的方式：对于优先级相同或者较低的lane进行重新处理。但是不要在不包含较低优先级更新的情况下处理
  // 高优先级更新。当考虑跨不同优先级级别的更新时，这种方法很合适，但对于相同优先级的更新来说，这是不够的，
  // 因为我们希望对这些update并行处理。
  // Unsuspend any update at equal or lower priority.
  // 取消同等或较低优先级的更新。

  const higherPriorityLanes = updateLane - 1; // Turns 0b1000 into 0b0111
  //        0b1000
  //        0b0111
  //        0b1011
  // -------------
  // result 0b1111
  // 将 updateLane 放到 suspendedLanes 和 pingedLanes中
  root.suspendedLanes &= higherPriorityLanes;
  root.pingedLanes &= higherPriorityLanes;
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
  // 从root.pendingLanes中删除剩余的lanes（remainingLanes）
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
  let lanes = noLongerPendingLanes;
  while (lanes > 0) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;
    // Clear the expiration time
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
    case TransitionShortHydrationLanePriority:
    case TransitionShortLanePriority:
      lane = TransitionShortHydrationLane;
      break;
    case TransitionLongHydrationLanePriority:
    case TransitionLongLanePriority:
      lane = TransitionLongHydrationLane;
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
