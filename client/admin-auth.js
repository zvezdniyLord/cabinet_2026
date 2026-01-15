/*const API_BASE_URL = 'http://localhost:3001';
const SERVER_API = 'https://devsanya.ru';
const adminLoginForm = document.getElementById('adminLoginForm');
const passwordInput = document.getElementById('password');
const errorMessageDiv = document.getElementById('errorMessage');
const loadingMessageDiv = document.getElementById('loadingMessage');
const loginButton = document.getElementById('loginButton');

const msgWarning = (message = '', type, el) => {
    el.textContent = message;
    type === "success" ? message : "403 error";
    document.body.appendChild(el);
};

const TOKEN_KEY = 'adminAuthToken';

if (localStorage.getItem(TOKEN_KEY)) {
    window.location.href = 'admin-tickets.html';
}

adminLoginForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const password = passwordInput.value;

    if (!password) {
        displayMessage('Пожалуйста, введите пароль.', true);
        return;
    }

    showLoading(true);
    clearMessage();

    try {
        const response = await fetch(`https://scadaint.ru/api/auth-tech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: password }),
        });

        const data = await response.json();

        if (response.ok && data.token) {
            localStorage.setItem(TOKEN_KEY, data.token);
            displayMessage('Вход успешен! Перенаправление...', false);
            setTimeout(() => {
                window.location.href = 'admin-tickets.html';
            }, 1500);
        } else {
            displayMessage(data.message || `Ошибка: ${response.status}`, true);
        }
    } catch (error) {
        console.error('Ошибка при попытке входа:', error);
        displayMessage('Произошла сетевая ошибка или сервер недоступен. Попробуйте позже.', true);
    } finally {
        showLoading(false);
    }
});

function displayMessage(message, isError = false) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.color = isError ? 'red' : 'green';
    errorMessageDiv.style.display = 'block';
}

function clearMessage() {
    errorMessageDiv.textContent = '';
    errorMessageDiv.style.display = 'none';
}

function showLoading(isLoading) {
    loadingMessageDiv.style.display = isLoading ? 'block' : 'none';
    loginButton.disabled = isLoading;
}
*/

const API_BASE_URL = 'http://localhost:3001';
const SERVER_API = 'https://devsanya.ru';
const adminLoginForm = document.getElementById('adminLoginForm');
const passwordInput = document.getElementById('password');
const errorMessageDiv = document.getElementById('errorMessage');
const loadingMessageDiv = document.getElementById('loadingMessage');
const loginButton = document.getElementById('loginButton');
const passwordToggle = document.getElementById('passwordToggle');

const TOKEN_KEY = 'adminAuthToken';

// Показать/скрыть пароль
if (passwordToggle) {
    passwordToggle.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        this.textContent = type === 'password' ? '👁' : '👁️‍🗨️';
        
        // Анимация иконки
        this.style.transform = 'scale(1.2)';
        setTimeout(() => {
            this.style.transform = 'scale(1)';
        }, 200);
    });
}

// Анимация при фокусе
if (passwordInput) {
    passwordInput.addEventListener('focus', function() {
        this.parentElement.classList.add('focused');
        this.style.transform = 'translateY(-2px)';
    });

    passwordInput.addEventListener('blur', function() {
        this.parentElement.classList.remove('focused');
        this.style.transform = 'translateY(0)';
    });
}

// Проверка наличия токена и редирект
if (localStorage.getItem(TOKEN_KEY)) {
    // Плавный переход
    document.body.style.opacity = '0.8';
    setTimeout(() => {
        window.location.href = 'admin-tickets.html';
    }, 300);
}

adminLoginForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const password = passwordInput.value.trim();

    if (!password) {
        displayMessage('Пожалуйста, введите пароль.', true);
        
        // Анимация ошибки
        const form = document.querySelector('.form-auth-tech');
        form.style.animation = 'none';
        setTimeout(() => {
            form.style.animation = 'shake 0.5s ease-in-out';
        }, 10);
        
        setTimeout(() => {
            form.style.animation = '';
        }, 500);
        
        return;
    }

    showLoading(true, 'Проверка учетных данных...');
    clearMessage();

    try {
        // Анимация нажатия кнопки
        loginButton.style.transform = 'scale(0.98)';
        
        const response = await fetch(`https://scadaint.ru/api/auth-tech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: password }),
        });

        const data = await response.json();

        if (response.ok && data.token) {
            localStorage.setItem(TOKEN_KEY, data.token);
            displayMessage('Вход успешен! Перенаправление...', false);
            
            // Визуальная обратная связь об успехе
            loginButton.classList.add('success');
            const form = document.querySelector('.form-auth-tech');
            form.classList.add('success');
            
            // Плавный переход
            setTimeout(() => {
                document.body.style.opacity = '0.8';
                document.body.style.transform = 'scale(0.98)';
            }, 500);
            
            setTimeout(() => {
                window.location.href = 'admin-tickets.html';
            }, 1500);
        } else {
            displayMessage(data.message || `Ошибка: ${response.status}`, true);
            
            // Анимация ошибки
            const form = document.querySelector('.form-auth-tech');
            form.style.animation = 'none';
            setTimeout(() => {
                form.style.animation = 'shake 0.5s ease-in-out';
            }, 10);
            
            setTimeout(() => {
                form.style.animation = '';
            }, 500);
            
            // Сброс состояния кнопки
            loginButton.classList.remove('success');
        }
    } catch (error) {
        console.error('Ошибка при попытке входа:', error);
        displayMessage('Произошла сетевая ошибка или сервер недоступен. Попробуйте позже.', true);
        
        // Анимация ошибки
        const form = document.querySelector('.form-auth-tech');
        form.style.animation = 'none';
        setTimeout(() => {
            form.style.animation = 'shake 0.5s ease-in-out';
        }, 10);
        
        setTimeout(() => {
            form.style.animation = '';
        }, 500);
    } finally {
        showLoading(false);
        // Возвращаем кнопку в исходное состояние
        setTimeout(() => {
            loginButton.style.transform = 'scale(1)';
        }, 200);
    }
});

function displayMessage(message, isError = false) {
    if (!errorMessageDiv) return;
    
    errorMessageDiv.textContent = message;
    
    if (isError) {
        errorMessageDiv.className = 'error-message';
        errorMessageDiv.style.color = '#dc2626';
        errorMessageDiv.style.backgroundColor = 'rgba(220, 38, 38, 0.1)';
        errorMessageDiv.style.borderColor = 'rgba(220, 38, 38, 0.2)';
        errorMessageDiv.innerHTML = '⚠️ ' + message;
    } else {
        errorMessageDiv.className = 'success-message';
        errorMessageDiv.style.color = '#10b981';
        errorMessageDiv.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        errorMessageDiv.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        errorMessageDiv.innerHTML = '✅ ' + message;
    }
    
    errorMessageDiv.style.display = 'block';
    
    // Анимация появления
    errorMessageDiv.style.animation = 'none';
    setTimeout(() => {
        errorMessageDiv.style.animation = 'slideIn 0.3s ease-out';
    }, 10);
}

function clearMessage() {
    if (!errorMessageDiv) return;
    
    errorMessageDiv.textContent = '';
    errorMessageDiv.style.display = 'none';
    errorMessageDiv.className = '';
}

function showLoading(isLoading, message = '') {
    if (isLoading) {
        loadingMessageDiv.style.display = 'block';
        loadingMessageDiv.textContent = message || 'Загрузка...';
        loadingMessageDiv.innerHTML = '⏳ ' + (message || 'Загрузка...');
        
        // Стили для индикатора загрузки
        loadingMessageDiv.style.color = '#10b981';
        loadingMessageDiv.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        loadingMessageDiv.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        
        loginButton.disabled = true;
        loginButton.innerHTML = '<span class="btn-icon">⏳</span> Авторизация...';
    } else {
        loadingMessageDiv.style.display = 'none';
        loadingMessageDiv.textContent = '';
        loginButton.disabled = false;
        loginButton.innerHTML = '<span class="btn-icon">🚀</span> Войти в систему';
    }
}

// Добавляем CSS для анимаций
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    
    .success-message {
        animation: slideIn 0.3s ease-out;
        padding: 16px;
        border-radius: 12px;
        margin-top: 20px;
        text-align: center;
        font-weight: 500;
        border: 1px solid;
        backdrop-filter: blur(10px);
    }
    
    .error-message {
        animation: slideIn 0.3s ease-out;
        padding: 16px;
        border-radius: 12px;
        margin-top: 20px;
        text-align: center;
        font-weight: 500;
        border: 1px solid;
        backdrop-filter: blur(10px);
    }
    
    .success {
        animation: pulse 2s ease-in-out infinite;
    }
    
    @keyframes pulse {
        0%, 100% {
            box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
        }
        50% {
            box-shadow: 0 4px 30px rgba(16, 185, 129, 0.5);
        }
    }
    
    .btn-icon {
        margin-right: 8px;
        font-size: 18px;
        vertical-align: middle;
        transition: transform 0.3s ease;
    }
    
    .form-auth-tech.success {
        box-shadow: 0 20px 60px rgba(16, 185, 129, 0.3);
        transition: all 0.5s ease;
    }
`;
document.head.appendChild(style);

// Добавляем обработчик для плавного перехода при выходе
window.addEventListener('beforeunload', () => {
    document.body.style.opacity = '0.8';
    document.body.style.transition = 'opacity 0.3s ease';
});

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    // Плавное появление страницы
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    }, 100);
    
    // Фокус на поле ввода
    setTimeout(() => {
        if (passwordInput) {
            passwordInput.focus();
        }
    }, 300);
});
