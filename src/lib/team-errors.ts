// Mapeamento de códigos de erro de domínio → mensagens em pt-BR
export const teamErrorMessages: Record<string, string> = {
  UNAUTHENTICATED: "Sua sessão expirou. Faça login novamente.",
  PROFILE_INACTIVE: "Seu perfil ainda não está ativo para esta operação.",
  USER_NOT_ACTIVE: "Seu perfil ainda não está ativo para esta operação.",
  FORBIDDEN: "Você não tem permissão para esta ação.",
  NO_ACTIVE_ORGANIZATION:
    "Você precisa ter um órgão de execução ativo para gerenciar a equipe.",
  TEAM_INVITATION_ALREADY_PENDING:
    "Já existe um convite pendente para este e-mail neste órgão.",
  USER_ALREADY_MEMBER_OF_ORGANIZATION:
    "Este usuário já faz parte da equipe deste órgão.",
  USER_ALREADY_LINKED_TO_ANOTHER_ORGANIZATION:
    "Este usuário já possui vínculo ativo com outro órgão de execução.",
  USER_HAS_INCOMPATIBLE_ROLE:
    "Este e-mail pertence a um Defensor ou Administrador — não pode ser convidado como membro.",
  INVITATION_EXPIRED: "Este convite expirou.",
  INVITATION_CANCELLED: "Este convite foi cancelado.",
  INVITATION_ALREADY_ACCEPTED: "Este convite já foi aceito.",
  INVITATION_NOT_FOUND: "Convite não encontrado.",
  MEMBER_NOT_FOUND: "Membro de equipe não encontrado ou inativo.",
  MEMBER_INCOMPATIBLE_ROLE:
    "Este usuário possui papel incompatível para vínculo como membro.",
  MEMBERSHIP_ALREADY_ACTIVE: "Este membro já possui vínculo ativo com você.",
  MEMBERSHIP_NOT_FOUND: "Vínculo não encontrado.",
  MEMBERSHIP_ALREADY_ENDED: "Este vínculo já foi encerrado.",
  DEFENDER_NOT_FOUND: "Defensor(a) não encontrado(a) ou inativo(a).",
  DEFENDER_REQUIRED: "Selecione um Defensor para prosseguir.",
  DEFENDER_HAS_NO_ORG:
    "Você precisa possuir um órgão de execução ativo antes de vincular membros.",
  INVALID_MEMBER: "Membro selecionado é inválido.",
  ORGANIZATION_NOT_FOUND: "Órgão de execução não encontrado.",
  SAME_ORGANIZATION: "Selecione um órgão diferente do atual.",
  CONCURRENT_CHANGE:
    "Os dados foram alterados por outro processo. Recarregue a página.",
  RATE_LIMITED:
    "Muitas tentativas em pouco tempo. Aguarde antes de tentar novamente.",
  INVITATION_SEND_FAILED:
    "Não foi possível enviar o e-mail de convite. Tente novamente em instantes.",
  INTERNAL_ERROR: "Ocorreu um erro interno. Tente novamente.",
};

const ERROR_CODE_PATTERN = new RegExp(
  `\\b(${Object.keys(teamErrorMessages).join("|")})\\b`,
);

export function extractErrorCode(err: unknown): string | null {
  if (!err) return null;
  const msg =
    (err as { message?: string }).message ??
    (err as { error?: string }).error ??
    String(err);
  const match = msg.match(ERROR_CODE_PATTERN);
  return match?.[0] ?? null;
}

export function friendlyTeamError(
  err: unknown,
  fallback = "Não foi possível concluir a operação.",
): string {
  const code = extractErrorCode(err);
  if (code && teamErrorMessages[code]) return teamErrorMessages[code];
  return fallback;
}
