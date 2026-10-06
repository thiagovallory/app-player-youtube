export interface YtErrorInfo {
  message: string
  skippable: boolean
}

export function describeYtError(code: number): YtErrorInfo {
  switch (code) {
    case 2:
      return { message: 'Link inválido para o player.', skippable: false }
    case 5:
      return { message: 'Erro do player HTML5 neste vídeo.', skippable: true }
    case 100:
      return { message: 'Vídeo removido ou privado.', skippable: true }
    case 101:
    case 150:
      return { message: 'O dono do vídeo bloqueou a reprodução em players externos.', skippable: true }
    case 153:
      return { message: 'O YouTube recusou a origem do player (referrer ausente).', skippable: false }
    default:
      return { message: `Erro desconhecido do player (${code}).`, skippable: false }
  }
}
