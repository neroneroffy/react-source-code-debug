import React from 'react'
import './indes.css'
class NewDemo extends React.Component {
  constructor(props) {
    super(props)
    this.buttonRef = React.createRef();
  }
  state = {
    count: 0,
    dragX: 0,
    dragY: 0,
  }
  componentDidMount() {
    //   A2是常规优先级的更新，A1是button.click()产生高优先级的更新。
    //   A后边的数字表示优先级，lane模型中，越小优先级越高，1 > 2。
    //   updateQueue：A2 - A1
    //                1    +2
    //   以1的优先级来执行updateQueue，发现队列中第一个update A2 比当前的渲染优先级低，跳过它处理A1
    //     Base state: 0
    //     Updates: [A1]              <-  +2
    //     Result state: 2
    //
    //   以2的优先级来执行updateQueue，队列中的update都会被处理，A1之前已经被处理过一次，所以A1会以不同的优先级处理两次
    //     Base state: 0              <-  因为上次A2被跳过了，所以base state是A2之前的状态 0
    //
    //     Updates: [A2, A1]          <-  当A1被处理的时候，A2已经处理完了，在1的基础上进行+2操作
    //               1   +2
    //     Result state: 3
  }
  handleButtonClick = () => {
    this.setState( prevState => {
      return { count: prevState.count + 2 }
    } )
  }
  onBeginTask = () => {
    const button = this.buttonRef.current
    setTimeout( () => this.setState( prevState => {
      return { count: prevState.count + 1 }
    } ), 500 )
    setTimeout( () => button.click(), 600)
  }
  onDragHandler = e => {
    this.setState({
      dragX: e.clientX,
      dragY: e.clientY,
    })
  }
  render() {
    const { dragX, dragY, count } = this.state
    return <div className={"new-demo"}>
      <div className="counter">
        <h3>
          不需要点击增加2这个按钮，这个按钮是交给js去模拟点击用的，模拟点击之后产生的是高优先级任务。
        </h3>
        <p>点击开始按钮开始模拟高优先级任务插队</p>
        <button ref={this.buttonRef} onClick={this.handleButtonClick}>增加2</button>
        <button onClick={this.onBeginTask} style={{ marginLeft: 16 }}>开始</button>
        <div>
          {Array.from(new Array(40000)).map( (v,index) =>
            <div key={index}>{count}</div>
          )}
        </div>
      </div>
      <div className="drag-wrapper">
        <h3>
          点击左侧开始按钮，随后迅速拖拽方块，一直拖，可以模拟低优先级任务饥饿现象
        </h3>
        <div className="drag-wrapper-box">
          <p>坐标{dragX}，{dragY}</p>
          <div
            id="drag-element"
            draggable={true}
            onDrag={this.onDragHandler}
          >
            拖拽
          </div>
        </div>
      </div>

    </div>

  }
}
export default NewDemo
