/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */
// UpdateQueue是一个基于优先级更新的链表，与Fiber一样，更新队列是成对的：
//
// 一个当前队列（current queue），代表着当前屏幕上的你在屏幕上看到的状态。

// 另外一个是正在进行中的队列（work-in-progress queue），
// React正在对它进行计算，它可以在提交之前被异步地更改和处理，这是一种双缓冲形式。

// 如果一个正在进行的渲染（work-in-progress）在完成（提交）之前被丢弃，
// 可以通过克隆当前队列来创建一个新的正在进行的工作。也就是要是work-in-progress被废了,
// 就用current新建一个,他们两个是互为备份的关系.

// UpdateQueue is a linked list of prioritized updates.`
// Like fibers, update queues come in pairs: a current queue, which represents
// the visible state of the screen, and a work-in-progress queue, which can be
// mutated and processed asynchronously before it is committed — a form of
// double buffering. If a work-in-progress render is discarded before finishing,
// we create a new work-in-progress by cloning the current queue.
//
// 这两个队列共享一个环状的单向链表结构，调度一个更新时，这个更新会被追加到两个队列地尾部，
// 每个队列维护一个指向环状列表中第一个未处理的update的指针（first指针），work-in-progress 队列的first指针
// 的位置大于等于current队列的first指针，因为我们只处理work-in-progress 队列。current队列的指针只在
// work-in-progress 队列处理完进入到commit阶段才更新.

// 当work-in-progress队列处理完之后,会进入到commit阶段,而她在这个时候就会变成current队列.
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
// 之所以向两个队列追加update是因为我们可能会在不处理这两个队列的情况下删除更新,比如只往work-in-progress队列添加更新,
// 那么当这个队列被丢弃再通过clone current队列重新启动时,后来被添加的update将会丢失.
// 同样的,只往current队列添加添加更新,那么在将work-in-progress队列复制到current队列时,
// current队列就会丢失刚刚已经添加的更新.
// 但是通过同时向两个队列追加更新,可以保证这个更新会成为下一个work-in-progress 队列的一部分.
// (因为work-in-progress队列在commit之后就称为current队列,所以不存在两次的更新都相同的情况)
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
// update不会按照优先级排序，而是通过插入顺序，新的update会插入到链表的尾部
// Updates are not sorted by priority, but by insertion; new updates are always
// appended to the end of the list.
//
// 尽管如此，优先级仍然很重要，当在渲染阶段处理更新队列时，渲染的结果只会包含具有足够优先级的更新。
// 如果因为优先级不足跳过了一个update，它将还是会在队列中，只不过稍后处理。
// 关键在于被跳过的update之后的所有update也是不管优先级如何，都在队列里，这意味着高优先级的update有时候
// 会以不同的渲染优先级处理两次。我们还追踪base state，它表示已经被应用（被应用就表示整理好了，即将被处理）
// 的队列中第一个update的上一个状态。
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
//   baseState 是空字符串，下边是更新队列，从下边的例子来看，优先级是1 > 2的
//   Given a base state of '', and the following queue of updates
//
//     A1 - B2 - C1 - D2
//
//   数字表示优先级，字母表示update的状态（state），React将对这些update进行两次处理，每次按照不同的优先级:
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

// 在这个例子中，C1就被处理了两次，印证了：高优先级的update有时候会以不同的渲染优先级处理两次。
// 第一次渲染的结果是AC，第二次的渲染开始时，Base state是A，不包含C，是因为上边解释了：
// base state，它表示已经被应用（被应用就表示整理好了，即将被处理）的队列中第一个update的上一个状态。
// 第二次的时候这个“被应用”的队列就是[B2, C1, D2]，第一个update就是A1，状态是A

// 因为是通过插入顺序来处理的更新，并且在跳过之前的update是重设高优先级update。最终结果都是确定的，
// 中间状态可能因为系统资源的不同而不同，但最终状态总是相同的
// Because we process updates in insertion order, and rebase high priority
// updates when preceding updates are skipped, the final result is deterministic
// regardless of priority. Intermediate state may vary according to system
// resources, but the final state is always the same.

// A1 - B1 - C2 - D1 - F2
//   First render, at priority 1:
//     Base state: ''
//     Updates: [A1, B1, D1]
//     Result state: 'ABD'
//   Second render, at priority 2:
//     Base state: 'B'            <-  The base state does not include C1,
//                                    because B2 was skipped.
//     Updates: [C2, D1, F2]      <-  C1 was rebased on top of B2
//     Result state: 'BCDF'


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
   baseQueue：执行中的更新任务 Update 队列，work-in-progress队列
   shared：以 pending 属性存储待执行的更新任务 Update 队列，current队列
   effects：side-effects 队列，commit 阶段执行

 UpdateQueue用来存储更新队列，一共有两条队列，work-in-progress队列 和 current队列
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
  let baseQueue = queue.baseQueue;
  // console.log('queue', queue);
  // The last pending update that hasn't been processed yet.
  let pendingQueue = queue.shared.pending;
  if (pendingQueue !== null) {
    // 这个判断的作用是，判断有没有待更新的队列，有的话就把它和正在更新的队列连到一起，
    // 把新队列赋值给正在更新的队列
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
    // 这个判断就是遍历队列处理更新获取新状态了
    console.log('baseQueue !== null', baseQueue);
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
    if (newBaseQueueLast === null) {
      newBaseState = newState;
    } else {
      // 否则将链表首尾相连
      newBaseQueueLast.next = (newBaseQueueFirst: any);
    }
    // 重新设置queue的baseState 和  更新队列
    queue.baseState = ((newBaseState: any): State);
    queue.baseQueue = newBaseQueueLast;

    // 将剩余的过期时间设置为队列中剩余的时间。这应该没问题，因为影响过期时间的只有props和context。
    // 当开始处理队列时，我们已经在开始阶段的中间，所以我们已经处理了props。指定shouldComponentUpdate的组件中的context很棘手;
    // 但无论如何，我们都要考虑到这一点。
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
