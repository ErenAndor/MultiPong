const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path'); // Added path module

const Database = require('./Database');
const RoomManager = require('./RoomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { // Changed to new Server as per original import, but kept cors config from instruction
    cors: {
        origin: "*", // Allow all origins for simplicity in dev/prod hybrid
        methods: ["GET", "POST"]
    }
});

// Serve static files from the React/Vite app
const clientPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientPath));

app.use(cors()); // Moved app.use(cors()) here

// Handle SPA routing: serve index.html for any unknown route
app.get(/^(.*)$/, (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
});

// Track active sessions to know if user is guest or registered
const activeUsers = new Map(); // socket.id -> { username, isGuest, stats }

const roomManager = new RoomManager(io, activeUsers); // Kept original initialization for roomManager
const PORT = process.env.PORT || 3000;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('register', async ({ username, password }, callback) => {
        try {
            const user = await Database.register(username, password);
            callback({ success: true });
        } catch (e) {
            callback({ success: false, message: e.message });
        }
    });

    socket.on('login', async ({ username, password, isGuest }, callback) => {
        try {
            let userData;
            if (isGuest) {
                userData = { username, isGuest: true, high_score: 0, total_goals: 0 };
            } else {
                const user = await Database.login(username, password);
                userData = { username: user.username, isGuest: false, high_score: user.high_score, total_goals: user.total_goals };
            }
            activeUsers.set(socket.id, userData);
            callback({ success: true, user: userData });
        } catch (e) {
            callback({ success: false, message: e.message });
        }
    });

    socket.on('getLeaderboard', async (callback) => {
        try {
            const top = await Database.getTopScores();
            callback(top);
        } catch (e) {
            console.error(e);
        }
    });

    // List rooms
    socket.on('getRooms', (callback) => {
        callback(roomManager.getRooms());
    });

    socket.on('createRoom', ({ roomId, password, duration, botDifficulty }, callback) => {
        try {
            roomManager.createRoom(roomId, socket.id, password, duration, botDifficulty || 'hard');
            callback({ success: true, room: roomManager.getRoomData(roomId) });
            io.emit('roomListUpdate', roomManager.getRooms()); // Broadcast update
        } catch (e) {
            callback({ success: false, message: e.message });
        }
    });

    socket.on('joinRoom', ({ roomId, username, password }, callback) => {
        try {
            const { player } = roomManager.joinRoom(roomId, socket.id, username, password);
            socket.join(roomId);
            const roomData = roomManager.getRoomData(roomId);

            // If this is the first player (host), add bots to fill remaining slots
            if (roomData.players.filter(p => !p.isBot).length === 1) {
                roomManager.addBotsToRoom(roomId);
            }

            callback({ success: true, room: roomManager.getRoomData(roomId), player });
            // Notify others in room
            socket.to(roomId).emit('playerJoined', player);
            // Update lobby
            io.emit('roomListUpdate', roomManager.getRooms());
        } catch (e) {
            callback({ success: false, message: e.message });
        }
    });

    socket.on('startGame', ({ roomId }) => {
        try {
            const roomData = roomManager.getRoomData(roomId);
            if (roomData && roomData.hostId === socket.id) {
                roomManager.startGame(roomId);
            } else {
                console.error('Only host can start the game');
            }
        } catch (e) {
            console.error(e);
        }
    });

    socket.on('input', ({ roomId, position }) => {
        roomManager.handleInput(roomId, socket.id, { position });
    });

    socket.on('leaveRoom', ({ roomId }) => {
        try {
            socket.leave(roomId);
            const room = roomManager.leaveRoom(roomId, socket.id);
            if (room) {
                socket.to(roomId).emit('playerLeft', socket.id);
                io.emit('roomListUpdate', roomManager.getRooms());
            }
        } catch (e) {
            console.error(e);
        }
    });

    socket.on('disconnecting', () => {
        const rooms = socket.rooms;
        rooms.forEach((roomId) => {
            if (roomId !== socket.id) {
                const room = roomManager.leaveRoom(roomId, socket.id);
                if (room) {
                    socket.to(roomId).emit('playerLeft', socket.id);
                }
            }
        });
        io.emit('roomListUpdate', roomManager.getRooms());
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
