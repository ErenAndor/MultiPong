import './style.css'
import { io } from "socket.io-client";
import { UI } from './ui.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';

// Auto-detect URL: use current host in production, or localhost:3000 in dev
const isProd = window.location.hostname !== 'localhost';
const socketUrl = isProd ? '/' : 'http://localhost:3000';
const socket = io(socketUrl);
const renderer = new Renderer('gameCanvas');
let currentRoomId = null;
let playerWall = null;
let myCountdown = 0;

const inputHandler = new InputHandler((pos) => {
    if (currentRoomId && myCountdown <= 0) {
        socket.emit('input', { roomId: currentRoomId, position: pos });
    }
});

// Update mouse logic
document.getElementById('gameCanvas').addEventListener('mousemove', (e) => {
    if (!currentRoomId || !playerWall) return;
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();

    // Scale mouse position to logical 800x800 size
    const scaleX = 800 / rect.width;
    const scaleY = 800 / rect.height;

    let pos;
    if (playerWall === 'top' || playerWall === 'bottom') {
        pos = (e.clientX - rect.left) * scaleX;
    } else {
        pos = (e.clientY - rect.top) * scaleY;
    }
    inputHandler.updateMousePosition(pos);
});

const ui = new UI(socket, (room, player) => {
    currentRoomId = room.id;
    playerWall = player.wall;
    myCountdown = player.countdown || 0;
    console.log('Joined room successfully:', room, player);

    // Render player list
    if (room.players) {
        ui.renderPlayerList(room.players);
        // Show waiting screen with all players
        if (room.gameState === 'waiting') {
            renderer.drawWaiting(room.players);
        }
    }

    // Show countdown if joining mid-game
    if (myCountdown > 0) {
        ui.showCountdown(myCountdown);
    }

    // Add Start Button if not already there (only if 2+ players)
    checkStartButton(room);
}, () => {
    currentRoomId = null;
    playerWall = null;
    myCountdown = 0;
    ui.hideCountdown();
    renderer.clear(); // Clear canvas when leaving
    console.log('Left room');
});

function checkStartButton(room) {
    const existing = document.getElementById('start-game-btn');
    if (existing) existing.remove();

    const isHost = room.hostId === socket.id;
    console.log('Checking start button - Players:', room.players.length, 'IsHost:', isHost);

    if (isHost && room.players.length >= 2 && room.gameState === 'waiting') {
        const btn = document.createElement('button');
        btn.id = 'start-game-btn';
        btn.textContent = 'Start Game';
        btn.onclick = () => {
            console.log('Starting game for room:', room.id);
            socket.emit('startGame', { roomId: room.id });
        };
        document.querySelector('.game-header').appendChild(btn);
    } else if (!isHost && room.gameState === 'waiting') {
        console.log('Waiting for host to start the game...');
    }
}

socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('gameState', (state) => {
    renderer.draw(state);

    // Sync input inversion
    const localUsername = document.getElementById('prof-name').textContent;
    const localPaddle = Object.values(state.paddles).find(p => p.name === localUsername);
    if (localPaddle && localPaddle.effects) {
        inputHandler.setReversed(!!localPaddle.effects.reverse);
    }

    // Update player list with current effects during game, sorted by score
    const playersWithEffects = Object.values(state.paddles)
        .filter(p => p.active)
        .map(p => ({
            username: p.name,
            wall: Object.keys(state.paddles).find(w => state.paddles[w].name === p.name),
            isBot: p.isBot,
            effects: p.effects,
            score: p.score,
            countdown: 0
        }))
        .sort((a, b) => b.score - a.score); // Sort by score descending
    ui.renderPlayerList(playersWithEffects);
});

socket.on('gameStarted', () => {
    const btn = document.getElementById('start-game-btn');
    if (btn) btn.remove();
    console.log('Game has started!');
});

socket.on('gameEvent', (event) => {
    console.log('Game Event:', event);
});

socket.on('gameOver', (data) => {
    console.log('Game Over:', data);
    const scoreText = data.scores
        .map(s => `${s.username}${s.isBot ? ' (Bot)' : ''}: ${s.score}`)
        .join('\n');
    alert('Game Over! Final Scores:\n' + scoreText);
    window.location.reload();
});

socket.on('playerJoined', (player) => {
    console.log('Another player joined:', player);
});

socket.on('roomUpdate', (room) => {
    checkStartButton(room);
    if (room.players) {
        ui.renderPlayerList(room.players);
        // Show waiting screen if game hasn't started
        if (room.gameState === 'waiting') {
            renderer.drawWaiting(room.players);
        }
    }
});

// Handle player list updates
socket.on('playerListUpdate', (players) => {
    console.log('Player list updated:', players);
    ui.renderPlayerList(players);
});

// Handle player joining with countdown
socket.on('playerJoining', (data) => {
    console.log('Player joining:', data);

    // Check if it's me joining
    if (data.playerId === socket.id) {
        myCountdown = data.countdown;
        if (data.countdown > 0) {
            ui.showCountdown(data.countdown);
        } else {
            ui.hideCountdown();
            myCountdown = 0;
        }
    }
});

