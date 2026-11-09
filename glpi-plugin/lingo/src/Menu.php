<?php

namespace GlpiPlugin\Lingo;

use CommonGLPI;
use Plugin;

/**
 * Entrada do Lingo no menu Ferramentas do GLPI.
 */
class Menu extends CommonGLPI
{
    /**
     * @param int $nb
     *
     * @return string
     */
    public static function getTypeName($nb = 0)
    {
        return __('Lingo', 'lingo');
    }

    /**
     * @return string
     */
    public static function getMenuName()
    {
        return self::getTypeName(1);
    }

    /**
     * @return array
     */
    public static function getMenuContent()
    {
        $web = Plugin::getWebDir('lingo');

        return [
            'title' => self::getMenuName(),
            'page'  => $web . '/front/app.php',
            'icon'  => 'ti ti-notebook',
            'links' => [],
        ];
    }

    /**
     * @return bool
     */
    public static function canView()
    {
        return Procedure::canView();
    }
}
