import React from 'react'
import Parent1 from './Parent1'
import Child2 from './Parent2/Child2'
import './index.css'
const State = () => {
  return <div className={'state-component'}>
    {/*<h2>State Change</h2>*/}
    {/*<Parent1/>*/}
    <Child2/>
  </div>
}

export default State
