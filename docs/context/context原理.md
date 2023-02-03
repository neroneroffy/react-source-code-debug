# React context 的原理
context为用户提供了一套跨组件通信方案，
## context 如何做到共享数据
### 了解context的数据结构
我们平时是使用createContext来创建context的，context中包含了两个ReactElement：Provider和Consumer。
现在有三个角色：context、Provider、Consumer，后两者最终回转化为fiber节点，它们之间的关系如下图：

```javascript
export function createContext<T>(defaultValue: T): ReactContext<T> {

  const context: ReactContext<T> = {
    $$typeof: REACT_CONTEXT_TYPE,
    
    // 主要关注 _currentValue，_currentValue2是为多渲染器的场景准备的
    _currentValue: defaultValue,
    Provider: (null: any),
    Consumer: (null: any),

    // Add these to use same hidden class in VM as ServerContext
    _defaultValue: (null: any),
    _globalName: (null: any),
    
    // 并发渲染器相关
    _currentValue2: defaultValue,
    _threadCount: 0,
  };

  context.Provider = {
    $$typeof: REACT_PROVIDER_TYPE,
    _context: context,
  };

  context.Consumer = context;
  return context;
}
```

### context这个系统中的角色

## Provider数据变化后，如何通知Consumer去更新

### 从Provider说起

