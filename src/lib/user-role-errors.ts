/**
 * Traduz mensagens técnicas de erro da RPC admin_assign_defensor_role
 * em textos institucionais para exibição.
 */
export function traduzirErroAtribuicao(raw: string, correlationId?: string): {
  title: string;
  description: string;
  needsMfa?: boolean;
} {
  const msg = (raw ?? "").toUpperCase();

  if (msg.includes("UNAUTHENTICATED"))
    return { title: "Sessão expirada", description: "Sua sessão expirou. Entre novamente no sistema." };
  if (msg.includes("FORBIDDEN"))
    return { title: "Sem permissão", description: "Você não possui permissão para alterar o papel deste usuário." };
  if (msg.includes("SELF_ROLE_CHANGE_NOT_ALLOWED"))
    return { title: "Ação não permitida", description: "Você não pode alterar seu próprio papel." };
  if (msg.includes("AAL2_REQUIRED"))
    return {
      title: "Confirmação de segurança necessária",
      description: "Para alterar o papel de um usuário, confirme sua autenticação de segurança.",
      needsMfa: true,
    };
  if (msg.includes("USER_NOT_FOUND"))
    return { title: "Usuário não localizado", description: "O usuário informado não foi localizado." };
  if (msg.includes("EMAIL_NOT_CONFIRMED"))
    return { title: "E-mail pendente", description: "O usuário precisa confirmar o e-mail antes de receber acesso." };
  if (msg.includes("TARGET_USER_INCOMPLETE") || msg.includes("INCOMPLETE_PROFILE"))
    return { title: "Dados incompletos", description: "Complete os dados obrigatórios (nome e matrícula) antes de atribuir o papel." };
  if (msg.includes("ORGANIZATION_NOT_FOUND"))
    return { title: "Órgão inválido", description: "O órgão de execução não foi localizado." };
  if (msg.includes("USER_ALREADY_DEFENDER"))
    return { title: "Já é Defensor", description: "Este usuário já possui o papel de Defensor Público." };
  if (msg.includes("USER_HAS_INCOMPATIBLE_ROLE"))
    return { title: "Papel incompatível", description: "O usuário possui um papel incompatível com esta operação." };
  if (msg.includes("JUSTIFICATIVA_MINIMA"))
    return { title: "Justificativa curta", description: "A justificativa administrativa deve ter no mínimo 10 caracteres." };
  if (msg.includes("CONCURRENT_CHANGE"))
    return { title: "Alteração concorrente", description: "Os dados deste usuário foram alterados por outra pessoa. Atualize a tela e tente novamente." };

  return {
    title: "Não foi possível concluir",
    description: `Não foi possível concluir a atribuição.${correlationId ? ` Código de referência: ${correlationId}` : ""}`,
  };
}
