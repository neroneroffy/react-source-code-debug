import React, { useEffect, useState, useLayoutEffect } from 'react'

const UseEffectExp = () => {
  const [ text, setText ] = useState(0)
    useEffect(() => {
        console.log('effect1')
        return () => {
            console.log('destory1');
        }
    }, [text])
    useLayoutEffect(() => {
        console.log('effect2')
        return () => {
            console.log('destory2');
        }
    }, [])
    return <div>
        <button onClick={() => setText(text + 1)}>{text}</button>
        useEffect
    </div>
}

export default UseEffectExp
