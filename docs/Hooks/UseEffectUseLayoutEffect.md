# 用法

# 本质
useEffect的调用，只是根据依赖项的变化情况有选择地将effect放到updateQueue中，等待commit阶段对updateQueue的处理。
# 数据结构

# 和fiber的关系

# 执行时机
* useEffect：
before mutation阶段异步调度flushPassiveEffects
layout阶段一旦识别到root含有effect，则将root赋值给rootWithPendingPassiveEffects
layout阶段之后，flushPassiveEffects从rootWithPendingPassiveEffects中找出有useEffect的fiber，循环updateQueue执行掉

# 区别
