import React, { useState } from 'react';
import State from './components/State'
import TabToggle from './components/TabToggle'
import AppSibling from './components/AppSibling'
import './App.css';

function App() {
  const [ count, setCount ] = useState(0)
  return (
    <div className="App">
      <span className={'app-span'} onClick={() => setCount(count + 1)}>App{count}</span>
      <AppSibling count={count}/>
    </div>
  );
}

export default App;
