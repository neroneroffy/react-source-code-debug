const result = 3
let currentResult = 0

function calculate() {
    currentResult++
    if (currentResult < result) {
        return calculate
    }
    return null
}

// 存放任务的队列
const taskQueue = []
// 存放模拟时间片的定时器
let interval

// 调度入口----------------------------------------

const scheduleCallback = (task, priority) => {
    // 创建一个专属于调度器的任务
    const taskItem = {
        callback: task,
        priority
    }

    // 向队列中添加任务
    taskQueue.push(taskItem)
    // 优先级影响到任务在队列中的排序，将优先级最高的任务排在最前面
    taskQueue.sort((a, b) => (a.priority - b.priority))
    // 开始执行任务，调度开始
    requestHostCallback(workLoop)
}
// 开始调度-----------------------------------------
const requestHostCallback = cb => {
    interval = setInterval(cb, 1000)
}
// 执行任务-----------------------------------------
const workLoop = () => {
    // 从队列中取出任务
    let currentTask = taskQueue[0]
    // 获取真正的任务函数，即calculate
    while (currentTask) {
        const taskCallback = currentTask.callback
        // 判断任务函数否是函数，若是，执行它，将返回值更新到currentTask的callback中
        // 所以，taskCallback是上一阶段执行的返回值，若它是函数类型，则说明上一次执行返回了函数
        // 类型，说明任务尚未完成，本次继续执行这个函数，否则说明任务完成。
        if (typeof taskCallback === 'function') {
            currentTask.callback = taskCallback()
            console.log('正在执行任务，当前的currentResult 是', currentResult);
        } else {
            // 任务完成。将当前的这个任务从taskQueue中移除，并清除定时器
            console.log('任务完成，最终的 currentResult 是', currentResult, currentTask);
            console.log(taskQueue);
            clearInterval(interval)
        }
        currentTask = taskQueue[0]

    }
}

// 把calculate加入调度，也就意味着调度开始
scheduleCallback(calculate, 1)