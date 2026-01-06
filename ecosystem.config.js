module.exports = {
    apps: [{
        name: "andorpong",
        script: "./server/index.js",

        // Environment variables
        env: {
            NODE_ENV: "production",
            PORT: 3000,

            // DATABASE CONFIGURATION
            // Option 1: PostgreSQL (Recommended for performance)
            // Uncomment and fill in your connection string:
            // DATABASE_URL: "postgresql://postgres:password@localhost:5432/pong",

            // Option 2: SQLite (Easiest setup)
            // If DATABASE_URL is not set, the app defaults to SQLite.
            // You can specify a path or leave default:
            // DATABASE_PATH: "./pong.db"
        },

        // Process configuration
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G'
    }]
}
