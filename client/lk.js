document.addEventListener('DOMContentLoaded', function() {

    const accountForm = document.getElementById('accountForm');
    const profileDataDiv = document.getElementById('profileData'); // Если используете
    const logoutBtn = document.getElementById('logoutBtn');

    // --- 1. Проверка авторизации при загрузке lk.html ---
    // Это резервная проверка, если auth-check.js не сработал или пользователь попал напрямую
    async function ensureAuthenticated() {
        try {
            const response = await fetch('https://scadaint.ru/api/check-auth', {
                credentials: 'include', // Важно!
                headers: { 'Cache-Control': 'no-cache' } // Чтобы избежать кэша
            });

            if (!response.ok) {
                // Если проверка не удалась (401, 500 и т.д.), считаем пользователя НЕ авторизованным
                console.warn('Authentication check failed on lk.html load, redirecting to auth.html');
                window.location.href = './auth.html'; // Или '../auth.html' если lk.html в подкаталоге
                return false; // Останавливаем дальнейшее выполнение
            }
            // Если response.ok, пользователь авторизован, продолжаем загрузку страницы
            return true;
        } catch (error) {
             console.error('Network error during auth check on lk.html load:', error);
             // В случае сетевой ошибки тоже лучше перенаправить, чтобы не показывать защищенный контент
             window.location.href = './auth.html';
             return false;
        }
    }

    // --- 2. Функция для загрузки данных профиля ---
    async function loadProfileData() {
        // Сначала убедимся, что пользователь авторизован
        const isAuthenticated = await ensureAuthenticated();
        if (!isAuthenticated) return; // Если не авторизован, ensureAuthenticated уже перенаправил

        try {
            const response = await fetch('https://scadaint.ru/api/user/profile', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                    // НЕ нужно добавлять Authorization header вручную, куки отправятся автоматически
                },
                credentials: "include" // Важно для отправки куки с accessToken
            });

            // Обработка 401 внутри fetch
            if (response.status === 401) {
                 console.warn('Received 401 on profile load, redirecting to auth.html');
                 // Очистка любых потенциально устаревших данных
                 localStorage.removeItem('userInfo'); // userInfo можно оставить, если используется для отображения в других частях UI
                 window.location.href = './auth.html'; // Или '../auth.html'
                 return; // Останавливаем выполнение
            }

            const result = await response.json();

            if (response.ok) {
                const user = result.userData;
		console.log(user);
                // --- Заполняем форму данными пользователя ---
                if (accountForm) {
                    const fioInput = accountForm.querySelector('input[name="fio"]');
                    const phoneInput = accountForm.querySelector('input[name="phone"]'); // Исправлено
                    const passwordInput = accountForm.querySelector('input[name="password"]'); // Исправлено
                    const companyInput = accountForm.querySelector('input[name="company"]'); // Исправлено
                    const positionInput = accountForm.querySelector('input[name="position"]');
                    const emailInput = accountForm.querySelector('input[name="email"]'); // Исправлено
                    const cityInput = accountForm.querySelector('input[name="city"]');
                    const activitySphereInput = accountForm.querySelector('input[name="activity_sphere"]'); // Исправлено
			
                    if (fioInput) fioInput.value = user.fio || '';
                    if (phoneInput) phoneInput.value = user.phone || '';
                    if (passwordInput) passwordInput.value = ''; // Пароль не отображаем, поле для ввода нового
                    if (companyInput) companyInput.value = user.company || '';
                    if (positionInput) positionInput.value = user.position || '';
                    if (emailInput) {
                        emailInput.value = user.email;
                        //emailInput.disabled = true; // Email не редактируется
                    }
                    if (cityInput) cityInput.value = user.city || '';
                    if (activitySphereInput) activitySphereInput.value = user.activity_sphere || '';
                }

                // --- Отображаем данные профиля (если есть div для этого) ---
                if (profileDataDiv) {
                    profileDataDiv.innerHTML = `
                        <div class="profile-card">
                            <h2>Профиль пользователя</h2>
                            <div class="profile-info">
                                <p><strong>ФИО:</strong> ${user.fio || 'Не указано'}</p>
                                <p><strong>Email:</strong> ${user.email || 'Не указано'}</p>
                                <p><strong>Должность:</strong> ${user.position || 'Не указано'}</p>
                                <p><strong>Компания:</strong> ${user.company || 'Не указано'}</p>
                                <p><strong>Сфера деятельности:</strong> ${user.activity_sphere || 'Не указано'}</p>
                                <p><strong>Город:</strong> ${user.city || 'Не указано'}</p>
                                <p><strong>Телефон:</strong> ${user.phone || 'Не указано'}</p>
                            </div>
                        </div>
                    `;
                }

                // --- Обновляем userInfo в localStorage (если используется для UI вне формы) ---
                // Проверяем, существуют ли данные для обновления
                if (user.id || user.email || user.fio) {
                     const currentUserInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
                     const updatedUserInfo = {
                         ...currentUserInfo, // Сохраняем старые данные на случай, если что-то не пришло
                         ...(user.id && { id: user.id }),
                         ...(user.email && { email: user.email }),
                         ...(user.fio && { fio: user.fio })
                     };
                     localStorage.setItem('userInfo', JSON.stringify(updatedUserInfo));
                }

            } else {
                // Сервер вернул ошибку (например, 500)
                const errorMessage = result.message || 'Неизвестная ошибка';
                console.error('Failed to load profile data:', errorMessage);
                if (profileDataDiv) {
                    profileDataDiv.innerHTML = `<p class="error-message">Не удалось загрузить профиль: ${errorMessage}</p>`;
                }
                // Можно также показать alert или уведомление пользователю
            }
        } catch (error) {
            console.error('Network error fetching profile data:', error);
            const networkErrorMessage = 'Ошибка сети при загрузке профиля. Попробуйте обновить страницу.';
            if (profileDataDiv) {
                profileDataDiv.innerHTML = `<p class="error-message">${networkErrorMessage}</p>`;
            }
            // Можно также показать alert или уведомление пользователю
        }
    }

    // --- 3. Обработчик отправки формы ---
    if (accountForm) {
        accountForm.addEventListener('submit', async function(event) {
            event.preventDefault();

            const submitButton = accountForm.querySelector('.btn-save-data');
            const originalButtonText = submitButton ? submitButton.textContent : 'Сохранить';

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Сохранение...';
            }

            // --- Собираем данные из формы (ИСПРАВЛЕНО) ---
            const formData = {};
            const fioInput = accountForm.querySelector('input[name="fio"]');
            const phoneInput = accountForm.querySelector('input[name="phone"]'); // Исправлено
            const passwordInput = accountForm.querySelector('input[name="password"]'); // Исправлено
            const companyInput = accountForm.querySelector('input[name="company"]'); // Исправлено
            const positionInput = accountForm.querySelector('input[name="position"]');
            const cityInput = accountForm.querySelector('input[name="city"]');
            const activitySphereInput = accountForm.querySelector('input[name="activity_sphere"]'); // Исправлено

            if (fioInput && fioInput.value.trim() !== '') formData.fio = fioInput.value.trim();
            if (phoneInput && phoneInput.value.trim() !== '') formData.phone = phoneInput.value.trim();
            // Пароль отправляется только если введено новое значение
            if (passwordInput && passwordInput.value.trim() !== '') formData.password = passwordInput.value.trim();
            if (companyInput && companyInput.value.trim() !== '') formData.company = companyInput.value.trim();
            if (positionInput && positionInput.value.trim() !== '') formData.position = positionInput.value.trim();
            if (cityInput && cityInput.value.trim() !== '') formData.city = cityInput.value.trim();
            if (activitySphereInput && activitySphereInput.value.trim() !== '') formData.activity_sphere = activitySphereInput.value.trim();

            // Если ничего не изменилось, можно не отправлять запрос
            if (Object.keys(formData).length === 0) {
                 alert('Нет изменений для сохранения.');
                 if (submitButton) {
                     submitButton.disabled = false;
                     submitButton.textContent = originalButtonText;
                 }
                 return;
            }

            try {
                const response = await fetch('https://scadaint.ru/api/user/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                        // НЕ нужно добавлять Authorization header вручную
                    },
                    body: JSON.stringify(formData),
                    credentials: "include" // Важно для отправки куки
                });

                const result = await response.json();

                if (response.ok) {
                    // Показываем сообщение об успехе
                    alert('Профиль успешно обновлен');

                    // Обновляем данные профиля на странице
                    loadProfileData(); // Перезагружаем данные

                    // --- Обновляем userInfo в localStorage, если изменилось ФИО или email ---
                    // Данные уже обновлены в loadProfileData, но можно и здесь явно
                    // const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
                    // if (formData.fio !== undefined) userInfo.fio = formData.fio; // formData.fio уже очищено выше
                    // if (formData.email !== undefined) userInfo.email = formData.email; // Email обычно не меняется, но на всякий случай
                    // localStorage.setItem('userInfo', JSON.stringify(userInfo));

                } else {
                    // Сервер вернул ошибку (например, 400, 500)
                    const errorMessage = result.message || 'Не удалось обновить профиль';
                    console.error('Failed to update profile:', errorMessage);
                    alert(`Ошибка: ${errorMessage}`);
                }
            } catch (error) {
                console.error('Network error updating profile:', error);
                alert('Ошибка сети при обновлении профиля. Попробуйте еще раз.');
            } finally {
                // Восстанавливаем кнопку
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = originalButtonText;
                }
            }
        });
    }

    // --- 4. Обработчик выхода ---
    if (logoutBtn) {
         logoutBtn.addEventListener('click', async function(e) {
             e.preventDefault();
             // Простая реализация: вызываем API logout и перенаправляем
             // Предполагается, что auth-check.js также обработает это глобально
             try {
                 // Отправляем запрос на сервер для инвалидации куки (если сервер это поддерживает)
                 const response = await fetch('https://scadaint.ru/api/logout', {
                     method: 'POST',
                     credentials: "include" // Отправляем куки
                 });

                 if (response.ok) {
                     console.log('Logout request sent successfully');
                 } else {
                     console.warn('Logout request failed on server:', response.status);
                     // Даже если сервер вернул ошибку, мы все равно выходим на клиенте
                 }
             } catch (error) {
                 console.error('Network error during logout request:', error);
                 // Даже при сетевой ошибке выходим
             } finally {
                 // Очищаем данные авторизации в localStorage (если они там есть и используются)
                 localStorage.removeItem('userInfo'); // Удаляем userInfo

                 // Перенаправляем на страницу входа
                 // Определяем путь в зависимости от структуры (упрощенный способ)
                 const basePath = window.location.pathname.includes('/some/subfolder/') ? '../' : './';
                 window.location.href = `${basePath}auth.html`;
             }
         });
     }


    // --- 5. Загружаем данные профиля при загрузке страницы ---
    // loadProfileData(); // Вызывается внутри ensureAuthenticated
    ensureAuthenticated().then(isAuth => {
        if(isAuth) {
            loadProfileData(); // Загружаем данные только если пользователь авторизован
        }
    });

});
