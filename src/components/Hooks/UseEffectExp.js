import React, { useEffect } from 'react'

const UseEffectExp = () => {
    useEffect(() => {
        console.log('effect1')
        return () => {
            console.log('destory1');
        }
    })
    useEffect(() => {
        console.log('effect2')
        return () => {
            console.log('destory2');
        }
    })
    return <div>
        useEffect
    </div>
}

export default UseEffectExp