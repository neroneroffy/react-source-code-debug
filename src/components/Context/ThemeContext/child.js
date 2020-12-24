import React, { useContext } from 'react'
import ThemeContext from '../context/theme'
const Child = () => {
  const themeColor = useContext(ThemeContext)
  return <p className={'theme-context-child'} style={{ background: themeColor }}>
    Child
  </p>
}

export default Child
