# Mundo do Prompt Agent

Automação sem API paga de inteligência artificial para o perfil **@mundodoprompt** no Threads.

## Como funciona

1. As tarefas agendadas do ChatGPT pesquisam tendências e criam conteúdo original em português.
2. Cada tarefa abre uma issue com o título iniciado por `[PUBLISH]`.
3. O GitHub Actions valida a solicitação.
4. O script publica o primeiro texto e as respostas em sequência pela API oficial do Threads.
5. Em caso de sucesso, a issue recebe o link da publicação e é fechada.

## Segurança

- Somente issues abertas pelo proprietário do repositório são processadas.
- O título precisa começar exatamente com `[PUBLISH]`.
- O token do Threads fica no secret `THREADS_ACCESS_TOKEN` e nunca no código.
- Cada parte aceita no máximo 500 caracteres.
- Uma solicitação aceita de 1 a 20 partes.

## Configuração necessária

Em **Settings → Secrets and variables → Actions → New repository secret**, crie:

- Nome: `THREADS_ACCESS_TOKEN`
- Valor: token de acesso gerado no aplicativo Mundo do Prompt Automação da Meta

Nunca coloque esse token em issues, arquivos ou mensagens.

## Formato da issue

Título:

```
[PUBLISH] Tema da thread
```

Corpo:

```json
{
  "parts": [
    "Texto principal",
    "Primeira resposta",
    "Segunda resposta com CTA"
  ]
}
```

Um exemplo está em `examples/thread.json`.

## Arquivos principais

- `.github/workflows/publish-thread.yml`: recebe a issue e executa a publicação.
- `scripts/publish-thread.mjs`: valida e publica a sequência pela Threads API.
- `examples/thread.json`: exemplo do formato aceito.

## Custos

O projeto não usa OpenAI API, Claude API ou outro serviço pago de geração. A pesquisa e a criação ficam nas tarefas do ChatGPT; a publicação usa GitHub Actions e a API oficial do Threads.


## Instagram

O mesmo repositório também publica carrosséis no **@mundodoprompt** por meio da API oficial do Instagram.

Fluxo:

1. Uma tarefa cria uma issue cujo título começa com `[INSTAGRAM]`.
2. O JSON é validado antes de qualquer publicação.
3. O renderizador gera de 2 a 10 imagens JPG em 1080 × 1350.
4. As imagens são disponibilizadas temporariamente pelo GitHub Pages.
5. O script cria todos os itens, monta o carrossel e só então publica.
6. Se qualquer validação ou upload falhar, nada é publicado.

Secrets necessários:

- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_USER_ID`

O GitHub Pages precisa estar configurado com **Source: GitHub Actions** em **Settings → Pages**.

Título da issue:

```
[INSTAGRAM] Tema do carrossel
```

O corpo deve conter somente JSON válido conforme `examples/instagram-carousel.json`.

O formato também aceita o campo opcional `category`, usado para escolher a identidade visual:

- `prompt`: azul e ciano, com linguagem de comandos e interfaces.
- `news`: vermelho e âmbar, com tratamento editorial de notícia.
- `guide`: verde e dourado, com linguagem de percurso e passo a passo.
- `curiosity`: roxo e ciano, com tratamento visual exploratório.
- `business`: verde e dourado, voltado a marketing, vendas e negócios.

Todos os layouts usam margens seguras, ajuste automático do título, indicação para deslizar, contador de páginas, ilustração contextual e CTA final destacado. Se `category` não for enviado, o renderizador infere a categoria pelo conteúdo.

Arquivos principais:

- `.github/workflows/publish-instagram-carousel.yml`
- `scripts/render-carousel.mjs`
- `scripts/publish-instagram.mjs`
- `examples/instagram-carousel.json`
- `examples/instagram-carousel-v2.json`: exemplo com categoria visual.
