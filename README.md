# App Player YouTube

Toca vídeo/playlist do YouTube em um monitor secundário, controlado por uma janela na tela principal.

## Rodar

```bash
npm install
npm run dev        # desenvolvimento
npm run build && npm run preview   # build de produção local
npm test           # testes unitários
```

## Uso

1. Cole o link de um vídeo ou playlist e clique em **Adicionar à fila** (ou Enter). Se a fila estava vazia, começa a tocar. **Tocar agora** substitui a fila inteira pelo link. Se o vídeo já estiver na fila, o app pede confirmação antes de adicionar de novo.
2. Playlists entram com todos os vídeos (até 200); os títulos aparecem aos poucos.
3. Na fila: arraste para reordenar, ✕ remove, clique no título para tocar aquele item, **Limpar** esvazia.
4. Escolha o monitor em "Monitor de reprodução" (**Identificar** mostra o número em cada tela).
5. Use play/pause, anterior/próximo, seek e volume. **Parar** fecha o player e mantém a fila.
6. **Salvar fila** guarda a fila atual com um nome; em "Filas salvas", **Carregar** substitui a fila atual e **Excluir** apaga a salva. A fila ativa não é restaurada ao abrir o app.

## Limitações

- Anúncios do YouTube aparecem (limite da IFrame API).
- Alguns vídeos bloqueiam reprodução embutida; o app avisa e, em playlist, pula para o próximo.
