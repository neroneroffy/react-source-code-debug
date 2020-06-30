import React, { useState } from 'react'

const Child1 = () => {
  const [ count, setCount ] = useState(0)
  return <div>
    Child1 FunctionComponent
    <div>
      <button onClick={() => {
        setCount(count + 1)
      }}>+</button>
      {count}
    </div>
  </div>
}

export default Child1
