<?php

/**
 * Endpoint JSON de procedimentos.
 */

use GlpiPlugin\Lingo\Api;
use GlpiPlugin\Lingo\Procedure;

require_once __DIR__ . '/../../../inc/includes.php';

$action = $_POST['action'] ?? $_GET['action'] ?? 'list';

try {
    switch ($action) {
        case 'list':
            Api::requireRead();
            Api::json(['procedures' => Procedure::listAll()]);
            break;

        case 'get':
            Api::requireRead();
            $id = Api::get('id', $_POST['id'] ?? '');
            $procedure = Procedure::getApiById($id);
            if ($procedure === null) {
                Api::error(__('Procedimento não encontrado.', 'lingo'), 404);
            }
            Api::json(['procedure' => $procedure]);
            break;

        case 'save':
            Api::requireWrite();
            Api::csrf();
            Api::json(['procedure' => Procedure::save($_POST)]);
            break;

        case 'bulk_save':
            Api::requireWrite();
            Api::csrf();
            $records = Api::jsonParam('records');
            if (count($records) === 0) {
                Api::error(__('Nenhum procedimento foi informado.', 'lingo'), 422);
            }
            Api::json(['result' => Procedure::bulkSave($records)]);
            break;

        case 'save_content':
            Api::requireWrite();
            Api::csrf();
            $content = $_POST['content'] ?? '';
            if (!is_string($content)) {
                Api::error(__('Conteúdo inválido.', 'lingo'), 422);
            }
            Api::json([
                'procedure' => Procedure::saveContent(
                    Api::post('id'),
                    $content
                ),
            ]);
            break;

        case 'delete':
            Api::requireWrite();
            Api::csrf();
            Procedure::deleteByExternalId(Api::post('id'));
            Api::json(['deleted' => true]);
            break;

        case 'ping':
            Api::requireRead();
            Api::json(['ok' => true]);
            break;

        default:
            Api::error(__('Ação inválida.', 'lingo'), 400);
    }
} catch (InvalidArgumentException $error) {
    Api::error($error->getMessage(), 422);
} catch (Throwable $error) {
    if (class_exists('Toolbox')) {
        Toolbox::logInFile(
            'lingo',
            get_class($error) . ': ' . $error->getMessage() . "\n" . $error->getTraceAsString() . "\n"
        );
    }
    Api::error(__('Não foi possível concluir a operação. Consulte os logs do GLPI.', 'lingo'), 500);
}
