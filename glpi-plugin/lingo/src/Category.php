<?php

namespace GlpiPlugin\Lingo;

use CommonDBTM;

/**
 * Categorias de procedimentos.
 */
class Category extends CommonDBTM
{
    public static $rightname = 'plugin_lingo';

    /**
     * @param string|null $classname
     *
     * @return string
     */
    public static function getTable($classname = null)
    {
        return 'glpi_plugin_lingo_categories';
    }

    /**
     * @param int $nb
     *
     * @return string
     */
    public static function getTypeName($nb = 0)
    {
        return _n('Categoria do Lingo', 'Categorias do Lingo', $nb, 'lingo');
    }

    /**
     * Lista as categorias no formato esperado pelo front-end.
     *
     * @return array
     */
    public static function getForFrontend()
    {
        global $DB;

        $categories = [];
        $iterator = $DB->request([
            'FROM'  => self::getTable(),
            'ORDER' => ['position ASC', 'name ASC'],
        ]);

        foreach ($iterator as $row) {
            $categories[] = [
                'id'          => $row['slug'],
                'label'       => $row['name'],
                'icon'        => $row['icon'] ?: 'i-info',
                'description' => (string) $row['description'],
                'color'       => $row['color'] ?: '#8ab4f8',
                'soft'        => $row['soft'] ?: 'rgba(138, 180, 248, 0.16)',
            ];
        }

        return $categories;
    }

    /**
     * @param string $slug
     *
     * @return array|null
     */
    public static function getBySlug($slug)
    {
        global $DB;

        $iterator = $DB->request([
            'FROM'  => self::getTable(),
            'WHERE' => ['slug' => (string) $slug],
            'LIMIT' => 1,
        ]);

        foreach ($iterator as $row) {
            return $row;
        }

        return null;
    }

    /**
     * @param string $slug
     *
     * @return int
     */
    public static function getIdBySlug($slug)
    {
        $row = self::getBySlug($slug);
        return $row ? (int) $row['id'] : 0;
    }

    /**
     * @param int $id
     *
     * @return string
     */
    public static function getSlugById($id)
    {
        global $DB;

        $iterator = $DB->request([
            'SELECT' => 'slug',
            'FROM'   => self::getTable(),
            'WHERE'  => ['id' => (int) $id],
            'LIMIT'  => 1,
        ]);

        foreach ($iterator as $row) {
            return (string) $row['slug'];
        }

        return '';
    }
}
