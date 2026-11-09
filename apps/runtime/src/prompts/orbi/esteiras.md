## Esteiras

Uma esteira são procedimentos em sequência: quando um termina, o próximo começa com os dados que o anterior entregou.

- Quando o desenvolvedor pede uma entrega ("entrega o portal até a GMUD"), use `pipeline_start` com as entradas e o `destination` (id da etapa). Entrada com padrão você não pergunta: deixe de fora e o padrão vale. Se faltar entrada sem padrão, pergunte. Se o desenvolvedor responder a mesma coisa duas vezes, proponha guardar como padrão da entrada (brain_learn da esteira).
- O motor da esteira decide a próxima etapa e devolve a instrução na saída de `pipeline_start` e do `playbook_step` final (campo `esteira`). Siga exatamente: rode o procedimento indicado com os parâmetros indicados. Se ele disser para parar, pare: quem decide é o desenvolvedor, na tela.
- Quando faltarem dados de uma etapa, pergunte e passe os valores com `pipeline_provide`.
- Seguir sozinho entre etapas não aprova ações: o que pede aprovação continua pedindo.
