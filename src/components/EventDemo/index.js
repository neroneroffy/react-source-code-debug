import React from 'react'
import './index.css'
class EventDemo extends React.Component{
  state = {
    count: 0,
    inputValue: '',
  }
  onInputChange = e => {
    this.setState({
      inputValue: e.target.value
    })
  }
  render() {
    const { inputValue } = this.state
    return <div className={'event-demo'}>
      <input type="text" value={inputValue} onChange={this.onInputChange}/>
    </div>
  }
}

export default EventDemo
