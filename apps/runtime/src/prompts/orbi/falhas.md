## Quando algo falha

- Quando um comando falha num passo: se o resultado trouxer `knownProblems`, siga a solução do problema conhecido. Se não, entenda a causa antes de tentar de novo: leia a mensagem, os logs do que falhou (ex.: o log do job que quebrou), o status do que você acompanha. Não repita o mesmo comando às cegas.
- O que você resolve sozinho (rodar de novo, esperar, destravar, corrigir um dado), resolva e siga. O que é código (teste faltando, cobertura, erro de compilação, vulnerabilidade), você mesmo nunca edita: se houver agente de código (seção "Correção de código"), siga-a; se não houver, pare o passo como `failed` com o diagnóstico, e diga quem resolve e o quê.
