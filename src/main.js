import { GameClient } from './game/GameClient.js';

// Глобальный обработчик загрузки страницы
window.addEventListener('load', async () => {
    try {
        // Создаём и инициализируем клиент
        const gameClient = new GameClient();
        await gameClient.init();

        // Сохраняем в window для отладки (опционально)
        window.gameClient = gameClient;
    } catch (error) {
        console.error('❌ Failed to start game:', error);
        alert('Failed to load the game. Please refresh the page.');
    }
});

// Обработчик закрытия вкладки — корректное завершение
window.addEventListener('beforeunload', () => {
    if (window.gameClient) {
        window.gameClient.destroy();
    }
});