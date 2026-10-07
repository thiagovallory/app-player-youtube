# Fila de Reprodução — Design

Data: 2026-10-07

Estende `docs/superpowers/specs/2026-10-05-app-player-youtube-design.md`. Onde há conflito, esta spec vale.

## Objetivo

Ao adicionar um vídeo, ele entra numa fila de reprodução. É possível continuar adicionando vídeos e playlists (uma playlist adiciona todos os seus vídeos), editar a fila (ordem, remoção) e salvar a fila com um nome para carregar depois. A fila ativa começa vazia a cada abertura do app.

## Decisões

- Expansão de playlist: janela oculta com o player do YouTube (`loadPlaylist` + `getPlaylist()`), títulos via oEmbed. Sem chave de API.
- Dois botões de adicionar: **Adicionar à fila** e **Tocar agora**.
- Fila ativa não persiste. Filas salvas com nome persistem.
- Fim da fila: para. Sem loop.

## Modelo

Item da fila: `{ uid: string, videoId: string, title: string }`. `uid` é único por item (o mesmo vídeo pode aparecer mais de uma vez).

Estado da fila no main (fonte de verdade): `items: QueueItem[]`, `currentUid: string | null`.

O player toca um vídeo por vez com `loadVideoById`. Quando o vídeo termina (`ended`), o main avança para o próximo item e manda `play-video` ao player. Isso substitui o uso da playlist nativa do YouTube e remove o rebuild do player para links "vídeo + list".

## Comportamento

### Adicionar
- **Adicionar à fila**: insere ao final. Se a fila estava vazia, começa a tocar o primeiro item inserido. Enter no campo de URL equivale a este botão.
- **Tocar agora**: substitui a fila inteira pelos itens do link e começa a tocar.
- Link de vídeo (`watch?v=`, `youtu.be`, `shorts`, `embed`, `live`): 1 item.
- Link de playlist (`playlist?list=`): todos os vídeos, na ordem da playlist.
- Link `watch?v=X&list=Y`: expande a playlist inteira. Em **Tocar agora**, o item atual é o vídeo X (se X não estiver na playlist, começa no primeiro). Em **Adicionar**, só acrescenta os itens ao final.
- Limite de 200 itens por playlist; se cortado, o controle exibe aviso.

### Expansão de playlist
1. O main abre uma janela oculta (`/probe/index.html`) com o IFrame API, carrega `loadPlaylist({ list })` e espera `getPlaylist()` retornar IDs.
2. A janela reporta os IDs ao main por IPC e é fechada.
3. Os itens entram na fila com título provisório (o próprio `videoId`) e o controle é atualizado.
4. O main busca o título de cada vídeo em `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json` (`net.fetch`), 5 requisições em paralelo. Cada título resolvido atualiza o item e empurra novo estado ao controle. Falha em um título mantém o `videoId` como título.
5. Timeout de 15 s sem IDs: nada é adicionado e o controle mostra aviso (playlist privada, indisponível ou vazia).

Durante a expansão o controle mostra "Carregando playlist…". Adicionar durante uma expansão em andamento enfileira as operações na ordem em que foram pedidas.

### Editar
- Reordenar por arrastar e soltar (HTML5 drag & drop).
- Remover item (✕). Remover o item atual toca o próximo; se não houver, para.
- Clicar num item toca esse item.
- **Limpar**: esvazia a fila e para o player.

### Controles de reprodução
- Próximo/Anterior operam na fila. Anterior no primeiro item e Próximo no último não fazem nada.
- Erro do player (100, 101, 150, 5, mantendo as regras de `describeYtError`): aviso no controle e avança para o próximo item. Erros não "skippable" não avançam.
- play/pause/seek/volume/stop continuam como antes. `stop` fecha a janela do player e mantém a fila; o item atual permanece selecionado.

### Salvar e carregar
- **Salvar fila como…**: campo de nome + botão. Salva `{ name, items: [{ videoId, title }] }` em `settings.json`. Nome vazio é rejeitado (após trim); nome existente é sobrescrito. Máximo de 100 caracteres por nome e 50 filas salvas.
- Lista de filas salvas, cada uma com **Carregar** e **Excluir**. Carregar substitui a fila atual e começa a tocar o primeiro item. Fila salva vazia não pode ser salva (botão desabilitado com fila vazia).

## Arquitetura

### Main
- `src/main/queue.ts`: classe pura `PlaybackQueue` — `add(items)`, `replace(items, startUid?)`, `remove(uid)`, `move(uid, toIndex)`, `clear()`, `playAt(uid)`, `next()`, `prev()`, `setTitle(uid, title)`, `snapshot()`. Cada mutação devolve o que deve acontecer com a reprodução (`{ play: QueueItem } | { stop: true } | null`).
- `src/main/playlistExpander.ts`: `expandPlaylist(listId): Promise<string[]>` (janela `probe`) e `fetchTitles(videoIds, onTitle)` (oEmbed com concorrência limitada). A lógica de concorrência fica em função pura testável (`mapWithConcurrency`).
- `src/main/settingsStore.ts`: ganha `queues: SavedQueue[]`, `saveQueue(name, items)`, `deleteQueue(name)`, com validação na leitura.
- `src/main/index.ts`: cria a fila, trata os canais `queue:*`, conecta fim de vídeo / erro ao avanço da fila e empurra `queue:state` ao controle.
- `src/main/windows.ts`: `createProbeWindow(baseUrl)` oculta, com os mesmos `webPreferences` seguros e o travamento de navegação.

### Preloads e renderers
- `src/preload/probe.ts` e `src/renderer/probe/{index.html,main.ts}`: carrega o IFrame API, `loadPlaylist`, reporta IDs (ou erro) ao main.
- Player renderer (`src/renderer/player/main.ts`): passa a tocar apenas `play-video` (`loadVideoById`); reporta `ended`. Remove `loadPlaylist` e o rebuild.
- Controle: novo módulo `src/renderer/control/queue.ts` (lista, arrastar, remover, limpar, salvar/carregar/excluir). `playback.ts` troca os botões Tocar por **Adicionar à fila** e **Tocar agora**.

### Contratos compartilhados (`src/shared`)
- `types.ts`: `QueueItem`, `QueueState { items, currentUid, expanding: boolean }`, `SavedQueue { name, items: { videoId, title }[] }`. `PlayerCommand`: `load` é substituído por `{ type: 'play-video', videoId: string }`; `next`/`prev` passam a ser tratados no main e deixam de ser enviados ao player. `Settings` ganha `queues`.
- `ipc.ts`: `QUEUE_ADD`, `QUEUE_REMOVE`, `QUEUE_MOVE`, `QUEUE_CLEAR`, `QUEUE_PLAY_AT`, `QUEUE_SAVE`, `QUEUE_LOAD_SAVED`, `QUEUE_DELETE_SAVED`, `QUEUE_STATE` (main → controle), `PROBE_RESULT`.
- `api.ts`: `ControlApi` ganha os métodos de fila e `onQueueState`; `ProbeApi` com `report(result)`.
- O estado do player ganha `status: 'ended'` já existente, usado para disparar o avanço no main.

## Segurança
- Todo novo `BrowserWindow` usa `contextIsolation`, `nodeIntegration: false`, `sandbox: true`, e o travamento de `will-navigate` / `window.open`.
- Validação no main de todo payload `queue:*`: `uid` e `videoId` como strings no formato esperado, `toIndex` inteiro dentro do intervalo, nomes de fila com trim e limite de tamanho. Sender verificado como a janela de controle.

## Erros
- Playlist privada/indisponível/vazia ou timeout: aviso no controle, fila inalterada.
- oEmbed falha ou tem timeout: título permanece o `videoId`.
- Fila salva com nome inválido ou limite excedido: aviso inline.
- Item cujo vídeo dá erro não-skippable: permanece na fila com o erro exibido; o usuário escolhe outro item.

## Testes
- Unitários: `PlaybackQueue` (add/replace/remove do item atual/move/next/prev nas bordas/playAt/setTitle), `mapWithConcurrency` (limite respeitado, ordem de resultados, erros isolados), `SettingsStore` (salvar/sobrescrever/excluir/limites/validação na leitura), validadores de payload.
- Manual (GUI): janela `probe` com playlist real e privada, drag & drop, avanço ao fim do vídeo, remoção do item atual durante a reprodução, carregar fila salva, expansão com `watch?v&list`.

## Fora de escopo
Loop/shuffle, restauração automática da fila ao abrir, renomear fila salva, miniaturas/duração dos itens, busca no YouTube, importar playlists privadas.

## Riscos
- Playlists geradas pelo YouTube (mix `RD…`) podem devolver poucos itens em `getPlaylist()`.
- O comportamento de `getPlaylist()` em playlist grande (limite de itens carregados de uma vez) só é verificável com o YouTube real.
- `ended` pode não disparar se o vídeo falhar de forma não reportada; mitigação: o erro também avança quando skippable.
