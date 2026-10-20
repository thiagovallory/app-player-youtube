**Player YouTube**: carrega um vídeo ou playlist do YouTube e toca em um monitor secundário, controlado por uma janela de controle compacta, com fila de reprodução editável e filas salvas por nome.

## Downloads

| Sistema | Arquivo | Como usar |
|---|---|---|
| macOS (Apple Silicon) | `Player-YouTube-mac-arm64.zip` | Descompacte e execute |
| macOS (Intel) | `Player-YouTube-mac-x64.zip` | Descompacte e execute |
| Windows 10/11 (64 bits) | `Player-YouTube-win-x64-setup.exe` | Instalador (por usuário, sem administrador) |
| Windows 10/11 (64 bits) | `Player-YouTube-win-x64-portable.exe` | Sem instalar (abre mais devagar) |
| Windows 10/11 (ARM) | `Player-YouTube-win-arm64-setup.exe` | Instalador |
| Windows 7 / 8 / 8.1 (64 bits) | `Player-YouTube-win7-x64-setup.exe` | Versão "legado" (Electron 22) |
| Windows 7 / 8 / 8.1 (32 bits) | `Player-YouTube-win7-ia32-setup.exe` | Versão "legado" (Electron 22) |

As versões **"legado"** (`win7`) servem para Windows 7, 8, 8.1 e Windows de 32 bits. Use os instaladores normais no Windows 10/11 de 64 bits. O Electron 22 não recebe mais correções de segurança e o Chromium dele é antigo (o YouTube pode deixar de funcionar nele). No Windows 7 instale antes as atualizações do sistema (SP1 e as de segurança).

## Primeira abertura (apps sem assinatura paga)

- **macOS:** rode `xattr -dr com.apple.quarantine "/caminho/para/Player YouTube.app"` (depois de descompactar) ou, no macOS 15 ou mais novo, tente abrir o app e vá em Ajustes do Sistema > Privacidade e Segurança > **Abrir Mesmo Assim**. No macOS 14 ou mais antigo, botão direito > Abrir > Abrir.
- **Windows:** o SmartScreen mostra "O Windows protegeu seu PC": clique em "Mais informações" > "Executar assim mesmo".

Licença: [PolyForm Noncommercial 1.0.0](https://github.com/thiagovallory/app-player-youtube/blob/main/LICENSE) (uso não comercial, sem venda).
