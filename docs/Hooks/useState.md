fiber上的update相关数据结构：
```javascript
type Update<State> = {|
  eventTime: number,
  lane: Lane,
  suspenseConfig: null | SuspenseConfig,

  tag: 0 | 1 | 2 | 3,
  payload: any,
  callback: (() => mixed) | null,

  next: Update<State> | null,
|};

type SharedQueue<State> = {|
  pending: Update<State> | null,
|};

type UpdateQueue<State> = {|
  baseState: State,
  firstBaseUpdate: Update<State> | null,
  lastBaseUpdate: Update<State> | null,
  shared: SharedQueue<State>,
  effects: Array<Update<State>> | null,
|};

```

hooks的update相关数据结构：
```javascript
type Update<S, A> = {|
  eventTime: number,
  lane: Lane,
  suspenseConfig: null | SuspenseConfig,
  action: A,
  eagerReducer: ((S, A) => S) | null,
  eagerState: S | null,
  next: Update<S, A>,
  priority?: ReactPriorityLevel,
|};

type UpdateQueue<S, A> = {|
  pending: Update<S, A> | null,
  dispatch: (A => mixed) | null,
  lastRenderedReducer: ((S, A) => S) | null,
  lastRenderedState: S | null,
|};

```

Hook相关的数据结构
```javascript
type Hook = {|
  memoizedState: any,
  baseState: any,
  baseQueue: Update<any, any> | null,
  queue: UpdateQueue<any, any> | null,
  next: Hook | null,
|};

type Effect = {|
  tag: HookEffectTag,
  create: () => (() => void) | void,
  destroy: (() => void) | void,
  deps: Array<mixed> | null,
  next: Effect,
|};
```
useState 和 useEffect这两个hook都是用链表来表示。

假设一个组件中调用了两次useState，那么这两个useState会以链表的形式拼接起来：
```javascript
const UseStateExp = () => {
    const [ text, setText ] = useState('hello')
    const [ next, setNext ] = useState('next')
    return <div>
        <input type="text" defaultValue={text} onChange={e => setText(e.target.value)}/>
        <p>{text}</p>
    </div>
}
```
UseStateExp 上memoizedState保存的useState链表结构:
```
fiber.memoizedState:
{
    baseQueue: {eventTime: 2643.9050000044517, lane: 8, suspenseConfig: null, action: "hellod", eagerReducer: ƒ, …}
    baseState: "hello"
    memoizedState: "hello"  
    queue: {pending: null, lastRenderedState: "hellod", dispatch: ƒ, lastRenderedReducer: ƒ}
    next: {
        baseQueue: null
        baseState: "next"
        memoizedState: "next"
        next: null
        queue: {pending: null, lastRenderedState: "next", dispatch: ƒ, lastRenderedReducer: ƒ}
    }
}

```

假设一个组件中调用了两次useEffect，那么这两个Effect会以链表的形式拼接起来，存到fiber节点的memoizedState的memoizedState字段上
```javascript
const UseEffectExp = () => {
    useEffect(() => {
        console.log('effect1')
        return () => {
            console.log('destory1');
        }
    })
    useEffect(() => {
        console.log('effect2')
        return () => {
            console.log('destory2');
        }
    })
    return <div>
        useEffect
    </div>
}

```
UseEffectExp上的effect保存在memoizedState的memoizedState属性上
```
{
    baseQueue: null
    baseState: null
    queue: null
    memoizedState: {
        create: () => {…}
        deps: null
        destroy: () => { console.log('destory1'); }
        next: {
            create: () => {…}
            deps: null
            destroy: () => { console.log('destory2'); }
            next: {tag: 5, deps: null, next: {…}, create: ƒ, destroy: ƒ}
            tag: 5
        },
        tag: 5
    }
    next: {
        baseQueue: null
        baseState: null
        next: null
        queue: null
        memoizedState: {
            create: () => {…}
            deps: null
            destroy: () => { console.log('destory2'); }
            next: {
                create: () => {…}
                deps: null
                destroy: () => { console.log('destory1'); }
                next: {tag: 5, deps: null, next: {…}, create: ƒ, destroy: ƒ}
                tag: 5
            },
            tag: 5
        }
    },
}
```

## hooks保存在哪里？
useState保存在fiber对象的memoizedState上，是一个环状链表。

useEffect保存在fiber对象的updateQueue中，也是一个环状链表