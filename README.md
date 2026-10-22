# IT Docs

Aplicação web para criar, organizar e consultar Procedimentos Operacionais Padrão (POPs) de TI. Funciona inteiramente no navegador, sem servidor ou banco de dados externo. As animações usam o GSAP e a rolagem suave usa o Lenis, ambos carregados localmente.

## Recursos

- Editor visual no estilo de blocos, com títulos, listas, listas de tarefas, citações, blocos de código, links, imagens e alinhamento de texto.
- Categorias fixas: **Software**, **Hardware** e **Rede**.
- Busca sem distinção de acentos, filtro por categoria e ordenação por atualização, criação ou título.
- Leitura formatada com marcação de tarefas persistente.
- Salvamento automático de procedimentos existentes e rascunho local para novos procedimentos. Ao criar um novo, o editor abre em branco e oferece a restauração do rascunho anterior sob demanda.
- Inserção de imagens por upload, colagem ou URL. Uploads são armazenados no IndexedDB.
- Importação e exportação em JSON, com imagens incorporadas como Data URLs.
- Exportação, visualização e cópia em Markdown, além de importação de arquivos `.md`.
- Sanitização de HTML na gravação, leitura e importação.
- Layout responsivo com menu lateral recolhível.
- Animações de entrada para navegação, cards, editor, leitores, diálogos e notificações, além de rolagem suave com Lenis. O controle **Animações** no rodapé da sidebar ativa ou desativa os dois recursos.
- Atalhos: `Ctrl+S` salva, `Ctrl+K` insere um link e `Tab` indenta dentro de blocos de código.

## Como executar

Não há etapa de build nem instalação.

1. Abra `index.html` diretamente no navegador, ou
2. Sirva a pasta com um servidor local (recomendado, pois alguns navegadores restringem APIs de armazenamento em `file://`):

```powershell
# Python 3
python -m http.server 8000

# ou Node.js
npx serve .
```

Depois acesse `http://localhost:8000`.

Navegadores recomendados: versões recentes do Chrome, Edge, Firefox ou Safari.

## Armazenamento e privacidade

Todos os dados ficam no próprio navegador:

- **IndexedDB** (`itdocs`): procedimentos e imagens.
- **LocalStorage**: preferências (`itdocs:settings`) e rascunho (`itdocs:draft`).

Os dados são vinculados à origem e ao navegador utilizados. Limpar os dados do site remove procedimentos, imagens e preferências. Se o IndexedDB não estiver disponível, a aplicação entra em modo temporário e avisa que os dados serão perdidos ao fechar a página.

Faça backups periódicos usando **Exportar tudo**. O arquivo JSON inclui os procedimentos e as imagens incorporadas.

## Importação e exportação

### JSON

O arquivo exportado segue este envelope:

```json
{
  "app": "IT Docs",
  "schemaVersion": 1,
  "exportedAt": "2026-01-01T12:00:00.000Z",
  "scope": "all",
  "imageFormat": "data-url",
  "procedures": [
    {
      "id": "pop_abc123",
      "title": "Configurar VPN",
      "category": "rede",
      "description": "Passos para configurar a VPN corporativa.",
      "contentFormat": "html",
      "content": "<h2>Pré-requisitos</h2><p>...</p>",
      "createdAt": "2026-01-01T12:00:00.000Z",
      "updatedAt": "2026-01-01T12:00:00.000Z"
    }
  ]
}
```

Na importação, procedimentos com o mesmo `id` são tratados conforme a estratégia escolhida:

- **Ignorar duplicados**: mantém o procedimento atual.
- **Atualizar existentes**: substitui os dados pelo conteúdo do arquivo.
- **Importar como novos**: gera um novo `id` e mantém ambos.

Limites: 64 MB por arquivo JSON, 5.000 procedimentos por importação e 8 MB por imagem. Imagens SVG não são aceitas.

### Markdown

O editor exporta e importa Markdown com suporte a títulos, ênfase, links, imagens, listas, listas de tarefas, citações, blocos de código e linhas horizontais. Imagens em Data URL são extraídas e armazenadas localmente durante a importação.

No editor, o botão **Markdown** abre o conteúdo atual em um campo editável. Cole ou edite o Markdown e clique em **Aplicar no editor** para convertê-lo em blocos visuais; depois, salve o procedimento normalmente.

## Estrutura do projeto

```text
.
├── index.html
├── assets/
│   ├── icons/favicon.svg
│   └── vendor/
│       ├── gsap.min.js
│       ├── lenis.css
│       └── lenis.min.js
├── css/
│   ├── styles.css
│   ├── editor.css
│   └── responsive.css
└── js/
    ├── utils.js
    ├── security.js
    ├── categories.js
    ├── storage.js
    ├── images.js
    ├── markdown.js
    ├── procedures.js
    ├── search.js
    ├── ui.js
    ├── animations.js
    ├── scroll.js
    ├── import-export.js
    ├── editor.js
    └── app.js
```

Os módulos são carregados na ordem acima por meio de tags `<script>` clássicas e se comunicam pelo namespace global `window.ITDocs`. O GSAP 3.13.0 e o Lenis 1.3.27 são carregados antes dos módulos e ficam disponíveis offline em `assets/vendor/`.

## Segurança

O conteúdo armazenado é HTML sanitizado por uma lista de permissões. Scripts, iframes, SVG, manipuladores de eventos, protocolos perigosos e atributos não permitidos são removidos na gravação, na renderização e na importação. Links externos são abertos com `noopener noreferrer`.

A aplicação não envia dados para nenhum servidor. Imagens por URL são carregadas diretamente pelo navegador a partir do endereço informado.
