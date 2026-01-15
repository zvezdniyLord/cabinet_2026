<?php

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require 'vendor/autoload.php';

// Проверяем, был ли загружен файл
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode(['message' => 'Файл не загружен']);
    exit;
}

// Проверка максимального размера файла (например, 10 МБ)
$maxFileSize = 10 * 1024 * 1024; // 10 МБ
if ($_FILES['file']['size'] > $maxFileSize) {
    echo json_encode(['message' => 'Файл слишком большой']);
    exit;
}

// Проверка расширения файла
$allowedExtensions = ['xlsx'];
$tmpName = $_FILES['file']['tmp_name'];
$name = basename($_FILES['file']['name']);

// Извлекаем расширение файла
$extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
if (!in_array($extension, $allowedExtensions)) {
    echo json_encode(['message' => 'Недопустимый формат файла']);
    exit;
}

// Перемещаем файл во временную папку
$tempPath = sys_get_temp_dir() . '/' . uniqid('excel_', true) . '.xlsx';
if (!move_uploaded_file($tmpName, $tempPath)) {
    echo json_encode(['message' => 'Ошибка при сохранении файла']);
    exit;
}

// === Отправка письма с одним файлом ===
$mail = new PHPMailer(true);
try {
    $mail->isHTML(false);
    $mail->CharSet = 'UTF-8';
    $mail->isSMTP();
    $mail->Host = 'smtp.elesy.ru';
    $mail->Port = 25;
    $mail->SMTPAuth = false;
    $mail->Username = 'noreply.scadaint@scadaint.ru';
    $mail->setFrom('noreply.scadaint@scadaint.ru', 'scadaint.ru');
    $mail->addAddress('commerce@scadaint.ru'); // Получатель
    $mail->Subject = 'Новый опросный лист';

    $userName = $_POST['name'] ?? 'Не указано';
    $fio = $_POST['fio'] ?? 'Не указано';
    $org = $_POST['organization'] ?? 'Не указано';
    $phone = $_POST['phone'] ?? 'Не указано';
    $email = $_POST['email'] ?? 'Не указано';
    $customer = $_POST['customer'] ?? 'Не указано';
    $object = $_POST['object'] ?? 'Не указано';

    $mail->addAttachment($tempPath, $name); // Прикрепляем файл

    $mail->Body = "Здравствуйте,\n\n"
        . "Отправлено пользователем:\n"
        . "ФИО: $fio\n"
        . "Телефон: $phone\n"
        . "Email: $email\n"
        . "Организация: $org\n"
        . "Конечный заказчик: $customer\n"
        . "Объект: $object\n\n"
        . "Во вложении вы найдете опросный лист.";
    $mail->send();
    if (file_exists($tempPath)) {
        unlink($tempPath);
    }
    echo json_encode(['message' => 'Файл успешно отправлен']);
} catch (Exception $e) {
    if (file_exists($tempPath)) {
        unlink($tempPath);
    }
    echo json_encode(['message' => 'Ошибка отправки: ' . $mail->ErrorInfo]);
}

