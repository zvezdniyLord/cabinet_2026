(function() {
    const unauthenticatedLinksContainer = document.querySelector('.header__auth-links');
    let authenticatedLinksContainer;
    let authCheckInProgress = false; // Флаг для предотвращения повторных проверок

    async function updateHeaderDisplay() {
        if (authCheckInProgress) return;
        authCheckInProgress = true;

        if (!unauthenticatedLinksContainer) {
            console.warn('Header auth links container not found.');
            authCheckInProgress = false;
            return;
        }

        try {
            const response = await fetch('https://scadaint.ru/api/check-auth', {
                credentials: 'include'
            });

            const isLoggedIn = response.ok;

            if (isLoggedIn) {
                // Для авторизованных пользователей
                const userData = await response.json().catch(() => null);

                unauthenticatedLinksContainer.style.display = 'none';

                if (!authenticatedLinksContainer) {
                    createAuthLinks(userData?.user || null);
                } else {
                    updateProfileLink(userData?.user || null);
                }

                authenticatedLinksContainer.style.display = 'flex';

                // Если мы на странице auth.html - редирект в ЛК
                if (window.location.pathname.endsWith('auth.html')) {
                    const redirectUrl = localStorage.getItem('redirectAfterLogin') || 'lk.html';
                    localStorage.removeItem('redirectAfterLogin');
                    window.location.href = redirectUrl;
                }
            } else {
                // Для неавторизованных
                unauthenticatedLinksContainer.style.display = 'flex';
                if (authenticatedLinksContainer) {
                    authenticatedLinksContainer.style.display = 'none';
                }

                checkRedirectNeeded();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            unauthenticatedLinksContainer.style.display = 'flex';
            if (authenticatedLinksContainer) {
                authenticatedLinksContainer.style.display = 'none';
            }
        } finally {
            authCheckInProgress = false;
        }
    }

    function createAuthLinks(userData) {
        authenticatedLinksContainer = document.createElement('div');
        authenticatedLinksContainer.id = 'auth-links-authenticated-dynamic';
        authenticatedLinksContainer.className = 'header__auth-links';

        const profileLink = document.createElement('a');
        profileLink.className = 'header__auth-link';
        profileLink.href = 'lk.html';
        updateProfileLinkText(profileLink, userData);

        const separatorSpan = document.createElement('span');
        separatorSpan.className = 'header__span';
        separatorSpan.textContent = '|';

        const logoutButton = document.createElement('button');
        logoutButton.className = 'header__auth-link header__logout-btn';
        logoutButton.textContent = 'Выйти';
        logoutButton.addEventListener('click', handleLogout);

        authenticatedLinksContainer.append(profileLink, separatorSpan, logoutButton);
        unauthenticatedLinksContainer.parentNode.insertBefore(
            authenticatedLinksContainer,
            unauthenticatedLinksContainer.nextSibling
        );
    }

    function updateProfileLink(userData) {
        const profileLink = authenticatedLinksContainer.querySelector('.header__auth-link[href="lk.html"]');
        if (profileLink) {
            updateProfileLinkText(profileLink, userData);
        }
    }

    function updateProfileLinkText(element, userData) {
        element.textContent = userData?.fio || userData?.email || 'Личный кабинет';
    }

    async function handleLogout() {
        try {
            const response = await fetch('https://scadaint.ru/api/logout', {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                localStorage.removeItem('userInfo');
                localStorage.removeItem('redirectAfterLogin');

                // Редирект только если мы не на публичной странице
                if (!isPublicPage()) {
                    window.location.href = 'auth.html';
                } else {
                    updateHeaderDisplay();
                }
            }
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    function checkRedirectNeeded() {
        if (isPublicPage()) return;

        localStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search);
        window.location.href = 'auth.html';
    }

    function isPublicPage() {
        const publicPages = [
            'index.html', 'about.html', 'auth.html', 'reg.html', 'alarms.html', 'clientsecurity.html',
            'contacts.html', 'datatransport.html', 'demo.html', 'documentation.html', 'education.html',
            'historyserver.html', 'hmi.html', 'ienvcontrol.html', 'integrator.html', 'iserver.html',
            'keys.html', 'licence.html', 'moscow.html', 'price.html', 'products.html', 'reports.html',
            'supports.html', 'systemreq.html', 'teсh.html', 'trends.html', 'webhmi.html'
        ];
	
	const privatePages = [
        'lk.html', 'history.html', 'documents.html', 'video.html'
    	];
	
        const currentPage = window.location.pathname.split('/').pop().toLowerCase() || 'index.html';

	if (privatePages.includes(currentPage)) {
        return false;
    	}

        return publicPages.includes(currentPage);
    }

    // Инициализация
    document.addEventListener('DOMContentLoaded', updateHeaderDisplay);
})();
