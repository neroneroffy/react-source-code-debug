import React from 'react'

class Diff extends React.Component {
    state = {
        arr: [1, 2]
    }
    render() {
        return <div>
          {
              this.state.arr.map(v => {
                  return <div key={v}>{v}</div>
              })
          }
        </div>
    }
}
export default Diff
