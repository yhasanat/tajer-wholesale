import React from 'react';
import {createRoot} from 'react-dom/client';
import TajerApp from './app/tajer-app';
import './styles.css';
const root=document.getElementById('root');
if(!root)throw Error('Root element not found');
createRoot(root).render(<React.StrictMode><TajerApp/></React.StrictMode>);
if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  window.addEventListener('load',()=>{navigator.serviceWorker.register(new URL('./sw.js',document.baseURI),{scope:'./'}).catch(()=>{});});
}
