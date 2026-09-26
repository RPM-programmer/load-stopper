// test-server.js
import express from 'express';
import { Worker } from 'node:worker_threads';
import loadStopper from './index.js'; // Подключаем наш кастомный модуль

const app = express();
const PORT = 3000;

// 1. Инициализируем load-stopper с низким порогом для быстрого теста
loadStopper.init({
    cpuThreshold: 50,    // Активировать защиту, если CPU > 50%
    intervalMs: 1000     // Проверять систему каждую секунду
});

// 2. Подключаем мидлвар защиты САМЫМ ПЕРВЫМ
app.use(loadStopper.middleware);

// 3. Обычный рабочий роут
app.get('/', (req, res) => {
    res.send('Everything is fine! Server is responding normally.');
});

// 4. Специальный роут для искусственного вызова перегрузки CPU
app.get('/trigger-load', (req, res) => {
    res.send('Heavy computation started in the background! Watch the console...');

    // Запускаем тяжелые вычисления в отдельном потоке (Worker Thread), 
    // чтобы загрузить CPU, но не намертво подвесить Event Loop сервера.
    const workerCode = `
        const startTime = Date.now();
        // Крутим бесконечный цикл в течение 8 секунд, чтобы раскалить процессор
        while (Date.now() - startTime < 8000) {
            Math.random() * Math.random();
        }
    `;

    // Запускаем 2 воркера параллельно для максимального эффекта
    new Worker(workerCode, { eval: true });
    new Worker(workerCode, { eval: true });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Test server is running at http://localhost:${PORT}`);
    console.log(`👉 Open http://localhost:${PORT}/trigger-load to simulate high CPU usage\n`);
});
