import React from 'react';
import * as ReactDOM from 'react-dom';
import './index.css';
import App from './App';


/*ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);*/
ReactDOM.createRoot(
  document.getElementById('root')
).render(<App />);
console.log('React 源码调试，当前版本：' + React.version);


// I 'm debugging the react source code, everything is fine until I adopting concurrent mode.

// When I use ReactDOM.createRoot like this,
//
// the App component can't mount into DOM, but ReactDOM.render is fine.
