import React from 'react'
import './index.css'
class EventDemo extends React.Component{
  state = {
    count: 0,
  }

  onDemoClick = () => {
    console.log('counter的点击事件被触发了');
    this.setState({
      count: this.state.count + 1
    })
  }
  onParentClick = () => {
    console.log('父级元素的点击事件被触发了');
  }
  onParentClickCapture = () => {
    console.log('父级元素捕获到点击事件');
  }
  render() {
    const { count } = this.state
    return <div
        className={'counter-parent'}
        onClick={this.onParentClick}
        onClickCapture={this.onParentClickCapture}
    >
      counter-parent
      <div
          onClick={this.onDemoClick}
          className={'counter'}
      >
        counter：{count}
      </div>
    </div>
  }
}

export default EventDemo
