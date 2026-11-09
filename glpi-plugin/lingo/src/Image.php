<?php

namespace GlpiPlugin\Lingo;

use CommonDBTM;
use finfo;
use Session;

/**
 * Imagens dos procedimentos.
 *
 * Os arquivos ficam em GLPI_PLUGIN_DOC_DIR/lingo/images e são servidos
 * exclusivamente por front/image.php após validação de sessão/permissão.
 */
class Image extends CommonDBTM
{
    public const MAX_FILE_SIZE = 8388608; // 8 MB

    public static $rightname = 'plugin_lingo';

    /**
     * @param string|null $classname
     *
     * @return string
     */
    public static function getTable($classname = null)
    {
        return 'glpi_plugin_lingo_images';
    }

    /**
     * @param int $nb
     *
     * @return string
     */
    public static function getTypeName($nb = 0)
    {
        return _n('Imagem do Lingo', 'Imagens do Lingo', $nb, 'lingo');
    }

    /**
     * Tipos permitidos. SVG é intencionalmente bloqueado.
     *
     * @return array
     */
    public static function allowedMimes()
    {
        return [
            'image/png'  => 'png',
            'image/jpeg' => 'jpg',
            'image/gif'  => 'gif',
            'image/webp' => 'webp',
            'image/bmp'  => 'bmp',
            'image/avif' => 'avif',
        ];
    }

    /**
     * @return string
     */
    public static function getDirectory()
    {
        $base = defined('GLPI_PLUGIN_DOC_DIR')
            ? GLPI_PLUGIN_DOC_DIR
            : GLPI_ROOT . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . '_plugins';

        return $base . DIRECTORY_SEPARATOR . 'lingo' . DIRECTORY_SEPARATOR . 'images';
    }

    /**
     * @return bool
     */
    public static function ensureDirectory()
    {
        $dir = self::getDirectory();
        if (is_dir($dir)) {
            return true;
        }

        return @mkdir($dir, 0755, true);
    }

    /**
     * @return string
     */
    public static function generateToken()
    {
        return 'img_' . bin2hex(random_bytes(12));
    }

    /**
     * Armazena um upload recebido via multipart/form-data.
     *
     * @param array $file
     *
     * @return array
     *
     * @throws \RuntimeException
     */
    public static function storeUpload(array $file)
    {
        global $DB;

        if (!isset($file['tmp_name'], $file['size']) || !is_uploaded_file($file['tmp_name'])) {
            throw new \RuntimeException(__('Nenhum arquivo de imagem foi recebido.', 'lingo'));
        }

        $size = (int) $file['size'];
        if ($size <= 0 || $size > self::MAX_FILE_SIZE) {
            throw new \RuntimeException(__('A imagem deve ter até 8 MB.', 'lingo'));
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $finfo->file($file['tmp_name']);
        $allowed = self::allowedMimes();

        if (!isset($allowed[$mime])) {
            throw new \RuntimeException(__('Formato não suportado. Use PNG, JPG, GIF, WebP, BMP ou AVIF.', 'lingo'));
        }

        if ($mime !== 'image/avif' && @getimagesize($file['tmp_name']) === false) {
            throw new \RuntimeException(__('O arquivo enviado não é uma imagem válida.', 'lingo'));
        }

        self::ensureDirectory();
        $token = self::generateToken();
        $path = self::getPath($token);

        if (!move_uploaded_file($file['tmp_name'], $path)) {
            throw new \RuntimeException(__('Não foi possível gravar a imagem.', 'lingo'));
        }

        $filename = isset($file['name']) ? basename((string) $file['name']) : $token;
        $filename = mb_substr($filename, 0, 255, 'UTF-8');

        $inserted = $DB->insert(self::getTable(), [
            'token'                      => $token,
            'plugin_lingo_procedures_id' => 0,
            'users_id'                   => (int) Session::getLoginUserID(),
            'filename'                   => $filename,
            'mime'                       => $mime,
            'size'                       => $size,
            'date_creation'              => Api::now(),
        ]);

        if (!$inserted) {
            @unlink($path);
            throw new \RuntimeException(__('Não foi possível registrar a imagem.', 'lingo'));
        }

        return [
            'id'   => $token,
            'name' => $filename,
            'mime' => $mime,
            'size' => $size,
        ];
    }

    /**
     * Armazena uma imagem data: URL (usado na importação server-side/CLI).
     *
     * @param string $dataUrl
     * @param string $filename
     *
     * @return array
     *
     * @throws \RuntimeException
     */
    public static function storeDataUrl($dataUrl, $filename = 'imagem')
    {
        global $DB;

        if (preg_match('/^data:(image\/(?:png|jpe?g|gif|webp|bmp|avif));base64,(.+)$/is', trim((string) $dataUrl), $matches) !== 1) {
            throw new \RuntimeException(__('Imagem incorporada inválida.', 'lingo'));
        }

        $mime = strtolower($matches[1]);
        if ($mime === 'image/jpg') {
            $mime = 'image/jpeg';
        }

        $binary = base64_decode(preg_replace('/\s+/', '', $matches[2]), true);
        if ($binary === false || $binary === '') {
            throw new \RuntimeException(__('Não foi possível decodificar a imagem.', 'lingo'));
        }

        $size = strlen($binary);
        if ($size > self::MAX_FILE_SIZE) {
            throw new \RuntimeException(__('A imagem deve ter até 8 MB.', 'lingo'));
        }

        $allowed = self::allowedMimes();
        if (!isset($allowed[$mime])) {
            throw new \RuntimeException(__('Formato de imagem não suportado.', 'lingo'));
        }

        self::ensureDirectory();
        $token = self::generateToken();
        $path = self::getPath($token);

        if (file_put_contents($path, $binary) === false) {
            throw new \RuntimeException(__('Não foi possível gravar a imagem.', 'lingo'));
        }

        $filename = mb_substr(basename((string) $filename), 0, 255, 'UTF-8');
        $inserted = $DB->insert(self::getTable(), [
            'token'                      => $token,
            'plugin_lingo_procedures_id' => 0,
            'users_id'                   => (int) Session::getLoginUserID(),
            'filename'                   => $filename,
            'mime'                       => $mime,
            'size'                       => $size,
            'date_creation'              => Api::now(),
        ]);

        if (!$inserted) {
            @unlink($path);
            throw new \RuntimeException(__('Não foi possível registrar a imagem.', 'lingo'));
        }

        return [
            'id'   => $token,
            'name' => $filename,
            'mime' => $mime,
            'size' => $size,
        ];
    }

    /**
     * @param string $token
     *
     * @return string
     */
    public static function getPath($token)
    {
        return self::getDirectory() . DIRECTORY_SEPARATOR . $token;
    }

    /**
     * @param string $token
     *
     * @return array|null
     */
    public static function getByToken($token)
    {
        global $DB;

        if (preg_match('/^img_[a-z0-9]+$/i', (string) $token) !== 1) {
            return null;
        }

        $iterator = $DB->request([
            'FROM'  => self::getTable(),
            'WHERE' => ['token' => (string) $token],
            'LIMIT' => 1,
        ]);

        foreach ($iterator as $row) {
            return $row;
        }

        return null;
    }

    /**
     * Envia a imagem para o navegador.
     *
     * @param string $token
     *
     * @return void
     */
    public static function serve($token)
    {
        $row = self::getByToken($token);
        if (!$row) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=UTF-8');
            echo 'Imagem não encontrada.';
            exit;
        }

        $path = self::getPath($row['token']);
        if (!is_file($path)) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=UTF-8');
            echo 'Arquivo da imagem não encontrado.';
            exit;
        }

        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        $mime = (string) $row['mime'];
        if (!isset(self::allowedMimes()[$mime])) {
            $mime = 'application/octet-stream';
        }

        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: inline; filename="' . rawurlencode((string) $row['filename']) . '"');
        header('Cache-Control: private, max-age=3600');
        header('X-Content-Type-Options: nosniff');
        readfile($path);
        exit;
    }

    /**
     * Lista os tokens existentes.
     *
     * @return array
     */
    public static function getTokens()
    {
        global $DB;

        $tokens = [];
        $iterator = $DB->request([
            'SELECT' => 'token',
            'FROM'   => self::getTable(),
            'ORDER'  => ['id ASC'],
        ]);

        foreach ($iterator as $row) {
            $tokens[] = (string) $row['token'];
        }

        return $tokens;
    }

    /**
     * Remove imagens por token.
     *
     * @param array $tokens
     *
     * @return int
     */
    public static function deleteTokens(array $tokens)
    {
        global $DB;

        $valid = [];
        foreach ($tokens as $token) {
            if (is_string($token) && preg_match('/^img_[a-z0-9]+$/i', $token) === 1) {
                $valid[] = $token;
            }
        }

        if (count($valid) === 0) {
            return 0;
        }

        $valid = array_values(array_unique($valid));
        $DB->delete(self::getTable(), ['token' => $valid]);

        foreach ($valid as $token) {
            $path = self::getPath($token);
            if (is_file($path)) {
                @unlink($path);
            }
        }

        return count($valid);
    }

    /**
     * Extrai tokens referenciados em um HTML.
     *
     * @param string $content
     *
     * @return array
     */
    public static function extractTokens($content)
    {
        $tokens = [];
        if (preg_match_all('/data-image-id="(img_[a-z0-9]+)"/i', (string) $content, $matches)) {
            $tokens = array_values(array_unique($matches[1]));
        }

        return $tokens;
    }

    /**
     * Remove imagens que não são referenciadas por nenhum procedimento.
     *
     * @param array $tokens
     *
     * @return int
     */
    public static function deleteUnreferenced(array $tokens)
    {
        global $DB;

        $deleted = 0;
        foreach ($tokens as $token) {
            if (preg_match('/^img_[a-z0-9]+$/i', (string) $token) !== 1) {
                continue;
            }

            $iterator = $DB->request([
                'SELECT' => 'id',
                'FROM'   => Procedure::getTable(),
                'WHERE'  => [
                    'is_deleted' => 0,
                    'content'    => ['LIKE', '%data-image-id="' . $token . '"%'],
                ],
                'LIMIT'  => 1,
            ]);

            if (count($iterator) === 0) {
                self::deleteTokens([$token]);
                $deleted++;
            }
        }

        return $deleted;
    }
}
