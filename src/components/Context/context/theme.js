import React from 'react'
export const THEME_COLOR = {
  PURPLE: 'purple',
  BLUE: 'blue',
  RED: 'red',
}

const defaultValue = {
  theme: THEME_COLOR.PURPLE
}
const ThemeContext = React.createContext(defaultValue);

export default ThemeContext
