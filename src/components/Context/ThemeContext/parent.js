import React, { useState } from 'react'
import Child from './child'
import ThemeContext, { THEME_COLOR } from '../context/theme'

const { PURPLE, BLUE, RED } = THEME_COLOR

const Parent = () => {
  const [ theme, setTheme ] = useState(PURPLE)
  return <div className={'theme-context'}>
    <span>主题</span>
    <select
      onChange={e => {
        setTheme(e.target.value)
      }}
    >
      <option value={PURPLE}>紫色</option>
      <option value={BLUE}>蓝色</option>
      <option value={RED}>红色</option>
    </select>
    <ThemeContext.Provider value={theme}>
      <Child/>
    </ThemeContext.Provider>
  </div>
}

export default Parent
