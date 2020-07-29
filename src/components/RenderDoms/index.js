/**
 * Licensed Materials - Property of tenxcloud.com
 * (C) Copyright 2019 TenxCloud. All Rights Reserved.
 * ----
 * page TrafficControl
 *
 * @author ZhouHaitao
 * @Date 2020/7/27 0027
 * @Time: 15:19
 */
import React from 'react'
import './indes.css'
class RenderDoms extends React.Component {
  constructor(props) {
    super(props)
    this.buttonRef = React.createRef();
  }
  state = {
    count: 0
  }
  componentDidMount() {
    const button = this.buttonRef.current
    setTimeout( () => this.setState( { count: 1 } ), 500 )
    setTimeout( () => button.click(), 600)
    //   A2是第一个setState产生的更新，A1是button.click()产生的更新。
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
  render() {
    return <div className={"doms"}>
      <button ref={this.buttonRef} onClick={this.handleButtonClick}>增加2</button>
      <div>
        {Array.from(new Array(8000)).map( (v,index) =>
          <div key={index}>{this.state.count}</div>
        )}
      </div>
    </div>
  }
}
export default RenderDoms
