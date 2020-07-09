import React, { Component } from 'react'
import SubChild1 from './SubChild1'
import SubChild2 from './SubChild2'
class Child2 extends Component {
  constructor(props) {
    super(props)
    this.state = {
      count: 0,
      domList: []
    }
  }
  componentDidMount() {
  }
  add = () => {
    const list = []
    // for (let i = 0; i < 10000; i++) {
    //   list.push(i)
    // }
    // this.setState({
    //   domList: list
    // })
    this.setState({
      count: this.state.count + 1
    })
    // this.setState({
    //   count: this.state.count + 2
    // })
    // this.setState({
    //   count: this.state.count + 3
    // })
  }
  render() {
    return <div className={'p2-child'}>
      Child2 ClassComponent
      <p>
        <button onClick={this.add}>+</button>
        {this.state.count}
      </p>
      <div className={'sub-child-wrapper'}>
        <SubChild1/>
        <SubChild2/>
      </div>
      {
        this.state.domList.map(item => {
          return <div key={item}>
            item
          </div>
        })
      }
    </div>
  }
}

export default Child2
