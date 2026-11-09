<?php

namespace GlpiPlugin\Lingo;

use Session;

/**
 * Utilitários comuns dos endpoints JSON do plugin.
 */
final class Api
{
    /**
     * Encerra a requisição com JSON.
     *
     * @param mixed $data
     * @param int   $status
     *
     * @return void
     */
    public static function json($data, $status = 200)
    {
        http_response_code((int) $status);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Resposta de erro padronizada.
     *
     * @param string $message
     * @param int    $status
     *
     * @return void
     */
    public static function error($message, $status = 400)
    {
        self::json(['message' => (string) $message], $status);
    }

    /**
     * Exige usuário autenticado.
     *
     * @return void
     */
    public static function requireLogin()
    {
        if (!Session::getLoginUserID()) {
            self::error(__('Sessão expirada. Faça login novamente.', 'lingo'), 401);
        }
    }

    /**
     * Exige permissão de leitura no plugin.
     *
     * @return void
     */
    public static function requireRead()
    {
        self::requireLogin();

        if (!Procedure::canView()) {
            self::error(__('Você não tem permissão para consultar os procedimentos.', 'lingo'), 403);
        }
    }

    /**
     * Exige permissão de edição no plugin.
     *
     * @return void
     */
    public static function requireWrite()
    {
        self::requireRead();

        if (!Procedure::canUpdate()) {
            self::error(__('Apenas administradores podem alterar procedimentos.', 'lingo'), 403);
        }
    }

    /**
     * Valida o token CSRF em requisições de escrita.
     *
     * @return void
     */
    public static function csrf()
    {
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            self::error(__('Método não permitido.', 'lingo'), 405);
        }

        Session::checkCSRF($_POST);
    }

    /**
     * Retorna um parâmetro POST como string.
     *
     * @param string $key
     * @param string $default
     *
     * @return string
     */
    public static function post($key, $default = '')
    {
        if (!isset($_POST[$key]) || is_array($_POST[$key])) {
            return $default;
        }

        return trim((string) $_POST[$key]);
    }

    /**
     * Retorna um parâmetro GET como string.
     *
     * @param string $key
     * @param string $default
     *
     * @return string
     */
    public static function get($key, $default = '')
    {
        if (!isset($_GET[$key]) || is_array($_GET[$key])) {
            return $default;
        }

        return trim((string) $_GET[$key]);
    }

    /**
     * Decodifica um parâmetro JSON enviado em POST.
     *
     * @param string $key
     *
     * @return array
     */
    public static function jsonParam($key)
    {
        $raw = $_POST[$key] ?? '';
        if (!is_string($raw) || $raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    /**
     * Data/hora atual no padrão do GLPI.
     *
     * @return string
     */
    public static function now()
    {
        return $_SESSION['glpi_currenttime'] ?? date('Y-m-d H:i:s');
    }

    /**
     * Converte uma data do banco em ISO 8601 para o front-end.
     *
     * @param string|null $value
     *
     * @return string
     */
    public static function toIso($value)
    {
        if (!is_string($value) || $value === '') {
            return date('c');
        }

        $timestamp = strtotime($value);
        return $timestamp === false ? date('c') : date('c', $timestamp);
    }

    /**
     * Converte uma data recebida do front-end para o formato do banco.
     *
     * @param string|null $value
     * @param string      $fallback
     *
     * @return string
     */
    public static function toDbDate($value, $fallback)
    {
        if (!is_string($value) || trim($value) === '') {
            return $fallback;
        }

        $timestamp = strtotime($value);
        return $timestamp === false ? $fallback : date('Y-m-d H:i:s', $timestamp);
    }
}
