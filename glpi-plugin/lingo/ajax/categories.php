<?php

/**
 * Endpoint JSON de categorias.
 */

use GlpiPlugin\Lingo\Api;
use GlpiPlugin\Lingo\Category;

require_once __DIR__ . '/../../../inc/includes.php';

$action = $_POST['action'] ?? $_GET['action'] ?? 'list';

try {
    Api::requireRead();

    switch ($action) {
        case 'list':
            Api::json(['categories' => Category::getForFrontend()]);
            break;

        default:
            Api::error(__('Ação inválida.', 'lingo'), 400);
    }
} catch (Throwable $error) {
    Api::error(__('Não foi possível carregar as categorias.', 'lingo'), 500);
}
