import React from 'react'
export const LANGUAGE = {
  ZH_CN: 'zh_cn',
  EN: 'en',
}

const defaultValue = {
  theme: LANGUAGE.ZH_CN
}
const LanguageContext = React.createContext(defaultValue);

export default LanguageContext
