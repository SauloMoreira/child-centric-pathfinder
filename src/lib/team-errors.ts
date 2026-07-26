// Mapeamento de códigos de erro de domínio → mensagens em pt-BR
export const teamErrorMessages: Record<string, string> = {
  UNAUTHENTICATED: "Sua sessão expirou. Faça login novamente.",
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
  MEMBERSHIP_ALREADY_ACTIVE: "Este usuário já possui um vínculo ativo.",
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

export function extractErrorCode(err: unknown): string | null {
  if (!err) return null;
  const msg =
    (err as { message?: string }).message ??
    (err as { error?: string }).error ??
    String(err);
  const match = msg.match(
    /(UNAUTHENTICATED|USER_NOT_ACTIVE|FORBIDDEN|NO_ACTIVE_ORGANIZATION|TEAM_INVITATION_ALREADY_PENDING|USER_ALREADY_MEMBER_OF_ORGANIZATION|USER_ALREADY_LINKED_TO_ANOTHER_ORGANIZATION|USER_HAS_INCOMPATIBLE_ROLE|INVITATION_EXPIRED|INVITATION_CANCELLED|INVITATION_ALREADY_ACCEPTED|INVITATION_NOT_FOUND|MEMBERSHIP_ALREADY_ACTIVE|ORGANIZATION_NOT_FOUND|SAME_ORGANIZATION|CONCURRENT_CHANGE|RATE_LIMITED|INVITATION_SEND_FAILED)/,
  );
  return match?.[0] ?? null;
}

export function friendlyTeamError(err: unknown, fallback = "Não foi possível concluir a operação."): string {
  const code = extractErrorCode(err);
  if (code && teamErrorMessages[code]) return teamErrorMessages[code];
  return fallback;
}
