<?php

/**
 * Lingo - Procedimentos Operacionais Padrão para GLPI.
 *
 * Plugin de documentação técnica com armazenamento centralizado no GLPI.
 */

use Glpi\Plugin\Hooks;
use GlpiPlugin\Lingo\Category;
use GlpiPlugin\Lingo\Image;
use GlpiPlugin\Lingo\Menu;
use GlpiPlugin\Lingo\Procedure;
use GlpiPlugin\Lingo\Profile;

define('PLUGIN_LINGO_VERSION', '1.0.0');
define('PLUGIN_LINGO_MIN_GLPI', '10.0.0');
define('PLUGIN_LINGO_MAX_GLPI', '10.0.99');

/**
 * Registra hooks e classes do plugin.
 */
function plugin_init_lingo()
{
    global $PLUGIN_HOOKS;

    // Os endpoints AJAX validam o token CSRF do GLPI.
    $PLUGIN_HOOKS['csrf_compliant']['lingo'] = true;

    Plugin::registerClass(Procedure::class);
    Plugin::registerClass(Category::class);
    Plugin::registerClass(Image::class);

    // Aba de permissões em Administração > Perfis.
    Plugin::registerClass(Profile::class, ['addtabon' => ['Profile']]);

    if (Session::getLoginUserID() && Procedure::canView()) {
        // Item principal na navbar superior: "Procedimentos"
        $PLUGIN_HOOKS['menu']['lingo'] = [
            'title' => __('Procedimentos', 'lingo'),
            'page'  => '/plugins/lingo/front/app.php',
            'icon'  => 'ti ti-notebook',
        ];

        // Mantém também no menu Ferramentas (opcional, remova se não quiser)
        $PLUGIN_HOOKS['menu_toadd']['lingo'] = [
            'tools' => Menu::class,
        ];
    }
}

/**
 * Metadados exibidos na tela de plugins.
 */
function plugin_version_lingo()
{
    return [
        'name'         => 'Lingo',
        'version'      => PLUGIN_LINGO_VERSION,
        'author'       => 'Lingo',
        'license'      => 'GPLv2+',
        'homepage'     => '',
        'requirements' => [
            'glpi' => [
                'min' => PLUGIN_LINGO_MIN_GLPI,
                'max' => PLUGIN_LINGO_MAX_GLPI,
            ],
            'php'  => [
                'min' => '7.4',
            ],
        ],
    ];
}

/**
 * Verificações mínimas antes da instalação.
 *
 * @return bool
 */
function plugin_lingo_check_prerequisites()
{
    if (!version_compare(GLPI_VERSION, PLUGIN_LINGO_MIN_GLPI, '>=')) {
        if (method_exists('Plugin', 'messageIncompatible')) {
            Plugin::messageIncompatible('glpi', PLUGIN_LINGO_MIN_GLPI, PLUGIN_LINGO_MAX_GLPI);
        }
        return false;
    }

    if (!extension_loaded('dom') || !extension_loaded('fileinfo')) {
        if (method_exists('Plugin', 'messageIncompatible')) {
            Plugin::messageIncompatible('php');
        }
        return false;
    }

    return true;
}

/**
 * Configuração adicional (não há configuração obrigatória).
 *
 * @param bool $verbose
 *
 * @return bool
 */
function plugin_lingo_check_config($verbose = false)
{
    if ($verbose) {
        echo __('Lingo está pronto para uso.', 'lingo');
    }

    return true;
}
