const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.elesy.ru',
    port: 25,
    secure: false,
    tls: {
        rejectUnauthorized: false
    }
});
/*const transporter = nodemailer.createTransport({
    host: 'smtp.elesy.ru',
    port: 25,
    secure: false,
    auth: {
        user: '',
        pass: ''
    },
    tls: {
        rejectUnauthorized: false
    }
});*/


const supportEmail = 'eat@elesy.ru';
//const supportEmail = 'devsanya.ru';
const siteSenderEmail = 'scadaint.ru';

module.exports = {transporter, supportEmail, siteSenderEmail}
