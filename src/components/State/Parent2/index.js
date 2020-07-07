import React from 'react'
import Child1 from './Child1'
import Child2 from './Child2'
const Parent2 = () => {
  return <div className={'parent2'}>
    Parent2
    <div className={'child-wrapper'}>
      {/*<Child1/>*/}
      <Child2/>
    </div>
  </div>
}

export default Parent2
