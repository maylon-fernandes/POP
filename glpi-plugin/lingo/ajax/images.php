<?php

/**
 * Endpoint JSON de imagens.
 */

use GlpiPlugin\Lingo\Api;
use GlpiPlugin\Lingo\Image;

require_once __DIR__ . '/../../../inc/includes.php';

$action = $_POST['action'] ?? $_GET['action'] ?? 'get';

try {
    Api::requireRead();

    if ($action === 'get') {
        Image::serve(Api::get('id', $_POST['id'] ?? ''));
    }

    if ($action === 'ids') {
        Api::json(['ids' => Image::getTokens()]);
    }

    Api::requireWrite();
    Api::csrf();

    switch ($action) {
        case 'upload':
            Api::json(['image' => Image::storeUpload($_FILES['file'] ?? [])]);
            break;

        case 'delete':
            $raw = $_POST['ids'] ?? '[]';
            $ids = is_string($raw) ? json_decode($raw, true) : null;
            if (!is_array($ids)) {
                Api::error(__('Lista de imagens inválida.', 'lingo'), 422);
            }
            Api::json(['deleted' => Image::deleteTokens($ids)]);
            break;

        default:
            Api::error(__('Ação inválida.', 'lingo'), 400);
    }
} catch (RuntimeException $error) {
    Api::error($error->getMessage(), 422);
} catch (Throwable $error) {
    if (class_exists('Toolbox')) {
        Toolbox::logInFile(
            'lingo',
            get_class($error) . ': ' . $error->getMessage() . "\n" . $error->getTraceAsString() . "\n"
        );
    }
    Api::error(__('Não foi possível processar a imagem.', 'lingo'), 500);
}
