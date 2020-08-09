## 高优先级任务插队，低优先级任务重做
一旦交互或者任何事件触发了更新，就会产生一个update对象，并持有一个更新优先级。
在workInProgress上，会记录两个东西，第一，所有属于该节点的update的优先级，放入workInProgress.lanes；第二，所有属于该节点的update，放入updateQueue。

关于第一点，将优先级放入workInProgress.lanes目的在于表明root的childLanes还有值。因为当高优先级任务完成更新后，root的childLanes会被作为剩余的优先级放入
root的pendingLanes。React会从pendingLanes找出最紧急的Lanes作为当前渲染的渲染优先级。所以，以root为起点的更新任务是否会被调度，在于当前渲染优先级是否存在。
关键代码如下：
```javascript
function ensureRootIsScheduled(root: FiberRoot, currentTime: number) {
  // 因为下次的渲染还没有被调度，所以现在确定的是下次的渲染优先级，和它们的优先级权重
  const newCallbackId = getNextLanes(
    root,
    root === workInProgressRoot ? workInProgressRootRenderLanes : NoLanes,
  );

  // newCallbackPriority会决定任务调度的情况
  const newCallbackPriority = returnNextLanesPriority();

  // 本次渲染优先级不存在，不进行调度
  if (newCallbackId === NoLanes) {
    // 不需要有所更新的话，取消掉之前的任务。
    if (existingCallbackNode !== null) {
      cancelCallback(existingCallbackNode);
      root.callbackNode = null;
      root.callbackPriority = NoLanePriority;
      root.callbackId = NoLanes;
    }
    return;
  }
  // 本次渲染优先级存在，依据优先级决定任务调度
  // .......
  // 这里省略了代码，只做简要描述。
  // 若有高优先级任务插队，需要取消上一次调度中断任务，重新调度。
  // 重新调度时，根据优先级来决定是走传统的同步调度还是concurrent模式的调度

  root.callbackId = newCallbackId;
  root.callbackPriority = newCallbackPriority;
  root.callbackNode = newCallbackNode;
}
```

当开始调度更新时，React会从root节点上的那些优先级中取出最紧急的，作为本次更新的渲染优先级，然后带着这个优先级一路向下构建workInProgress树。
遇到刚刚产生更新的workInProgress节点时，会处理它的updateQueue队列。

具体过程是依次处理队列中的update，处理之前用本次的渲染优先级和update的优先级作比较。若update的优先级包含在本次渲染优先级之中，进行处理，反之则跳过。
对下一个update进行同样的处理。

若update被跳过，则说明优先级不足，将它放到workInProgress节点中。这么做的目的是下次以被跳过update的优先级为渲染优先级进行渲染时，这个被跳过的update
能够被更新。

React会对Fiber上的updateQueue中的update依据本次渲染的渲染优先级和update的优先级决定眼前的这个update是被处理还是被跳过。

```
  constructor(props) {
    super(props)
    this.buttonRef = React.createRef();
  }
  state = { count: 0 }
  componentDidMount() {
    const button = this.buttonRef.current
    // 模拟常规优先级任务
    setTimeout( () => this.setState( { count: 1 } ), 500 )

    // 模拟用户操作，产生高优先级任务插队
    setTimeout( () => button.click(), 600)
  }
  handleButtonClick = () => {
    this.setState( prevState => {
      return { count: prevState.count + 2 }
    } )
  }
  render() {
    return <div className={"doms"}>
      <button ref={this.buttonRef} onClick={this.handleButtonClick}>增加2</button>
      <div>
        {Array.from(new Array(16000)).map( (v,index) =>
          <div key={index}>{this.state.count}</div>
        )}
      </div>
    </div>
  }
```
