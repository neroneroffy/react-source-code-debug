/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */
// UpdateQueue是一个基于优先级更新的链表，与Fiber一样，更新队列是成对的，
// UpdateQueue is a linked list of prioritized updates.`
// Like fibers, update queues come in pairs: a current queue, which represents
// the visible state of the screen, and a work-in-progress queue, which can be
// mutated and processed asynchronously before it is committed — a form of
// double buffering. If a work-in-progress render is discarded before finishing,
// we create a new work-in-progress by cloning the current queue.
//
// Both queues share a persistent, singly-linked list structure. To schedule an
// update, we append it to the end of both queues. Each queue maintains a
// pointer to first update in the persistent list that hasn't been processed.
// The work-in-progress pointer always has a position equal to or greater than
// the current queue, since we always work on that one. The current queue's
// pointer is only updated during the commit phase, when we swap in the
// work-in-progress.
//
// For example:
//
//   Current pointer:           A - B - C - D - E - F
//   Work-in-progress pointer:              D - E - F
//                                          ^
//                                          The work-in-progress queue has
//                                          processed more updates than current.
//
// The reason we append to both queues is because otherwise we might drop
// updates without ever processing them. For example, if we only add updates to
// the work-in-progress queue, some updates could be lost whenever a work-in
// -progress render restarts by cloning from current. Similarly, if we only add
// updates to the current queue, the updates will be lost whenever an already
// in-progress queue commits and swaps with the current queue. However, by
// adding to both queues, we guarantee that the update will be part of the next
// work-in-progress. (And because the work-in-progress queue becomes the
// current queue once it commits, there's no danger of applying the same
// update twice.)
//
// Prioritization
// --------------
//
// Updates are not sorted by priority, but by insertion; new updates are always
// appended to the end of the list.
//
// The priority is still important, though. When processing the update queue
// during the render phase, only the updates with sufficient priority are
// included in the result. If we skip an update because it has insufficient
// priority, it remains in the queue to be processed later, during a lower
// priority render. Crucially, all updates subsequent to a skipped update also
// remain in the queue *regardless of their priority*. That means high priority
// updates are sometimes processed twice, at two separate priorities. We also
// keep track of a base state, that represents the state before the first
// update in the queue is applied.
//
// For example:
//
//   Given a base state of '', and the following queue of updates
//
//     A1 - B2 - C1 - D2
//
//   where the number indicates the priority, and the update is applied to the
//   previous state by appending a letter, React will process these updates as
//   two separate renders, one per distinct priority level:
//
//   First render, at priority 1:
//     Base state: ''
//     Updates: [A1, C1]
//     Result state: 'AC'
//
//   Second render, at priority 2:
//     Base state: 'A'            <-  The base state does not include C1,
//                                    because B2 was skipped.
//     Updates: [B2, C1, D2]      <-  C1 was rebased on top of B2
//     Result state: 'ABCD'
//
// Because we process updates in insertion order, and rebase high priority
// updates when preceding updates are skipped, the final result is deterministic
// regardless of priority. Intermediate state may vary according to system
// resources, but the final state is always the same.

import type {Fiber} from './ReactFiber';
import type {ExpirationTime} from './ReactFiberExpirationTime';
import type {SuspenseConfig} from './ReactFiberSuspenseConfig';
import type {ReactPriorityLevel} from './SchedulerWithReactIntegration';

import {NoWork, Sync} from './ReactFiberExpirationTime';
import {
  enterDisallowedContextReadInDEV,
  exitDisallowedContextReadInDEV,
} from './ReactFiberNewContext';
import {Callback, ShouldCapture, DidCapture} from 'shared/ReactSideEffectTags';

import {debugRenderPhaseSideEffectsForStrictMode} from 'shared/ReactFeatureFlags';

import {StrictMode} from './ReactTypeOfMode';
import {
  markRenderEventTimeAndConfig,
  markUnprocessedUpdateTime,
} from './ReactFiberWorkLoop';

import invariant from 'shared/invariant';
import {getCurrentPriorityLevel} from './SchedulerWithReactIntegration';

export type Update<State> = {|
  expirationTime: ExpirationTime,
  suspenseConfig: null | SuspenseConfig,

  tag: 0 | 1 | 2 | 3,
  payload: any,
  callback: (() => mixed) | null,

  next: Update<State>,

  // DEV only
  priority?: ReactPriorityLevel,
|};

type SharedQueue<State> = {|pending: Update<State> | null|};

export type UpdateQueue<State> = {|
  baseState: State,
  baseQueue: Update<State> | null,
  shared: SharedQueue<State>,
  effects: Array<Update<State>> | null,
|};

export const UpdateState = 0;
export const ReplaceState = 1;
export const ForceUpdate = 2;
export const CaptureUpdate = 3;

// Global state that is reset at the beginning of calling `processUpdateQueue`.
// It should only be read right after calling `processUpdateQueue`, via
// `checkHasForceUpdateAfterProcessing`.
let hasForceUpdate = false;

let didWarnUpdateInsideUpdate;
let currentlyProcessingQueue;
export let resetCurrentlyProcessingQueue;
if (__DEV__) {
  didWarnUpdateInsideUpdate = false;
  currentlyProcessingQueue = null;
  resetCurrentlyProcessingQueue = () => {
    currentlyProcessingQueue = null;
  };
}

export function initializeUpdateQueue<State>(fiber: Fiber): void {
  const queue: UpdateQueue<State> = {
    baseState: fiber.memoizedState,
    baseQueue: null,
    shared: {
      pending: null,
    },
    effects: null,
  };
  fiber.updateQueue = queue;
}

export function cloneUpdateQueue<State>(
  current: Fiber,
  workInProgress: Fiber,
): void {
  // Clone the update queue from current. Unless it's already a clone.
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);
  const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
  if (queue === currentQueue) {
    const clone: UpdateQueue<State> = {
      baseState: currentQueue.baseState,
      baseQueue: currentQueue.baseQueue,
      shared: currentQueue.shared,
      effects: currentQueue.effects,
    };
    workInProgress.updateQueue = clone;
  }
}

export function createUpdate(
  expirationTime: ExpirationTime,
  suspenseConfig: null | SuspenseConfig,
): Update<*> {
  let update: Update<*> = {
    expirationTime,
    suspenseConfig,

    tag: UpdateState,
    payload: null,
    callback: null,

    next: (null: any),
  };
  update.next = update;
  if (__DEV__) {
    update.priority = getCurrentPriorityLevel();
  }
  return update;
}
/**
 * 前置知识：
 * -------------------
 Update的结构：
   tag：更新类型，UpdateState、ReplaceState、ForceUpdate、CaptureUpdate
   payload：状态变更函数或新状态本身
   callback：回调，作用于 fiber.effectTag，并将 callback 作为 side-effects 回调
   expirationTime：deadline 时间，未到该时间点，不予更新
   suspenseConfig：suspense 配置
   next：指向下一个 Update
   priority：仅限于 dev 环境

 updateQueue的结构：
   baseState：先前的状态，作为 payload 函数的 prevState 参数
   baseQueue：存储执行中的更新任务 Update 队列，尾节点存储形式
   shared：以 pending 属性存储待执行的更新任务 Update 队列，尾节点存储形式
   effects：side-effects 队列，commit 阶段执行

 UpdateQueue用来存储更新队列，一共有两条队列：正在更新的队列baseQueue，待更新的队列（shared中的pending）
 * */

export function enqueueUpdate<State>(fiber: Fiber, update: Update<State>) {
  // enqueueUpdate函数做的事情是更新Fiber上的updateQueue，
  // 具体就是向Fiber的updateQueue的待更新队列的链表中追加新产生的update
  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    // 在fiber卸载的时候，直接直接return
    return;
  }
  // console.log(updateQueue, update);
  const sharedQueue = updateQueue.shared;
  const pending = sharedQueue.pending;
  // 这是当前更新队列中等待被更新的队列
  if (pending === null) {
    // 如果没有等待被更新的队列，创建一个单向循环链表，作为更新队列，
    // 也就是用本次setState产生的update自身来创建一个只有一个元素的更新队列。
    // This is the first update. Create a circular list.
    update.next = update;
  } else {
    // 如果有需要等待被更新的队列，将update追加到待更新队列的尾部
    update.next = pending.next;
    pending.next = update;
  }
  // 此时的update经过两种情况的处理，已经是一个整合后的更新队列了
  // 将之前Fiber节点上的原有的更新队列中待更新的队列指向这个新队列，也就是更新Fiber节点的updateQueue
  sharedQueue.pending = update;

  if (__DEV__) {
    if (
      currentlyProcessingQueue === sharedQueue &&
      !didWarnUpdateInsideUpdate
    ) {
      console.error(
        'An update (setState, replaceState, or forceUpdate) was scheduled ' +
          'from inside an update function. Update functions should be pure, ' +
          'with zero side-effects. Consider using componentDidUpdate or a ' +
          'callback.',
      );
      didWarnUpdateInsideUpdate = true;
    }
  }
}

export function enqueueCapturedUpdate<State>(
  workInProgress: Fiber,
  update: Update<State>,
) {
  const current = workInProgress.alternate;
  if (current !== null) {
    // Ensure the work-in-progress queue is a clone
    cloneUpdateQueue(current, workInProgress);
  }

  // Captured updates go only on the work-in-progress queue.
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);
  // Append the update to the end of the list.
  const last = queue.baseQueue;
  if (last === null) {
    queue.baseQueue = update.next = update;
    update.next = update;
  } else {
    update.next = last.next;
    last.next = update;
  }
}

function getStateFromUpdate<State>(
  workInProgress: Fiber,
  queue: UpdateQueue<State>,
  update: Update<State>,
  prevState: State,
  nextProps: any,
  instance: any,
): any {
  switch (update.tag) {
    case ReplaceState: {
      const payload = update.payload;
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictMode
          ) {
            payload.call(instance, prevState, nextProps);
          }
        }
        const nextState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          exitDisallowedContextReadInDEV();
        }
        return nextState;
      }
      // State object
      return payload;
    }
    case CaptureUpdate: {
      workInProgress.effectTag =
        (workInProgress.effectTag & ~ShouldCapture) | DidCapture;
    }
    // Intentional fallthrough
    case UpdateState: {
      // 获取update上的payload，有可能是对象，有可能是函数
      const payload = update.payload;
      let partialState;
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictMode
          ) {
            payload.call(instance, prevState, nextProps);
          }
        }
        // 如果是函数，调用它，并将调用结果存到partialState。这里就是setState传入函数的场景
        // this.setState((prevState, nextProps) => {
        //     return {
        //        ...
        //     }
        // })
        partialState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          exitDisallowedContextReadInDEV();
        }
      } else {
        // Partial state object
        // setState传入对象的场景
        partialState = payload;
      }
      if (partialState === null || partialState === undefined) {
        // Null and undefined are treated as no-ops.
        return prevState;
      }
      // Merge the partial state and the previous state.
      // 将本次计算的state，与上一次的prevState进行合并。由于对象的属性只能唯一，因而在setState传入对象的场景下，
      // 多次同步调用this.setState,得到的state总是最后一次设置的结果。
      // console.log('prevState, partialState', prevState, partialState);
      return Object.assign({}, prevState, partialState);
    }
    case ForceUpdate: {
      hasForceUpdate = true;
      return prevState;
    }
  }
  return prevState;
}

export function processUpdateQueue<State>(
  workInProgress: Fiber,
  props: any,
  instance: any,
  renderExpirationTime: ExpirationTime,
): void {
  // This is always non-null on a ClassComponent or HostRoot
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  hasForceUpdate = false;

  if (__DEV__) {
    currentlyProcessingQueue = queue.shared;
  }
  // The last rebase update that is NOT part of the base state.
  // baseQueue 是正在更新的队列
  let baseQueue = queue.baseQueue;
  // console.log('queue', queue);
  // The last pending update that hasn't been processed yet.
  // pendingQueue是等待更新的队列
  let pendingQueue = queue.shared.pending;
  if (pendingQueue !== null) {
    // 有待更新的队列，它将会被添加到正在更新的队列中
    // We have new updates that haven't been processed yet.
    // We'll add them to the base queue.

    if (baseQueue !== null) {
      // Merge the pending queue and the base queue.
      // 更新队列是一个环状链表，将待更新队列追加到当前正在更新的队列的尾部，也就是将更新中的队列与等待更新的队列进行合并
      let baseFirst = baseQueue.next;
      let pendingFirst = pendingQueue.next;
      baseQueue.next = pendingFirst;
      pendingQueue.next = baseFirst;
    }
    // 将现有的正在更新的队列重新赋值为合并后的新队列
    baseQueue = pendingQueue;
    // 合并之后，释放原有存储的待更新队列
    queue.shared.pending = null;
    // TODO: Pass `current` as argument
    // 从workInProgress中取出对应的Fiber节点（alternate对应着workInProgress当前节点对应的Fiber节点）
    const current = workInProgress.alternate;
    if (current !== null) {
      const currentQueue = current.updateQueue;
      if (currentQueue !== null) {
        // 对Fiber节点上的正在更新的队列重新赋值，新值为上边合并后的更新队列
        currentQueue.baseQueue = pendingQueue;
      }
    }
  }

  // These values may change as we process the queue.
  // （直译）在处理队列时，这些值可能会发生变化。

  if (baseQueue !== null) {
    let first = baseQueue.next;
    // Iterate through the list of updates to compute the result.
    // 这部分的逻辑是遍历更新队列，计算出新的结果

    // 这里的newState，可以理解为上一次更新的state。
    let newState = queue.baseState;
    let newExpirationTime = NoWork;

    let newBaseState = null; // 用来存储新的state，最终会是组件的新的this.state
    let newBaseQueueFirst = null;
    let newBaseQueueLast = null;
    // 当没有到baseQueue链表不为空，进行遍历
    if (first !== null) {
      let update = first;
      /**
       * update：当前要被处理的update
       * updateExpirationTime：update的优先级
       * newExpirationTime：本次更新的优先级，最终要被记录到workInProgress中
       * renderExpirationTime: FiberRoot 上最大优先级的值
       * */
      do {
        const updateExpirationTime = update.expirationTime; // 当前更新的优先级
        if (updateExpirationTime < renderExpirationTime) {
          // Priority is insufficient. Skip this update. If this is the first
          // skipped update, the previous update/state is the new base
          // update/state.
          // （直译）优先级不足，跳过更新，如果这是第一个被跳过的更新，前一个update/state
          // （前一个update的结果）就会被更新成新的update/state。

          // 这个判断其实表达的是，如果当前的update优先级不足，那么就把它放到 newBaseQueue 的尾部，先处理高优先级的
          const clone: Update<State> = {
            expirationTime: update.expirationTime,
            suspenseConfig: update.suspenseConfig,

            tag: update.tag,
            payload: update.payload,
            callback: update.callback,

            // next指向了null，说明这个update下边不会再有其他update，这是它作为尾部节点的特征
            next: (null: any),
          };
          // 将这个更新放到newBaseQueue中，这里判断了newBaseQueue有没有元素，
          // 没有的话，直接放进去，有的话就追加到尾部
          if (newBaseQueueLast === null) {
            newBaseQueueFirst = newBaseQueueLast = clone;
            // newBaseState 更新为前一个update的结果
            newBaseState = newState;
          } else {
            newBaseQueueLast = newBaseQueueLast.next = clone;
          }
          // Update the remaining priority in the queue.
          // 更新workInProgress的优先级
          if (updateExpirationTime > newExpirationTime) {
            newExpirationTime = updateExpirationTime;
          }
        } else {
          // This update does have sufficient priority.
          // update有足够的优先级
          if (newBaseQueueLast !== null) {
            // 将update放到更新队列的尾部
            const clone: Update<State> = {
              // update即将进入commit阶段，所以需要将它的优先级置为同步，就是最高优先级
              expirationTime: Sync, // This update is going to be committed so we never want uncommit it.
              suspenseConfig: update.suspenseConfig,

              tag: update.tag,
              payload: update.payload,
              callback: update.callback,

              next: (null: any),
            };
            newBaseQueueLast = newBaseQueueLast.next = clone;
          }

          // Mark the event time of this update as relevant to this render pass.
          // TODO: This should ideally use the true event time of this update rather than
          // its priority which is a derived and not reverseable value.
          // TODO: We should skip this update if it was already committed but currently
          // we have no way of detecting the difference between a committed and suspended
          // update here.
          markRenderEventTimeAndConfig(
            updateExpirationTime,
            update.suspenseConfig,
          );
          // Process this update.
          // 处理更新，计算出新结果
          newState = getStateFromUpdate(
            workInProgress,
            queue,
            update,
            newState,
            props,
            instance,
          );
          const callback = update.callback;
          if (callback !== null) {
            workInProgress.effectTag |= Callback;
            let effects = queue.effects;
            if (effects === null) {
              queue.effects = [update];
            } else {
              effects.push(update);
            }
          }
        }
        // 将当前处理的update换成当前的下一个，实现移动链表的遍历
        update = update.next;
        if (update === null || update === first) {
          pendingQueue = queue.shared.pending;
          if (pendingQueue === null) {
            break;
          } else {
            // An update was scheduled from inside a reducer. Add the new
            // pending updates to the end of the list and keep processing.
            update = baseQueue.next = pendingQueue.next;
            pendingQueue.next = first;
            queue.baseQueue = baseQueue = pendingQueue;
            queue.shared.pending = null;
          }
        }
      } while (true); // 因为updateQueue是环状闭合链表，所以一直循环，直到链表清空 ？ @TODO 需要再研究这里的循环逻辑
    }
    // 如果当前的更新队列的最后一个元素为空，此时链表为空，newBaseState赋值为之前计算出的newState
    console.log(newBaseQueueFirst, newBaseQueueLast, first);
    if (newBaseQueueLast === null) {
      newBaseState = newState;
    } else {
      // 否则将链表首尾相连
      newBaseQueueLast.next = (newBaseQueueFirst: any);
    }
    // 重新设置queue的baseState 和  更新队列
    queue.baseState = ((newBaseState: any): State);
    queue.baseQueue = newBaseQueueLast;

    // Set the remaining expiration time to be whatever is remaining in the queue.
    // This should be fine because the only two other things that contribute to
    // expiration time are props and context. We're already in the middle of the
    // begin phase by the time we start processing the queue, so we've already
    // dealt with the props. Context in components that specify
    // shouldComponentUpdate is tricky; but we'll have to account for
    // that regardless.
    markUnprocessedUpdateTime(newExpirationTime);
    workInProgress.expirationTime = newExpirationTime;

    // 设置workInProgress节点的memoizedState，最终表现为组件的this.state
    workInProgress.memoizedState = newState;
  }

  if (__DEV__) {
    currentlyProcessingQueue = null;
  }
}

function callCallback(callback, context) {
  invariant(
    typeof callback === 'function',
    'Invalid argument passed as callback. Expected a function. Instead ' +
      'received: %s',
    callback,
  );
  callback.call(context);
}

export function resetHasForceUpdateBeforeProcessing() {
  hasForceUpdate = false;
}

export function checkHasForceUpdateAfterProcessing(): boolean {
  return hasForceUpdate;
}

export function commitUpdateQueue<State>(
  finishedWork: Fiber,
  finishedQueue: UpdateQueue<State>,
  instance: any,
): void {
  // Commit the effects
  const effects = finishedQueue.effects;
  finishedQueue.effects = null;
  if (effects !== null) {
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i];
      const callback = effect.callback;
      if (callback !== null) {
        effect.callback = null;
        callCallback(callback, instance);
      }
    }
  }
}
