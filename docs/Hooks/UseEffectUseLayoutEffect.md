# 用法

# 本质
// useEffect的调用，只是根据依赖项的变化情况有选择地将effect放到updateQueue中，等待commit阶段对updateQueue的处理。

React在构建用户界面整体遵循函数式的编程理念，即固定的输入有固定的输出，尤其是在推出函数式组件之后，更加强化了组件纯函数的理念。
但实际业务中编写的组件不免要产生请求数据、订阅事件、手动操作DOM这些副作用（effect），这样难免让函数组件变得不那么纯，于是React
提供use(Layout)Effect的hook，来约束开发者的行为。

下面我们会重点通过分析effect的数据结构和执行时机来理解React规定用use(Layout)Effect去执行副作用的用意，同时梳理use(Layout)Effect在render和commit阶段的整体流程。

# 数据结构
useEffect或useLayoutEffect在调用之后，会产生一个effect对象，单个的effect对象包括以下几个属性：
* create: 传入use（Layout）Effect函数的第一个参数，即回调函数
* destroy: 回调函数return的函数，在组件卸载的时候执行
* deps: 依赖项
* next: 指向下一个effect
* tag: effect的类型，区分是useEffect还是useLayoutEffect

单纯看effect对象中的字段，其实很容易将表层意思管理副作用操作的本质联系起来。create函数执行之后，定义在其中的副作用也会得以执行。
而通过deps，又可以控制副作用的执行时机，如需清除副作用，则在create函数中return一个新函数（destroy）即可。


当一个组件中调用多个use(Layout)Effect时，它们会组成环形链表。
```
const UseEffectExp = () => {
    useEffect(() => {
        console.log('useEffect')
        return () => {
            console.log('useEffect destory');
        }
    }, [ dep1, dep2 ])
    useLayoutEffect(() => {
        console.log('useLayoutEffect')
        return () => {
          console.log('useLayoutEffect destory');
        }
    }, [ dep3, dep4 ])
    return <div>useEffect</div>
}
```
环形链表结构如下：
```
fiber.updateQueue ---> useLayoutEffect ----next----> useEffect
                             ↑                          |
                             |__________________________|
```


# 和fiber的关系

# 执行时机
useEffect和useLayoutEffect都是在commit阶段进行处理的，不同的是useEffect采取commit阶段异步调度，在DOM的变化渲染到页面之后再执行。
> 使用 useEffect 完成副作用操作。赋值给 useEffect 的函数会在组件渲染到屏幕之后执行。

而useLayoutEffect是在React完成DOM操作，渲染出来之前这一段时间内同步执行，它会阻塞渲染。
> 它会在所有的 DOM 变更之后同步调用 effect。可以使用它来读取 DOM 布局并同步触发重渲染。在浏览器执行绘制之前，useLayoutEffect 内部的更新计划将被同步刷新。

* useEffect：
before mutation阶段和layout阶段异步调度flushPassiveEffects
layout阶段一旦识别到root含有effect，则将root赋值给rootWithPendingPassiveEffects
layout阶段之后，flushPassiveEffects从rootWithPendingPassiveEffects中找出有useEffect的fiber，循环updateQueue执行掉

