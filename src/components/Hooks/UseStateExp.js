import React, { useState } from 'react'

const UseState = () => {
    const [ text, setText ] = useState('hello')
    return <div>
        <input type="text" defaultValue={text} onChange={e => setText(e.target.value)}/>
        <p>{text}</p>
    </div>
}

export default UseState