
import React from 'react'

class Concurrent extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      text: '2'
    }
  }
  onChange = e => {
    this.setState({
      text: e.target.value
    })
  }
  render() {
    return <>
      <input type="text" onChange={this.onChange}/>
      <div>
        {Array.from(new Array(8000)).map( (v,index) =>
          <div key={index}>{this.state.text}</div>
        )}
      </div>

    </>
  }
}
export default Concurrent
