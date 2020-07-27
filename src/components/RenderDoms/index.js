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
  }
  handleButtonClick = () => {
    this.setState( prevState => ({ count: prevState.count + 2 }) )
  }
  render() {
    return <div>
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
