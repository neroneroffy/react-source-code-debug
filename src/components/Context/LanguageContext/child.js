import React, { useContext } from 'react'
import LanguageContext, { LANGUAGE } from '../context/language'
const { ZH_CN } = LANGUAGE
const Child = () => {
  const language = useContext(LanguageContext)
  return <p className={'language-context-child'}>
    { language === ZH_CN ? '你好' : 'hello' }
  </p>
}

export default Child
