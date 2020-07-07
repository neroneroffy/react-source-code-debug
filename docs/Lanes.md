This worked because of a constraint we imposed where lower priority tasks
were not allowed to complete unless higher priority tasks are also included.
Given priorities A > B > C, you couldn't work on B without also working on A;
nor could you work on C without working on both B and A.

这之所以有效，是因为我们是施加了一个约束，即不允许较低优先级的任务完成，除非包含高优先级的任务。
假设优先级 A > B > C，你不能在没有A的情况下处理B，如果没有A和B，你也不能处理C。


This constraint was designed before Suspense was a thing, and it made some
sense in that world. When all your work is CPU bound, there's not much reason
to work on tasks in any order other than by their priority. But when you
introduce tasks that are IO-bound (i.e. Suspense), you can have a scenario
where a higher priority IO-bound task blocks a lower-priority CPU-bound
task from completing.

这种约束是在挂起之前设计的，在之前的场景里是有意义的。当所有任务都是CPU相关的任务时，必须按照优先级
来处理任务。但是，当你引入了io限制的任务（即挂起）时，可能会遇到这样的场景：高优先级的IO任务阻塞了
低优先级的CPU相关任务的完成。

A similar flaw of Expiration Times is that it's limited in how we can express a
group of multiple priority levels.
过期时间的一个缺陷是，它限制了我们表达一组多个优先级级别的方式。
