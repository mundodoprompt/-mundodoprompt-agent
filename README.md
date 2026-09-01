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
