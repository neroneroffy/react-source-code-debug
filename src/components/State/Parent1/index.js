import React from 'react'
import Child1 from './Child1'
import Child2 from './Child2'
const Parent1 = () => {
  return <div className={'parent1'}>
    Parent1
    <div className={'child-wrapper'}>
      <Child1/>
      <Child2/>
    </div>
  </div>
}

export default Parent1
