# Mapa visual: como o Orbi funciona hoje

O mapa fica num canvas, para olhar e discutir em cima:
https://claude.ai/artifact/9uteU6Bq8a4MzCWog5ZUT7

| Quadro | O que mostra |
|---|---|
| A | O que o Orbi recebe e tem em cada turno: o que chega, instruções, situação, skills, ferramentas, o portão |
| B | Ensinar um procedimento: entender, ensaiar, combinar, cartão |
| C | Executar um procedimento: do pedido à entrega |
| D | Depois da execução: revisão, nível, juiz, aprendizados, revisor de conhecimento, conversa no cartão, mudança a pedido |
| E | Onde deu errado na execução de livros infantis (13/11): o defeito em cada ponto, o que já foi corrigido e o que está aberto |

Cada linha de execução tem as mesmas colunas: quem age (você, o Orbi, o runtime, o revisor),
o que acontece e **qual ferramenta ou sinal é chamado**, o que você vê na tela e onde fica
guardado.

## Como atualizar

`gen.py` gera os quadros (`python3 gen.py`, dentro de uma pasta com `project/`). Ao mudar um
fluxo (uma ferramenta nova, um sinal, uma parte do prompt), mude a linha correspondente no
`gen.py` e publique de novo no canvas. Uma execução que deu errado ganha um quadro novo no
formato do E, para a discussão ficar registrada.
