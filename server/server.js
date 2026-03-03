require('dotenv').config({
	path: '/var/www/app/.env'
});
const express = require('express');
const pool = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser'); // <-- Добавлено
const cors = require('cors');
const helmet = require('helmet'); // <-- Добавлено
const rateLimit = require('express-rate-limit'); // <-- Добавлено
const {createProxyMiddleware} = require('http-proxy-middleware');
const multer = require('multer');
const fs = require('node:fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);
const path = require("node:path");
const {simpleParser} = require('mailparser');
const {transporter, supportEmail, siteSenderEmail} = require('./nodemailer');
const { escape } = require('node:querystring');
const sanitize = require('sanitize-filename');

const app = express();
const port = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(express.json());
//app.use(express.urlencoded({ extended: true, limit: '1gb' }));
app.use(express.urlencoded());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));



async function sendEmail(to, subject, text, html, options = {}) {
    console.log(`\n--- sendEmail CALLED ---`);
    console.log(`Initial params: to=${to}, subject="${subject}"`);
    console.log(`Options:`, JSON.stringify(options, null, 2)); // Логируем все переданные опции

    try {
        let finalSubject = subject; // Начинаем с исходной темы

        // 1. Обработка идентификатора тикета
        if (options.ticketNumber) {
            const ticketIdNumber = options.ticketNumber;
            const mainTicketMarker = `#${ticketIdNumber}:`;
            const fullTicketPattern = `Заявка ${mainTicketMarker}`;

            console.log(`sendEmail DBG: Processing ticketNumber: ${ticketIdNumber}. Target pattern: "${fullTicketPattern}"`);

            // Удаляем любые предыдущие формы идентификаторов, чтобы избежать дублирования или конфликтов
            let tempSubject = finalSubject
                .replace(/\[Ticket#[a-zA-Z0-9\-]+\]/gi, '') // Удаляем [Ticket#...]
                .replace(/Заявка\s*#\d+:/gi, '')          // Удаляем "Заявка #ЧИСЛО:"
                .replace(/#\d+:/gi, '');                   // Удаляем одиночные #ЧИСЛО:

            // Убираем лишние "Re: " если они дублируются или стоят перед пустым местом
            tempSubject = tempSubject.replace(/^(Re:\s*)+/i, 'Re: ').trim();
            if (tempSubject.toLowerCase() === 're:') { // Если остался только "Re: "
                tempSubject = ''; // Сделаем тему пустой, чтобы корректно добавить наш паттерн
            } else if (tempSubject.toLowerCase().startsWith('re:')) {
                // Если есть "Re: ", оставляем его и работаем с остальной частью темы
                tempSubject = tempSubject.substring(3).trim();
            }

            tempSubject = tempSubject.trim(); // Убираем пробелы по краям после всех замен

            console.log(`sendEmail DBG: Subject after cleaning old markers: "${tempSubject}"`);

            // Теперь формируем новую тему с нашим главным идентификатором
            if (subject.toLowerCase().startsWith('re:')) { // Используем исходный subject для проверки Re:
                finalSubject = `Re: ${fullTicketPattern} ${tempSubject}`;
            } else {
                finalSubject = `${fullTicketPattern} ${tempSubject}`;
            }
            console.log(`sendEmail DBG: Subject after adding main ticket pattern: "${finalSubject}"`);

        } else {
            console.log(`sendEmail DBG: options.ticketNumber is NOT provided. Subject will not be modified for ticket ID, only thread ID if present.`);
        }

        // 2. Добавляем Thread ID, если он есть и еще не добавлен
        if (options.threadId && !finalSubject.includes(`[Thread#${options.threadId}]`)) {
            finalSubject = `${finalSubject.trim()} [Thread#${options.threadId}]`;
            console.log(`sendEmail DBG: Subject after adding threadId: "${finalSubject}"`);
        }

        finalSubject = finalSubject.replace(/\s\s+/g, ' ').trim();
        console.log(`sendEmail DBG: finalSubject before sending: "${finalSubject}"`);

        const mailOptions = {
            from: `"${options.fromName || 'Ваш Сайт ИНТ'}" <${siteSenderEmail}>`, // siteSenderEmail должен быть определен
            to: to,
            subject: finalSubject,
            text: text,
            html: html,
            replyTo: options.replyTo || undefined,
            attachments: options.attachments || [],
            headers: {}
        };

        if (options.threadId) {
            mailOptions.headers['X-Thread-ID'] = options.threadId;
            if (options.inReplyToMessageId) {
                mailOptions.inReplyTo = options.inReplyToMessageId;
                mailOptions.references = options.references ? `${options.references} ${options.inReplyToMessageId}` : options.inReplyToMessageId;
            }
        }

        const info = await transporter.sendMail(mailOptions); // transporter должен быть определен
        console.log(`Email sent successfully to ${to} (Actual Sent Subject: "${finalSubject}"). Message ID: ${info.messageId}`);

        // Логирование в БД (если нужно)
        if (options.saveToDb !== false && typeof pool !== 'undefined' && pool) { // pool должен быть определен
            let client;
            try {
                client = await pool.connect();
                await client.query(
                    `INSERT INTO emails (thread_id, subject, body, from_email, is_outgoing, created_at, user_id)
                     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)`,
                    [
                        options.threadId || null,
                        finalSubject,
                        text,
                        siteSenderEmail,
                        true,
                        options.userIdForLog || null
                    ]
                );
                console.log(`Outgoing email (to: ${to}, subject: ${finalSubject}) logged to DB.`);
            } catch (dbError) {
                console.error('Error logging outgoing email to database:', dbError);
            } finally {
                if (client) client.release();
            }
        }
        console.log(`--- sendEmail END ---\n`);
        return {
            messageId: info.messageId,
            threadId: options.threadId
        };

    } catch (error) {
        const subjectForErrorLog = (typeof finalSubject !== 'undefined' && finalSubject !== subject) ? finalSubject : subject;
        console.error(`Error sending email to ${to} with initial subject "${subject}" (attempted final subject: "${subjectForErrorLog}"):`, error);
        console.log(`--- sendEmail ERROR END ---\n`);
        throw error;
    }
}

app.use(helmet()); // Устанавливает безопасные HTTP заголовки

app.use(cors({
    origin: 'http://127.0.0.1:5500' || 'http://localhost:5500',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control']
}));

const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 15 минут
    max: 10, // Максимум 10 запросов на вход/регистрацию с одного IP за 15 минут
    message: { message: 'Слишком много попыток входа/регистрации. Попробуйте позже.' },
    standardHeaders: true, // Возвращать информацию о лимитах в заголовках `RateLimit-*`
    legacyHeaders: false, // Отключить заголовки `X-RateLimit-*`
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

app.use(cookieParser()); // Парсер для cookies <-- Добавлено
app.use(express.json()); // Парсер для JSON тел запросов
app.use(express.urlencoded({ extended: true })); // Парсер для URL-encoded тел запросов

const sendTokenCookie = (res, token) => {
    const cookieOptions = {
        httpOnly: true,
        secure: true, // <-- В production - только через HTTPS
        sameSite: 'Strict',
        maxAge: parseInt(process.env.COOKIE_MAX_AGE || '3600000', 10),
        path: '/'
    };
    return res.cookie('accessToken', token, cookieOptions); // Имя cookie - accessToken
};

// --- Middleware для проверки JWT из заголовка Authorization ---
const verifyToken = (req, res, next) => {
    // Получаем токен из cookie
    const token = req.cookies?.accessToken;

    if (!token) {
        return res.status(401).json({ message: 'Доступ запрещен. Требуется авторизация.' });
    }

    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
        console.error('!!! JWT_SECRET is not defined for verification !!!');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
    }

    try {
        const decoded = jwt.verify(token, secretKey);
        req.user = decoded; // Добавляем payload токена (userId, email) в объект запроса
        next(); // Переходим к защищенному маршруту
    } catch (err) {
        console.warn('JWT Verification failed:', err.message);
        // Очищаем невалидную cookie
        res.clearCookie('accessToken');
        return res.status(401).json({ message: 'Сессия недействительна или истекла. Пожалуйста, войдите снова.' });
    }
};

app.post('/api/register', async (req, res) => {
    const { email, fio, password_hash, position, company, activity, city, phone } = req.body;

    if (!email || !fio || !password_hash || !position || !company || !activity || !city || !phone) {
        return res.status(400).json({ message: 'Все поля обязательны для заполнения' });
    }
    if (password_hash.length < 6) {
        return res.status(400).json({ message: 'Пароль должен содержать не менее 6 символов' });
    }

    let hashedPassword;
    try {
        const saltRounds = 12;
        hashedPassword = await bcrypt.hash(password_hash, saltRounds);
    } catch (hashError) {
        console.error('Error hashing password:', hashError);
        return res.status(500).json({ message: 'Ошибка сервера при обработке регистрации' });
    }

    const insertQuery = `
        INSERT INTO users (email, fio, password_hash, position, company, activity_sphere, city, phone, account_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_approval')
        RETURNING id, email, fio;
    `;
    const values = [email, fio, hashedPassword, position, company, activity, city, phone];

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(insertQuery, values);
        const newUser = result.rows[0];
        console.log('User registered:', { id: newUser.id, email: newUser.email });
        try {
            await sendEmail(
                //'eat@elesy.ru', // Email админа для уведомлений
		`eat@elesy.ru`,
                `Новая заявка на регистрацию: ${newUser.fio}`,
                `Пользователь ${newUser.fio} (${newUser.email}) подал заявку на регистрацию.\nКомпания: ${company}\nДолжность: ${position}\n\nПожалуйста, рассмотрите заявку в админ-панели.`,
                `<p>Пользователь <strong>${newUser.fio}</strong> (<code>${newUser.email}</code>) подал заявку на регистрацию.</p>
                 <p><strong>Компания:</strong> ${company || 'не указана'}</p>
                 <p><strong>Должность:</strong> ${position || 'не указана'}</p>
                 <p>Пожалуйста, рассмотрите заявку в админ-панели.</p>`,
                { fromName: 'Система Регистрации Scadaint.ru' } // Можно без saveToDb или с userId системы
            );
        } catch (emailError) {
            console.error('Failed to send registration notification email to admin:', emailError);
        }
        res.status(201).json({
            message: 'Спасибо за регистрацию, как только администратор подвердит Ваш аккаунт, Вы сможете войти в систему',
            user: {
                id: newUser.id,
                email: newUser.email,
                fio: newUser.fio
            }
        });

    } catch (dbError) {
        console.error('Database registration error:', dbError);
        if (dbError.code === '23505') { // Unique constraint violation
            return res.status(409).json({ message: 'Пользователь с таким email уже существует' });
        }
        res.status(500).json({ message: 'Ошибка сервера при регистрации' });
    } finally {
        if (client) client.release();
    }
});

// Обновление профиля пользователя
app.put('/api/user/profile', verifyToken, async (req, res) => {
    const userId = req.user.userId; // ID пользователя из JWT-токена
    const { fio, phone, password, company, position, city, activity_sphere } = req.body;
    console.log(req.body);
    // Проверяем, что пользователь не пытается изменить email (если это запрещено в вашей системе)
    if (req.body.email) {
        return res.status(400).json({ message: 'Изменение email не разрешено' });
    }

    let client;
    try {
        client = await pool.connect();

        // Начинаем транзакцию
        await client.query('BEGIN');

        // Проверяем, существует ли пользователь с таким ID
        const userCheckResult = await client.query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );

        if (userCheckResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Формируем запрос на обновление данных
        let updateQuery = 'UPDATE users SET ';
        const updateValues = [];
        const updateFields = [];
        let paramIndex = 1;

        // Добавляем только те поля, которые были переданы в запросе
        if (fio !== undefined) {
            updateFields.push(`fio = $${paramIndex++}`);
            updateValues.push(fio);
        }

        if (phone !== undefined) {
            updateFields.push(`phone = $${paramIndex++}`);
            updateValues.push(phone);
        }

        if (company !== undefined) {
            updateFields.push(`company = $${paramIndex++}`);
            updateValues.push(company);
        }

        if (position !== undefined) {
            updateFields.push(`position = $${paramIndex++}`);
            updateValues.push(position);
        }

        if (city !== undefined) {
            updateFields.push(`city = $${paramIndex++}`);
            updateValues.push(city);
        }

        if (activity_sphere !== undefined) {
            updateFields.push(`activity_sphere = $${paramIndex++}`);
            updateValues.push(activity_sphere);
        }

        // Если передан пароль, хэшируем его
        if (password !== undefined && password.trim() !== '') {
            try {
                const saltRounds = 12;
                const hashedPassword = await bcrypt.hash(password, saltRounds);
                updateFields.push(`password_hash = $${paramIndex++}`);
                updateValues.push(hashedPassword);
            } catch (hashError) {
                await client.query('ROLLBACK');
                console.error('Error hashing password:', hashError);
                return res.status(500).json({ message: 'Ошибка при обработке пароля' });
            }
        }

        // Добавляем updated_at
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

        // Если нет полей для обновления, возвращаем успех
        if (updateFields.length === 0) {
            await client.query('ROLLBACK');
            return res.status(200).json({ message: 'Нет данных для обновления' });
        }

        // Формируем полный запрос
        updateQuery += updateFields.join(', ') + ` WHERE id = $${paramIndex}`;
        updateValues.push(userId);

        // Выполняем запрос
        await client.query(updateQuery, updateValues);

        // Получаем обновленные данные пользователя
        const updatedUserResult = await client.query(
            `SELECT id, email, fio, position, company, activity_sphere, city, phone, created_at, updated_at
             FROM users WHERE id = $1`,
            [userId]
        );

        // Завершаем транзакцию
        await client.query('COMMIT');

        // Отправляем обновленные данные клиенту
        res.status(200).json({
            message: 'Профиль успешно обновлен',
            userData: updatedUserResult.rows[0]
        });

    } catch (error) {
        // В случае ошибки откатываем транзакцию
        if (client) await client.query('ROLLBACK');
        console.error('Error updating user profile:', error);
        res.status(500).json({ message: 'Не удалось обновить профиль' });
    } finally {
        if (client) client.release();
    }
});

app.get('/api/check-auth', (req, res) => {
    const token = req.cookies.accessToken;
    if (!token) {
      return res.status(401).json({ isAuthenticated: false });
    }

    try {
      jwt.verify(token, process.env.JWT_SECRET);
      res.json({ isAuthenticated: true });
    } catch (err) {
      res.clearCookie('accessToken');
      res.status(401).json({ isAuthenticated: false });
    }
  });



app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Необходимо указать email и пароль' });
    }

    const findUserQuery = 'SELECT id, email, fio, password_hash, account_status FROM users WHERE email = $1';
    let client;

    try {
        client = await pool.connect();
        const result = await client.query(findUserQuery, [email]);

        if (result.rows.length === 0) {
            console.warn(`Login attempt failed (user not found): ${email}`);
            return res.status(401).json({ message: 'Неверный email или пароль' });
        }

        const user = result.rows[0];
        if (user.account_status !== 'active') {
            let statusMessage = 'Ваш аккаунт неактивен.';
            if (user.account_status === 'pending_approval') {
                statusMessage = 'Ваш аккаунт ожидает подтверждения администратором.';
            } else if (user.account_status === 'suspended') {
                statusMessage = 'Ваш аккаунт заблокирован.';
            } else if (user.account_status === 'rejected') {
                statusMessage = 'В регистрации вашего аккаунта было отказано.';
            }
            console.warn(`Login attempt failed (account not active: ${user.account_status}): ${email}`);
            return res.status(403).json({ message: statusMessage });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            console.warn(`Login attempt failed (invalid password): ${email}`);
            return res.status(401).json({ message: 'Неверный email или пароль' });
        }

        // Генерация JWT токена
        const payload = { userId: user.id, email: user.email };
        const secretKey = process.env.JWT_SECRET;
        const expiresIn = process.env.JWT_EXPIRES_IN || '1h';

        if (!secretKey) {
            console.error('!!! JWT_SECRET is not defined in .env file !!!');
            return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
        }

        const token = jwt.sign(payload, secretKey, { expiresIn });

        // Установка HTTP-only cookie
        res.cookie('accessToken', token, {
            httpOnly: true,
            secure: true, // В production только через HTTPS
            sameSite: 'None',
            maxAge: 3600000, // 1 час (в миллисекундах)
            path: '/'
        });
        console.log(`Login successful: ${email}`);
        res.status(200).json({
            message: 'Вход выполнен успешно!',
            user: {
                id: user.id,
                email: user.email,
                fio: user.fio
            }
        });

    } catch (error) {
        console.error('Login process error:', error);
        res.status(500).json({ message: 'Ошибка сервера при попытке входа' });
    } finally {
        if (client) client.release();
    }
});

// --- Logout Route ---
app.post('/api/logout', (req, res) => {
    // Очищаем cookie
    res.clearCookie('accessToken', {
        httpOnly: true,
        secure: true,
        sameSite: 'None',
        path: '/'
    });

    console.log('User logged out');
    res.status(200).json({ message: 'Вы успешно вышли из системы' });
});

app.get('/api/user/profile', verifyToken, async (req, res) => {
    // req.user доступен благодаря middleware verifyToken
    const userId = req.user.userId;
    console.log(`Fetching profile for user ID: ${userId}`);

    const query = `
        SELECT id, email, fio, position, company, activity_sphere, city, phone, created_at
        FROM users
        WHERE id = $1;
    `;
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(query, [userId]);

        if (result.rows.length === 0) {
            // Это странная ситуация, если токен валиден, а пользователя нет
            console.error(`User with ID ${userId} not found in DB despite valid token.`);
            return res.status(404).json({ message: 'Профиль пользователя не найден' });
        }

        // Не отправляем password_hash клиенту!
        const userProfile = result.rows[0];
        res.status(200).json({ userData: userProfile });

    } catch (dbError) {
        console.error('Error fetching user profile:', dbError);
        res.status(500).json({ message: 'Не удалось загрузить данные профиля' });
    } finally {
        if (client) client.release();
    }
});

function decodeOriginalName(name) {
    try {
      // Попытка декодировать как UTF-8 из Latin-1 (часто помогает при кривой кодировке)
      const utf8 = Buffer.from(name, 'latin1').toString('utf8');

      // Если в результате есть символы не из ASCII или есть кириллица — считаем, что декодирование успешно
      if (/[^\u0000-\u00ff]/.test(utf8) || /[А-Яа-яЁё]/.test(utf8)) {
        return utf8;
      }
    } catch (err) {
      console.warn('Ошибка при декодировании имени файла:', name);
    }

    return name; // Возвращаем как есть, если декодирование не помогло
  }

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      let uploadPath = 'uploads/';
      if (file.fieldname === 'document') uploadPath += 'documents/';
      else if (file.fieldname === 'video') uploadPath += 'videos/';
      else if (file.fieldname === 'thumbnail') uploadPath += 'thumbnails/';

      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
      // Декодируем имя файла
      const decoded = decodeOriginalName(file.originalname);

      // Парсим имя и расширение
      const parsed = path.parse(decoded);
      let base = sanitize(parsed.name).trim(); // Санитизация имени
      if (!base) base = 'file'; // страховка

      const ext = parsed.ext;
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const finalName = `${base}-${uniqueSuffix}${ext}`;

      console.log('Original:', file.originalname, '-> Decoded & Saved as:', finalName);
      cb(null, finalName);
    }
  });

// Фильтр для проверки типов файлов
const fileFilter = (req, file, cb) => {
    console.log('Обрабатываем файл в поле:', file.fieldname); // Логирование для отладки

    if (file.fieldname === 'document' || file.fieldname === 'docFile' || file.fieldname === 'image' || file.fieldname === 'attachments') {
        // Разрешаем документы
        const allowedDocTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/png',
            'image/jpeg'
        ];

        if (allowedDocTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый тип документа'), false);
        }
    }
    else if (file.fieldname === 'video' || file.fieldname === 'videoFile') {
        // Разрешаем видео
        const allowedVideoTypes = ['video/mp4', 'video/webm'];
        if (allowedVideoTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый тип видео'), false);
        }
    }
    else if (file.fieldname === 'thumbnail' || file.fieldname === 'thumbnailFile') {
        // Разрешаем изображения
        const allowedImageTypes = ['image/jpeg', 'image/png'];
        if (allowedImageTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый тип изображения'), false);
        }
    }
    else {
        console.error('Неизвестное поле для файла:', file.fieldname);
        cb(new Error('Неизвестное поле для файла!'), false);
    }
};

// Инициализация multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1 * 1024 * 1024 * 1024 // 100 MB (максимальный размер файла)
    }
});

// Middleware для проверки прав администратора
const verifyAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: 'Доступ запрещен. Требуется авторизация администратора.' });
    }

    const adminSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

    if (!adminSecret) {
        console.error('ADMIN_JWT_SECRET not set in .env file');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
    }

    jwt.verify(token, adminSecret, (err, decoded) => {
        if (err) {
            console.warn('Admin JWT Verification failed:', err.message);
            return res.status(403).json({ message: 'Доступ запрещен. Недействительный токен администратора.' });
        }

        // Проверяем, что в токене есть роль admin
        if (decoded.role !== 'admin') {
            return res.status(403).json({ message: 'Доступ запрещен. Недостаточно прав.' });
        }

        req.admin = decoded; // Сохраняем данные из токена
        next(); // Переходим к следующему обработчику
    });
};

// Эндпоинт для входа администратора
app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;

    // Проверяем пароль (хранится в .env)
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        console.error('ADMIN_PASSWORD not set in .env file');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
    }

    if (password !== adminPassword) {
        // Для безопасности используем одинаковое сообщение об ошибке
        return res.status(401).json({ message: 'Неверный пароль' });
    }

    // Генерируем JWT токен для администратора
    const adminJwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

    if (!adminJwtSecret) {
        console.error('ADMIN_JWT_SECRET not set in .env file');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера' });
    }

    const token = jwt.sign(
        { role: 'admin' }, // Payload с ролью администратора
        adminJwtSecret,
        { expiresIn: '4h' } // Токен действителен 4 часа
    );

    // Отправляем токен клиенту
    res.status(200).json({
        message: 'Вход выполнен успешно',
        token: token
    });
});

// 1. Получение списка всех документов
app.get('/api/admin/documents', verifyAdminToken, async (req, res) => {
    console.log(req.file);
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM documents ORDER BY created_at DESC'
        );

        res.status(200).json({ documents: result.rows });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ message: 'Не удалось загрузить список документов' });
    } finally {
        if (client) client.release();
    }
});

// 2. Получение одного документа по ID
app.get('/api/admin/documents/:id', verifyAdminToken, async (req, res) => {
    const documentId = req.params.id;

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Документ не найден' });
        }

        res.status(200).json({ document: result.rows[0] });
    } catch (error) {
        console.error('Error fetching document:', error);
        res.status(500).json({ message: 'Не удалось загрузить документ' });
    } finally {
        if (client) client.release();
    }
});

// 3. Создание нового документа
app.post('/api/admin/documents', verifyAdminToken, upload.single('document'), async (req, res) => {


 console.log('\n' + '='.repeat(60));
    console.log('📁 [DOCUMENTS UPLOAD] POST /api/admin/documents');
    console.log('📦 Request body fields:', Object.keys(req.body));
    console.log('📝 Title from form:', req.body.title);
    
    if (req.file) {
        console.log('✅ File received:', {
            name: req.file.originalname,
            size: `${(req.file.size / 1024 / 1024).toFixed(2)} MB`,
            type: req.file.mimetype,
            path: req.file.path
        });
    } else {
        console.log('❌ NO FILE RECEIVED!');
        console.log('Request keys:', Object.keys(req));
    }


    const { title } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({
            message: 'Необходимо указать корректное название документа',
            details: {
                required: 'Название должно быть непустой строкой',
                received: title
            }
        });
    }

    if (!req.file) {
        return res.status(400).json({
            message: 'Необходимо загрузить файл документа',
            acceptedTypes: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpeg']
        });
    }

    // 2. Подготовка данных файла
    const { path: filePath, size: fileSize, originalname } = req.file;
    const fileType = path.extname(originalname).substring(1).toLowerCase();
    const sanitizedTitle = title.trim();

    // 3. Дополнительная валидация типа файла
    const allowedTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpeg'];
    if (!allowedTypes.includes(fileType)) {
        // Удаляем временный файл
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return res.status(400).json({
            message: 'Неподдерживаемый тип файла',
            details: {
                allowedTypes: allowedTypes,
                receivedType: fileType
            }
        });
    }

    const maxSize = 100 * 1024 * 1024; 
    /*if (fileSize > maxSize) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return res.status(400).json({
            message: 'Файл слишком большой',
            details: {
                maxAllowed: `${maxSize / (1024 * 1024)}MB`,
                receivedSize: `${(fileSize / (1024 * 1024)).toFixed(2)}MB`
            }
        });
    }*/

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN'); // Начинаем транзакцию

        // 5. Сохранение в базу данных
        const result = await client.query(
            `INSERT INTO documents (title, file_path, file_size, file_type, created_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             RETURNING id, title, file_path, file_type, created_at`,
            [sanitizedTitle, filePath, fileSize, fileType]
        );

        // 6. Проверка успешности вставки
        if (result.rows.length === 0) {
            throw new Error('Не удалось сохранить документ в базу данных');
        }

        await client.query('COMMIT'); // Подтверждаем транзакцию

        // 7. Формирование ответа
        const document = result.rows[0];
        res.status(201).json({
            success: true,
            message: 'Документ успешно загружен',
            document: {
                ...document,
                // Можно добавить URL для скачивания, если файлы доступны через GET
                download_url: `/api/documents/${document.id}/download`
            }
        });

    } catch (error) {
        // Откатываем транзакцию в случае ошибки
        if (client) {
            await client.query('ROLLBACK');
        }

        console.error('Error creating document:', error);

        // Удаляем загруженный файл в случае ошибки
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (unlinkError) {
                console.error('Failed to delete uploaded file:', unlinkError);
            }
        }

        // Разные сообщения об ошибках для разных типов ошибок
        if (error.code === '23505') { // Ошибка уникальности
            res.status(409).json({
                message: 'Документ с таким названием уже существует',
                details: {
                    suggestion: 'Измените название документа'
                }
            });
        } else {
            res.status(500).json({
                message: 'Не удалось загрузить документ',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    } finally {
        if (client) {
            client.release();
        }
    }
});

app.get('/api/documents', verifyToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        // Возвращаем только нужную информацию, без file_path
        const result = await client.query(
            'SELECT id, title, file_size, file_type, created_at FROM documents ORDER BY created_at DESC'
        );
        res.status(200).json({ documents: result.rows });
    } catch (error) {
        console.error('Error fetching documents for user:', error);
        res.status(500).json({ message: 'Не удалось загрузить список документов' });
    } finally {
        if (client) client.release();
    }
});

// Получение списка всех опубликованных видео для пользователей
// Для списка видео
app.get('/api/videos', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, title, description, file_path, created_at FROM videos ORDER BY created_at DESC'
        );
        res.status(200).json({ videos: result.rows });
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ message: 'Не удалось загрузить список видео' });
    }
});

// Защищенный эндпоинт для скачивания документа
app.get('/api/download/document/:id', verifyToken, async (req, res) => {
    const documentId = req.params.id;
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT file_path, title, file_type FROM documents WHERE id = $1', [documentId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Документ не найден' });
        }

        const doc = result.rows[0];
        const filePath = path.join(__dirname, doc.file_path); // Формируем абсолютный путь

        if (fs.existsSync(filePath)) {
            // res.download() автоматически установит нужные заголовки для скачивания
            // Второй аргумент - имя файла, которое увидит пользователь при скачивании
            const userFriendlyFilename = `${doc.title}.${doc.file_type}`;
            res.download(filePath, userFriendlyFilename, (err) => {
                if (err) {
                    console.error('Error during file download:', err);
                    // Важно: если заголовки уже отправлены, может возникнуть ошибка
                    if (!res.headersSent) {
                         res.status(500).send('Не удалось скачать файл.');
                    }
                }
            });
        } else {
            console.error(`File not found on server: ${filePath}`);
            res.status(404).json({ message: 'Файл не найден на сервере' });
        }
    } catch (error) {
        console.error('Error processing document download:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Ошибка сервера при скачивании файла' });
        }
    } finally {
        if (client) client.release();
    }
});

// 4. Обновление документа
app.put('/api/admin/documents/:id', verifyAdminToken, upload.single('document'), async (req, res) => {
    const documentId = req.params.id;
    const { title } = req.body;

    if (!title) {
        return res.status(400).json({ message: 'Необходимо указать название документа' });
    }

    let client;
    try {
        client = await pool.connect();

        // Начинаем транзакцию
        await client.query('BEGIN');

        // Получаем текущую информацию о документе
        const documentResult = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (documentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Документ не найден' });
        }

        const oldDocument = documentResult.rows[0];
        let filePath = oldDocument.file_path;
        let fileSize = oldDocument.file_size;
        let fileType = oldDocument.file_type;

        // Если загружен новый файл, обновляем информацию
        if (req.file) {
            // Удаляем старый файл
            if (fs.existsSync(oldDocument.file_path)) {
                fs.unlinkSync(oldDocument.file_path);
            }

            // Обновляем информацию о файле
            filePath = req.file.path;
            fileSize = req.file.size;
            fileType = path.extname(req.file.originalname).substring(1);
        }

        // Обновляем запись в базе данных
        const updateResult = await client.query(
            `UPDATE documents
             SET title = $1, file_path = $2, file_size = $3, file_type = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING *`,
            [title, filePath, fileSize, fileType, documentId]
        );

        // Завершаем транзакцию
        await client.query('COMMIT');

        res.status(200).json({
            message: 'Документ успешно обновлен',
            document: updateResult.rows[0]
        });
    } catch (error) {
        // В случае ошибки откатываем транзакцию
        if (client) await client.query('ROLLBACK');
        console.error('Error updating document:', error);

        // Удаляем новый загруженный файл в случае ошибки
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({ message: 'Не удалось обновить документ' });
    } finally {
        if (client) client.release();
    }
});

// 5. Удаление документа
app.delete('/api/admin/documents/:id', verifyAdminToken, async (req, res) => {
    const documentId = req.params.id;

    let client;
    try {
        client = await pool.connect();

        // Начинаем транзакцию
        await client.query('BEGIN');

        // Получаем информацию о документе
        const documentResult = await client.query(
            'SELECT * FROM documents WHERE id = $1',
            [documentId]
        );

        if (documentResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Документ не найден' });
        }

        const document = documentResult.rows[0];

        // Удаляем запись из базы данных
        await client.query(
            'DELETE FROM documents WHERE id = $1',
            [documentId]
        );

        // Завершаем транзакцию
        await client.query('COMMIT');

        // Удаляем файл с диска
        if (fs.existsSync(document.file_path)) {
            fs.unlinkSync(document.file_path);
        }

        res.status(200).json({
            message: 'Документ успешно удален',
            id: documentId
        });
    } catch (error) {
        // В случае ошибки откатываем транзакцию
        if (client) await client.query('ROLLBACK');
        console.error('Error deleting document:', error);
        res.status(500).json({ message: 'Не удалось удалить документ' });
    } finally {
        if (client) client.release();
    }
});

//EMAIL_BLOCK
// Эндпоинт для отправки email
// Эндпоинт для создания новой заявки (письма в техподдержку)
app.post('/api/tickets', verifyToken, upload.array('attachments', 5), async (req, res) => {
    const userId = req.user.userId;
    const userEmailFromToken = req.user.email;

    // 'subject' и 'message' извлекаются из req.body, которое приходит от FormData
    const { subject, message } = req.body;

    if (!subject || !message) {
        return res.status(400).json({ message: 'Необходимо указать тему и текст заявки' });
    }

    let client;
    try {
        client = await pool.connect(); // pool должен быть определен глобально
        await client.query('BEGIN');

        const statusResult = await client.query('SELECT id FROM ticket_statuses WHERE name = $1', ['open']);
        if (statusResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.error('Ticket status "open" not found in database.');
            return res.status(500).json({ message: 'Ошибка конфигурации сервера: статус заявки не найден.' });
        }
        const statusId = statusResult.rows[0].id;

        // Генерируем номер заявки
        const ticketNumberResult = await client.query('SELECT generate_ticket_number() as generated_ticket_number');
        const newTicketNumber = ticketNumberResult.rows[0].generated_ticket_number;

        // Генерируем thread_id для email
        const threadId = `ticket-${newTicketNumber}-${Date.now()}`;

        // Получаем полное имя пользователя из БД
        const userDetailsResult = await client.query('SELECT fio FROM users WHERE id = $1', [userId]);
        const senderName = userDetailsResult.rows.length > 0 ? userDetailsResult.rows[0].fio : userEmailFromToken;

        // 1. Создаем запись о заявке в таблице 'tickets'
        const ticketInsertResult = await client.query(
            `INSERT INTO tickets (ticket_number, user_id, subject, status_id, email_thread_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, created_at`, // ticket_number уже есть в newTicketNumber
            [newTicketNumber, userId, subject, statusId, threadId]
        );
        // Собираем данные о новой заявке
        const newTicketData = {
            id: ticketInsertResult.rows[0].id,
            created_at: ticketInsertResult.rows[0].created_at,
            ticket_number: newTicketNumber // Используем сгенерированный номер
        };

        // 2. Сохраняем исходное сообщение
        const messageInsertResult = await client.query(
            `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, sender_email, message)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [newTicketData.id, 'user', userId, userEmailFromToken, message]
        );
        const firstMessageId = messageInsertResult.rows[0].id;

        // 3. Обрабатываем вложения
        const emailAttachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await client.query(
                    `INSERT INTO ticket_attachments (message_id, file_name, file_path, file_size, mime_type)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [firstMessageId, file.originalname, file.path, file.size, file.mimetype]
                );
                emailAttachments.push({ filename: file.originalname, path: file.path });
            }
        }

        // --- Определение переменных для тела письма ---
        const emailSubjectForSupport = `Новая заявка #${newTicketData.ticket_number}: ${subject}`;

        const emailTextForSupport = // `textBody` для функции sendEmail
            `Пользователь: ${senderName} (${userEmailFromToken})
            Тема: ${subject}
            Сообщение:
            ${message}
            ---
            Идентификатор заявки: ${newTicketData.ticket_number}
            Идентификатор треда (для ответов): ${threadId}`
        ;

        const emailHtmlForSupport = // `htmlBody` для функции sendEmail
            `<p><strong>Пользователь:</strong> ${senderName} (${userEmailFromToken})</p>
            <p><strong>Тема:</strong> ${subject}</p>
            <p><strong>Сообщение:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
            <hr>
            <p>Идентификатор заявки: <code>${newTicketData.ticket_number}</code></p>
            <p>Идентификатор треда (для ответов): <code>${threadId}</code></p>`;
        // --- Конец определения переменных для тела письма ---

        // Коммитим транзакцию ДО отправки email, чтобы данные точно были в БД
        await client.query('COMMIT');

        // 4. Отправляем email в техподдержку
        try {
            await sendEmail(
                supportEmail,             // `to`
                emailSubjectForSupport,   // `subject`
                emailTextForSupport,      // `textBody`
                emailHtmlForSupport,      // `htmlBody`
                {                         // `options`
                    replyTo: userEmailFromToken,
                    ticketNumber: newTicketData.ticket_number,
                    threadId: threadId,
                    attachments: emailAttachments,
                    userIdForLog: userId,
                    fromName: `${senderName} (через сайт)`
                    // saveToDb: true, // По умолчанию true, если pool определен и вы хотите логировать это
                }
            );
            console.log(`Email for new ticket #${newTicketData.ticket_number} sent to support.`);
        } catch (emailError) {
            // Логируем ошибку отправки email, но не откатываем транзакцию, так как заявка уже создана
            console.error(`Failed to send email notification for new ticket #${newTicketData.ticket_number}:`, emailError);
            // Здесь можно добавить логику для пометки заявки как "email не отправлен"
        }

        res.status(201).json({
            message: 'Заявка успешно создана.',
            ticket: {
                id: newTicketData.id,
                ticket_number: newTicketData.ticket_number,
                subject: subject,
                status: 'open',
                created_at: newTicketData.created_at,
                thread_id: threadId
            }
        });

    } catch (error) {
        // Если ошибка произошла ДО client.query('COMMIT'), откатываем транзакцию
        if (client && client.active) { // Проверяем, активна ли транзакция
             try { await client.query('ROLLBACK'); } catch (rbError) { console.error('Error rolling back transaction', rbError); }
        }
        console.error('Error creating ticket:', error);
        if (error.code === '23505' && error.constraint && error.constraint.includes('ticket_number')) {
            return res.status(409).json({ message: 'Ошибка: Конфликт номера заявки. Пожалуйста, попробуйте еще раз.' });
        }
        res.status(500).json({ message: 'Ошибка при создании заявки.' });
    } finally {
        if (client) client.release();
    }
});


//РАБОЧИЙ ЭНДПОИНТ
//1. Получение списка заявок пользователя
/*app.get('/api/tickets', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const statusFilter = req.query.status; // 'open', 'closed', 'all'

    let query = `
        SELECT t.id, t.ticket_number, t.subject, ts.name as status,
               t.created_at, t.updated_at, t.closed_at,
               (SELECT tm.message FROM ticket_messages tm
                WHERE tm.ticket_id = t.id
                ORDER BY tm.created_at ASC LIMIT 1) as first_message
        FROM tickets t
        JOIN ticket_statuses ts ON t.status_id = ts.id
        WHERE t.user_id = $1
    `;

    const queryParams = [userId];

    if (statusFilter === 'open') {
        query += ` AND ts.name != 'closed'`;
    } else if (statusFilter === 'closed') {
        query += ` AND ts.name = 'closed'`;
    }

    query += ` ORDER BY t.updated_at DESC`;

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(query, queryParams);
        res.status(200).json({ tickets: result.rows });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ message: 'Не удалось загрузить список заявок' });
    } finally {
        if (client) client.release();
    }
});*/

// GET /api/tickets - получить заявки пользователя
// GET /api/tickets?scope=company - получить заявки всей компании
app.get('/api/tickets', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const statusFilter = req.query.status; // 'open', 'closed', 'all'
    const scope = req.query.scope || 'user'; // 'user' или 'company'
    
    let client;
    try {
        client = await pool.connect();
        
        // Получаем информацию о текущем пользователе (нужно для company scope)
        const userResult = await client.query(
            'SELECT company FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        
        const userCompany = userResult.rows[0].company;
        
        let query;
        let queryParams = [];
        let paramIndex = 1;
        
        if (scope === 'company' && userCompany) {
            // Получаем заявки всех сотрудников компании
            query = `
                SELECT 
                    t.id, 
                    t.ticket_number, 
                    t.subject, 
                    ts.name as status,
                    t.created_at, 
                    t.updated_at, 
                    t.closed_at,
                    t.user_id,
                    u.fio as user_fio,
                    u.email as user_email,
                    (SELECT tm.message FROM ticket_messages tm
                     WHERE tm.ticket_id = t.id
                     ORDER BY tm.created_at ASC LIMIT 1) as first_message
                FROM tickets t
                JOIN ticket_statuses ts ON t.status_id = ts.id
                JOIN users u ON t.user_id = u.id
                WHERE u.company = $1 AND u.account_status = 'active'
            `;
            queryParams = [userCompany];
            paramIndex = 2;
            
            // Добавляем фильтр по статусу
            if (statusFilter === 'open') {
                query += ` AND ts.name != 'closed'`;
            } else if (statusFilter === 'closed') {
                query += ` AND ts.name = 'closed'`;
            }
            
            query += ` ORDER BY t.updated_at DESC`;
            
        } else {
            // Только свои заявки
            query = `
                SELECT t.id, t.ticket_number, t.subject, ts.name as status,
                       t.created_at, t.updated_at, t.closed_at,
                       (SELECT tm.message FROM ticket_messages tm
                        WHERE tm.ticket_id = t.id
                        ORDER BY tm.created_at ASC LIMIT 1) as first_message
                FROM tickets t
                JOIN ticket_statuses ts ON t.status_id = ts.id
                WHERE t.user_id = $1
            `;
            queryParams = [userId];
            paramIndex = 2;
            
            if (statusFilter === 'open') {
                query += ` AND ts.name != 'closed'`;
            } else if (statusFilter === 'closed') {
                query += ` AND ts.name = 'closed'`;
            }
            
            query += ` ORDER BY t.updated_at DESC`;
        }
        
        const result = await client.query(query, queryParams);
        
        res.status(200).json({ 
            tickets: result.rows,
            scope: scope,
            company: scope === 'company' ? userCompany : null
        });
        
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ message: 'Не удалось загрузить список заявок' });
    } finally {
        if (client) client.release();
    }
});

// GET /api/company/colleagues - получить список коллег по компании
app.get('/api/company/colleagues', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    
    let client;
    try {
        client = await pool.connect();
        
        // Получаем компанию пользователя
        const userResult = await client.query(
            'SELECT company FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        
        const userCompany = userResult.rows[0].company;
        
        if (!userCompany) {
            return res.status(200).json({ 
                colleagues: [],
                company: null,
                message: 'У вас не указана компания'
            });
        }
        
        // Получаем всех активных сотрудников этой компании
        const colleaguesResult = await client.query(
            `SELECT id, fio, email, position 
             FROM users 
             WHERE company = $1 
               AND id != $2 
               AND account_status = 'active'
             ORDER BY fio ASC`,
            [userCompany, userId]
        );
        
        res.status(200).json({
            colleagues: colleaguesResult.rows,
            company: userCompany
        });
        
    } catch (error) {
        console.error('Error fetching colleagues:', error);
        res.status(500).json({ message: 'Не удалось загрузить список коллег' });
    } finally {
        if (client) client.release();
    }
});

// GET /api/tickets/unread/count - количество непрочитанных ответов
app.get('/api/tickets/unread/count', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    
    let client;
    try {
        client = await pool.connect();
        
        // Получаем компанию пользователя
        const userResult = await client.query(
            'SELECT company FROM users WHERE id = $1',
            [userId]
        );
        
        const userCompany = userResult.rows[0]?.company;
        
        let query;
        let queryParams;
        
        if (userCompany) {
            // Непрочитанные сообщения во всех заявках компании
            query = `
                SELECT COUNT(tm.id) as unread_count
                FROM ticket_messages tm
                JOIN tickets t ON tm.ticket_id = t.id
                JOIN users u ON t.user_id = u.id
                WHERE u.company = $1 
                  AND tm.sender_type = 'support'
                  AND tm.is_read = false
                  AND t.status_id != (SELECT id FROM ticket_statuses WHERE name = 'closed')
            `;
            queryParams = [userCompany];
        } else {
            // Только свои непрочитанные
            query = `
                SELECT COUNT(tm.id) as unread_count
                FROM ticket_messages tm
                JOIN tickets t ON tm.ticket_id = t.id
                WHERE t.user_id = $1 
                  AND tm.sender_type = 'support'
                  AND tm.is_read = false
            `;
            queryParams = [userId];
        }
        
        const result = await client.query(query, queryParams);
        
        res.status(200).json({
            unread_count: parseInt(result.rows[0].unread_count, 10)
        });
        
    } catch (error) {
        console.error('Error counting unread messages:', error);
        res.status(500).json({ message: 'Не удалось подсчитать непрочитанные сообщения' });
    } finally {
        if (client) client.release();
    }
});

// 2. Создание новой заявки
app.post('/api/tickets', verifyToken, upload.array('attachments', 5), async (req, res) => {
    const userId = req.user.userId;
    const { subject, message } = req.body;

    if (!subject || !message) {
        return res.status(400).json({ message: 'Необходимо указать тему и текст заявки' });
    }

    let client;
    try {
        client = await pool.connect();

        // Начинаем транзакцию
        await client.query('BEGIN');

        // Получаем ID статуса "open"
        const statusResult = await client.query(
            'SELECT id FROM ticket_statuses WHERE name = $1',
            ['open']
        );
        const statusId = statusResult.rows[0].id;

        // Генерируем номер заявки
        const ticketNumberResult = await client.query('SELECT generate_ticket_number() as number');
        const ticketNumber = ticketNumberResult.rows[0].number;

        // Генерируем thread_id для email
        const threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        // Получаем информацию о пользователе
        const userResult = await client.query(
            'SELECT email, fio as fio FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];

        // Создаем заявку
        const ticketResult = await client.query(
            `INSERT INTO tickets (ticket_number, user_id, subject, status_id, email_thread_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, ticket_number, created_at`,
            [ticketNumber, userId, subject, statusId, threadId]
        );
        const newTicket = ticketResult.rows[0];

        // Сохраняем исходящее письмо в базу данных
        const emailResult = await client.query(
            `INSERT INTO emails (thread_id, subject, body, from_email, is_outgoing, created_at, user_id)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
             RETURNING id`,
            [threadId, `${subject} [${threadId}]`, message, user.email, false, userId]
        );
        const emailId = emailResult.rows[0].id;

        // Добавляем первое сообщение от пользователя
        const messageResult = await client.query(
            `INSERT INTO ticket_messages (ticket_id, message_number, sender_type, sender_id, sender_email, message, email_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [newTicket.id, 1, 'user', userId, user.email, message, emailId]
        );
        const messageId = messageResult.rows[0].id;

        // Обрабатываем вложения, если они есть
        const attachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
		console.log(`fileOriginalName: ${file.originalname}`);
                // Сохраняем информацию о вложении в базу данных
                await client.query(
                    `INSERT INTO ticket_attachments (message_id, file_name, file_path, file_size, mime_type)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [messageId, file.originalname, file.path, file.size, file.mimetype]
                );

                // Добавляем вложение для отправки по email
                attachments.push({
                    filename: file.originalname,
                    path: file.path
                });
            }
        }

        // Завершаем транзакцию
        await client.query('COMMIT');

        // Отправляем уведомление на email техподдержки
        try {
            const emailInfo = await sendEmail(
                supportEmail,
                `Новая заявка #${ticketNumber}: ${subject}`,
                `Пользователь ${user.fio} (${user.email}) создал новую заявку:\n\n${message}\n\nДля ответа на эту заявку, пожалуйста, сохраните тему письма и ID цепочки: ${threadId}`,
                `<p>Пользователь <strong>${user.fio}</strong> (${user.email}) создал новую заявку:</p>
                 <p><strong>Номер заявки:</strong> ${ticketNumber}</p>
                 <p><strong>Тема:</strong> ${subject}</p>
                 <p><strong>Сообщение:</strong></p>
                 <p>${message.replace(/\n/g, '<br>')}</p>
                 <p>Для ответа на эту заявку, пожалуйста, сохраните тему письма и ID цепочки: ${threadId}</p>`,
                {
                    threadId: threadId,
                    userId: userId,
                    saveToDb: true,
                    attachments: attachments
                }
            );
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Продолжаем выполнение, даже если email не отправился
        }

        res.status(201).json({
            message: 'Заявка успешно создана',
            ticket: {
                id: newTicket.id,
                ticket_number: newTicket.ticket_number,
                subject,
                status: 'open',
                created_at: newTicket.created_at,
                thread_id: threadId
            }
        });

    } catch (error) {
        // В случае ошибки откатываем транзакцию
        if (client) await client.query('ROLLBACK');
        console.error('Error creating ticket:', error);
        res.status(500).json({ message: 'Не удалось создать заявку' });
    } finally {
        if (client) client.release();
    }
});

// 3. Добавление сообщения в заявку
app.post('/api/tickets/:ticketNumber/messages', verifyToken, upload.array('attachments', 5), async (req, res) => {
    const userId = req.user.userId;
    const { ticketNumber } = req.params;
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ message: 'Текст сообщения не может быть пустым' });
    }

    let client;
    try {
        client = await pool.connect();

        // Начинаем транзакцию
        await client.query('BEGIN');

        // Получаем информацию о заявке
        const ticketResult = await client.query(
            `SELECT t.id, t.subject, ts.name as status, t.user_id, t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Проверяем, принадлежит ли заявка текущему пользователю
        if (ticket.user_id !== userId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'У вас нет доступа к этой заявке' });
        }

        // Проверяем, не закрыта ли заявка
        if (ticket.status === 'closed') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Невозможно добавить сообщение в закрытую заявку' });
        }

        // Получаем информацию о пользователе
        const userResult = await client.query(
            'SELECT email, fio as fio FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];

        // Получаем последний номер сообщения в заявке
        const lastMessageResult = await client.query(
            `SELECT MAX(message_number) as last_number FROM ticket_messages WHERE ticket_id = $1`,
            [ticket.id]
        );

        const messageNumber = (lastMessageResult.rows[0].last_number || 0) + 1;

        // Сохраняем исходящее письмо в базу данных
        const emailResult = await client.query(
            `INSERT INTO emails (thread_id, subject, body, from_email, is_outgoing, created_at, user_id)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
             RETURNING id`,
            [ticket.email_thread_id, `Re: ${ticket.subject} [${ticket.email_thread_id}]`, message, user.email, false, userId]
        );
        const emailId = emailResult.rows[0].id;

        // Добавляем сообщение
        const messageResult = await client.query(
            `INSERT INTO ticket_messages (ticket_id, message_number, sender_type, sender_id, sender_email, message, email_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, created_at`,
            [ticket.id, messageNumber, 'user', userId, user.email, message, emailId]
        );
        const messageId = messageResult.rows[0].id;

        // Обрабатываем вложения, если они есть
        const attachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                // Сохраняем информацию о вложении в базу данных
                await client.query(
                    `INSERT INTO ticket_attachments (message_id, file_name, file_path, file_size, mime_type)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [messageId, file.originalname, file.path, file.size, file.mimetype]
                );

                // Добавляем вложение для отправки по email
                attachments.push({
                    filename: file.originalname,
                    path: file.path
                });
            }
        }

        // Обновляем статус заявки на "ожидает ответа от техподдержки", если она была в статусе "ожидает ответа от пользователя"
        if (ticket.status === 'waiting_for_user') {
            const openStatusResult = await client.query(
                'SELECT id FROM ticket_statuses WHERE name = $1',
                ['open']
            );
            const openStatusId = openStatusResult.rows[0].id;

            await client.query(
                `UPDATE tickets
                 SET status_id = $1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [openStatusId, ticket.id]
            );
        } else {
            // Просто обновляем время последнего обновления
            await client.query(
                `UPDATE tickets
                 SET updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [ticket.id]
            );
        }

        // Завершаем транзакцию
        await client.query('COMMIT');

        // Отправляем уведомление на email техподдержки
        try {
            await sendEmail(
                supportEmail,
                `Re: ${ticket.subject}`,
                `Пользователь ${user.fio} (${user.email}) добавил новое сообщение в заявку #${ticketNumber}:\n\n${message}`,
                `<p>Пользователь <strong>${user.fio}</strong> (${user.email}) добавил новое сообщение в заявку:</p>
                 <p><strong>Номер заявки:</strong> ${ticketNumber}</p>
                 <p><strong>Тема:</strong> ${ticket.subject}</p>
                 <p><strong>Сообщение:</strong></p>
                 <p>${message.replace(/\n/g, '<br>')}</p>`,
                {
                    threadId: ticket.email_thread_id,
                    userId: userId,
                    saveToDb: true,
                    attachments: attachments,
                    ticketNumber: ticketNumber
                }
            );
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Продолжаем выполнение, даже если email не отправился
        }

        res.status(201).json({
            message: 'Сообщение успешно добавлено',
            ticketMessage: {
                sender_type: 'user',
                sender_name: user.fio,
                sender_email: user.email,
                message: message,
                created_at: messageResult.rows[0].created_at,
                is_read: false
            }
        });

    } catch (error) {
        // В случае ошибки откатываем транзакцию
        if (client) await client.query('ROLLBACK');
        console.error('Error adding message to ticket:', error);
        res.status(500).json({ message: 'Не удалось добавить сообщение в заявку' });
    } finally {
        if (client) client.release();
    }
});

// 4. Закрытие заявки
app.post('/api/tickets/:ticketNumber/close', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const { ticketNumber } = req.params;

    let client;
    try {
        client = await pool.connect();

        // Получаем информацию о заявке
        const ticketResult = await client.query(
            `SELECT t.id, t.subject, ts.name as status, t.user_id, t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Проверяем, принадлежит ли заявка текущему пользователю
        if (ticket.user_id !== userId) {
            return res.status(403).json({ message: 'У вас нет доступа к этой заявке' });
        }

        // Проверяем, не закрыта ли уже заявка
        if (ticket.status === 'closed') {
            return res.status(400).json({ message: 'Заявка уже закрыта' });
        }

        // Получаем ID статуса "closed"
        const closedStatusResult = await client.query(
            'SELECT id FROM ticket_statuses WHERE name = $1',
            ['closed']
        );
        const closedStatusId = closedStatusResult.rows[0].id;

        // Закрываем заявку
        await client.query(
            `UPDATE tickets
             SET status_id = $1, updated_at = CURRENT_TIMESTAMP, closed_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [closedStatusId, ticket.id]
        );

        // Получаем информацию о пользователе
        const userResult = await client.query(
            'SELECT email, fio as fio FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];

        // Отправляем уведомление на email техподдержки
        try {
            await sendEmail(
                supportEmail,
                `Заявка #${ticketNumber} закрыта пользователем: ${ticket.subject}`,
                `Пользователь ${user.fio} (${user.email}) закрыл заявку #${ticketNumber}.`,
                `<p>Пользователь <strong>${user.fio}</strong> (${user.email}) закрыл заявку:</p>
                 <p><strong>Номер заявки:</strong> ${ticketNumber}</p>
                 <p><strong>Тема:</strong> ${ticket.subject}</p>`,
                {
                    threadId: ticket.email_thread_id,
                    userId: userId,
                    saveToDb: true
                }
            );
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Продолжаем выполнение, даже если email не отправился
        }

        res.status(200).json({
            message: 'Заявка успешно закрыта',
            ticket_number: ticketNumber,
            status: 'closed',
            closed_at: new Date()
        });

    } catch (error) {
        console.error('Error closing ticket:', error);
        res.status(500).json({ message: 'Не удалось закрыть заявку' });
    } finally {
        if (client) client.release();
    }
});

// 5. Повторное открытие заявки
app.post('/api/tickets/:ticketNumber/reopen', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const { ticketNumber } = req.params;

    let client;
    try {
        client = await pool.connect();

        // Получаем информацию о заявке
        const ticketResult = await client.query(
            `SELECT t.id, t.subject, ts.name as status, t.user_id, t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Проверяем, принадлежит ли заявка текущему пользователю
        if (ticket.user_id !== userId) {
            return res.status(403).json({ message: 'У вас нет доступа к этой заявке' });
        }

        // Проверяем, закрыта ли заявка
        if (ticket.status !== 'closed') {
            return res.status(400).json({ message: 'Заявка уже открыта' });
        }

        // Получаем ID статуса "open"
        const openStatusResult = await client.query(
            'SELECT id FROM ticket_statuses WHERE name = $1',
            ['open']
        );
        const openStatusId = openStatusResult.rows[0].id;

        // Открываем заявку заново
        await client.query(
            `UPDATE tickets
             SET status_id = $1, updated_at = CURRENT_TIMESTAMP, closed_at = NULL
             WHERE id = $2`,
            [openStatusId, ticket.id]
        );

        // Получаем информацию о пользователе
        const userResult = await client.query(
            'SELECT email, fio as fio FROM users WHERE id = $1',
            [userId]
        );
        const user = userResult.rows[0];

        // Отправляем уведомление на email техподдержки
        try {
            await sendEmail(
                supportEmail,
                `Заявка #${ticketNumber} открыта повторно: ${ticket.subject}`,
                `Пользователь ${user.fio} (${user.email}) повторно открыл заявку #${ticketNumber}.`,
                `<p>Пользователь <strong>${user.fio}</strong> (${user.email}) повторно открыл заявку:</p>
                 <p><strong>Номер заявки:</strong> ${ticketNumber}</p>
                 <p><strong>Тема:</strong> ${ticket.subject}</p>`,
                {
                    threadId: ticket.email_thread_id,
                    userId: userId,
                    saveToDb: true
                }
            );
        } catch (emailError) {
            console.error('Failed to send email notification:', emailError);
            // Продолжаем выполнение, даже если email не отправился
        }

        res.status(200).json({
            message: 'Заявка успешно открыта повторно',
            ticket_number: ticketNumber,
            status: 'open',
            updated_at: new Date()
        });

    } catch (error) {
        console.error('Error reopening ticket:', error);
        res.status(500).json({ message: 'Не удалось повторно открыть заявку' });
    } finally {
        if (client) client.release();
    }
});

async function decodeMimeEncodedString(mimeString) {
    if (!mimeString || typeof mimeString !== 'string' || !mimeString.startsWith('=?') || !mimeString.endsWith('?=')) {
        return mimeString; // Возвращаем как есть, если не похоже на MIME
    }
    try {
        const emailSource = `Subject: ${mimeString}\n\n`;
        const parsedEmail = await simpleParser(emailSource);
        return parsedEmail.subject || mimeString;
    } catch (error) {
        console.error("Error decoding MIME string with mailparser:", error);
        return mimeString; // В случае ошибки возвращаем исходную строку, чтобы не прерывать поток
    }
}

function extractTicketInfo(decodedSubject) {
    // decodedSubject - это уже РАСКОДИРОВАННАЯ строка темы
    if (!decodedSubject || typeof decodedSubject !== 'string') {
        return { ticketNumber: null, message: "Decoded subject is invalid or empty." };
    }

    let ticketNumber = null;
    let message = "Ticket number not found with known patterns in decoded subject.";

    let match = decodedSubject.match(/#([0-9]+):/i);
    if (match && match[1]) {
        ticketNumber = match[1];
        message = `Ticket number '${ticketNumber}' found using pattern '#...:'.`;
        return { ticketNumber, message };
    }


    match = decodedSubject.match(/\[Ticket#([a-zA-Z0-9\-]+)\]/i);
    if (match && match[1]) {
        ticketNumber = match[1];
        message = `Ticket number '${ticketNumber}' found using pattern '[Ticket#...]'.`;
        return { ticketNumber, message };
    }

    match = decodedSubject.match(/Ticket#([a-zA-Z0-9\-]+)/i);
    if (match && match[1]) {
        ticketNumber = match[1];
        message = `Ticket number '${ticketNumber}' found using pattern 'Ticket#...'.`;
        return { ticketNumber, message };
    }

    match = decodedSubject.match(/_#([0-9]+):/i);
    if (match && match[1]) {
        ticketNumber = match[1];
        message = `Ticket number '${ticketNumber}' found using pattern '_#...:'.`;
        return { ticketNumber, message };
    }

    return { ticketNumber, message }; // ticketNumber будет null, если ни один паттерн не сработал
}



// 6. Эндпоинт для обработки входящих писем от почтового сервера
app.post('/api/receive-email', async (req, res) => {
    // 1. Защита Webhook'а
    const apiKey = req.headers['x-api-key'];
    if (!process.env.EMAIL_WEBHOOK_API_KEY || apiKey !== process.env.EMAIL_WEBHOOK_API_KEY) {
        console.warn('Unauthorized webhook access attempt to /api/receive-email.');
        return res.status(401).json({ message: 'Unauthorized webhook access.' });
    }

    const { subject, body, from } = req.body;

    // Проверяем наличие обязательных полей
    if (!subject || !body || !from) { // Используем 'subject' и 'from'
        console.warn('Webhook /api/receive-email: Missing required fields:', req.body);
        // Сообщение об ошибке тоже должно соответствовать:
        return res.status(400).json({ message: 'Missing required fields: subject, body, from are required.' });
    }

    console.log(`Webhook /api/receive-email: Received raw subject: "${subject}"`); // Используем 'subject'

    // 2.1. Декодируем тему письма (передаем 'subject' как исходную MIME-строку)
    const decodedSubject = await decodeMimeEncodedString(subject);
    console.log(`Webhook /api/receive-email: Decoded subject: "${decodedSubject}"`);

    // 2.2. Извлекаем номер тикета из ДЕКОДИРОВАННОЙ темы
    const ticketInfo = extractTicketInfo(decodedSubject);
    const ticketNumber = ticketInfo.ticketNumber;

    console.log(`Webhook /api/receive-email: Ticket extraction - ${ticketInfo.message}`);

    if (!ticketNumber) {
        console.warn(`Webhook /api/receive-email: Could not extract ticket_number. Raw subject: "${subject}", Decoded: "${decodedSubject}". Email will be ignored.`);
        return res.status(200).json({ message: 'Ticket number not found in subject. Email ignored.' });
    }
    console.log(`Webhook /api/receive-email: Successfully extracted ticket_number '${ticketNumber}'.`);

    // Используем ДЕКОДИРОВАННУЮ тему для записи в БД и дальнейшей логики
    const subjectForDb = decodedSubject;

    let client;
    try {
        client = await pool.connect(); // pool должен быть определен выше
        await client.query('BEGIN');

        // 4. Находим заявку в БД по извлеченному ticket_number
        const ticketQueryResult = await client.query(
            `SELECT t.id, t.ticket_number, t.user_id, t.subject as ticket_subject, ts.name as status,
                    u.email as user_email, u.fio as user_name, t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             JOIN users u ON t.user_id = u.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketQueryResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.warn(`Webhook /api/receive-email: Ticket not found for ticket_number: ${ticketNumber}.`);
            return res.status(200).json({ message: `Ticket not found for ticket_number: ${ticketNumber}. Email ignored.` });
        }
        const ticket = ticketQueryResult.rows[0];

        // 5. Определяем, кто отправитель: пользователь или техподдержка
        let senderType = 'user';
        let senderIdForDb = ticket.user_id;

        const supportEmailEnv = process.env.SUPPORT_MAIN_EMAIL || 'default_support@example.com';
        const supportEmailsEnv = (process.env.SUPPORT_EMAILS || supportEmailEnv).split(',').map(email => email.trim().toLowerCase());

        // Используем 'from' для определения отправителя
        if (supportEmailsEnv.includes(from.toLowerCase())) {
            senderType = 'support';
            const supportStaffResult = await client.query('SELECT id FROM users WHERE email = $1 AND is_support = TRUE', [from]); // Используем 'from'
            senderIdForDb = supportStaffResult.rows.length > 0 ? supportStaffResult.rows[0].id : null;
        } else if (from.toLowerCase() !== ticket.user_email.toLowerCase()) { // Используем 'from'
            console.warn(`Webhook /api/receive-email: Email from '${from}' for ticket #${ticket.ticket_number}, but original user is '${ticket.user_email}'. Processing as user reply.`);
        }

        // 6. Сохраняем входящее письмо в таблицу emails
        const emailInsertResult = await client.query(
            `INSERT INTO emails (thread_id, subject, body, from_email, is_outgoing, created_at, user_id)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
             RETURNING id`,
            // Для поля from_email в БД используем переменную 'from'
            [ticket.email_thread_id, subjectForDb, body, from, false, (senderType === 'user' ? ticket.user_id : senderIdForDb)]
        );
        const emailId = emailInsertResult.rows[0].id;

        // 7. Добавляем сообщение в таблицу ticket_messages
        const messageInsertResult = await client.query(
            `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, sender_email, message, email_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, created_at, message_number`,
            // Для поля sender_email в БД используем переменную 'from'
            [ticket.id, senderType, senderIdForDb, from, body, emailId]
        );
        const newMessage = messageInsertResult.rows[0];

        // 8. Обновляем статус заявки (логика остается прежней)
        let newStatusName = ticket.status;
        if (senderType === 'support' && ['open', 'in_progress', 'reopened'].includes(ticket.status)) {
            newStatusName = 'waiting_for_user';
        } else if (senderType === 'user' && ['waiting_for_user', 'closed'].includes(ticket.status)) {
            newStatusName = (ticket.status === 'closed') ? 'reopened' : 'open';
            if (ticket.status === 'closed') {
                console.log(`Webhook /api/receive-email: Ticket #${ticket.ticket_number} re-opened due to user reply.`);
            }
        }

        if (newStatusName !== ticket.status) {
            const newStatusResult = await client.query('SELECT id FROM ticket_statuses WHERE name = $1', [newStatusName]);
            if (newStatusResult.rows.length > 0) {
                await client.query(
                    `UPDATE tickets SET status_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                    [newStatusResult.rows[0].id, ticket.id]
                );
                console.log(`Webhook /api/receive-email: Ticket #${ticket.ticket_number} status updated from '${ticket.status}' to '${newStatusName}'.`);
            } else {
                console.warn(`Webhook /api/receive-email: Status_id for '${newStatusName}' not found. Ticket status not changed.`);
                await client.query(`UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [ticket.id]);
            }
        } else {
             await client.query(`UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [ticket.id]);
        }

        await client.query('COMMIT');

        // 9. Отправляем email-уведомление (если нужно)
        if (typeof sendEmail === 'function') {
            if (senderType === 'support') {
                try {
                    await sendEmail(
                        ticket.user_email,
                        `Ответ по вашей заявке #${ticket.ticket_number}: ${ticket.ticket_subject}`,
                        `Здравствуйте, ${ticket.user_name || 'Пользователь'}!\n\nСотрудник техподдержки (${from}) ответил на вашу заявку:\n\n${body}\n\nС уважением,\nТехподдержка ИНТ`, // Используем 'from'
                        `<p>Здравствуйте, ${ticket.user_name || 'Пользователь'}!</p><p>Сотрудник техподдержки (${from}) ответил на вашу заявку #${ticket.ticket_number} (${ticket.ticket_subject}):</p><blockquote>${body.replace(/\n/g, '<br>')}</blockquote><p>С уважением,<br>Техподдержка ИНТ</p>`,
                        { replyTo: supportEmailEnv, threadId: ticket.email_thread_id, ticketNumber: ticket.ticket_number }
                    );
                } catch (emailError) { console.error(`Webhook: Failed to send notification to user for ticket #${ticket.ticket_number}:`, emailError); }
            } else if (senderType === 'user' && !supportEmailsEnv.includes(from.toLowerCase())) { // Используем 'from'
                 try {
                    await sendEmail(
                        supportEmailEnv,
                        `Новый ответ от пользователя по заявке #${ticket.ticket_number}: ${ticket.ticket_subject}`,
                        `Пользователь ${ticket.user_name} (${from}) ответил на заявку #${ticket.ticket_number}:\n\n${body}`, // Используем 'from'
                        `<p>Пользователь <strong>${ticket.user_name}</strong> (${from}) ответил на заявку #${ticket.ticket_number} (${ticket.ticket_subject}):</p><blockquote>${body.replace(/\n/g, '<br>')}</blockquote>`,
                        { replyTo: from, threadId: ticket.email_thread_id, ticketNumber: ticket.ticket_number } // Используем 'from'
                    );
                } catch (emailError) { console.error(`Webhook: Failed to send notification to support for ticket #${ticket.ticket_number}:`, emailError); }
            }
        } else {
            console.warn("Webhook /api/receive-email: sendEmail function is not defined. Notifications skipped.");
        }


        console.log(`Webhook /api/receive-email: Message from ${from} successfully processed for ticket #${ticket.ticket_number}`); // Используем 'from'
        res.status(200).json({
            message: 'Email successfully processed and added to ticket.',
            ticket_number: ticket.ticket_number,
            message_id: newMessage.id
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error processing incoming email via webhook /api/receive-email:', error);
        res.status(500).json({ message: 'Internal server error while processing email.' });
    } finally {
        if (client) client.release();
    }
});


//РАБОЧАЯ 7.
// 7. Получение детальной информации о заявке
/*app.get('/api/tickets/:ticketNumber', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const { ticketNumber } = req.params;

    let client;
    try {
        client = await pool.connect();

        // Получаем информацию о заявке
        const ticketResult = await client.query(
            `SELECT t.id, t.ticket_number, t.subject, ts.name as status,
                    t.created_at, t.updated_at, t.closed_at, t.user_id, t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Проверяем, принадлежит ли заявка текущему пользователю
        if (ticket.user_id !== userId) {
            return res.status(403).json({ message: 'У вас нет доступа к этой заявке' });
        }

        // Получаем все сообщения в заявке
        const messagesResult = await client.query(
            `SELECT tm.id, tm.sender_type, tm.sender_id, tm.sender_email, tm.message,
                    tm.created_at, tm.is_read, tm.email_id,
                    CASE WHEN tm.sender_type = 'user' THEN u.fio ELSE 'Техподдержка' END as sender_name
             FROM ticket_messages tm
             LEFT JOIN users u ON tm.sender_id = u.id AND tm.sender_type = 'user'
             WHERE tm.ticket_id = $1
             ORDER BY tm.created_at ASC`,
            [ticket.id]
        );

        // Получаем вложения для каждого сообщения
        const messageIds = messagesResult.rows.map(m => m.id);
        let attachmentsResult = { rows: [] };

        if (messageIds.length > 0) {
            attachmentsResult = await client.query(
                `SELECT * FROM ticket_attachments WHERE message_id = ANY($1)`,
                [messageIds]
            );
        }

        // Группируем вложения по ID сообщения
        const attachmentsByMessageId = {};
        attachmentsResult.rows.forEach(attachment => {
            if (!attachmentsByMessageId[attachment.message_id]) {
                attachmentsByMessageId[attachment.message_id] = [];
            }
            attachmentsByMessageId[attachment.message_id].push(attachment);
        });

        // Добавляем вложения к сообщениям
        const messagesWithAttachments = messagesResult.rows.map(message => {
            return {
                ...message,
                attachments: attachmentsByMessageId[message.id] || []
            };
        });

        // Отмечаем сообщения от техподдержки как прочитанные
        if (messagesResult.rows.some(m => m.sender_type === 'support' && !m.is_read)) {
            await client.query(
                `UPDATE ticket_messages
                 SET is_read = TRUE
                 WHERE ticket_id = $1 AND sender_type = 'support' AND is_read = FALSE`,
                [ticket.id]
            );
        }

        res.status(200).json({
            ticket: {
                id: ticket.id,
                ticket_number: ticket.ticket_number,
                subject: ticket.subject,
                status: ticket.status,
                created_at: ticket.created_at,
                updated_at: ticket.updated_at,
                closed_at: ticket.closed_at,
                thread_id: ticket.email_thread_id
            },
            messages: messagesWithAttachments
        });

    } catch (error) {
        console.error('Error fetching ticket details:', error);
        res.status(500).json({ message: 'Не удалось загрузить информацию о заявке' });
    } finally {
        if (client) client.release();
    }
});*/

// 7. Получение детальной информации о заявке
app.get('/api/tickets/:ticketNumber', verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const { ticketNumber } = req.params;

    let client;
    try {
        client = await pool.connect();

        // Получаем информацию о заявке и ее владельце
        const ticketResult = await client.query(
            `SELECT t.id, t.ticket_number, t.subject, ts.name as status,
                    t.created_at, t.updated_at, t.closed_at, t.user_id, t.email_thread_id,
                    u.company as owner_company, u.email as owner_email, u.fio as owner_fio
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             JOIN users u ON t.user_id = u.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Получаем компанию текущего пользователя
        const currentUserResult = await client.query(
            'SELECT company FROM users WHERE id = $1',
            [userId]
        );
        
        const currentUserCompany = currentUserResult.rows[0]?.company;

        // ИЗМЕНЕНО: Проверяем права доступа
        const isOwner = ticket.user_id === userId;
        const isSameCompany = currentUserCompany && 
                             ticket.owner_company && 
                             currentUserCompany === ticket.owner_company;
        
        // Разрешаем доступ если:
        // 1. Это владелец заявки ИЛИ
        // 2. Это коллега по компании (у обоих есть компания и они совпадают)
        if (!isOwner && !isSameCompany) {
            console.warn(`User ${userId} (company: ${currentUserCompany}) attempted to access ticket ${ticketNumber} owned by user ${ticket.user_id} (company: ${ticket.owner_company}) - ACCESS DENIED`);
            return res.status(403).json({ 
                message: 'У вас нет доступа к этой заявке. Вы можете просматривать только свои заявки или заявки сотрудников вашей компании.' 
            });
        }

        console.log(`User ${userId} (company: ${currentUserCompany}) accessing ticket ${ticketNumber} owned by ${ticket.user_id} (company: ${ticket.owner_company}) - ACCESS GRANTED`);

        // Получаем все сообщения в заявке
        const messagesResult = await client.query(
            `SELECT tm.id, tm.sender_type, tm.sender_id, tm.sender_email, tm.message,
                    tm.created_at, tm.is_read, tm.email_id,
                    CASE 
                        WHEN tm.sender_type = 'user' AND tm.sender_id = $2 THEN 'Вы'
                        WHEN tm.sender_type = 'user' THEN u_sender.fio
                        WHEN tm.sender_type = 'support' THEN 'Техподдержка ИНТ'
                        ELSE 'Система'
                    END as sender_name,
                    tm.sender_type,
                    tm.sender_id
             FROM ticket_messages tm
             LEFT JOIN users u_sender ON tm.sender_id = u_sender.id AND tm.sender_type = 'user'
             WHERE tm.ticket_id = $1
             ORDER BY tm.created_at ASC`,
            [ticket.id, userId] // Передаем userId для подстановки "Вы"
        );

        // Получаем вложения
        const messageIds = messagesResult.rows.map(m => m.id);
        let attachmentsResult = { rows: [] };

        if (messageIds.length > 0) {
            attachmentsResult = await client.query(
                `SELECT * FROM ticket_attachments WHERE message_id = ANY($1)`,
                [messageIds]
            );
        }

        const attachmentsByMessageId = {};
        attachmentsResult.rows.forEach(attachment => {
            if (!attachmentsByMessageId[attachment.message_id]) {
                attachmentsByMessageId[attachment.message_id] = [];
            }
            attachmentsByMessageId[attachment.message_id].push(attachment);
        });

        const messagesWithAttachments = messagesResult.rows.map(message => {
            return {
                ...message,
                attachments: attachmentsByMessageId[message.id] || []
            };
        });

        // Отмечаем сообщения от техподдержки как прочитанные (только для владельца)
        if (isOwner) {
            await client.query(
                `UPDATE ticket_messages
                 SET is_read = TRUE
                 WHERE ticket_id = $1 AND sender_type = 'support' AND is_read = FALSE`,
                [ticket.id]
            );
        }

        // Добавляем информацию о правах доступа в ответ
        const accessInfo = {
            is_owner: isOwner,
            is_colleague: isSameCompany,
            owner_name: ticket.owner_fio,
            owner_email: ticket.owner_email
        };

        res.status(200).json({
            ticket: {
                id: ticket.id,
                ticket_number: ticket.ticket_number,
                subject: ticket.subject,
                status: ticket.status,
                created_at: ticket.created_at,
                updated_at: ticket.updated_at,
                closed_at: ticket.closed_at,
                thread_id: ticket.email_thread_id,
                user_id: ticket.user_id,
                user_fio: ticket.owner_fio,
                user_email: ticket.owner_email,
                access: accessInfo // Добавляем информацию о доступе
            },
            messages: messagesWithAttachments
        });

    } catch (error) {
        console.error('Error fetching ticket details:', error);
        res.status(500).json({ message: 'Не удалось загрузить информацию о заявке' });
    } finally {
        if (client) client.release();
    }
});


const superAdminAuthLimiter = rateLimit({ // Переименовал для ясности
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5,                   // Максимум 5 попыток входа с одного IP за 15 минут
    message: { message: 'Слишком много попыток входа. Попробуйте позже.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.post('/api/auth-tech', superAdminAuthLimiter, async (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ message: "Введите пароль" });
    }

    const superAdminPasswordFromEnv = process.env.TECH_PASSWORD; // Пароль из .env
    const adminJwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

    if (!superAdminPasswordFromEnv) {
        console.error('!!! TECH_PASSWORD is not defined in .env file !!!');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера (пароль суперадмина)' });
    }
    if (!adminJwtSecret) {
        console.error('!!! ADMIN_JWT_SECRET (or JWT_SECRET) is not defined in .env file !!!');
        return res.status(500).json({ message: 'Ошибка конфигурации сервера (секрет токена)' });
    }

    try {
        if (password === superAdminPasswordFromEnv) {
            const payload = {
                role: 'admin',
            };
            const token = jwt.sign(
                payload,
                adminJwtSecret, // Используем тот же секрет, что и в verifyAdminToken
                { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '4h' } // Время жизни токена
            );

            res.status(200).json({
                message: 'Вход выполнен успешно',
                token: token // Отправляем токен клиенту
            });
        } else {
            res.status(401).json({ message: 'Пароль не верный' });
        }
    } catch (error) {
        console.error('Error in /auth-tech:', error);
        res.status(500).json({ message: 'Внутренняя ошибка сервера' });
    }
});

app.post('/api/admin/tickets/:ticketNumber/close', verifyAdminToken, async (req, res) => {
    const { ticketNumber } = req.params;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Найти заявку
        const ticketResult = await client.query(
            `SELECT t.id, t.status_id, ts.name as status
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );
        if (ticketResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Проверить, не закрыта ли уже заявка
        if (ticket.status === 'closed') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Заявка уже закрыта' });
        }

        // Получить ID статуса "closed"
        const statusResult = await client.query(
            'SELECT id FROM ticket_statuses WHERE name = $1',
            ['closed']
        );
        const closedStatusId = statusResult.rows[0].id;

        // Обновить статус заявки
        await client.query(
            `UPDATE tickets
             SET status_id = $1, closed_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [closedStatusId, ticket.id]
        );

        await client.query('COMMIT');
        res.status(200).json({
            message: 'Заявка успешно закрыта администратором',
            ticket_number: ticketNumber,
            status: 'closed'
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error closing ticket as admin:', error);
        res.status(500).json({ message: 'Ошибка при закрытии заявки' });
    } finally {
        if (client) client.release();
    }
});

app.get('/api/admin/tickets', verifyAdminToken, async (req, res) => {
    const statusFilter = req.query.status;
    const userIdFilter = req.query.userId;
    const companyFilter = req.query.company;
    const sortBy = req.query.sortBy || 'updated_at';
    const sortOrder = req.query.sortOrder || 'DESC';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const selectClause = `
        SELECT
            t.id, t.ticket_number, t.subject, ts.name as status,
            u.fio as user_fio, u.email as user_email, u.company as user_company,
            t.created_at, t.updated_at, t.closed_at,
            (SELECT tm.message FROM ticket_messages tm WHERE tm.ticket_id = t.id ORDER BY tm.created_at ASC LIMIT 1) as first_message_snippet,
            (SELECT tm.created_at FROM ticket_messages tm WHERE tm.ticket_id = t.id ORDER BY tm.created_at DESC LIMIT 1) as last_message_at
    `;
    const fromClause = `
        FROM tickets t
        JOIN ticket_statuses ts ON t.status_id = ts.id
        JOIN users u ON t.user_id = u.id
    `;
    const countSelectClause = `SELECT COUNT(t.id)`;

    let whereConditions = []; // <--- ИЗМЕНЕНИЕ: Инициализируем как МАССИВ
    const queryParams = [];
    const countQueryParams = [];


    if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'open') {
            whereConditions.push(`ts.name != 'closed'`); // <--- ИЗМЕНЕНИЕ: Используем массив
        } else {
            countQueryParams.push(statusFilter); // Добавляем в параметры для count первым
            queryParams.push(statusFilter);      // Затем в параметры для основного запроса
            whereConditions.push(`ts.name = $${countQueryParams.length}`); // <--- Используем длину countQueryParams для индекса
        }
    }

    if (userIdFilter && userIdFilter !== 'all') {
        const userIdNum = parseInt(userIdFilter, 10);
        if (!isNaN(userIdNum)) { // Проверка, что это действительно число
            countQueryParams.push(userIdNum);
            queryParams.push(userIdNum);
            whereConditions.push(`t.user_id = $${countQueryParams.length}`); // <--- Используем длину countQueryParams для индекса
        } else {
            console.warn(`Invalid userIdFilter received: ${userIdFilter}`);

        }
    }


    if (companyFilter && companyFilter.trim() !== '') {
	const companySearchTerm = `%${companyFilter.trim()}%`;
	countQueryParams.push(companySearchTerm);
	queryParams.push(companySearchTerm);
	whereConditions.push(`u.company ILIKE $${countQueryParams.length}`);
    }

    let whereClauseString = '';
    if (whereConditions.length > 0) {
        whereClauseString = 'WHERE ' + whereConditions.join(' AND ');
    }

    let query = `${selectClause} ${fromClause} ${whereClauseString}`;
    let countQuery = `${countSelectClause} ${fromClause} ${whereClauseString}`;

    const allowedSortByFields = ['ticket_number', 'subject', 'status', 'user_fio', 'created_at', 'updated_at', 'last_message_at'];
    let safeSortByDbField = sortBy;
    if (sortBy === 'status') safeSortByDbField = 'ts.name';
    else if (sortBy === 'user_fio') safeSortByDbField = 'u.fio';
    else if (allowedSortByFields.includes(sortBy)) safeSortByDbField = `t.${sortBy}`; // Добавляем алиас t. для полей из tickets
    else safeSortByDbField = 't.updated_at'; // Поле из t по умолчанию

    const safeSortOrder = (sortOrder.toUpperCase() === 'ASC' || sortOrder.toUpperCase() === 'DESC') ? sortOrder.toUpperCase() : 'DESC';
    query += ` ORDER BY ${safeSortByDbField} ${safeSortOrder}, t.id ${safeSortOrder}`;

    // Параметры для LIMIT и OFFSET всегда добавляются последними
    queryParams.push(limit);
    query += ` LIMIT $${queryParams.length}`;
    queryParams.push(offset);
    query += ` OFFSET $${queryParams.length}`;

    let client;
    try {
        client = await pool.connect();
        console.log('Executing Query:', query); // Лог для отладки основного запроса
        console.log('Query Params:', queryParams);  // Лог для отладки параметров основного запроса

        console.log('Executing Count Query:', countQuery); // Лог для отладки запроса подсчета
        console.log('Count Query Params:', countQueryParams); // Лог для отладки параметров запроса подсчета

        const ticketsResult = await client.query(query, queryParams);
        const totalTicketsResult = await client.query(countQuery, countQueryParams);

        const totalTickets = parseInt(totalTicketsResult.rows[0].count, 10);

        res.status(200).json({
            tickets: ticketsResult.rows,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalTickets / limit),
                totalItems: totalTickets,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error('!!! UNHANDLED ERROR in /api/admin/tickets:', error); // Изменил, чтобы было видно в логах
        res.status(500).json({ message: 'Не удалось загрузить список заявок' });
    } finally {
        if (client) client.release();
    }
});

// Эндпоинт для получения списка пользователей для фильтра в админке
app.get('/api/admin/userslist', verifyAdminToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        // Выбираем только необходимые поля, возможно, отсортируем по ФИО
        const result = await client.query(
            'SELECT id, fio, email, account_status FROM users ORDER BY fio ASC'
        );
        res.status(200).json({ users: result.rows });
    } catch (error) {
        console.error('Error fetching users list for admin filter:', error);
        res.status(500).json({ message: 'Не удалось загрузить список пользователей' });
    } finally {
        if (client) client.release();
    }
});

app.get('/api/admin/users', verifyAdminToken, async (req, res) => {
    const statusFilter = req.query.status; // например, 'pending_approval', 'active', 'all'
    let query = `SELECT id, fio, email, company, position, phone, created_at, account_status FROM users`;
    const queryParams = [];

    if (statusFilter && statusFilter !== 'all') {
        queryParams.push(statusFilter);
        query += ` WHERE account_status = $1`;
    }
    query += ` ORDER BY created_at DESC`;
    // Добавьте пагинацию, если пользователей много

    let client;
    try {
        client = await pool.connect();
        const result = await client.query(query, queryParams);
        res.status(200).json({ users: result.rows });
    } catch (error) {
        console.error(error + " /api/admin/users")
    } finally {
        if (client) client.release();
    }
});

app.put('/api/admin/users/:userId/approve', verifyAdminToken, async (req, res) => {
    const { userId } = req.params;
    let client;
    try {
        client = await pool.connect();
        // Проверяем, что пользователь существует и ожидает подтверждения
        const userResult = await client.query(
            "SELECT email, fio, account_status FROM users WHERE id = $1",
            [userId]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }
        if (userResult.rows[0].account_status !== 'pending_approval') {
            return res.status(400).json({ message: 'Пользователь не ожидает подтверждения или уже обработан.' });
        }

        await client.query(
            "UPDATE users SET account_status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [userId]
        );

        // Опционально: отправить email пользователю об активации
        const user = userResult.rows[0];
        try {
            await sendEmail(
                user.email,
                'Ваш аккаунт успешно активирован!',
                `Здравствуйте, ${user.fio}!\n\nВаш аккаунт на сайте ИНТ был успешно активирован. Теперь вы можете войти в систему.\n\nСпасибо!`,
                `<p>Здравствуйте, ${user.fio}!</p><p>Ваш аккаунт на сайте ИНТ был успешно активирован. Теперь вы можете войти в систему.</p><p>Спасибо!</p>`,
                { fromName: 'Администрация ИНТ' }
            );
        } catch (emailError) {
            console.error(`Failed to send account activation email to ${user.email}:`, emailError);
        }

        res.status(200).json({ message: 'Регистрация пользователя одобрена.' });
    } catch (error) {
        console.error(error)
    } finally {
        if (client) client.release();
    }
});

app.put('/api/admin/users/:userId/reject', verifyAdminToken, async (req, res) => {
    const { userId } = req.params;
    // Причина отклонения (опционально, из req.body.reason)
    const { reason } = req.body;
    let client;
    try {
        client = await pool.connect();
         const userResult = await client.query( // Проверка как в approve
            "SELECT email, fio, account_status FROM users WHERE id = $1",
            [userId]
        );
        if (userResult.rows.length === 0) return res.status(404).json({ message: 'Пользователь не найден' });
        if (userResult.rows[0].account_status !== 'pending_approval') return res.status(400).json({ message: 'Пользователь не ожидает подтверждения.' });


        // Можно либо удалить пользователя, либо сменить статус на 'rejected'
        // Вариант 1: Смена статуса
        await client.query(
            "UPDATE users SET account_status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
            [userId]
        );
        // Вариант 2: Удаление (ОСТОРОЖНО!)
        // await client.query("DELETE FROM users WHERE id = $1", [userId]);

        // Опционально: отправить email пользователю об отклонении
        const user = userResult.rows[0];
        try {
            await sendEmail(
                user.email,
                'Заявка на регистрацию отклонена',
                `Здравствуйте, ${user.fio}.\n\nК сожалению, ваша заявка на регистрацию на сайте ИНТ была отклонена.${reason ? '\nПричина: ' + reason : ''}\n\nС уважением,\nАдминистрация ИНТ`,
                // ... HTML версия ...
                { fromName: 'Администрация ИНТ' }
            );
        } catch (emailError) {
            console.error(`Failed to send account rejection email to ${user.email}:`, emailError);
        }

        res.status(200).json({ message: 'Регистрация пользователя отклонена.' });
    } catch (error) {
        console.error(error)
    } finally {
        if (client) client.release();
    }
});

app.get('/api/admin/tickets/:ticketNumber/details', verifyAdminToken, async (req, res) => {
    // const adminId = req.admin.id; // Если нужно для логирования или чего-то еще
    const { ticketNumber } = req.params;

    let client;
    try {
        client = await pool.connect();

        // Получаем информацию о заявке
        const ticketResult = await client.query(
            `SELECT t.id, t.ticket_number, t.subject, ts.name as status,
                    t.created_at, t.updated_at, t.closed_at, t.user_id, u.fio as user_fio, u.email as user_email,
                    t.email_thread_id
             FROM tickets t
             JOIN ticket_statuses ts ON t.status_id = ts.id
             JOIN users u ON t.user_id = u.id  -- Добавили JOIN с users для информации о пользователе
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        const ticket = ticketResult.rows[0];

        // Получаем все сообщения в заявке
        const messagesResult = await client.query(
            `SELECT tm.id, tm.sender_type, tm.sender_id, tm.sender_email, tm.message,
                    tm.created_at, tm.is_read, tm.email_id,
                    CASE
                        WHEN tm.sender_type = 'user' THEN u_sender.fio
                        WHEN tm.sender_type = 'support' THEN COALESCE(s_sender.fio, 'Техподдержка') -- Имя сотрудника или 'Техподдержка'
                        ELSE 'Система'
                    END as sender_name
             FROM ticket_messages tm
             LEFT JOIN users u_sender ON tm.sender_id = u_sender.id AND tm.sender_type = 'user'
             LEFT JOIN users s_sender ON tm.sender_id = s_sender.id AND tm.sender_type = 'support' -- Для имени сотрудника поддержки
             WHERE tm.ticket_id = $1
             ORDER BY tm.created_at ASC`,
            [ticket.id]
        );

        // Получаем вложения для каждого сообщения (этот код у вас уже есть, можно переиспользовать)
        const messageIds = messagesResult.rows.map(m => m.id);
        let attachmentsResult = { rows: [] };

        if (messageIds.length > 0) {
            attachmentsResult = await client.query(
                `SELECT id, message_id, file_name, file_path, file_size, mime_type
                 FROM ticket_attachments WHERE message_id = ANY($1::int[])`, // Явно указываем тип массива
                [messageIds]
            );
        }

        const attachmentsByMessageId = {};
        attachmentsResult.rows.forEach(attachment => {
            if (!attachmentsByMessageId[attachment.message_id]) {
                attachmentsByMessageId[attachment.message_id] = [];
            }
            attachmentsByMessageId[attachment.message_id].push({
                id: attachment.id,
                file_name: attachment.file_name,
                file_path: attachment.file_path, // Для админа может быть полезен путь
                file_size: attachment.file_size,
                mime_type: attachment.mime_type
                // Можно добавить URL для скачивания, если файлы доступны через GET эндпоинт
                // download_url: `/api/admin/attachments/${attachment.id}` // Пример
            });
        });

        const messagesWithAttachments = messagesResult.rows.map(message => {
            return {
                ...message,
                attachments: attachmentsByMessageId[message.id] || []
            };
        });

        // Администратору не нужно отмечать сообщения как прочитанные таким образом,
        // это логика для пользователя.

        res.status(200).json({
            ticket: { // Расширяем информацию о тикете для админа
                id: ticket.id,
                ticket_number: ticket.ticket_number,
                subject: ticket.subject,
                status: ticket.status,
                created_at: ticket.created_at,
                updated_at: ticket.updated_at,
                closed_at: ticket.closed_at,
                user_id: ticket.user_id,
                user_fio: ticket.user_fio,
                user_email: ticket.user_email,
                thread_id: ticket.email_thread_id
            },
            messages: messagesWithAttachments
        });

    } catch (error) {
        console.error('Error fetching ticket details for admin:', error);
        res.status(500).json({ message: 'Не удалось загрузить информацию о заявке для администратора' });
    } finally {
        if (client) client.release();
    }
});

app.post('/api/admin/tickets/:ticketNumber/reply', verifyAdminToken, upload.array('attachments', 5), async (req, res) => {
    const { ticketNumber } = req.params;
    const { message } = req.body; // Текст ответа от администратора
    const adminUserId = req.admin.id; // ID администратора из токена (если есть и вы его туда кладете)

    if (!message || message.trim() === '') {
        return res.status(400).json({ message: 'Текст ответа не может быть пустым.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // 1. Найти тикет
        const ticketResult = await client.query(
            `SELECT t.id, t.subject as ticket_subject, t.user_id, u.email as user_email, u.fio as user_fio,
                    t.email_thread_id, ts.name as current_status
             FROM tickets t
             JOIN users u ON t.user_id = u.id
             JOIN ticket_statuses ts ON t.status_id = ts.id
             WHERE t.ticket_number = $1`,
            [ticketNumber]
        );

        if (ticketResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Заявка не найдена.' });
        }
        const ticket = ticketResult.rows[0];

        // 2. Проверить, не закрыт ли тикет (опционально, можно разрешить отвечать в закрытые, тогда они переоткроются)
        if (ticket.current_status === 'closed') {
            // Можно либо запретить, либо автоматически переоткрыть
            // Пока запретим, но вы можете изменить логику
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Нельзя ответить на закрытую заявку. Сначала переоткройте её.' });
        }

        // 3. Получить ID сотрудника поддержки (если это реализовано)
        // Предположим, что `req.admin` содержит `userId` для администратора/сотрудника поддержки
        // Если нет, то sender_id может быть null или ID специального "системного" пользователя поддержки.
        let supportStaffId = null;
        let supportStaffEmail = supportEmail; // Глобальная переменная supportEmail
        let supportStaffName = 'Техподдержка ИНТ';

        // Если у вас есть информация о сотруднике в токене или вы можете ее получить:
        if (req.admin && req.admin.userId) { // Предполагаем, что в ADMIN_JWT_SECRET токене есть userId
            const staffResult = await client.query('SELECT id, email, fio FROM users WHERE id = $1 AND (is_support = TRUE OR role = \'admin\')', [req.admin.userId]);
            if (staffResult.rows.length > 0) {
                supportStaffId = staffResult.rows[0].id;
                supportStaffEmail = staffResult.rows[0].email;
                supportStaffName = staffResult.rows[0].fio || supportStaffName;
            } else {
                console.warn(`Admin user ID ${req.admin.userId} from token not found as support staff. Using default support sender.`);
            }
        } else {
             console.warn(`Admin user ID not found in token. Using default support sender. Ensure ADMIN_JWT_SECRET payload includes userId for staff attribution.`);
        }


        // 4. Сохранить сообщение от техподдержки
        // Сохраняем входящее письмо в таблицу emails (имитируем, что это "исходящее" от системы, но полученное от админа)
        // Это нужно, чтобы корректно работал threadId и replyTo в функции sendEmail
        const emailLogResult = await client.query(
            `INSERT INTO emails (thread_id, subject, body, from_email, to_email, is_outgoing, created_at, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
             RETURNING id`,
            [
                ticket.email_thread_id,
                `Re: ${ticket.ticket_subject}`, // Тема для лога
                message,
                supportStaffEmail,        // От кого (почта поддержки)
                ticket.user_email,        // Кому (почта пользователя)
                true,                     // Это исходящее письмо
                supportStaffId            // ID сотрудника поддержки, если есть
            ]
        );
        const emailId = emailLogResult.rows[0].id;

        const messageInsertResult = await client.query(
            `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, sender_email, message, email_id)
             VALUES ($1, 'support', $2, $3, $4, $5)
             RETURNING id, created_at`,
            [ticket.id, supportStaffId, supportStaffEmail, message, emailId]
        );
        const newMessage = messageInsertResult.rows[0];

        // 5. Обработать вложения (если есть)
        const emailAttachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await client.query(
                    `INSERT INTO ticket_attachments (message_id, file_name, file_path, file_size, mime_type)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [newMessage.id, file.originalname, file.path, file.size, file.mimetype]
                );
                emailAttachments.push({ filename: file.originalname, path: file.path });
            }
        }

        // 6. Обновить статус тикета на "Ожидает ответа от пользователя" (waiting_for_user)
        // и время последнего обновления
        const waitingStatusResult = await client.query('SELECT id FROM ticket_statuses WHERE name = $1', ['waiting_for_user']);
        if (waitingStatusResult.rows.length === 0) {
            await client.query('ROLLBACK');
            console.error('Status "waiting_for_user" not found in database.');
            return res.status(500).json({ message: 'Ошибка конфигурации: статус "waiting_for_user" не найден.' });
        }
        const waitingStatusId = waitingStatusResult.rows[0].id;

        await client.query(
            'UPDATE tickets SET status_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [waitingStatusId, ticket.id]
        );

        await client.query('COMMIT');

        // 7. Отправить email пользователю
        try {
            const emailSubjectToUser = `Ответ по вашей заявке #${ticketNumber}: ${ticket.ticket_subject}`;
            const emailTextToUser =
`Здравствуйте, ${ticket.user_fio || 'Пользователь'}!

Сотрудник техподдержки (${supportStaffName}, ${supportStaffEmail}) ответил на вашу заявку #${ticketNumber}:

${message}

---
Вы можете ответить на это письмо или перейти в личный кабинет на сайте.
С уважением,
Техподдержка ИНТ`;

            const emailHtmlToUser =
`<p>Здравствуйте, ${ticket.user_fio || 'Пользователь'}!</p>
<p>Сотрудник техподдержки (<strong>${supportStaffName}</strong>, ${supportStaffEmail}) ответил на вашу заявку #${ticketNumber} (Тема: ${ticket.ticket_subject}):</p>
<blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 5px;">
  ${message.replace(/\n/g, '<br>')}
</blockquote>
<p>---</p>
<p>Вы можете ответить на это письмо или перейти в личный кабинет на сайте.</p>
<p>С уважением,<br>Техподдержка ИНТ</p>`;

            await sendEmail(
                ticket.user_email,
                emailSubjectToUser,
                emailTextToUser,
                emailHtmlToUser,
                {
                    fromName: supportStaffName, // Имя отправителя от техподдержки
                    replyTo: supportStaffEmail, // Email для ответа пользователя
                    attachments: emailAttachments,
                    threadId: ticket.email_thread_id,
                    ticketNumber: ticketNumber,
                    inReplyToMessageId: null, // Сюда можно подставить Message-ID предыдущего письма от пользователя, если он есть
                    // saveToDb: true, // Уже сохранили в emailLogResult
                    userIdForLog: supportStaffId // Для лога в БД, если нужно
                }
            );
             console.log(`Admin reply for ticket #${ticketNumber} sent to user ${ticket.user_email}`);
        } catch (emailError) {
            // Не откатываем транзакцию, т.к. ответ уже сохранен. Просто логируем ошибку.
            console.error(`Failed to send email notification to user for ticket #${ticketNumber} reply:`, emailError);
            // Можно добавить флаг в сообщение/тикет, что email не был отправлен.
        }

        res.status(201).json({
            message: 'Ответ успешно отправлен и сохранен.',
            newMessage: {
                id: newMessage.id,
                sender_type: 'support',
                sender_name: supportStaffName,
                sender_email: supportStaffEmail,
                message: message,
                created_at: newMessage.created_at,
                attachments: emailAttachments.map(a => ({ file_name: a.filename, file_path: a.path })) // Возвращаем информацию о вложениях
            },
            new_status: 'waiting_for_user'
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error sending admin reply to ticket:', error);
        res.status(500).json({ message: 'Ошибка сервера при отправке ответа.' });
    } finally {
        if (client) client.release();
    }
});

const videoUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = 'uploads/videos/';
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[Multer] Загрузка видео в директорию: ${dir}`);
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const filename = `${Date.now()}-${file.originalname}`;
            console.log(`[Multer] Имя файла: ${filename}, MIME-тип: ${file.mimetype}`);
            cb(null, filename);
        }
    }),
    fileFilter: (req, file, cb) => {
        console.log(`[Multer] Проверка файла: ${file.originalname}, MIME: ${file.mimetype}`);
        if (file.mimetype === 'video/mp4' || file.mimetype === 'video/webm') {
            console.log(`[Multer] Файл разрешен: ${file.originalname}`);
            cb(null, true);
        } else {
            console.error(`[Multer] Ошибка: недопустимый тип файла (${file.mimetype})`);
            cb(new Error('Допустимы только MP4 и WebM видео'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 * 1024, // 5GB
    }
});

app.get('/api/admin/videos', verifyAdminToken, async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            `SELECT id, title, description, file_path, thumbnail_path,
                    created_at, updated_at
             FROM videos
             ORDER BY created_at DESC`
        );

        res.status(200).json({
            success: true,
            videos: result.rows
        });
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({
            success: false,
            message: 'Не удалось загрузить список видео'
        });
    } finally {
        if (client) client.release();
    }
});

app.post('/api/admin/videos', verifyAdminToken, (req, res, next) => {
    console.log('\n--- Начало загрузки видео ---');
    //console.log('Заголовки запроса:', req.headers);
    console.log(res.file);
    req.setTimeout(10 * 60 * 1000); // 10 минут
    res.setTimeout(10 * 60 * 1000);

    const videoUpload = multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => {
                const dir = 'uploads/videos/';
                fs.mkdirSync(dir, { recursive: true });
                console.log(`[Multer] Загрузка ${file.fieldname} в ${dir}`);
                cb(null, dir);
            },
            filename: (req, file, cb) => {
                const filename = `${Date.now()}-${file.originalname}`;
                console.log(`[Multer] Имя файла: ${filename}`);
                cb(null, filename);
            }
        }),
        fileFilter: (req, file, cb) => {
            console.log(`[Multer] Проверка файла: ${file.originalname}, тип: ${file.mimetype}`);

            if (file.fieldname === 'video' &&
                !['video/mp4', 'video/webm'].includes(file.mimetype)) {
                console.error('[Multer] Ошибка: недопустимый тип видео');
                return cb(new Error('Допустимы только MP4 и WebM видео'), false);
            }

            if (file.fieldname === 'thumbnail' &&
                !['image/jpeg', 'image/png'].includes(file.mimetype)) {
                console.error('[Multer] Ошибка: недопустимый тип изображения');
                return cb(new Error('Допустимы только JPG и PNG для миниатюр'), false);
            }

            cb(null, true);
        },
        limits: {
            fileSize: 5 * 1024 * 1024 * 1024 // 5GB
        }
    }).fields([
        { name: 'video', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 }
    ]);

    videoUpload(req, res, async (err) => {
        try {
            if (err) {
                console.error('Ошибка Multer:', err);
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({
                        message: 'Файл слишком большой. Максимальный размер: 5GB.'
                    });
                }
                return res.status(400).json({ message: err.message });
            }

            if (!req.files || !req.files['video']) {
                console.error('Видеофайл не был загружен');
                return res.status(400).json({ message: 'Видеофайл обязателен' });
            }

            const videoFile = req.files['video'][0];
            const thumbnailFile = req.files['thumbnail'] ? req.files['thumbnail'][0] : null;
            const { title, description } = req.body;

            console.log('Обработка данных:', {
                title,
                description,
                videoPath: videoFile.path,
                thumbnailPath: thumbnailFile?.path
            });

            if (!title) {
                await cleanupFile(videoFile.path);
                if (thumbnailFile) await cleanupFile(thumbnailFile.path);
                return res.status(400).json({ message: 'Название видео обязательно' });
            }

            const result = await pool.query(
                `INSERT INTO videos (title, description, file_path, thumbnail_path, file_size)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, title, file_path, created_at`,
                [
                    title.trim(),
                    description ? description.trim() : null,
                    videoFile.path,
                    thumbnailFile?.path || null,
//                    videoFile.size,
                    videoFile.mimetype
                ]
            );

            console.log('Видео успешно сохранено в БД. ID:', result.rows[0].id);

            res.status(201).json({
                message: 'Видео успешно загружено',
                video: result.rows[0]
            });

        } catch (error) {
            console.error('\n--- Критическая ошибка при загрузке ---');
            console.error(error);

            if (req.files) {
                for (const fileType in req.files) {
                    for (const file of req.files[fileType]) {
                        await cleanupFile(file.path);
                    }
                }
            }

            res.status(500).json({
                message: 'Ошибка при загрузке видео',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        } finally {
            console.log('--- Завершение обработки запроса ---\n');
        }
    });
});

async function cleanupFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            console.log(`Файл удален: ${filePath}`);
        }
    } catch (error) {
        console.error(`Ошибка удаления файла ${filePath}:`, error);
    }
}

// Вспомогательная функция для форматирования размера файла
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]);
}

app.put('/api/admin/videos/:id', verifyAdminToken, upload.fields([
    // ...
]), async (req, res) => {
    // ... (код до try...catch)
    try {
        const client = await pool.connect();
        await client.query('BEGIN');

        // ... (код получения oldVideo)

        const oldVideo = videoResult.rows[0];
        // --- ИЗМЕНЕНИЯ ЗДЕСЬ ---
        let newFilePath = oldVideo.file_path; // Используем file_path
        let newFileSize = oldVideo.file_size; // Используем file_size
        let newThumbnailPath = oldVideo.thumbnail_path;

        // Если загружен новый видеофайл
        if (req.files && req.files['video']) {
            const newVideoFile = req.files['video'][0];
            // Удаляем старый видеофайл
            if (fs.existsSync(oldVideo.file_path)) {
                fs.unlinkSync(oldVideo.file_path);
            }
            newFilePath = newVideoFile.path;
            newFileSize = newVideoFile.size; // Обновляем размер файла
        }

        // ... (код для thumbnail без изменений)

        // Обновляем запись в БД
        const updateResult = await client.query(
            // --- ИЗМЕНЕНИЯ ЗДЕСЬ ---
            `UPDATE videos SET title = $1, description = $2, file_path = $3, file_size = $4, thumbnail_path = $5, updated_at = CURRENT_TIMESTAMP
             WHERE id = $6 RETURNING *`,
            [title, description, newFilePath, newFileSize, newThumbnailPath, videoId]
        );

        await client.query('COMMIT');
        res.status(200).json({
            message: 'Видео успешно обновлено',
            video: updateResult.rows[0]
        });

    } catch (error) {
        // ... (остальной код без изменений)
    } finally {
        // ... (остальной код без изменений)
    }
});

app.delete('/api/admin/videos/:id', verifyAdminToken, async (req, res) => {
    const videoId = req.params.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const videoResult = await client.query('SELECT file_path, thumbnail_path FROM videos WHERE id = $1', [videoId]);
        if (videoResult.rows.length === 0) {
            return res.status(404).send("Видео не найдено");
        }

        const videoToDelete = videoResult.rows[0];

        await client.query('DELETE FROM videos WHERE id = $1', [videoId]);

        if (fs.existsSync(videoToDelete.file_path)) {
            fs.unlinkSync(videoToDelete.file_path);
        }
        if (videoToDelete.thumbnail_path && fs.existsSync(videoToDelete.thumbnail_path)) {
            fs.unlinkSync(videoToDelete.thumbnail_path);
        }

        await client.query('COMMIT');
        res.send("Видео удалено");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting video:', error);
        res.status(500).send("Ошибка при удалении видео");
    } finally {
        client.release();
    }
});

// Получение последних 6 новостей (для главной страницы)
app.get('/api/news/latest', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, image_path, short_text, created_at
             FROM news
             WHERE is_archived = false
             ORDER BY created_at DESC
             LIMIT 6`
        );
        res.status(200).json({ news: result.rows });
    } catch (error) {
        console.error('Error fetching latest news:', error);
        res.status(500).json({ message: 'Не удалось загрузить новости' });
    }
});

// Получение одной новости по ID (полная версия)
app.get('/api/news/:id', async (req, res) => {
    const newsId = req.params.id;
    try {
        const result = await pool.query(
            `SELECT id, title, image_path, short_text, full_text, external_link, created_at
             FROM news
             WHERE id = $1`,
            [newsId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Новость не найдена' });
        }

        res.status(200).json({ news: result.rows[0] });
    } catch (error) {
        console.error('Error fetching news item:', error);
        res.status(500).json({ message: 'Не удалось загрузить новость' });
    }
});

// Получение архива новостей (все кроме последних 6)
app.get('/api/news/archive', async (req, res) => {
  try {
        // Получаем и проверяем page и limit
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        // Проверка на корректность значений
        if (isNaN(page) || page < 1) {
            return res.status(400).json({
                success: false,
                message: 'Некорректный номер страницы'
            });
        }

        if (isNaN(limit) || limit < 1 || limit > 100) {
            return res.status(400).json({
                success: false,
                message: 'Некорректный размер страницы (должен быть от 1 до 100)'
            });
        }

        const offset = (page - 1) * limit;

        const result = await pool.query(
            `SELECT id, title, image_path, short_text, created_at
             FROM news
             WHERE is_archived = true
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.status(200).json({
            success: true,
            news: result.rows
        });

    } catch (error) {
        console.error('Error fetching news archive:', error);
        res.status(500).json({
            success: false,
            message: 'Не удалось загрузить архив новостей'
        });
    }
});

// Создание новости (требует админских прав)
app.post('/api/admin/news', verifyAdminToken, upload.single('image'), async (req, res) => {
    const { title, short_text, full_text } = req.body;

    if (!title || !short_text) {
        return res.status(400).json({ message: 'Заголовок и краткое описание обязательны' });
    }

    let image_path = null;
    if (req.file) {
        image_path = `/uploads/${req.file.filename}`;
    }

    try {
        const result = await pool.query(
            `INSERT INTO news (title, short_text, full_text, image_path)
             VALUES ($1, $2, $3, $4)
             RETURNING id, title, short_text, full_text, image_path, created_at`,
            [title, short_text, full_text || null, image_path]
        );

        res.status(201).json({
            message: 'Новость успешно создана',
            news: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating news:', error);
        res.status(500).json({ message: 'Не удалось создать новость' });
    }
});

app.get('/api/admin/news', verifyAdminToken, async (req, res) => {
    const { page = 1, limit = 10, is_archived } = req.query;
    const offset = (page - 1) * limit;

    try {
        let query = `
            SELECT id, title, image_path, short_text,
                   full_text, external_link, is_archived,
                   created_at, updated_at
            FROM news
        `;

        let countQuery = `SELECT COUNT(*) FROM news`;
        const params = [];
        const countParams = [];
        let whereClause = '';

        // Фильтрация по статусу архивации
        if (is_archived !== undefined) {
            whereClause = ' WHERE is_archived = $1';
            params.push(is_archived === 'true');
            countParams.push(is_archived === 'true');
        }

        query += whereClause + ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        countQuery += whereClause;

        params.push(parseInt(limit), offset);

        const client = await pool.connect();

        try {
            const newsResult = await client.query(query, params);
            const countResult = await client.query(countQuery, countParams);

            const total = parseInt(countResult.rows[0].count, 10);
            const totalPages = Math.ceil(total / limit);

            res.status(200).json({
                news: newsResult.rows,
                pagination: {
                    currentPage: parseInt(page, 10),
                    totalPages,
                    totalItems: total,
                    itemsPerPage: parseInt(limit, 10)
                }
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error fetching news for admin:', error);
        res.status(500).json({ message: 'Не удалось загрузить новости' });
    }
});

// Обновление новости (требует админских прав)
app.put('/api/admin/news/:id', verifyAdminToken, upload.single('image'), async (req, res) => {
    const newsId = req.params.id;
    const { title, short_text, full_text } = req.body;

    if (!title || !short_text) {
        return res.status(400).json({ message: 'Заголовок и краткое описание обязательны' });
    }

    try {
        // Сначала получаем текущую новость
        const currentNews = await pool.query(
            `SELECT image_path FROM news WHERE id = $1`,
            [newsId]
        );

        if (currentNews.rows.length === 0) {
            return res.status(404).json({ message: 'Новость не найдена' });
        }

        let imageUrl = currentNews.rows[0].image_path;

        // Если загружено новое изображение
        if (req.file) {
            // Удаляем старое изображение, если оно есть
            if (imageUrl) {
                const oldImagePath = path.join(__dirname, imageUrl);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            imageUrl = `/uploads/news/${req.file.filename}`;
        }

        const result = await pool.query(
            `UPDATE news
             SET title = $1, short_text = $2, full_text = $3, image_path = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING id, title, short_text, full_text, image_path, created_at, updated_at`,
            [title, short_text, full_text || null, imageUrl, newsId]
        );

        res.status(200).json({
            message: 'Новость успешно обновлена',
            news: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating news:', error);
        res.status(500).json({ message: 'Не удалось обновить новость' });
    }
});

// Удаление новости (требует админских прав)
app.delete('/api/admin/news/:id', verifyAdminToken, async (req, res) => {
    const newsId = req.params.id;

    try {
        // Сначала получаем новость, чтобы удалить изображение
        const currentNews = await pool.query(
            `SELECT image_path FROM news WHERE id = $1`,
            [newsId]
        );

        if (currentNews.rows.length === 0) {
            return res.status(404).json({ message: 'Новость не найдена' });
        }

        // Удаляем изображение, если оно есть
        if (currentNews.rows[0].image_path) {
            const imagePath = path.join(__dirname, currentNews.rows[0].image_path);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        // Удаляем запись из БД
        await pool.query(
            `DELETE FROM news WHERE id = $1`,
            [newsId]
        );

        res.status(200).json({ message: 'Новость успешно удалена' });
    } catch (error) {
        console.error('Error deleting news:', error);
        res.status(500).json({ message: 'Не удалось удалить новость' });
    }
});

// Получение последних новостей для главной страницы
app.get('/api/public/news', async (req, res) => {
    try {
        const { limit = 6 } = req.query; // По умолчанию 6 новостей

        const result = await pool.query(
            `SELECT
                id,
                title,
                image_path,
                short_text,
                external_link,
                created_at
             FROM news
             WHERE is_archived = false
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
        );

        res.status(200).json({
            success: true,
            news: result.rows.map(news => ({
                ...news,
                created_at: formatClientDate(news.created_at)
            }))
        });
    } catch (error) {
        console.error('Error fetching public news:', error);
        res.status(500).json({
            success: false,
            message: 'Не удалось загрузить новости'
        });
    }
});

// Получение полного текста новости
app.get('/api/public/news/:id', async (req, res) => {
    try {
        const { id } = req.params;

	 // Проверяем, что id является числом
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Неверный идентификатор новости'
            });
        }

        const result = await pool.query(
            `SELECT
                id,
                title,
                image_path,
                short_text,
                full_text,
                external_link,
                created_at
             FROM news
             WHERE id = $1
             AND is_archived = false`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Новость не найдена или недоступна'
            });
        }

        const newsItem = result.rows[0];

        res.status(200).json({
            success: true,
            news: {
                ...newsItem,
                created_at: formatClientDate(newsItem.created_at),
                // Если полного текста нет, используем краткий
                full_text: newsItem.full_text || newsItem.short_text
            }
        });
    } catch (error) {
        console.error('Error fetching news item:', error);
        res.status(500).json({
            success: false,
            message: 'Не удалось загрузить новость'
        });
    }
});

// Вспомогательная функция для форматирования даты
function formatClientDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}


app.post('/api/test-upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'Файл не загружен'
        });
    }

    res.status(200).json({
        success: true,
        message: 'Файл успешно загружен',
        fileInfo: {
            originalName: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            path: req.file.path,
            mimetype: req.file.mimetype
        }
    });
});

// Эндпоинт для получения информации о лимитах (без авторизации)
app.get('/api/upload-limits', (req, res) => {
    res.status(200).json({
        limits: {
            // Лимиты Express по умолчанию
            expressJsonLimit: '100mb',
            expressUrlencodedLimit: '100mb',
            // Информация о multer лимитах
            multerFileSize: '100MB (в коде)',
            // Рекомендации для загрузки файлов
            recommended: 'Установите лимиты в коде или конфигурации сервера'
        }
    });
});

// Эндпоинт для тестирования админской загрузки БЕЗ ПАРОЛЯ
app.post('/api/test-admin-upload', upload.single('document'), (req, res) => {
    const { title } = req.body;
    
    if (!title) {
        return res.status(400).json({
            success: false,
            message: 'Необходимо указать название документа'
        });
    }

    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'Файл не загружен'
        });
    }

    res.status(200).json({
        success: true,
        message: 'Тест админской загрузки прошел успешно (без сохранения в БД)',
        testInfo: {
            title: title,
            file: {
                originalName: req.file.originalname,
                size: req.file.size,
                path: req.file.path,
                mimetype: req.file.mimetype
            }
        }
    });
});


app.use((err, req, res, next) => {
    console.error('!!! UNHANDLED ERROR:', err.stack);
    res.status(500).json({ message: 'Непредвиденная ошибка сервера' });
});

app.listen(port, () => {
    if (isProduction) {
        console.log('prodmode');
    } else {
        console.log('devmode');
    }
    console.log(`URL CORS: ${process.env.CLIENT_URL}`);
});
