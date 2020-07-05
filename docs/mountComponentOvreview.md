# React 组件更新 - 类组件

暂时只列出函数调用栈，通过调用栈梳理类组件更新的整个流程。我们从setState入手，看看setState之后，都发生了什么。

## 组件实例的setState
声明类组件的方式如下:
```javascript
class Example extends React.Component {
  constructor(props) {
    super(props);
  }
}
```
声明的类组件继承了React的Component类，Component的源码如下：
```javascript
function Component(props, context, updater) {
  this.props = props;
  this.context = context;
  // If a component has string refs, we will assign a different object later.
  this.refs = emptyObject;
  // We initialize the default updater but the real one gets injected by the renderer.
  // 初始化了一个默认的updater，但是真正的updater会被渲染器注入
  this.updater = updater || ReactNoopUpdateQueue;
}
```
可以看到只在Component类上挂载了几个属性，但我们更关心setState的实现：
```javascript
Component.prototype.setState = function(partialState, callback) {
  this.updater.enqueueSetState(this, partialState, callback, 'setState');
};
```
setState内部调用了Component上挂载的updater的enqueueSetState方法。
可以大概猜出，enqueueSetState的调用，触发了React的更新机制。

## 组件实例化
最开始，ReactDOM.render将会调用updateContainer，省略中间的调用关系，它将最终调用scheduleUpdateOnFiber，该函数会开展调度工作，
并且会在组件挂载和组件更新的时候被调用。挂载阶段，调用它会最终实例化组件，将真正的updater挂载到组件上。组件真正的updater：
```javascript
const classComponentUpdater = {
  isMounted,
  enqueueSetState(inst, payload, callback) {
    const fiber = getInstance(inst);
    const eventTime = requestEventTime();
    const suspenseConfig = requestCurrentSuspenseConfig();
    // 获取本次渲染的优先级
    const lane = requestUpdateLane(fiber, suspenseConfig);

    const update = createUpdate(eventTime, lane, suspenseConfig);
    update.payload = payload;
    if (callback !== undefined && callback !== null) {
      update.callback = callback;
    }

    enqueueUpdate(fiber, update);
    scheduleUpdateOnFiber(fiber, lane, eventTime);
  },
  enqueueReplaceState(inst, payload, callback) {
    // ...
  },
  enqueueForceUpdate(inst, callback) {
    // ...
  },
};
```
我们重点关注enqueueSetState方法，它主要的任务有三个
* 创建update
* 调用`enqueueUpdate`将update放入更新队列
* 调用`scheduleUpdateOnFiber`开始调度更新，其内部利用updateQueue来更新组件

scheduleUpdateOnFiber是重点，它里面包含了render阶段和commit阶段的工作。而该函数会在初始化阶段，
以及setState的时候分别被调用，从而触发组件更新。

scheduleUpdateOnFiber的触发最终会调用beginWork，render阶段便以此为起点，


