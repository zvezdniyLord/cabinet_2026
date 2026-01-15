document.addEventListener('DOMContentLoaded', function () {
    // Если есть контейнер деталей — это страница деталей (приоритетно)
    const hasDetailsPage = !!document.getElementById('ticketContainer');

    // Если есть контейнер списка или формы/модалки — это страница менеджера
    const hasManagerSurface =
        document.getElementById('ticketsContainer') ||
        document.getElementById('ticketForm') ||
        document.getElementById('ticketViewModal') ||
        document.getElementById('replyForm');

    if (hasDetailsPage) {
        // Страница деталей
        const ticketDetails = new TicketDetails();
        ticketDetails.init();
    } else if (hasManagerSurface) {
        // Страница истории/менеджера заявок (или только формы без списка)
        const ticketManager = new TicketManager();
        ticketManager.init();
    }
});

class TicketManager {
    constructor() {
        // Элементы DOM для списка заявок
        this.ticketsContainer = document.getElementById('ticketsContainer');
        this.createTicketBtn = document.getElementById('createTicketBtn');
        this.filterOpenBtn = document.getElementById('filterOpen');
        this.filterClosedBtn = document.getElementById('filterClosed');
        this.filterAllBtn = document.getElementById('filterAll');

        // Элементы DOM для модального окна СОЗДАНИЯ заявки
        this.ticketFormModal = document.getElementById('ticketFormModal');
        this.ticketForm = document.getElementById('ticketForm');
        this.closeTicketFormBtn = document.getElementById('closeTicketFormBtn');
        this.cancelTicketFormBtn = document.getElementById('cancelTicketFormBtn');
        this.attachmentInput = document.getElementById('attachmentInput');
        this.selectedFilesContainer = document.getElementById('selectedFilesContainer');

        // Элементы DOM для модального окна ПРОСМОТРА заявки
        this.ticketViewModal = document.getElementById('ticketViewModal');
        this.closeTicketViewBtn = document.getElementById('closeTicketViewBtn');
        this.viewTicketNumber = document.getElementById('viewTicketNumber');
        this.viewTicketStatus = document.getElementById('viewTicketStatus');
        this.viewTicketSubject = document.getElementById('viewTicketSubject');
        this.viewTicketCreatedAt = document.getElementById('viewTicketCreatedAt');
        this.viewTicketClosedAtContainer = document.getElementById('viewTicketClosedAtContainer');
        this.viewTicketClosedAt = document.getElementById('viewTicketClosedAt');
        this.ticketMessagesContainer = document.getElementById('ticketMessagesContainer');
        this.replyFormContainer = document.getElementById('replyFormContainer');
        this.replyForm = document.getElementById('replyForm');
        this.ticketActions = document.getElementById('ticketActions');
        this.closeTicketBtn = document.getElementById('closeTicketBtn');
        this.reopenTicketBtn = document.getElementById('reopenTicketBtn');

        this.notification = document.getElementById('notification');

        // Состояние
        this.currentFilter = 'open';
        this.token = localStorage.getItem('token');
        this.currentTicketNumber = null;
        this.selectedFiles = [];
    }

    init() {
        // ВЕШАЕМ слушатели ВСЕГДА, даже если нет контейнера списка
        this.setupEventListeners();

        // Загружаем список заявок, только если есть куда рендерить
        if (this.ticketsContainer) {
            this.setActiveFilter(this.currentFilter);
            this.loadTickets(this.currentFilter);
        } else {
            // Нет контейнера списка — возможно, страница с формами/модалками без списка
            // Это штатно: формы и модалки будут работать (слушатели уже навешаны)
            // console.warn("TicketManager: 'ticketsContainer' не найден — пропускаю загрузку списка.");
        }
    }

    setupEventListeners() {
        if (this.createTicketBtn) {
            this.createTicketBtn.addEventListener('click', () => this.showTicketForm());
        }

        // Обработчики для модального окна СОЗДАНИЯ
        // Подстраховываемся: эти кнопки точно не должны сабмитить форму
        [this.closeTicketFormBtn, this.cancelTicketFormBtn].forEach(btn => {
            if (btn) btn.setAttribute('type', 'button');
        });

        if (this.closeTicketFormBtn) {
            this.closeTicketFormBtn.addEventListener('click', () => this.hideTicketForm());
        }
        if (this.cancelTicketFormBtn) {
            this.cancelTicketFormBtn.addEventListener('click', () => this.hideTicketForm());
        }
        if (this.ticketFormModal) {
            this.ticketFormModal.addEventListener('click', (e) => {
                if (e.target === this.ticketFormModal) this.hideTicketForm();
            });
        }
        if (this.ticketForm) {
            this.ticketForm.addEventListener('submit', (e) => this.handleTicketSubmit(e));
        }
        if (this.attachmentInput) {
            this.attachmentInput.addEventListener('change', (e) => this.handleFileSelection(e));
        }

        // Обработчики для фильтров
        if (this.filterOpenBtn) {
            this.filterOpenBtn.addEventListener('click', () => {
                this.setActiveFilter('open');
                this.loadTickets('open');
            });
        }
        if (this.filterClosedBtn) {
            this.filterClosedBtn.addEventListener('click', () => {
                this.setActiveFilter('closed');
                this.loadTickets('closed');
            });
        }
        if (this.filterAllBtn) {
            this.filterAllBtn.addEventListener('click', () => {
                this.setActiveFilter('all');
                this.loadTickets('all');
            });
        }

        // Обработчики для модального окна ПРОСМОТРА
        if (this.closeTicketViewBtn) {
            // На всякий случай — не сабмитим
            this.closeTicketViewBtn.setAttribute('type', 'button');
            this.closeTicketViewBtn.addEventListener('click', () => this.hideTicketViewModal());
        }
        if (this.ticketViewModal) {
            this.ticketViewModal.addEventListener('click', (e) => {
                if (e.target === this.ticketViewModal) this.hideTicketViewModal();
            });
        }
        if (this.replyForm) {
            this.replyForm.addEventListener('submit', (e) => this.handleReplySubmit(e));
        }

        // Кнопки закрытия/переоткрытия заявки не должны сабмитить формы
        [this.closeTicketBtn, this.reopenTicketBtn].forEach(btn => {
            if (btn) btn.setAttribute('type', 'button');
        });

        if (this.closeTicketBtn) {
            this.closeTicketBtn.addEventListener('click', () => this.closeTicket());
        }
        if (this.reopenTicketBtn) {
            this.reopenTicketBtn.addEventListener('click', () => this.reopenTicket());
        }
    }

    async loadTickets(filter = 'open') {
        if (!this.ticketsContainer) return;
        this.ticketsContainer.innerHTML = '<div class="loading">Загрузка заявок...</div>';

        try {
            const response = await fetch(`https://scadaint.ru/api/tickets?status=${filter}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.token}` },
                credentials: "include"
            });

            if (!response.ok) {
                if (response.status === 401) {
                    return;
                }
                const errorData = await response.json().catch(() => ({ message: 'Ошибка сервера' }));
                throw new Error(errorData.message || `Ошибка загрузки: ${response.statusText}`);
            }
            const data = await response.json();
            if (!data.tickets || data.tickets.length === 0) {
                this.ticketsContainer.innerHTML = `<div class="no-tickets"><p>У вас пока нет ${this.getFilterText(filter)} заявок</p></div>`;
                return;
            }
            this.renderTickets(data.tickets);
        } catch (error) {
            console.error('Error loading tickets:', error);
            this.ticketsContainer.innerHTML = `<div class="error-message"><p>Не удалось загрузить: ${error.message}</p></div>`;
        }
    }

    renderTickets(tickets) {
        if (!this.ticketsContainer) return;
        this.ticketsContainer.innerHTML = '';
        if (!Array.isArray(tickets)) {
            this.ticketsContainer.innerHTML = '<div class="error-message"><p>Ошибка: неверный формат данных.</p></div>';
            return;
        }
        tickets.forEach(ticket => {
            const ticketElement = document.createElement('div');
            ticketElement.className = 'ticket-item-new';
            const statusText = ticket.status === 'closed' ? 'ЗАКРЫТА' : (ticket.status === 'waiting_for_user' ? 'ОЖИДАЕТ ОТВЕТА' : 'ОТКРЫТА');
            const statusClass = ticket.status === 'closed' ? 'status-badge-closed' : (ticket.status === 'waiting_for_user' ? 'status-badge-waiting' : 'status-badge-open');
            const subject = ticket.subject || 'Без темы';
            const ticketNumber = ticket.ticket_number || 'N/A';
            const firstMessagePreview = (ticket.first_message || '').substring(0, 80) + ((ticket.first_message || '').length > 80 ? '...' : '');
            ticketElement.innerHTML = `
                <div class="ticket-main-info">
                    <span class="ticket-id-new">Тема заявки: ${subject}</span>
                    <span class="ticket-status-badge ${statusClass}">${statusText}</span>
                </div>
                <p class="ticket-preview-new">${firstMessagePreview}</p>
                <span class="ticket-arrow-new">&gt;</span>`;
            ticketElement.addEventListener('click', () => this.viewTicket(ticketNumber));
            this.ticketsContainer.appendChild(ticketElement);
        });
    }

    showTicketForm() {
        if (this.ticketFormModal) this.ticketFormModal.style.display = 'block';
    }

    hideTicketForm() {
        if (this.ticketFormModal) {
            this.ticketFormModal.style.display = 'none';
            if (this.ticketForm) this.ticketForm.reset();
            this.selectedFiles = [];
            if (this.selectedFilesContainer) this.selectedFilesContainer.innerHTML = '';
        }
    }

    handleFileSelection(event) {
        const files = event.target.files;
        if (!files) return;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!this.selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
                this.selectedFiles.push(file);
            }
        }
        this.renderSelectedFiles();
        event.target.value = null;
    }

    renderSelectedFiles() {
        if (!this.selectedFilesContainer) return;
        this.selectedFilesContainer.innerHTML = '';
        this.selectedFiles.forEach((file, index) => {
            const fileItemElement = document.createElement('div');
            fileItemElement.className = 'selected-file-item';
            fileItemElement.innerHTML = `
                <span class="selected-file-name" title="${file.name}">${file.name} (${this.formatFileSize(file.size)})</span>
                <button type="button" class="remove-file-btn" data-index="${index}">&times;</button>`;
            fileItemElement.querySelector('.remove-file-btn').addEventListener('click', (e) => {
                this.removeSelectedFile(parseInt(e.target.dataset.index, 10));
            });
            this.selectedFilesContainer.appendChild(fileItemElement);
        });
    }

    removeSelectedFile(index) {
        if (index >= 0 && index < this.selectedFiles.length) {
            this.selectedFiles.splice(index, 1);
            this.renderSelectedFiles();
        }
    }

    async handleTicketSubmit(e) {
        e.preventDefault(); // Предотвращаем перезагрузку страницы

        const ticketSubjectInput = document.getElementById('ticketSubject');
        const ticketMessageInput = document.getElementById('ticketMessage');

        if (!ticketSubjectInput || !ticketMessageInput) {
            this.showNotification('Ошибка: элементы формы не найдены', 'error');
            return;
        }
        const subject = ticketSubjectInput.value.trim();
        const message = ticketMessageInput.value.trim();
        if (!subject || !message) {
            this.showNotification('Заполните "Тема" и "Сообщение"', 'error');
            return;
        }
        try {
            const formData = new FormData();
            formData.append('subject', subject);
            formData.append('message', message);
            this.selectedFiles.forEach(file => {
                formData.append('attachments', file, file.name);
            });

            const response = await fetch('https://scadaint.ru/api/tickets', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                credentials: "include",
                body: formData
            });
            const result = await response.json();
            if (response.ok) {
                this.hideTicketForm();
                this.showNotification(result.message || 'Заявка отправлена', 'success');
                this.loadTickets(this.currentFilter);
            } else {
                this.showNotification(result.message || 'Не удалось отправить', 'error');
            }
        } catch (error) {
            console.error('Error submitting ticket:', error);
            this.showNotification('Ошибка сети при отправке', 'error');
        }
    }

    showTicketViewModal() {
        if (this.ticketViewModal) this.ticketViewModal.style.display = 'block';
    }

    hideTicketViewModal() {
        if (this.ticketViewModal) this.ticketViewModal.style.display = 'none';
        this.currentTicketNumber = null;
        if (this.ticketMessagesContainer) this.ticketMessagesContainer.innerHTML = '';
        if (this.replyForm) this.replyForm.reset();
    }

    async viewTicket(ticketNumber) {
        this.currentTicketNumber = ticketNumber;
        const requiredElements = [
            this.ticketMessagesContainer, this.viewTicketNumber, this.viewTicketStatus,
            this.viewTicketSubject, this.viewTicketCreatedAt,
            this.viewTicketClosedAtContainer, this.viewTicketClosedAt
        ];
        if (requiredElements.some(el => !el)) {
            console.error("Ticket view modal elements are missing.");
            return;
        }
        this.ticketMessagesContainer.innerHTML = '<div class="loading">Загрузка...</div>';
        this.showTicketViewModal();

        try {
            const response = await fetch(`https://scadaint.ru/api/tickets/${ticketNumber}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.token}` },
                credentials: "include"
            });
            if (!response.ok) {
                if (response.status === 401) { /* ... */ }
                const errorData = await response.json().catch(() => ({ message: 'Ошибка сервера' }));
                throw new Error(errorData.message || `Ошибка: ${response.statusText}`);
            }
            const data = await response.json();
            this.viewTicketNumber.textContent = data.ticket.ticket_number;
            this.viewTicketSubject.textContent = data.ticket.subject;
            this.viewTicketCreatedAt.textContent = new Date(data.ticket.created_at).toLocaleString();
            const statusText = data.ticket.status === 'closed' ? 'ЗАКРЫТА' : (data.ticket.status === 'waiting_for_user' ? 'ОЖИДАЕТ ОТВЕТА' : 'ОТКРЫТА');
            const statusClass = data.ticket.status === 'closed' ? 'status-badge-closed' : (data.ticket.status === 'waiting_for_user' ? 'status-badge-waiting' : 'status-badge-open');
            this.viewTicketStatus.textContent = statusText;
            this.viewTicketStatus.className = `ticket-status-badge ${statusClass}`;
            if (data.ticket.closed_at) {
                this.viewTicketClosedAt.textContent = new Date(data.ticket.closed_at).toLocaleString();
                this.viewTicketClosedAtContainer.style.display = 'block';
            } else {
                this.viewTicketClosedAtContainer.style.display = 'none';
            }
            this.renderTicketMessages(data.messages);
            this.updateTicketActions(data.ticket.status);
        } catch (error) {
            console.error('Error viewing ticket:', error);
            this.showNotification('Не удалось загрузить детали', 'error');
            this.hideTicketViewModal();
        }
    }

    renderTicketMessages(messages) {
        if (!this.ticketMessagesContainer) return;
        this.ticketMessagesContainer.innerHTML = '';
        if (!Array.isArray(messages) || messages.length === 0) {
            this.ticketMessagesContainer.innerHTML = '<p>В этой заявке пока нет сообщений.</p>';
            return;
        }
        const currentUserInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        const currentUserId = currentUserInfo.id;
        messages.forEach(message => {
            const messageElement = document.createElement('div');
            let senderDisplayName = 'Неизвестно';
            let messageClass = '';
            if (message.sender_type === 'user') {
                senderDisplayName = (message.sender_id === currentUserId) ? 'Вы' : (message.sender_name || message.sender_email);
                messageClass = (message.sender_id === currentUserId) ? 'user-message' : 'user-message-other';
            } else if (message.sender_type === 'support') {
                senderDisplayName = 'Техподдержка ИНТ';
                messageClass = 'support-message';
            }
            messageElement.className = `message-item ${messageClass}`;
            let attachmentsHtml = '';
            if (message.attachments && message.attachments.length > 0) {
                attachmentsHtml = `
                    <div class="message-attachments">
                        <h4>Вложения:</h4>
                        <ul>${message.attachments.map(att => `<li><a href="${att.file_path}" target="_blank" download="${att.file_name}">${att.file_name} (${this.formatFileSize(att.file_size)})</a></li>`).join('')}</ul>
                    </div>`;
            }
            messageElement.innerHTML = `
                <div class="message-header">
                    <span class="message-sender">${senderDisplayName}</span>
                    <span class="message-date">${new Date(message.created_at).toLocaleString()}</span>
                </div>
                <div class="message-body"><p>${message.message.replace(/\n/g, '<br>')}</p></div>
                ${attachmentsHtml}`;
            this.ticketMessagesContainer.appendChild(messageElement);
        });
        this.ticketMessagesContainer.scrollTop = this.ticketMessagesContainer.scrollHeight;
    }

    updateTicketActions(status) {
        const isOpen = status !== 'closed';
        if (this.replyFormContainer) this.replyFormContainer.style.display = isOpen ? 'block' : 'none';
        if (this.closeTicketBtn) this.closeTicketBtn.style.display = isOpen ? 'block' : 'none';
        if (this.reopenTicketBtn) this.reopenTicketBtn.style.display = isOpen ? 'none' : 'block';
    }

    async handleReplySubmit(e) {
        e.preventDefault(); // Предотвращаем перезагрузку страницы

        if (!this.currentTicketNumber || !this.replyForm) return;
        const replyMessageInput = document.getElementById('replyMessage');
        const attachmentInput = document.getElementById('replyAttachmentInput');
        if (!replyMessageInput) return;
        const message = replyMessageInput.value.trim();
        if (!message) {
            this.showNotification('Введите текст сообщения', 'error');
            return;
        }
        try {
            const formData = new FormData();
            formData.append('message', message);
            if (attachmentInput && attachmentInput.files.length > 0) {
                for (let i = 0; i < attachmentInput.files.length; i++) {
                    formData.append('attachments', attachmentInput.files[i]);
                }
            }
            const response = await fetch(`https://scadaint.ru/api/tickets/${this.currentTicketNumber}/messages`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                credentials: "include",
                body: formData
            });
            const result = await response.json();
            if (response.ok) {
                this.viewTicket(this.currentTicketNumber);
                this.showNotification(result.message || 'Ответ отправлен', 'success');
                this.replyForm.reset();
                if (attachmentInput) attachmentInput.value = null;
            } else {
                this.showNotification(result.message || 'Не удалось отправить', 'error');
            }
        } catch (error) {
            console.error('Error sending reply:', error);
            this.showNotification('Ошибка сети при отправке ответа', 'error');
        }
    }

    async closeTicket() {
        if (!this.currentTicketNumber) return;
        try {
            const response = await fetch(`https://scadaint.ru/api/tickets/${this.currentTicketNumber}/close`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                credentials: "include"
            });
            const result = await response.json();
            if (response.ok) {
                this.showNotification(result.message || 'Заявка закрыта', 'success');
                this.viewTicket(this.currentTicketNumber);
                this.loadTickets(this.currentFilter);
            } else {
                this.showNotification(result.message || 'Не удалось закрыть', 'error');
            }
        } catch (error) {
            console.error('Error closing ticket:', error);
            this.showNotification('Ошибка сети при закрытии', 'error');
        }
    }

    async reopenTicket() {
        if (!this.currentTicketNumber) return;
        try {
            const response = await fetch(`http://localhost:3001/api/tickets/${this.currentTicketNumber}/reopen`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                credentials: "include"
            });
            const result = await response.json();
            if (response.ok) {
                this.showNotification(result.message || 'Заявка открыта', 'success');
                this.viewTicket(this.currentTicketNumber);
                this.loadTickets(this.currentFilter);
            } else {
                this.showNotification(result.message || 'Не удалось открыть', 'error');
            }
        } catch (error) {
            console.error('Error reopening ticket:', error);
            this.showNotification('Ошибка сети при открытии', 'error');
        }
    }

    setActiveFilter(filter) {
        this.currentFilter = filter;
        const buttons = [this.filterOpenBtn, this.filterClosedBtn, this.filterAllBtn];
        buttons.forEach(button => {
            if (button) {
                button.classList.remove('active');
                if (button.dataset.filter === filter) {
                    button.classList.add('active');
                }
            }
        });
    }

    formatFileSize(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    getFilterText(filter) {
        if (filter === 'open') return 'активных';
        if (filter === 'closed') return 'закрытых';
        return '';
    }

    showNotification(message, type) {
        if (!this.notification) {
            console.warn("Notification element (#notification) not found, using alert as fallback.");
            alert(`${type.toUpperCase()}: ${message}`);
            return;
        }
        this.notification.textContent = message;
        this.notification.className = `notification ${type}`;
        this.notification.classList.remove('hidden');
        setTimeout(() => {
            this.notification.classList.add('hidden');
        }, 3000);
    }
}

class TicketDetails {
    constructor() {
        // Элементы DOM
        this.ticketContainer = document.getElementById('ticketContainer');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.replyForm = document.getElementById('replyForm');
        this.closeTicketBtn = document.getElementById('closeTicketBtn');
        this.reopenTicketBtn = document.getElementById('reopenTicketBtn');

        // Состояние
        this.token = localStorage.getItem('token');
        this.ticketNumber = this.getTicketNumberFromUrl();
    }

    init() {
        // Проверка наличия номера заявки в URL
        if (!this.ticketNumber) {
            this.showError('Номер заявки не указан');
            return;
        }

        // Обеспечиваем, что кнопки не сабмитят форму
        [this.closeTicketBtn, this.reopenTicketBtn].forEach(btn => {
            if (btn) btn.setAttribute('type', 'button');
        });

        // Загрузка данных заявки
        this.loadTicketDetails();

        // Обработчики событий
        this.setupEventListeners();
    }

    // Получение номера заявки из URL
    getTicketNumberFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id');
    }

    setupEventListeners() {
        // Отправка формы ответа
        if (this.replyForm) {
            this.replyForm.addEventListener('submit', (e) => this.handleReplySubmit(e));
        }

        // Закрытие заявки
        if (this.closeTicketBtn) {
            this.closeTicketBtn.addEventListener('click', () => this.closeTicket());
        }

        // Повторное открытие заявки
        if (this.reopenTicketBtn) {
            this.reopenTicketBtn.addEventListener('click', () => this.reopenTicket());
        }
    }

    // Загрузка деталей заявки
    async loadTicketDetails() {
        try {
            if (this.ticketContainer) {
                this.ticketContainer.innerHTML = '<div class="loading">Загрузка данных заявки...</div>';
            }

            const response = await fetch(`https://scadaint.ru/api/tickets/${this.ticketNumber}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                credentials: "include"
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem('token');
                    window.location.href = './auth.html';
                    return;
                }
                throw new Error('Ошибка загрузки заявки');
            }

            const data = await response.json();
            this.renderTicketDetails(data.ticket);
            this.renderMessages(data.messages);
            this.updateTicketActions(data.ticket.status);
        } catch (error) {
            console.error('Error loading ticket details:', error);
            this.showError('Не удалось загрузить данные заявки');
        }
    }

    // Отображение деталей заявки
    renderTicketDetails(ticket) {
        if (!this.ticketContainer) return;

        const statusClass = ticket.status === 'closed' ? 'status-closed' : 'status-open';
        const statusText = ticket.status === 'closed' ? 'ЗАКРЫТА' : 'ОТКРЫТА';

        this.ticketContainer.innerHTML = `
            <div class="ticket-header">
                <h2>Заявка #${ticket.ticket_number}</h2>
                <span class="ticket-status ${statusClass}">${statusText}</span>
            </div>
            <div class="ticket-info">
                <p class="ticket-subject">${ticket.subject}</p>
                <p class="ticket-date">Создана: ${new Date(ticket.created_at).toLocaleString()}</p>
                ${ticket.closed_at ? `<p class="ticket-date">Закрыта: ${new Date(ticket.closed_at).toLocaleString()}</p>` : ''}
            </div>
        `;
    }

    // Отображение сообщений заявки
    renderMessages(messages) {
        if (!this.messagesContainer) return;
        this.messagesContainer.innerHTML = '';

        messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `message ${message.sender_type === 'user' ? 'user-message' : 'support-message'}`;

            let attachmentsHtml = '';
            if (message.attachments && message.attachments.length > 0) {
                attachmentsHtml = `
                    <div class="message-attachments">
                        <h4>Вложения:</h4>
                        <ul>
                            ${message.attachments.map(attachment => `
                                <li>
                                    <a href="${attachment.file_path}" target="_blank" download="${attachment.file_name}">
                                        ${attachment.file_name} (${this.formatFileSize(attachment.file_size)})
                                    </a>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            }
            messageElement.innerHTML = `
                <div class="message-header">
                    <span class="message-sender">${message.sender_type === 'user' ? 'Вы' : 'Техподдержка'}</span>
                    <span class="message-date">${new Date(message.created_at).toLocaleString()}</span>
                </div>
                <div class="message-body">
                    <p>${message.message.replace(/\n/g, '<br>')}</p>
                </div>
                ${attachmentsHtml}
            `;

            this.messagesContainer.appendChild(messageElement);
        });
    }

    // Обновление кнопок действий
    updateTicketActions(status) {
        if (status === 'closed') {
            if (this.closeTicketBtn) this.closeTicketBtn.style.display = 'none';
            if (this.reopenTicketBtn) this.reopenTicketBtn.style.display = 'block';
            if (this.replyForm) this.replyForm.style.display = 'none';
        } else {
            if (this.closeTicketBtn) this.closeTicketBtn.style.display = 'block';
            if (this.reopenTicketBtn) this.reopenTicketBtn.style.display = 'none';
            if (this.replyForm) this.replyForm.style.display = 'block';
        }
    }

    // Обработка отправки ответа
    async handleReplySubmit(e) {
        e.preventDefault(); // Предотвращаем перезагрузку страницы

        const replyMessageInput = document.getElementById('replyMessage');
        if (!replyMessageInput) return;

        const message = replyMessageInput.value.trim();

        if (!message) {
            this.showNotification('Введите текст сообщения', 'error');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('message', message);

            // Добавляем вложения, если есть
            const attachmentInput = document.getElementById('replyAttachmentInput');
            if (attachmentInput && attachmentInput.files.length > 0) {
                for (let i = 0; i < attachmentInput.files.length; i++) {
                    formData.append('attachments', attachmentInput.files[i]);
                }
            }

            const response = await fetch(`https://scadaint.ru/api/tickets/${this.ticketNumber}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData,
                credentials: "include"
            });

            if (!response.ok) {
                throw new Error('Ошибка отправки сообщения');
            }

            // Обновляем просмотр заявки
            this.loadTicketDetails();
            this.showNotification('Сообщение отправлено', 'success');

            // Очищаем форму ответа
            if (this.replyForm) {
                this.replyForm.reset();
            }
        } catch (error) {
            console.error('Error sending reply:', error);
            this.showNotification('Не удалось отправить сообщение', 'error');
        }
    }

    // Закрытие заявки
    async closeTicket() {
        try {
            const response = await fetch(`https://scadaint.ru/api/tickets/${this.ticketNumber}/close`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                credentials: "include"
            });

            if (!response.ok) {
                throw new Error('Ошибка закрытия заявки');
            }

            this.showNotification('Заявка успешно закрыта', 'success');
            this.loadTicketDetails();
        } catch (error) {
            console.error('Error closing ticket:', error);
            this.showNotification('Не удалось закрыть заявку', 'error');
        }
    }

    // Повторное открытие заявки
    async reopenTicket() {
        try {
            const response = await fetch(`https://scadaint.ru/api/tickets/${this.ticketNumber}/reopen`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                credentials: "include"
            });

            if (!response.ok) {
                throw new Error('Ошибка открытия заявки');
            }

            this.showNotification('Заявка успешно открыта', 'success');
            this.loadTicketDetails();
        } catch (error) {
            console.error('Error reopening ticket:', error);
            this.showNotification('Не удалось открыть заявку', 'error');
        }
    }

    // Форматирование размера файла
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Показ уведомления
    showNotification(message, type) {
        const notification = document.getElementById('notification');
        if (!notification) return;

        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');

        // Скрываем уведомление через 3 секунды
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }

    // Показ сообщения об ошибке
    showError(message) {
        if (this.ticketContainer) {
            this.ticketContainer.innerHTML = `<div class="error-message"><p>${message}</p></div>`;
        }
    }
}
