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
