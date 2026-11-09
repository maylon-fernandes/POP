<?php

namespace GlpiPlugin\Lingo;

use CommonGLPI;
use Html;
use Session;

/**
 * Aba de permissões do Lingo em Administração > Perfis.
 */
class Profile extends \Profile
{
    /**
     * @param CommonGLPI $item
     * @param int        $withtemplate
     *
     * @return string
     */
    public function getTabNameForItem(CommonGLPI $item, $withtemplate = 0)
    {
        if ($item instanceof \Profile) {
            return __('Lingo', 'lingo');
        }

        return '';
    }

    /**
     * @param CommonGLPI $item
     * @param int        $tabnum
     * @param int        $withtemplate
     *
     * @return bool
     */
    public static function displayTabContentForItem(CommonGLPI $item, $tabnum = 1, $withtemplate = 0)
    {
        if ($item instanceof \Profile) {
            $profile = new self();
            $profile->showForProfile((int) $item->getID());
        }

        return true;
    }

    /**
     * @param int $profilesId
     *
     * @return void
     */
    public function showForProfile($profilesId)
    {
        if (!$this->can($profilesId, READ)) {
            return;
        }

        $canEdit = Session::haveRight('profile', UPDATE);

        echo "<div class='spaced'>";
        if ($canEdit) {
            echo "<form method='post' action='" . htmlspecialchars(self::getFormURL()) . "'>";
        }

        $this->displayRightsChoiceMatrix(
            [
                [
                    'itemtype' => Procedure::class,
                    'label'    => Procedure::getTypeName(Session::getPluralNumber()),
                    'field'    => Procedure::$rightname,
                ],
            ],
            [
                'canedit' => $canEdit,
                'title'   => __('Lingo', 'lingo'),
            ]
        );

        if ($canEdit) {
            echo "<div class='text-center'>";
            echo Html::hidden('id', ['value' => (int) $profilesId]);
            echo Html::submit(_sx('button', 'Save'), ['name' => 'update']);
            echo '</div>';
            Html::closeForm();
        }

        echo '</div>';
    }
}
