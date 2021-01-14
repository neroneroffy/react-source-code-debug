import React from 'react'
import PropTypes from 'prop-types'

class ProviderText extends React.Component{
  getChildContext() {
    return {
      text: this.props.text
    }
  }

  render() {
    return <>
      <h3>ProviderText</h3>
      {this.props.children}
    </>
  }
}
ProviderText.childContextTypes = {
  text: PropTypes.string
};

class ConsumerText extends React.Component{
  render() {
    return <div>ConsumerText: {this.context.text}</div>
  }
}
ConsumerText.contextTypes = {
  text: PropTypes.string
}

class ProviderColor extends React.Component{
  getChildContext() {
    return {
      color: this.props.color
    }
  }

  render() {
    return <>
      <h3 style={{ color: this.props.color }}>ProviderColor</h3>
      {this.props.children}
    </>
  }
}
ProviderColor.childContextTypes = {
  color: PropTypes.string
};

class ConsumerColor extends React.Component{
  render() {
    const { color } = this.context
    return <div style={{ color }}>ConsumerColor: {color}</div>
  }
}
ConsumerColor.contextTypes = {
  color: PropTypes.string
}


class LagcyContext extends React.Component{
  state = {
    textValue: 'hello context',
    color: 'black'
  }
  render() {
    const { textValue, color } = this.state
    return <>
      <div style={{ marginTop: 80 }}>
        <h2>旧版context</h2>
        <p>
          颜色：
          <select
            name="color"
            id="color-selector"
            onChange={e => {
              this.setState({ color: e.target.value })
            }}
          >
            <option value="black">黑色</option>
            <option value="red">红色</option>
            <option value="green">绿色</option>
          </select>
        </p>
        <p>
          文字：
          <input
            type="text"
            defaultValue={textValue}
            onChange={e => {
              this.setState({ textValue: e.target.value })
            }}
          />
        </p>
      </div>
      <ProviderText text={textValue}>
        <ProviderColor color={color}>
          <ConsumerColor/>
          <ConsumerText/>
        </ProviderColor>
      </ProviderText>
    </>
  }
}
export default LagcyContext
