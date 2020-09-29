/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type PriorityLevel = 0 | 1 | 2 | 3 | 4 | 5;

// TODO: Use symbols?
export const NoPriority = 0; // 无任何优先级
export const ImmediatePriority = 1; // 立即执行，优先级最高，Sync模式采用这种优先级进行调度
export const UserBlockingPriority = 2; // 用户阻塞，用户操作引起的调度任务采用该优先级调度
export const NormalPriority = 3; // 默认的优先级
export const LowPriority = 4; // 低优先级
export const IdlePriority = 5; // 优先级最低，闲置的任务
