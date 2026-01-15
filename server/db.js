const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // Опции для production (если нужно)
    // ssl: isProduction ? { rejectUnauthorized: false } : false, // Пример для Heroku/Render
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('!!! DATABASE CONNECTION ERROR:', err.stack);
    }
    console.log('Подкл к БД');
    client.release();
});

module.exports = pool;
