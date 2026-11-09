<?php

namespace GlpiPlugin\Lingo;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;

/**
 * Sanitizador HTML conservador para o conteúdo dos procedimentos.
 *
 * O front-end também sanitiza o conteúdo antes de renderizar. Esta camada
 * protege o banco contra requisições feitas fora do SPA.
 */
final class Sanitizer
{
    private const ALLOWED_TAGS = [
        'p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr',
        'a', 'img', 'input', 'span', 'figure', 'figcaption',
        'sub', 'sup', 'mark',
    ];

    private const DROP_TAGS = [
        'script', 'style', 'template', 'iframe', 'object', 'embed', 'applet',
        'link', 'meta', 'base', 'form', 'textarea', 'select', 'option',
        'optgroup', 'button', 'svg', 'math', 'video', 'audio', 'source',
        'track', 'canvas', 'noscript', 'frame', 'frameset', 'head', 'title',
    ];

    private const ALLOWED_CLASSES = [
        'doc-image', 'img-w-25', 'img-w-50', 'img-w-75', 'img-w-100',
        'img-align-left', 'img-align-center', 'img-align-right',
        'task-list', 'task-checkbox', 'callout', 'small',
    ];

    /**
     * Sanitiza um fragmento HTML.
     *
     * @param string $html
     *
     * @return string
     */
    public static function html($html)
    {
        $html = trim((string) $html);
        if ($html === '') {
            return '';
        }

        $doc = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML(
            '<?xml encoding="utf-8" ?><div id="lingo-root">' . $html . '</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
        );
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $xpath = new DOMXPath($doc);
        $roots = $xpath->query('//div[@id="lingo-root"]');
        if ($roots === false || $roots->length === 0) {
            return '';
        }

        $root = $roots->item(0);
        self::sanitizeChildren($root);

        $output = '';
        foreach ($root->childNodes as $child) {
            $output .= $doc->saveHTML($child);
        }

        return trim($output);
    }

    /**
     * @param DOMNode $parent
     *
     * @return void
     */
    private static function sanitizeChildren(DOMNode $parent)
    {
        $children = [];
        foreach ($parent->childNodes as $child) {
            $children[] = $child;
        }

        foreach ($children as $child) {
            self::sanitizeNode($child);
        }
    }

    /**
     * @param DOMNode $node
     *
     * @return void
     */
    private static function sanitizeNode(DOMNode $node)
    {
        if ($node->nodeType === XML_TEXT_NODE) {
            return;
        }

        if ($node->nodeType !== XML_ELEMENT_NODE || !$node->parentNode) {
            if ($node->parentNode) {
                $node->parentNode->removeChild($node);
            }
            return;
        }

        /** @var DOMElement $node */
        $tag = strtolower($node->nodeName);

        if (in_array($tag, self::DROP_TAGS, true)) {
            $node->parentNode->removeChild($node);
            return;
        }

        if (!in_array($tag, self::ALLOWED_TAGS, true)) {
            self::sanitizeChildren($node);
            self::unwrap($node);
            return;
        }

        if ($tag === 'input') {
            self::sanitizeInput($node);
            return;
        }

        if ($tag === 'img') {
            self::sanitizeImage($node);
            return;
        }

        self::cleanAttributes($node, $tag);
        self::sanitizeChildren($node);
    }

    /**
     * @param DOMElement $element
     *
     * @return void
     */
    private static function sanitizeInput(DOMElement $element)
    {
        $type = strtolower($element->getAttribute('type'));
        if ($type !== 'checkbox') {
            if ($element->parentNode) {
                $element->parentNode->removeChild($element);
            }
            return;
        }

        $checked = $element->hasAttribute('checked');
        self::stripAttributes($element);
        $element->setAttribute('type', 'checkbox');
        $element->setAttribute('contenteditable', 'false');
        $element->setAttribute('class', 'task-checkbox');
        if ($checked) {
            $element->setAttribute('checked', 'checked');
        }
    }

    /**
     * @param DOMElement $element
     *
     * @return void
     */
    private static function sanitizeImage(DOMElement $element)
    {
        $id = trim($element->getAttribute('data-image-id'));
        $hasId = preg_match('/^img_[a-z0-9]+$/i', $id) === 1;
        $src = trim($element->getAttribute('src'));
        $safeSrc = self::isSafeImageSource($src);

        if (!$hasId && !$safeSrc) {
            if ($element->parentNode) {
                $element->parentNode->removeChild($element);
            }
            return;
        }

        $classes = self::filterClasses($element->getAttribute('class'), 'img');
        $alt = substr($element->getAttribute('alt'), 0, 300);
        $title = substr($element->getAttribute('title'), 0, 300);
        $width = $element->getAttribute('width');
        $height = $element->getAttribute('height');

        self::stripAttributes($element);

        if ($hasId) {
            $element->setAttribute('data-image-id', $id);
        }
        $element->setAttribute('class', $classes !== '' ? $classes . ' doc-image' : 'doc-image');
        if ($safeSrc && !$hasId) {
            $element->setAttribute('src', $src);
        }
        if ($alt !== '') {
            $element->setAttribute('alt', $alt);
        }
        if ($title !== '') {
            $element->setAttribute('title', $title);
        }
        if (preg_match('/^\d{1,5}$/', $width) === 1) {
            $element->setAttribute('width', $width);
        }
        if (preg_match('/^\d{1,5}$/', $height) === 1) {
            $element->setAttribute('height', $height);
        }
        $element->setAttribute('loading', 'lazy');
        $element->setAttribute('decoding', 'async');
    }

    /**
     * @param DOMElement $element
     * @param string     $tag
     *
     * @return void
     */
    private static function cleanAttributes(DOMElement $element, $tag)
    {
        $attributes = [];
        foreach ($element->attributes as $attribute) {
            $attributes[] = $attribute;
        }

        foreach ($attributes as $attribute) {
            $name = strtolower($attribute->name);
            $value = $attribute->value;

            if ($name === 'class') {
                $filtered = self::filterClasses($value, $tag);
                if ($filtered !== '') {
                    $element->setAttribute('class', $filtered);
                } else {
                    $element->removeAttribute($attribute->name);
                }
                continue;
            }

            if ($name === 'style') {
                $align = self::extractTextAlign($value);
                if ($align !== '') {
                    $element->setAttribute('style', 'text-align: ' . $align);
                } else {
                    $element->removeAttribute($attribute->name);
                }
                continue;
            }

            if ($name === 'title') {
                continue;
            }

            if ($name === 'dir') {
                if (!in_array(strtolower(trim($value)), ['ltr', 'rtl', 'auto'], true)) {
                    $element->removeAttribute($attribute->name);
                }
                continue;
            }

            if ($tag === 'a' && ($name === 'href' || $name === 'target' || $name === 'rel')) {
                if ($name === 'href' && !self::isSafeLink($value)) {
                    $element->removeAttribute($attribute->name);
                } elseif ($name === 'target' && trim($value) !== '_blank') {
                    $element->removeAttribute($attribute->name);
                } elseif ($name === 'rel') {
                    $tokens = preg_split('/\s+/', strtolower(trim($value))) ?: [];
                    $tokens = array_values(array_intersect($tokens, ['noopener', 'noreferrer', 'nofollow', 'ugc']));
                    if (count($tokens) > 0) {
                        $element->setAttribute('rel', implode(' ', $tokens));
                    } else {
                        $element->removeAttribute($attribute->name);
                    }
                }
                continue;
            }

            if ($tag === 'li' && $name === 'data-checked') {
                $normalized = strtolower(trim($value));
                if ($normalized === 'true' || $normalized === 'false') {
                    $element->setAttribute('data-checked', $normalized);
                } else {
                    $element->removeAttribute($attribute->name);
                }
                continue;
            }

            if ($tag === 'ol' && $name === 'start') {
                if (preg_match('/^\d{1,6}$/', trim($value)) !== 1) {
                    $element->removeAttribute($attribute->name);
                }
                continue;
            }

            $element->removeAttribute($attribute->name);
        }

        if ($tag === 'a' && $element->hasAttribute('href')) {
            if ($element->getAttribute('target') === '_blank') {
                $element->setAttribute('rel', 'noopener noreferrer');
            } else {
                $element->removeAttribute('rel');
            }
        }
    }

    /**
     * @param string $value
     * @param string $tag
     *
     * @return string
     */
    private static function filterClasses($value, $tag)
    {
        $tokens = preg_split('/\s+/', trim((string) $value)) ?: [];
        $filtered = [];

        foreach ($tokens as $token) {
            if ($token === '') {
                continue;
            }
            if (in_array($token, self::ALLOWED_CLASSES, true)) {
                $filtered[] = $token;
            } elseif (
                ($tag === 'code' || $tag === 'pre')
                && preg_match('/^language-[a-z0-9_+#.-]{1,24}$/i', $token) === 1
            ) {
                $filtered[] = strtolower($token);
            }
        }

        if ($tag === 'img' && !in_array('doc-image', $filtered, true)) {
            $filtered[] = 'doc-image';
        }

        return implode(' ', array_values(array_unique($filtered)));
    }

    /**
     * @param string $value
     *
     * @return string
     */
    private static function extractTextAlign($value)
    {
        if (preg_match('/(?:^|;)\s*text-align\s*:\s*(left|right|center|justify)\s*(?:;|$)/i', (string) $value, $match) === 1) {
            return strtolower($match[1]);
        }

        return '';
    }

    /**
     * @param string $value
     *
     * @return bool
     */
    private static function isSafeLink($value)
    {
        $raw = trim((string) $value);
        if ($raw === '' || strlen($raw) > 4096) {
            return false;
        }

        $normalized = self::normalizeForProtocol($raw);
        if ($normalized === '') {
            return false;
        }

        if (preg_match('/^(javascript|vbscript|data|file|blob|filesystem|chrome|about):/i', $normalized) === 1) {
            return false;
        }

        if (preg_match('/^(https?:|mailto:|tel:)/i', $normalized) === 1) {
            return true;
        }

        if (strpos($normalized, '#') === 0 || strpos($normalized, '?') === 0 || strpos($normalized, '/') === 0) {
            return true;
        }

        if (strpos($normalized, './') === 0 || strpos($normalized, '../') === 0) {
            return true;
        }

        $colon = strpos($normalized, ':');
        $slash = strpos($normalized, '/');
        if ($colon !== false && ($slash === false || $colon < $slash)) {
            return false;
        }

        return true;
    }

    /**
     * @param string $value
     *
     * @return bool
     */
    private static function isSafeImageSource($value)
    {
        $raw = trim((string) $value);
        if ($raw === '' || strlen($raw) > 12 * 1024 * 1024) {
            return false;
        }

        return preg_match('/^(https?:|\/\/)/i', self::normalizeForProtocol($raw)) === 1;
    }

    /**
     * @param string $value
     *
     * @return string
     */
    private static function normalizeForProtocol($value)
    {
        $value = preg_replace('/[\x00-\x20\x7f-\x9f]+/', '', (string) $value);
        $value = str_replace('\\', '/', (string) $value);
        return strtolower($value);
    }

    /**
     * @param DOMElement $element
     *
     * @return void
     */
    private static function stripAttributes(DOMElement $element)
    {
        $names = [];
        foreach ($element->attributes as $attribute) {
            $names[] = $attribute->name;
        }
        foreach ($names as $name) {
            $element->removeAttribute($name);
        }
    }

    /**
     * Substitui o elemento pelos seus filhos.
     *
     * @param DOMNode $node
     *
     * @return void
     */
    private static function unwrap(DOMNode $node)
    {
        $parent = $node->parentNode;
        if (!$parent) {
            return;
        }

        while ($node->firstChild) {
            $parent->insertBefore($node->firstChild, $node);
        }
        $parent->removeChild($node);
    }
}
