import React, { useState } from 'react'
import Child from './child'
import LanguageContext, { LANGUAGE } from '../context/language'

const { ZH_CN, EN } = LANGUAGE

const Parent = () => {
  const [ language, setLanguage ] = useState(ZH_CN)
  return <div className={'language-context'}>
    <span>语言</span>
    <select
      onChange={e => {
        setLanguage(e.target.value)
      }}
    >
      <option value={ZH_CN}>中文</option>
      <option value={EN}>英文</option>
    </select>
    <LanguageContext.Provider value={language}>
      <Child/>
    </LanguageContext.Provider>
  </div>
}

export default Parent
