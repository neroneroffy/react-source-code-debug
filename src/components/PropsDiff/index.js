import React from 'react'

class PropsDiff extends React.Component {
    state = {
        title: '更新前的标题',
        color: 'red',
        fontSize: 18
    }
    onClickDiv = () => {
        this.setState({
            title: '更新后的标题',
            color: 'blue'
        })
    }
    render() {
        return <div
            className="test"
            onClick={this.onClickDiv}
            title={this.state.title}
            style={{color: this.state.color, fontSize: this.state.fontSize}}
            {...this.state.color === 'red' && {props: '自定义旧属性'}}
        >
            测试div的Props变化
        </div>
    }
}
export default PropsDiff
