import { auth, defineMcp } from "@lovable.dev/mcp-js";
import meuEstadoInstitucional from "./tools/meu-estado-institucional";
import listarOrgaos from "./tools/listar-orgaos";
import criarOrgao from "./tools/criar-orgao";
import listarSolicitacoes from "./tools/listar-solicitacoes-acesso";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "reintegra-infancia-mcp",
  title: "Reintegra Infância — DPE-RS",
  version: "0.1.0",
  instructions:
    "Ferramentas institucionais do Reintegra Infância (DPE-RS). O cliente atua como o usuário autenticado, respeitando papéis e RLS. Use `meu_estado_institucional` para descobrir papéis e vínculos, `listar_orgaos_execucao` para consultar órgãos, `criar_orgao_execucao` para cadastrar novos órgãos (exige papel administrativo e MFA) e `listar_solicitacoes_acesso` para acompanhar pedidos de acesso.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [meuEstadoInstitucional, listarOrgaos, criarOrgao, listarSolicitacoes],
});
