高优先级任务插队，低优先级任务重做

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
