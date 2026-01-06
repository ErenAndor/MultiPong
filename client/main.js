import './style.css'
import { io } from "socket.io-client";

document.querySelector('#app').innerHTML = `
  <div>
    <h1>AndorPong</h1>
    <div id="status">Connecting...</div>
    <canvas id="gameCanvas" width="800" height="800"></canvas>
  </div>
`

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    document.querySelector('#status').innerText = `Connected: ${socket.id}`;
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    document.querySelector('#status').innerText = 'Disconnected';
});
