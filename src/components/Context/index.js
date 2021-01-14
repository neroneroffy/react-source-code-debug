import React from 'react'
import ThemeParent from './ThemeContext/parent'
import LanguageParent from './LanguageContext/parent'
import LagcyContext from './LagcyContext/index'
import './index.css'

const ContextDemo = () => {
  return <div className={'context-demo'}>
    <ThemeParent/>
    <LanguageParent/>
    <LagcyContext/>
  </div>
}
export default ContextDemo
