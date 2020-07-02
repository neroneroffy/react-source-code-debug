import React, { Component } from 'react'
import SubChild1 from './SubChild1'
import SubChild2 from './SubChild2'
class Child2 extends Component {
  constructor(props) {
    super(props)
    this.state = {
      count: 0
    }
  }

  add = () => {
    this.setState({
      count: this.state.count + 1
    })
    this.setState({
      count: this.state.count + 2
    })
    this.setState({
      count: this.state.count + 3
    })

    const b = { name: 'q0' }
    b.next = b
    const p = { name: 'q1' }
    const q2 = { name: 'q2' }
    const q3 = { name: 'q3' }
    p.next = q2
    q2.next = q3
    q3.next = p
    // console.log('b: ', b) // q0 -> q0 -> q0
    // console.log('p: ', p) // q1 -> q2 -> q3

    const bFirst = b.next
    const pFirst = p.next

    b.next = pFirst
    p.next = bFirst
    //
    console.log('b: ', b)
    console.log('p: ', p)
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
    </div>
  }
}

export default Child2
