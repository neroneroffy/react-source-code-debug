import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';

ReactDOM.createRoot(
  document.getElementById('root')
).render(<App />);

/*ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);*/
console.log('React 源码调试，当前版本：' + React.version);
