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
    return <h1 onClick={this.add}>{this.state.count}</h1>
  }
}

export default Child2
