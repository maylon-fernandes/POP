<?php

namespace GlpiPlugin\Lingo;

use CommonDBTM;
use Session;

/**
 * Procedimento operacional padrão (POP).
 */
class Procedure extends CommonDBTM
{
    public static $rightname = 'plugin_lingo';

    public const MAX_TITLE = 160;
    public const MAX_DESCRIPTION = 300;

    /**
     * @param string|null $classname
     *
     * @return string
     */
    public static function getTable($classname = null)
    {
        return 'glpi_plugin_lingo_procedures';
    }

    /**
     * @param int $nb
     *
     * @return string
     */
    public static function getTypeName($nb = 0)
    {
        return _n('Procedimento do Lingo', 'Procedimentos do Lingo', $nb, 'lingo');
    }

    /**
     * @return bool
     */
    public static function canView()
    {
        return Session::haveRight(self::$rightname, READ);
    }

    /**
     * @return bool
     */
    public static function canCreate()
    {
        return Session::haveRight(self::$rightname, CREATE);
    }

    /**
     * @return bool
     */
    public static function canUpdate()
    {
        return Session::haveRight(self::$rightname, UPDATE);
    }

    /**
     * @return bool
     */
    public static function canDelete()
    {
        return Session::haveRight(self::$rightname, DELETE);
    }

    /**
     * Lista todos os procedimentos no formato do front-end.
     *
     * @return array
     */
    public static function listAll()
    {
        global $DB;

        $categoryMap = [];
        $categories = $DB->request([
            'SELECT' => ['id', 'slug'],
            'FROM'   => Category::getTable(),
        ]);
        foreach ($categories as $category) {
            $categoryMap[(int) $category['id']] = (string) $category['slug'];
        }

        $procedures = [];
        $iterator = $DB->request([
            'FROM'  => self::getTable(),
            'WHERE' => ['is_deleted' => 0],
            'ORDER' => ['date_mod DESC', 'id DESC'],
        ]);

        foreach ($iterator as $row) {
            $procedures[] = self::toApi($row, $categoryMap);
        }

        return $procedures;
    }

    /**
     * @param string $externalId
     *
     * @return array|null
     */
    public static function getApiById($externalId)
    {
        $row = self::findRowByExternalId($externalId);
        if (!$row) {
            return null;
        }

        return self::toApi($row, null);
    }

    /**
     * @param string $externalId
     *
     * @return array|null
     */
    public static function findRowByExternalId($externalId)
    {
        global $DB;

        $externalId = trim((string) $externalId);
        if ($externalId === '') {
            return null;
        }

        $iterator = $DB->request([
            'FROM'  => self::getTable(),
            'WHERE' => [
                'external_id' => $externalId,
                'is_deleted'  => 0,
            ],
            'LIMIT' => 1,
        ]);

        foreach ($iterator as $row) {
            return $row;
        }

        return null;
    }

    /**
     * @param array      $row
     * @param array|null $categoryMap
     *
     * @return array
     */
    public static function toApi(array $row, $categoryMap = null)
    {
        $categorySlug = '';
        if (is_array($categoryMap)) {
            $categorySlug = $categoryMap[(int) $row['plugin_lingo_categories_id']] ?? '';
        } else {
            $categorySlug = Category::getSlugById((int) $row['plugin_lingo_categories_id']);
        }

        return [
            'id'            => (string) $row['external_id'],
            'title'         => (string) $row['name'],
            'category'      => $categorySlug,
            'description'   => (string) $row['description'],
            'content'       => (string) $row['content'],
            'contentFormat' => 'html',
            'createdAt'     => Api::toIso($row['date_creation']),
            'updatedAt'     => Api::toIso($row['date_mod']),
        ];
    }

    /**
     * Cria ou atualiza um procedimento.
     *
     * @param array $input
     *
     * @return array
     *
     * @throws \InvalidArgumentException
     */
    public static function save(array $input)
    {
        global $DB;

        $requestedId = trim((string) ($input['id'] ?? ''));
        $existing = $requestedId !== '' ? self::findRowByExternalId($requestedId) : null;

        $title = trim((string) ($input['title'] ?? ''));
        if ($title === '') {
            throw new \InvalidArgumentException(__('Informe um título para o procedimento.', 'lingo'));
        }
        if (mb_strlen($title, 'UTF-8') > self::MAX_TITLE) {
            throw new \InvalidArgumentException(sprintf(
                __('O título deve ter até %d caracteres.', 'lingo'),
                self::MAX_TITLE
            ));
        }

        $categorySlug = strtolower(trim((string) ($input['category'] ?? '')));
        $categoryId = Category::getIdBySlug($categorySlug);
        if ($categoryId <= 0) {
            throw new \InvalidArgumentException(__('Selecione uma categoria válida.', 'lingo'));
        }

        $description = trim((string) ($input['description'] ?? ''));
        if (mb_strlen($description, 'UTF-8') > self::MAX_DESCRIPTION) {
            $description = mb_substr($description, 0, self::MAX_DESCRIPTION, 'UTF-8');
        }

        $content = Sanitizer::html((string) ($input['content'] ?? ''));
        $now = Api::now();

        if ($existing) {
            $externalId = (string) $existing['external_id'];
            $dateCreation = (string) $existing['date_creation'];
            $dateMod = Api::toDbDate($input['updatedAt'] ?? '', $now);

            $DB->update(self::getTable(), [
                'name'                       => $title,
                'description'                => $description,
                'content'                    => $content,
                'plugin_lingo_categories_id' => $categoryId,
                'users_id'                   => (int) Session::getLoginUserID(),
                'date_mod'                   => $dateMod,
            ], ['id' => (int) $existing['id']]);
        } else {
            $externalId = $requestedId;
            if (
                $externalId === ''
                || preg_match('/^[A-Za-z0-9_-]{1,191}$/', $externalId) !== 1
                || self::findRowByExternalId($externalId) !== null
            ) {
                $externalId = 'pop_' . bin2hex(random_bytes(10));
            }

            $dateCreation = Api::toDbDate($input['createdAt'] ?? '', $now);
            $dateMod = Api::toDbDate($input['updatedAt'] ?? '', $dateCreation);

            $DB->insert(self::getTable(), [
                'external_id'                => $externalId,
                'name'                       => $title,
                'description'                => $description,
                'content'                    => $content,
                'plugin_lingo_categories_id' => $categoryId,
                'users_id'                   => (int) Session::getLoginUserID(),
                'is_deleted'                 => 0,
                'date_creation'              => $dateCreation,
                'date_mod'                   => $dateMod,
            ]);
        }

        $saved = self::findRowByExternalId($externalId);
        if (!$saved) {
            throw new \RuntimeException(__('Não foi possível salvar o procedimento.', 'lingo'));
        }

        self::syncImages((int) $saved['id'], $content);

        return self::toApi($saved, null);
    }

    /**
     * Importação em lote (upsert por identificador externo).
     *
     * @param array $records
     *
     * @return array
     */
    public static function bulkSave(array $records)
    {
        $created = 0;
        $updated = 0;
        $failed = 0;
        $errors = [];

        foreach ($records as $index => $record) {
            if (!is_array($record)) {
                $failed++;
                $errors[] = sprintf(__('Item %d: estrutura inválida.', 'lingo'), $index + 1);
                continue;
            }

            $id = trim((string) ($record['id'] ?? ''));
            $existing = $id !== '' ? self::findRowByExternalId($id) : null;

            try {
                self::save($record);
                if ($existing) {
                    $updated++;
                } else {
                    $created++;
                }
            } catch (\Throwable $error) {
                $failed++;
                $errors[] = sprintf(
                    __('Item %d: %s', 'lingo'),
                    $index + 1,
                    $error->getMessage()
                );
            }
        }

        return [
            'created' => $created,
            'updated' => $updated,
            'failed'  => $failed,
            'errors'  => $errors,
        ];
    }

    /**
     * Atualiza somente o conteúdo (checklists do leitor).
     *
     * @param string $externalId
     * @param string $content
     *
     * @return array
     *
     * @throws \InvalidArgumentException
     */
    public static function saveContent($externalId, $content)
    {
        global $DB;

        $row = self::findRowByExternalId($externalId);
        if (!$row) {
            throw new \InvalidArgumentException(__('Procedimento não encontrado.', 'lingo'));
        }

        $sanitized = Sanitizer::html((string) $content);

        $DB->update(self::getTable(), [
            'content'  => $sanitized,
            'users_id' => (int) Session::getLoginUserID(),
            'date_mod' => Api::now(),
        ], ['id' => (int) $row['id']]);

        self::syncImages((int) $row['id'], $sanitized);

        $saved = self::findRowByExternalId($externalId);
        if (!$saved) {
            throw new \RuntimeException(__('Não foi possível salvar o procedimento.', 'lingo'));
        }

        return self::toApi($saved, null);
    }

    /**
     * Exclui definitivamente um procedimento e as imagens órfãs.
     *
     * @param string $externalId
     *
     * @return bool
     *
     * @throws \InvalidArgumentException
     */
    public static function deleteByExternalId($externalId)
    {
        global $DB;

        $row = self::findRowByExternalId($externalId);
        if (!$row) {
            throw new \InvalidArgumentException(__('Procedimento não encontrado.', 'lingo'));
        }

        $tokens = Image::extractTokens((string) $row['content']);
        $DB->delete(self::getTable(), ['id' => (int) $row['id']]);

        if (count($tokens) > 0) {
            Image::deleteUnreferenced($tokens);
        }

        return true;
    }

    /**
     * Associa imagens usadas no conteúdo ao procedimento.
     *
     * @param int    $procedureId
     * @param string $content
     *
     * @return void
     */
    public static function syncImages($procedureId, $content)
    {
        global $DB;

        $tokens = Image::extractTokens((string) $content);
        if (count($tokens) === 0) {
            return;
        }

        $DB->update(Image::getTable(), [
            'plugin_lingo_procedures_id' => (int) $procedureId,
        ], ['token' => $tokens]);
    }
}
