<?php

/**
 * Serve uma imagem do Lingo para usuários autenticados.
 */

use GlpiPlugin\Lingo\Image;
use GlpiPlugin\Lingo\Procedure;

require_once __DIR__ . '/../../../inc/includes.php';

Session::checkLoginUser();

if (!Procedure::canView()) {
    http_response_code(403);
    exit;
}

Image::serve(isset($_GET['id']) && is_string($_GET['id']) ? $_GET['id'] : '');
