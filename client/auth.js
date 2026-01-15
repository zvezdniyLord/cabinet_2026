document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('authEmail');
    const passwordInput = document.getElementById('authPassword');
    const messageBox = document.getElementById('authMessage');
    const submitButton = loginForm?.querySelector('.btn__auth-enter');

    // Проверяем авторизацию только если мы не на странице lk.html
    /*if (!window.location.pathname.endsWith('lk.html')) {
        checkAuthStatus().then(isAuthenticated => {
            if (isAuthenticated) {
                window.location.href = 'lk.html';
            }
        });
    }*/

    if (!loginForm || !emailInput || !passwordInput || !messageBox || !submitButton) {
        console.error('Login form elements not found!');
        if (messageBox) messageBox.textContent = "Ошибка инициализации формы.";
        return;
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        // Валидация
        if (!email || !password) {
            showError('Введите email и пароль.');
            return;
        }

        try {
            setLoading(true);
            const response = await fetch('https://scadaint.ru/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include'
            });

            if (response.ok) {
                const result = await response.json();
                showSuccess(result.message || 'Вход выполнен!');

                // Ждём 100мс чтобы куки точно установились
                await new Promise(resolve => setTimeout(resolve, 100));
                window.location.href = 'lk.html';
            } else {
                const error = await response.json().catch(() => ({ message: 'Ошибка входа' }));
                showError(error.message);
            }
        } catch (error) {
            showError('Ошибка сети. Проверьте подключение.');
            console.error('Login error:', error);
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        submitButton.disabled = isLoading;
        submitButton.textContent = isLoading ? 'Вход...' : 'Войти';
    }

    function showError(message) {
        messageBox.textContent = message;
        messageBox.className = 'error-message';
    }

    function showSuccess(message) {
        messageBox.textContent = message;
        messageBox.className = 'success-message';
    }
});

async function checkAuthStatus() {
    try {
        const response = await fetch('https://scadaint.ru/api/check-auth', {
            credentials: 'include',
            headers: { 'Cache-Control': 'no-cache' }
        });

        if (response.status === 401) {
            document.cookie = 'accessToken=; max-age=0; path=/';
            return false;
        }
        return response.ok;
    } catch (error) {
        console.error('Auth check failed:', error);
        return false;
    }
}
