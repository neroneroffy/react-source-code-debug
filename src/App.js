import React, { useState } from 'react';
import State from './components/State'
import LanesDemo from './components/LanesDemo'
import AppSibling from './components/AppSibling'
import TasksWithDifferentPriorities from './components/TasksWithDifferentPriorities'
import Concurrent from './components/ConcurrentInput'
import Diff from './components/Diff'
import PropsDiff from './components/PropsDiff'
import Hooks from "./components/Hooks";
import EventDemo from "./components/EventDemo";
import './App.css';

// propsDiff
/*class App extends React.Component {
  render() {
    return <PropsDiff/>
  }
}*/
function App() {

  // 事件系统
  // return <EventDemo/>

  // return <Hooks/>
  // fiber树
  // return (
  //   <div className="App">
  //     <span className={'app-span'} onClick={() => setCount(count + 1)}>App{count}</span>
  //     <AppSibling count={count}/>
  //   </div>
  // );

  // 高优先级插队
  return <TasksWithDifferentPriorities/>

  // diff 算法
  // return <Diff ref={'diffRef'}/>
}

export default App;

const result = 6
let currentResult = 0
let index = 0
function calculate() {
  currentResult++
  if (currentResult <= result) {
    return calculate
  }
  return null
}

const task = {
  callback: calculate,
}
const taskQueue = []
taskQueue.push(task)

const executeTask = () => {
  const currentTask = taskQueue[0]
  const taskCallback = currentTask.callback
  if (typeof taskCallback() === 'function') {
    index++
    console.log(index);
    currentTask.callback = taskCallback()
  } else {
    return
  }
  executeTask()
}
executeTask()

