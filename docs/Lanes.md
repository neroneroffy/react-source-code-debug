与过期时间相比，Lanes模型有两个主要优势
* lane将任务优先级(“任务的A优先级是否高于任务B?”)从任务批处理(“任务A是这组任务的一部分吗?”)的概念中解耦出来。
* lane可以用一个32位的数据类型表示许多不同的任务线程。

在旧模型中，为了确定正在进行的批处理中是否包含指定的工作单元，我们将比较该工作单元与批处理的相对优先级:
```
const isTaskIncludedInBatch = priorityOfTask >= priorityOfBatch;
```
之所以这种方式可以达到目的，是因为我们是施加了一个约束，即在完成高优先级的任务之前，不允许处理较低优先级的任务。
假设优先级 A > B > C，你不能在没有A的情况下处理B，如果没有A和B，你也不能处理C。

这种规则是在有任务挂起之前出现的，在这种场景里是有意义的，即当所有任务都是CPU密集型的任务时，必须按照优先级
来处理任务。但是，当你引入了IO密集型的任务（即挂起）时，可能会遇到这样的场景：高优先级的IO任务阻塞了
低优先级的CPU密集型任务的完成。

过期时间的一个缺陷是，它限制了我们表达一组多个优先级级别的方式。

无论从内存角度还是计算角度来看，使用Set对象都是不切实际的。这种优先级的检查非常多，所以它们需要速度快，
使用尽可能少的内存。

作为一种妥协，我们通常会做的是保持优先级的范围：
```javascript
const isTaskIncludedInBatch = taskPriority <= highestPriorityInRange && taskPriority >= lowestPriorityInRange;
```
但这种方式不是十全十美的，可以用它来标识一个封闭、连续的任务范围，但并不能区分出这个范围内的某个任务。例如，
指定一个任务范围，如何删除一个位于该范围中间的任务呢？即使已经有了一个不错的解决方案，用这种方式来寻找目标
任务也会变得混乱，并容易出现递归。

旧模型将优先级和批处理这两个概念结合成一个单一的数据类型。

在新的模型中，我们已经将这两个概念解耦了。任务组不是用相对数字表示，而是用位掩码表示：
```javascript
const isTaskIncludedInBatch = (task & batchOfTasks) !== 0;
```
> task & batchOfTasks 为位掩码运算（按位与 &），检查batchOfTasks中是否含有task

表示任务的位掩码类型称为Lane。表示批处理的位掩码的类型称为Lanes。

**实际上无论 Lane 或者 Lanes类型，都是number类型**

更具体地说，由setState调度的更新对象包含一个lane字段，它是一个启用了单个位的位掩码。这将替换旧模型中update的
expirationTime字段。

另一方面，一个fiber并不只与单个更新相关联，而可能关联到多个更新。因此它有一个lane字段，一个启用零位或更多位
的位掩码(旧模型中的fiber.expirationTime)；和一个childLanes字段(fiber.childExpirationTime)。

Lanes是一种不透明类型。你只能在ReactFiberLane模块中执行直接的位掩码操作。在其他地方，必须从该模块导入相关的函数。
这是一种权衡，但我认为它最终是值得的，因为处理lane可能非常微妙，并且同步所有逻辑将使我们更容易调整我们的代码，
而不必每次都做巨大的重构(就像这样)。

## 常见的过期时间字段，将转换为Leans
* renderExpirationtime -> renderLanes
* update.expirationTime -> update.lane
* fiber.expirationTime -> fiber.lanes
* fiber.childExpirationTime -> fiber.childLanes
* root.firstPendingTime and root.lastPendingTime -> fiber.pendingLanes

