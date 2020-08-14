/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// UpdateQueue is a linked list of prioritized updates.`
// Like fibers, update queues come in pairs: a current queue, which represents
// the visible state of the screen, and a work-in-progress queue, which can be
// mutated and processed asynchronously before it is committed — a form of
// double buffering. If a work-in-progress render is discarded before finishing,
// we create a new work-in-progress by cloning the current queue.

// UpdateQueue是一个基于优先级更新的链表，与Fiber一样，更新队列是成对的。
// 一个当前队列（current queue），代表着当前屏幕上的你在屏幕上看到的状态。
// 另外一个是正在处理中（WIP）的队列（work-in-progress queue），代表着react正在后台处理的队列。
// 它可以在提交之前被异步地更改和处理，这是一种双缓冲形式。
// 如果一个正在进行的渲染（work-in-progress）在完成（提交）之前被丢弃，
// 可以通过克隆当前队列来创建一个新的正在进行的工作。也就是要是WIP被废了，就用current新建一个。

/**----注：
 双缓冲的概念，有了它，可以一定程度上抹平两次更新之间的空白。
 说的意思是当前的current queue展示给用户，而WIP queue在后台处理，当需要展示新状态立刻替换current queue，将新的更新展示给用户，
 而只有一个队列，先处理再展示，这样可能不会及时把更新呈现出来。
 */

// Both queues share a persistent, singly-linked list structure. To schedule an
// update, we append it to the end of both queues. Each queue maintains a
// pointer to first update in the persistent list that hasn't been processed.
// The work-in-progress pointer always has a position equal to or greater than
// the current queue, since we always work on that one. The current queue's
// pointer is only updated during the commit phase, when we swap in the
// work-in-progress.

// 这两个队列共享一个环状的单链表结构，当产生（原文是调度）一个新的update时，会追加到两个队列的尾部，
// 每个队列都有一个指向环状列表中第一个未处理的update的指针（也就是queue的next），WIP队列的next指针
// 的位置大于等于current队列的指针，因为我们只处理WIP 队列。current队列的指针只在WIP队列处理完进入到
// commit阶段才更新。

// 当WIP队列处理完之后，会进入到commit阶段，这个时候current队列 和 WIP队列交换，
// current队列就变成了新的WIP队列，后续的update都会追加到它的尾部。
//
//
// For example:
//
// 原版注释的示意图是
//   Current pointer:           A - B - C - D - E - F
//   Work-in-progress pointer:              D - E - F
//                                          ^
//                                          The work-in-progress queue has
//                                          processed more updates than current.

// 但理解起来不通畅，稍微修改了一下
//   Current pointer:           A - B - C - D - E - F
//                                          ^
//   Work-in-progress pointer:  A - B - C - D - E - F
//                                                  ^
//                                                  WIP队列总比current队列处理更多的update
/**----注：
 * “WIP队列的next指针的位置大于等于current队列的指针”，这句话要从图中理解，并结合“每个队列都有一个指向环状列表中第一个未处理的update的指针”。
 * 假设A-B-C为三个新添加的update，Current队列的第一个未处理的update为D，而WIP第一个未处理的为F，F的位置总比D大。而且由于update同时被推入两个队列，所以
 * WIP的指针不可能比Current小。原因就是同时向两个队列追加的update只有在WIP队列能得到处理。
 * */

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

// 之所以向两个队列追加update是因为我们可能会在不处理某些更新的情况下删除它们，比如只往WIP队列
// 添加更新，那么当这个队列被丢弃，再通过clone current队列重新建立WIP队列时，后来被添加的update
// 将会丢失。同样的，只往current队列添加更新，那么在将WIP队列与current队列交换时,current队列就会
// 丢失刚刚已经添加的更新。但是通过同时向两个队列追加更新，可以保证这个更新会成为下一个WIP队列的
// 一部分。(因为WIP队列在commit之后就成为current队列，所以不存在相同的更新被处理两次的情况)
//
// Prioritization 优先级
// --------------
// Updates are not sorted by priority, but by insertion; new updates are always
// appended to the end of the list.

// update不会按照优先级排序，而是通过插入顺序，新的update会插入到链表的尾部
//

// The priority is still important, though. When processing the update queue
// during the render phase, only the updates with sufficient priority are
// included in the result. If we skip an update because it has insufficient
// priority, it remains in the queue to be processed later, during a lower
// priority render. Crucially, all updates subsequent to a skipped update also
// remain in the queue *regardless of their priority*. That means high priority
// updates are sometimes processed twice, at two separate priorities. We also
// keep track of a base state, that represents the state before the first update in the queue is applied.

// 尽管如此，优先级仍然很重要，当在render阶段处理更新队列时，渲染的结果只会包含具有足够优先级的更新。
// 如果因为优先级不足跳过了一个update，它将还是会在队列中，只不过稍后处理。
// 关键在于这个被跳过的update之后的所有update不管优先级如何，都在队列里，这意味着高优先级的update有时候
// 会以不同的渲染优先级处理两次。我们还跟踪base state，表示被处理的队列中第一个update之前的状态。
//
// For example:
//   baseState 是空字符串，下边是更新队列，优先级是1 > 2的
//   Given a base state of '', and the following queue of updates
//
//     A1 - B2 - C1 - D2

//   where the number indicates the priority, and the update is applied to the
//   previous state by appending a letter, React will process these updates as
//   two separate renders, one per distinct priority level:
//   数字表示优先级，字母表示update的所持有的状态（state），React将对这些update进行两次处理，每次按照不同的优先级:
//
//   First render, at priority 1:
//     Base state: ''
//     Updates: [A1, C1]
//     Result state: 'AC'
//
//   Second render, at priority 2:
//     Base state: 'A'            <-  The base state does not include C1, base state不包含C1，因为B2被跳过了
//                                    because B2 was skipped.
//     Updates: [B2, C1, D2]      <-  C1 was rebased on top of B2 C1的优先级在B2之上
//     Result state: 'ABCD'

/**-----注：
 在这个例子中，C1就被处理了两次，印证了：高优先级的update有时候会以不同的渲染优先级处理两次。
 第一次渲染的结果是AC，第二次的渲染开始时，Base state是A，不包含C，是因为上边解释了“base state，
 表示被处理的队列中第一个update之前的状态”。第二次的时候“被处理”的队列就是[B2, C1, D2]，第一
 个update就是A1，状态是A。
 * */

// 再来一个例子
// A1 - B1 - C2 - D1 - E2
//   First render, at priority 1:
//     Base state: ''
//     Updates: [A1, B1, D1]
//     Result state: 'ABD'

//   Second render, at priority 2:
//     Base state: 'AB'           <-  base state 没有包含D，是因为C2被跳过了，此时的队列为[C2, D1, E2]，
//                                    第一个update为C2，它之前的状态是A和B。
//
//                                    当循环处理链表，到C2时，如果判断它优先级不足，会先记住此刻的baseState，
//                                    因为A和B都处理完了，所以此时的baseState就是AB。
//
//     Updates: [C2, D1, E2]      <-  D1的优先级在C2之上
//     Result state: 'ABCDE'
// ------------------------------------------------------------------------------------------------


// Because we process updates in insertion order, and rebase high priority
// updates when preceding updates are skipped, the final result is deterministic
// regardless of priority. Intermediate state may vary according to system
// resources, but the final state is always the same.

// 因为是按照update插入的顺序来依次处理更新，并且在跳过update时，重做高优先级的update。无论优先级如何，最终结果都是确定的，
// 中间状态可能因为系统资源的不同而不同，但最终状态总是相同的

/**
 * react自上而下依次调用this.setState，但结果总是最后的state的原因就在于每次调用setState时，会将新的state插入到updateQueue，
 * 然后在组件更新时，会统一处理队列中的update，后设置的state会覆盖新的state。
 * */

import type {Fiber} from './ReactInternalTypes';
import type {Lanes, Lane} from './ReactFiberLane';
import type {SuspenseConfig} from './ReactFiberSuspenseConfig';

import {NoLane, NoLanes, isSubsetOfLanes, mergeLanes} from './ReactFiberLane';
import {
  enterDisallowedContextReadInDEV,
  exitDisallowedContextReadInDEV,
} from './ReactFiberNewContext.new';
import {Callback, ShouldCapture, DidCapture} from './ReactSideEffectTags';

import {debugRenderPhaseSideEffectsForStrictMode} from 'shared/ReactFeatureFlags';

import {StrictMode} from './ReactTypeOfMode';
import {
  markRenderEventTimeAndConfig,
  markSkippedUpdateLanes,
} from './ReactFiberWorkLoop.new';

import invariant from 'shared/invariant';

import {disableLogs, reenableLogs} from 'shared/ConsolePatchingDev';

export type Update<State> = {|
  // TODO: Temporary field. Will remove this by storing a map of
  // transition -> event time on the root.
  eventTime: number,
  lane: Lane,
  suspenseConfig: null | SuspenseConfig,

  tag: 0 | 1 | 2 | 3,
  payload: any,
  callback: (() => mixed) | null,

  next: Update<State> | null,
|};

type SharedQueue<State> = {|
  pending: Update<State> | null,
|};

export type UpdateQueue<State> = {|
  baseState: State,
  firstBaseUpdate: Update<State> | null,
  lastBaseUpdate: Update<State> | null,
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
    firstBaseUpdate: null,
    lastBaseUpdate: null,
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
      firstBaseUpdate: currentQueue.firstBaseUpdate,
      lastBaseUpdate: currentQueue.lastBaseUpdate,
      shared: currentQueue.shared,
      effects: currentQueue.effects,
    };
    workInProgress.updateQueue = clone;
  }
}

export function createUpdate(
  eventTime: number,
  lane: Lane,
  suspenseConfig: null | SuspenseConfig,
): Update<*> {
  const update: Update<*> = {
    eventTime,
    lane,
    suspenseConfig,

    tag: UpdateState,
    payload: null,
    callback: null,

    next: null,
  };
  return update;
}

export function enqueueUpdate<State>(fiber: Fiber, update: Update<State>) {
  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    return;
  }

  const sharedQueue: SharedQueue<State> = (updateQueue: any).shared;
  const pending = sharedQueue.pending;
  if (pending === null) {
    // This is the first update. Create a circular list.
    // 创建单向环状链表
    update.next = update;
  } else {
    update.next = pending.next;
    pending.next = update;
  }
  // 更新队列的链表总是指向最后一个update
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
  capturedUpdate: Update<State>,
) {
  // Captured updates are updates that are thrown by a child during the render
  // phase. They should be discarded if the render is aborted. Therefore,
  // we should only put them on the work-in-progress queue, not the current one.
  let queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  // Check if the work-in-progress queue is a clone.
  const current = workInProgress.alternate;
  if (current !== null) {
    const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
    if (queue === currentQueue) {
      // The work-in-progress queue is the same as current. This happens when
      // we bail out on a parent fiber that then captures an error thrown by
      // a child. Since we want to append the update only to the work-in
      // -progress queue, we need to clone the updates. We usually clone during
      // processUpdateQueue, but that didn't happen in this case because we
      // skipped over the parent when we bailed out.
      let newFirst = null;
      let newLast = null;
      const firstBaseUpdate = queue.firstBaseUpdate;
      if (firstBaseUpdate !== null) {
        // Loop through the updates and clone them.
        let update = firstBaseUpdate;
        do {
          const clone: Update<State> = {
            eventTime: update.eventTime,
            lane: update.lane,
            suspenseConfig: update.suspenseConfig,

            tag: update.tag,
            payload: update.payload,
            callback: update.callback,

            next: null,
          };
          if (newLast === null) {
            newFirst = newLast = clone;
          } else {
            newLast.next = clone;
            newLast = clone;
          }
          update = update.next;
        } while (update !== null);

        // Append the captured update the end of the cloned list.
        if (newLast === null) {
          newFirst = newLast = capturedUpdate;
        } else {
          newLast.next = capturedUpdate;
          newLast = capturedUpdate;
        }
      } else {
        // There are no base updates.
        newFirst = newLast = capturedUpdate;
      }
      queue = {
        baseState: currentQueue.baseState,
        firstBaseUpdate: newFirst,
        lastBaseUpdate: newLast,
        shared: currentQueue.shared,
        effects: currentQueue.effects,
      };
      workInProgress.updateQueue = queue;
      return;
    }
  }

  // Append the update to the end of the list.
  const lastBaseUpdate = queue.lastBaseUpdate;
  if (lastBaseUpdate === null) {
    queue.firstBaseUpdate = capturedUpdate;
  } else {
    lastBaseUpdate.next = capturedUpdate;
  }
  queue.lastBaseUpdate = capturedUpdate;
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
        }
        const nextState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictMode
          ) {
            disableLogs();
            try {
              payload.call(instance, prevState, nextProps);
            } finally {
              reenableLogs();
            }
          }
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
      const payload = update.payload;
      let partialState;
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
        }
        partialState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictMode
          ) {
            disableLogs();
            try {
              payload.call(instance, prevState, nextProps);
            } finally {
              reenableLogs();
            }
          }
          exitDisallowedContextReadInDEV();
        }
      } else {
        // Partial state object
        partialState = payload;
      }
      if (partialState === null || partialState === undefined) {
        // Null and undefined are treated as no-ops.
        return prevState;
      }
      // Merge the partial state and the previous state.
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
  renderLanes: Lanes,
): void {

  // 准备阶段----------------------------------------
  // 从workInProgress节点上取出updateQueue
  // 以下代码中的queue就是updateQueue
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);
  hasForceUpdate = false;

  if (__DEV__) {
    currentlyProcessingQueue = queue.shared;
  }

  // 取出queue上的baseUpdate队列（下面称遗留的队列），
  // 等待接入本次新产生的更新队列（下面称新队列）
  let firstBaseUpdate = queue.firstBaseUpdate;
  let lastBaseUpdate = queue.lastBaseUpdate;

  // 下面的操作，实际上就是将新队列连接到上次遗留的队列中。
  let pendingQueue = queue.shared.pending;
  if (pendingQueue !== null) {
    queue.shared.pending = null;

    // 取到新队列
    const lastPendingUpdate = pendingQueue;
    const firstPendingUpdate = lastPendingUpdate.next;

    // 将遗留的队列最后一个元素指向null，实现断开环状链表
    // 然后在尾部接入新队列
    lastPendingUpdate.next = null;
    if (lastBaseUpdate === null) {
      firstBaseUpdate = firstPendingUpdate;
    } else {
      // 将遗留的队列中最后一个update的next指向新队列第一个update
      // 完成接入
      lastBaseUpdate.next = firstPendingUpdate;
    }
    // 修改遗留队列的尾部为新队列的尾部
    lastBaseUpdate = lastPendingUpdate;


    // 用同样的方式更新current上的firstBaseUpdate 和
    // lastBaseUpdate（baseUpdate队列）。

    // 这样做相当于将本次合并完成的队列作为baseUpdate队列备份到current节
    // 点上，因为如果render中断，那么下次再重新执行任务的时候，WIP节点复制
    // 自current节点，它上面的baseUpdate队列会保有这次的update，保证
    // update不丢失。
    const current = workInProgress.alternate;
    if (current !== null) {
      // This is always non-null on a ClassComponent or HostRoot
      const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
      const currentLastBaseUpdate = currentQueue.lastBaseUpdate;
      if (currentLastBaseUpdate !== lastBaseUpdate) {
        if (currentLastBaseUpdate === null) {
          currentQueue.firstBaseUpdate = firstPendingUpdate;
        } else {
          currentLastBaseUpdate.next = firstPendingUpdate;
        }
        currentQueue.lastBaseUpdate = lastPendingUpdate;
      }
    }
  }

  // 至此，新队列已经合并到遗留队列上，firstBaseUpdate作为
  // 这个新合并的队列，会被循环处理

  // 处理阶段-------------------------------------
  if (firstBaseUpdate !== null) {
    // 取到baseState
    let newState = queue.baseState;
    // 声明newLanes，它会作为本轮更新处理完成的
    // 优先级，最终标记到WIP节点上
    let newLanes = NoLanes;

    // 声明newBaseState，注意接下来它被赋值的时机，还有前置条件：
    // 1. 当有优先级被跳过，newBaseState赋值为newState，
    //    也就是queue.baseState
    // 2. 当都处理完成后没有优先级被跳过，newBaseState赋值为
    //    本轮新计算的state，最后更新到queue.baseState上
    let newBaseState = null;

    // 使用newFirstBaseUpdate 和 newLastBaseUpdate
    // 来表示本次更新产生的的baseUpdate队列，目的是截取现有队列中
    // 第一个低优先级到最后的所有update，最后会被更新到
    // updateQueue的firstBaseUpdate 和 lastBaseUpdate上
    // 作为下次渲染的遗留队列（baseUpdate）
    let newFirstBaseUpdate = null;
    let newLastBaseUpdate = null;

    // 从头开始循环
    let update = firstBaseUpdate;
    do {
      const updateLane = update.lane;
      const updateEventTime = update.eventTime;
      // isSubsetOfLanes函数的意义是，判断当前更新的优先级（updateLane）
      // 是否在渲染优先级（renderLanes）中如果不在，那么就说明优先级不足
      if (!isSubsetOfLanes(renderLanes, updateLane)) {
        const clone: Update<State> = {
          eventTime: updateEventTime,
          lane: updateLane,
          suspenseConfig: update.suspenseConfig,

          tag: update.tag,
          payload: update.payload,
          callback: update.callback,

          next: null,
        };
        // 优先级不足，将update添加到本次的baseUpdate队列中
        if (newLastBaseUpdate === null) {
          newFirstBaseUpdate = newLastBaseUpdate = clone;
          // newBaseState 更新为前一个 update 任务的结果，下一轮
          // 持有新优先级的渲染过程处理更新队列时，将会以它为基础进行计算。
          newBaseState = newState;
        } else {
          // 如果baseUpdate队列中已经有了update，那么将当前的update
          // 追加到队列尾部
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }
        /*
        *
        * newLanes会在最后被赋值到workInProgress.lanes上，而它又最终
        * 会被收集到root.pendingLanes。
        *
        * 再次更新时会从root上的pendingLanes中找出应该在本次中更新的优先
        * 级（renderLanes），renderLanes含有本次跳过的优先级，再次进入，
        * processUpdateQueue wip的优先级符合要求，被更新掉。
        * */
        // 低优先级任务因此被重做
        newLanes = mergeLanes(newLanes, updateLane);
        console.log('被跳过的WIP节点上边的优先级：', updateLane, '此时的渲染优先级：', renderLanes);
      } else {
        if (newLastBaseUpdate !== null) {
          // 进到这个判断说明现在处理的这个update在优先级不足的update之后，
          // 原因有二：
          // 第一，优先级足够；
          // 第二，newBaseQueueLast不为null说明已经有优先级不足的update了
          //
          // 然后将这个高优先级放入本次的baseUpdate，实现之前提到的截取队列
          const clone: Update<State> = {
            eventTime: updateEventTime,
            lane: NoLane,
            suspenseConfig: update.suspenseConfig,
            tag: update.tag,
            payload: update.payload,
            callback: update.callback,
            next: null,
          };
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }
        markRenderEventTimeAndConfig(updateEventTime, update.suspenseConfig);

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
        // 这里的callback是setState的第二个参数，属于副作用，会被放入queue的副作用队列里
        if (callback !== null) {
          workInProgress.effectTag |= Callback;
          const effects = queue.effects;
          if (effects === null) {
            queue.effects = [update];
          } else {
            effects.push(update);
          }
        }
      }
      // 将当前处理的update换成当前的下一个，移动链表实现遍历
      update = update.next;
      if (update === null) {
        // 已有的队列处理完了，检查一下有没有新进来的，有的话
        // 接在已有队列后边继续处理
        pendingQueue = queue.shared.pending;
        if (pendingQueue === null) {
          // 如果没有等待处理的update，那么跳出循环
          break;
        } else {
          // 如果此时又有了新的update进来，那么将它接入到之前合并好的队列中
          const lastPendingUpdate = pendingQueue;
          const firstPendingUpdate = ((lastPendingUpdate.next: any): Update<State>);
          lastPendingUpdate.next = null;
          update = firstPendingUpdate;
          queue.lastBaseUpdate = lastPendingUpdate;
          queue.shared.pending = null;
        }
      }
    } while (true);
    // 如果没有低优先级的更新，那么新的newBaseState就被赋值为
    // 刚刚计算出来的state
    if (newLastBaseUpdate === null) {
      newBaseState = newState;
    }

    // 完成阶段------------------------------------
    queue.baseState = ((newBaseState: any): State);
    queue.firstBaseUpdate = newFirstBaseUpdate;
    queue.lastBaseUpdate = newLastBaseUpdate;
    markSkippedUpdateLanes(newLanes);
    workInProgress.lanes = newLanes;
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
