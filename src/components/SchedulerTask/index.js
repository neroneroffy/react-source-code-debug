import React from 'react'
import './indes.css'
class SchedulerTask extends React.Component {
  constructor(props) {
    super(props)
    this.buttonRef = React.createRef();
  }
  state = {
    count: 0,
    positionX: 0,
    positionY: 0,
    moving: false,
    parentX: 0,
    parentY: 0,
  }
  componentDidMount() {
    const target = document.getElementById('drag-element')
    target.addEventListener('mousedown', e => {
      const x = e.clientX - target.offsetLeft;
      const y = e.clientY- target.offsetTop;

      document.onmousemove = function(moveE){
        target.style.left = moveE.clientX - x + 'px'
        target.style.top = moveE.clientY - y + 'px'
      };
      document.onmouseup = function() {
        document.onmousemove = null;
        document.onmouseup = null;
      }
    })

  }
  handleButtonClick = () => {
    this.setState( prevState => {
      return { count: prevState.count + 2 }
    } )
  }
  onBeginTask = () => {
    setTimeout( () => this.setState( { count: this.state.count + 1 } ), 0 )
  }

  render() {
    const { count } = this.state
    return <div className={"task-with-different-priorities"}>
      <div className="counter">
        <button onClick={this.onBeginTask}>开始</button>
        <div>
          {Array.from(new Array(140000)).map( (v,index) =>
            <div key={index}>{count}</div>
          )}
        </div>
      </div>
      <div className="drag-wrapper">
        <div
          id={'drag-element'}
          style={{
            position: 'absolute',
          }}
        >
        </div>
      </div>
    </div>
  }
}
export default SchedulerTask
