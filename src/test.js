const result = 3
let currentResult = 0
const taskQueue = []
let interval
function calculate() {
    currentResult++
    if (currentResult < result) {
        return calculate
    }
    return null
}

const scheduleCallback = (task, priority) => {
    const taskItem = {
        callback: task,
        priority
    }
    taskQueue.push(taskItem)
    taskQueue.sort((a, b) => (a.priority - b.priority))
    requestHostCallback(workLoop)
}

const requestHostCallback = cb => {
    interval = setInterval(cb, 1000)
}

const workLoop = () => {
    const currentTask = taskQueue[0]
    const taskCallback = currentTask.callback
    if (typeof taskCallback === 'function') {
        currentTask.callback = taskCallback()
        console.log('正在执行任务，当前的currentResult 是', currentResult);
    } else {
        console.log('任务完成，最终的 currentResult 是', currentResult);
        taskQueue.pop()
        clearInterval(interval)
    }
}


scheduleCallback(calculate, 1)




