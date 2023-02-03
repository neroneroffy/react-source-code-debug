# 为什么 React 要用 JSX？
React目的之一在于引导开发者思考如何构建一个应用（[React 哲学](https://zh-hans.reactjs.org/docs/thinking-in-react.html) ）,
引导的重点在于减少开发者的心智负担，消除额外干扰，这就在框架设计层面上提出了关注点分离的要求，尽可能让开发者更关注应用开发，
不用去考虑React组件到DOM的映射。这样做需要在编码层面对DOM结构的描述抽象出来，所以有了JSX。