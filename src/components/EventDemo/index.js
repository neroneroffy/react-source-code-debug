import React from 'react'
import './index.css'
class EventDemo extends React.Component{
  state = {
    count: 0
  }
  render() {
    return <div className={'event-demo'}>
      <div onClick={() => {
        this.setState({
          count: this.state.count + 1
        })
      }}>{this.state.count}</div>
    </div>
  }
}

export default EventDemo
