参考文章：
https://zhuanlan.zhihu.com/p/110903585

# README.md

这个项目是为了调试react源码而搭建的，目前react的版本是16.9.0。

## setState
调用Class Component 的 setState之后，react 开始调度，`ReactFiberBeginWork.js`文件内部包含了更新各种类型组件的方法。
暴露的beginWork方法内部会根据组件的类型进行判断，其中，判断classComponent的部分：
```javascript
case ClassComponent: {
  const Component = workInProgress.type;
  const unresolvedProps = workInProgress.pendingProps;
  const resolvedProps =
    workInProgress.elementType === Component
      ? unresolvedProps
      : resolveDefaultProps(Component, unresolvedProps);
  return updateClassComponent(
    current,
    workInProgress,
    Component,
    resolvedProps,
    renderExpirationTime,
  );
}
```
可见最终返回的是updateClassComponent的调用结果，而它的调用结果是一个Fiber对象。其内部会先构建class组件实例，之后挂载它。
然后更新它，最后完成更新。完成更新的实例是个Fiber对象
```javascript
function updateClassComponent(
  current: Fiber | null,
  workInProgress: Fiber,
  Component: any,
  nextProps,
  renderExpirationTime: ExpirationTime,
) {
  ...
  const instance = workInProgress.stateNode;
  let shouldUpdate;
  if (instance === null) {
    ...
    // 构造组件实例
    constructClassInstance(...);
    // 挂载组件 
    mountClassInstance(...);
    shouldUpdate = true;
  } else if (current === null) {
    // 重新挂载组件
    shouldUpdate = resumeMountClassInstance(...);
  } else  {
    // 更新之前的准备工作
    shouldUpdate = updateClassInstance(...);
  }
  // 更新组件
  const nextUnitOfWork = finishClassComponent(...);

  return nextUnitOfWork;
}
```
### 构造组件实例
constructClassInstance方法会构建一个组件，主要做了两个事情：
* 获取到context，便于执行组件的构造函数时作为入参，参与构造
* 挂载updater，记录workInProgress 的 stateNode，将当前的workInProgress挂载到组件的_reactInternalFiber上，
以便当前的组件可以被调度更新
```javascript
function constructClassInstance(
  workInProgress: Fiber,
  ctor: any,
  props: any,
  renderExpirationTime: ExpirationTime,
): any {
  let isLegacyContextConsumer = false;
  let unmaskedContext = emptyContextObject;
  let context = emptyContextObject;
  const contextType = ctor.contextType;
  // 从unmaskedContext中根据contextType抽取组件需要的context来实例化组件
  if (typeof contextType === 'object' && contextType !== null) {
    context = readContext((contextType: any));
  } else if (!disableLegacyContext) {
    unmaskedContext = getUnmaskedContext(workInProgress, ctor, true);
    const contextTypes = ctor.contextTypes;
    isLegacyContextConsumer =
      contextTypes !== null && contextTypes !== undefined;
    context = isLegacyContextConsumer
      ? getMaskedContext(workInProgress, unmaskedContext)
      : emptyContextObject;
  }

  const instance = new ctor(props, context);
  const state = (workInProgress.memoizedState =
    instance.state !== null && instance.state !== undefined
      ? instance.state
      : null);
  // 挂载updater，记录workInProgress 的 stateNode，将当前的workInProgress挂载到组件的_reactInternalFiber上，以便当前爱组件可以被调度更新
  adoptClassInstance(workInProgress, instance);

  // Cache unmasked context so we can avoid recreating masked context unless necessary.
  // ReactFiberContext usually updates this cache but can't for newly-created instances.
  if (isLegacyContextConsumer) {
    cacheContext(workInProgress, unmaskedContext, context);
  }

  return instance;
}
```
### 挂载组件

构建class组件实例的方法constructClassInstance对于更新相关的操作是内部调用adoptClassInstance方法，将updater挂载到组件上
```javascript
function adoptClassInstance(workInProgress: Fiber, instance: any): void {
  instance.updater = classComponentUpdater;
  workInProgress.stateNode = instance;
  setInstance(instance, workInProgress);
```
挂载之后的更新是使用updateClassInstance函数，在`ReactFiberClassComponent.js`文件中

在类组件中，决定组件是否做出更新的行为一共有两点：
1. `shouldComponentUpdate`的返回值。
2. `PureComponent`，当组件更新时，如果组件的 props 和 state 是否变化。

checkShouldComponentUpdate 来判断组件是否应该更新。判断的依据是
* 如果组件有shouldComponentUpdate，调用它并且把调用结果返回出去。
* 如果组件是PureComponent，那么对组件的props和state做浅比较，把比较结果返回
* 如果前两个条件都不成立（组件内没有shouldComponentUpdate的生命周期函数，组件是一般组件），那么当前这个组件应该进行更新。
代码如下：
```javascript
function checkShouldComponentUpdate(
  workInProgress,
  ctor,
  oldProps,
  newProps,
  oldState,
  newState,
  nextContext,
) {
  const instance = workInProgress.stateNode;
  if (typeof instance.shouldComponentUpdate === 'function') {
    startPhaseTimer(workInProgress, 'shouldComponentUpdate');
    // 调用组件内部的shouldComponentUpdate，拿到调用结果
    const shouldUpdate = instance.shouldComponentUpdate(
      newProps,
      newState,
      nextContext,
    );
    stopPhaseTimer();
    return shouldUpdate;
  }

  if (ctor.prototype && ctor.prototype.isPureReactComponent) {
    return (
      !shallowEqual(oldProps, newProps) || !shallowEqual(oldState, newState)
    );
  }

  return true;
}

```
