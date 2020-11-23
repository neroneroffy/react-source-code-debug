import React, { useState } from 'react'

const UseState = () => {
    const [ text, setText ] = useState('hello')
    const [ next, setNext ] = useState('next')
    return <div>
        <input type="text" defaultValue={text} onChange={e => setText(e.target.value)}/>
        <p>{text}</p>
    </div>
}

export default UseState