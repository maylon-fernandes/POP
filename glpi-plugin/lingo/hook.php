<?php

/**
 * Instalação, atualização e remoção do plugin Lingo.
 */

use GlpiPlugin\Lingo\Category;
use GlpiPlugin\Lingo\Image;
use GlpiPlugin\Lingo\Procedure;

/**
 * Cria as tabelas, popula as categorias iniciais e registra as permissões.
 *
 * @return bool
 */
function plugin_lingo_install()
{
    global $DB;

    $default_charset   = DBConnection::getDefaultCharset();
    $default_collation = DBConnection::getDefaultCollation();
    $default_key_sign  = DBConnection::getDefaultPrimaryKeySignOption();
    $now               = $_SESSION['glpi_currenttime'] ?? date('Y-m-d H:i:s');

    if (!$DB->tableExists(Category::getTable())) {
        $query = "CREATE TABLE `" . Category::getTable() . "` (
            `id` int {$default_key_sign} NOT NULL AUTO_INCREMENT,
            `slug` varchar(64) NOT NULL,
            `name` varchar(255) NOT NULL,
            `description` text,
            `icon` varchar(64) DEFAULT NULL,
            `color` varchar(20) DEFAULT NULL,
            `soft` varchar(64) DEFAULT NULL,
            `position` int NOT NULL DEFAULT 0,
            `date_creation` datetime DEFAULT NULL,
            `date_mod` datetime DEFAULT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `slug` (`slug`)
        ) ENGINE=InnoDB DEFAULT CHARSET={$default_charset} COLLATE={$default_collation} ROW_FORMAT=DYNAMIC;";

        if (!$DB->query($query)) {
            return false;
        }
    }

    if (!$DB->tableExists(Procedure::getTable())) {
        $query = "CREATE TABLE `" . Procedure::getTable() . "` (
            `id` int {$default_key_sign} NOT NULL AUTO_INCREMENT,
            `external_id` varchar(191) NOT NULL,
            `name` varchar(255) NOT NULL,
            `description` varchar(300) DEFAULT NULL,
            `content` longtext,
            `plugin_lingo_categories_id` int {$default_key_sign} NOT NULL DEFAULT 0,
            `users_id` int {$default_key_sign} NOT NULL DEFAULT 0,
            `is_deleted` tinyint NOT NULL DEFAULT 0,
            `date_creation` datetime DEFAULT NULL,
            `date_mod` datetime DEFAULT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `external_id` (`external_id`),
            KEY `plugin_lingo_categories_id` (`plugin_lingo_categories_id`),
            KEY `users_id` (`users_id`),
            KEY `is_deleted` (`is_deleted`),
            KEY `date_mod` (`date_mod`)
        ) ENGINE=InnoDB DEFAULT CHARSET={$default_charset} COLLATE={$default_collation} ROW_FORMAT=DYNAMIC;";

        if (!$DB->query($query)) {
            return false;
        }
    }

    if (!$DB->tableExists(Image::getTable())) {
        $query = "CREATE TABLE `" . Image::getTable() . "` (
            `id` int {$default_key_sign} NOT NULL AUTO_INCREMENT,
            `token` varchar(64) NOT NULL,
            `plugin_lingo_procedures_id` int {$default_key_sign} NOT NULL DEFAULT 0,
            `users_id` int {$default_key_sign} NOT NULL DEFAULT 0,
            `filename` varchar(255) DEFAULT NULL,
            `mime` varchar(100) NOT NULL,
            `size` int {$default_key_sign} NOT NULL DEFAULT 0,
            `date_creation` datetime DEFAULT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `token` (`token`),
            KEY `plugin_lingo_procedures_id` (`plugin_lingo_procedures_id`),
            KEY `users_id` (`users_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET={$default_charset} COLLATE={$default_collation} ROW_FORMAT=DYNAMIC;";

        if (!$DB->query($query)) {
            return false;
        }
    }

    // Categorias iniciais. A lista é a mesma exibida pelo front-end.
    $categories = [
        [
            'slug'        => 'sistema',
            'name'        => 'Sistema',
            'icon'        => 'i-software',
            'description' => 'Instalação, configuração de aplicativos, e-mail e resolução de erros.',
            'color'       => '#8ab4f8',
            'soft'        => 'rgba(110, 168, 254, 0.16)',
            'position'    => 10,
        ],
        [
            'slug'        => 'hardware',
            'name'        => 'Hardware',
            'icon'        => 'i-hardware',
            'description' => 'Manutenção, componentes, periféricos e diagnóstico de equipamentos.',
            'color'       => '#ffda6a',
            'soft'        => 'rgba(255, 218, 106, 0.15)',
            'position'    => 20,
        ],
        [
            'slug'        => 'rede',
            'name'        => 'Rede',
            'icon'        => 'i-network',
            'description' => 'Conectividade, IP, DNS, DHCP, Wi-Fi, switches e roteadores.',
            'color'       => '#20c997',
            'soft'        => 'rgba(32, 201, 151, 0.16)',
            'position'    => 30,
        ],
        [
            'slug'        => 'tasy',
            'name'        => 'Tasy',
            'icon'        => 'i-tasy',
            'description' => 'Procedimentos e configurações do sistema Tasy.',
            'color'       => '#e6a6f0',
            'soft'        => 'rgba(217, 130, 232, 0.16)',
            'position'    => 40,
        ],
    ];

    foreach ($categories as $category) {
        $existing = $DB->request([
            'SELECT' => 'id',
            'FROM'   => Category::getTable(),
            'WHERE'  => ['slug' => $category['slug']],
            'LIMIT'  => 1,
        ]);

        if (count($existing) === 0) {
            $DB->insert(Category::getTable(), $category + [
                'date_creation' => $now,
                'date_mod'      => $now,
            ]);
        }
    }

    // Diretório de imagens fora da pasta do plugin.
    Image::ensureDirectory();

    $migration = new Migration(PLUGIN_LINGO_VERSION);

    // Administradores (perfis com permissão de configuração) podem editar.
    $migration->addRight(
        Procedure::$rightname,
        READ | UPDATE | CREATE | DELETE,
        ['config' => UPDATE]
    );

    // Demais perfis recebem somente leitura.
    $migration->addRight(Procedure::$rightname, READ, []);

    return true;
}

/**
 * Remove tabelas, permissões e arquivos do plugin.
 *
 * @return bool
 */
function plugin_lingo_uninstall()
{
    global $DB;

    if ($DB->tableExists(Image::getTable())) {
        $DB->query('DROP TABLE `' . Image::getTable() . '`');
    }
    if ($DB->tableExists(Procedure::getTable())) {
        $DB->query('DROP TABLE `' . Procedure::getTable() . '`');
    }
    if ($DB->tableExists(Category::getTable())) {
        $DB->query('DROP TABLE `' . Category::getTable() . '`');
    }

    ProfileRight::deleteProfileRights([Procedure::$rightname]);

    $dir = defined('GLPI_PLUGIN_DOC_DIR')
        ? GLPI_PLUGIN_DOC_DIR . DIRECTORY_SEPARATOR . 'lingo'
        : '';

    if ($dir !== '' && is_dir($dir)) {
        plugin_lingo_remove_directory($dir);
    }

    return true;
}

/**
 * Remove um diretório recursivamente, apenas dentro da área de documentos.
 *
 * @param string $dir
 *
 * @return void
 */
function plugin_lingo_remove_directory($dir)
{
    $base = rtrim(GLPI_PLUGIN_DOC_DIR, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    $real = realpath($dir);
    $baseReal = realpath(rtrim(GLPI_PLUGIN_DOC_DIR, DIRECTORY_SEPARATOR));

    if ($real === false || $baseReal === false || strpos($real, $baseReal . DIRECTORY_SEPARATOR) !== 0) {
        return;
    }

    $items = scandir($real);
    if ($items === false) {
        return;
    }

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $real . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path) && !is_link($path)) {
            plugin_lingo_remove_directory($path);
        } elseif (is_file($path) || is_link($path)) {
            @unlink($path);
        }
    }

    @rmdir($real);
}
