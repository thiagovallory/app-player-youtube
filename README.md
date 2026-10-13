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

1. Cole o link de um vídeo ou playlist e clique em **Adicionar à fila** (ou Enter). Adicionar não toca sozinho: se a fila estava vazia, o primeiro item fica apenas selecionado. Para tocar, use **Tocar agora** (substitui a fila inteira pelo link e toca), o botão ▶ ou clique no título de um item da fila. Se o vídeo já estiver na fila, o app pede confirmação antes de adicionar de novo.
2. Playlists entram com todos os vídeos (até 200); os títulos aparecem aos poucos.
3. Na fila: arraste para reordenar, ✕ remove, clique no título para tocar aquele item, **Limpar** esvazia.
4. O menu **☰** (canto superior esquerdo) reúne três blocos:
   - **Monitor**: escolha o monitor de reprodução (**Identificar** mostra o número em cada tela).
   - **Salvar fila**: guarda a fila atual com um nome.
   - **Filas salvas**: **Adicionar** acrescenta os itens ao fim da fila atual (sem tocar), **Substituir** troca a fila atual, seleciona o primeiro item e para o player (sem tocar) e **Excluir** apaga a fila salva. A fila ativa não é restaurada ao abrir o app.
5. Use play/pause, anterior/próximo, seek e volume. **Parar** fecha o player e mantém a fila.

## Gerar executáveis

Os arquivos saem em `dist/` (fora do git).

```bash
npm run dist:mac   # macOS: .zip com o Player YouTube.app (arm64 e x64)
npm run dist:win   # Windows: instaladores x64 e arm64 + .exe portátil x64
```

- **macOS:** descompacte o `.zip` e execute o app, sem instalar. Ele não é assinado com certificado de desenvolvedor (só assinatura ad-hoc), então na primeira vez o macOS bloqueia: clique com o botão direito no app > Abrir > Abrir, ou libere em Ajustes do Sistema > Privacidade e Segurança. Se aparecer "danificado", rode `xattr -dr com.apple.quarantine "Player YouTube.app"`.
- **Windows (Windows 10 ou 11):**
  - `...-win-x64-setup.exe`: instalador para PCs comuns (64 bits). Instala só para o usuário, sem pedir administrador, e cria atalhos e desinstalador.
  - `...-win-arm64-setup.exe`: instalador para Windows no ARM.
  - `...-win-x64-portable.exe`: roda direto, sem instalar (abre mais devagar, pois se descompacta a cada abertura).
  - O SmartScreen mostra "O Windows protegeu seu PC": clique em "Mais informações" > "Executar assim mesmo".
  - Windows de 32 bits não é suportado (o Electron 44 não publica essa versão).
- Sem certificado pago não há assinatura nem notarização; o app funciona igual depois dos avisos da primeira abertura. O build do Windows também pode ser gerado neste Mac.

## Limitações

- Anúncios do YouTube aparecem (limite da IFrame API).
- Alguns vídeos bloqueiam reprodução embutida; o app avisa e, em playlist, pula para o próximo.

## Licença

Uso **não comercial**: você pode usar, copiar e modificar o app livremente, mas **não pode vender**. Licença [PolyForm Noncommercial 1.0.0](LICENSE) (o código é público, mas não é "open source" no sentido da OSI).
