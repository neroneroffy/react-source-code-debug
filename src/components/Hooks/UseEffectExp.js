import React, { useEffect, useState, useLayoutEffect } from 'react'

const UseEffectExp = () => {
  const [ text, setText ] = useState('hello')
    useEffect(() => {
        console.log('effect1')
        return () => {
            console.log('destory1');
        }
    })
    useLayoutEffect(() => {
        console.log('effect2')
        setTimeout(() => {
          setText('123')
        }, 2000)
        return () => {
            console.log('destory2');
        }
    })
    return <div>
        <button onClick={() => setText('123')}>{text}</button>
        useEffect
    </div>
}

export default UseEffectExp
