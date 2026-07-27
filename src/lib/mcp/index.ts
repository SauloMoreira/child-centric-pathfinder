import { auth, defineMcp } from "@lovable.dev/mcp-js";
import meuEstadoInstitucional from "./tools/meu-estado-institucional";
import listarSolicitacoes from "./tools/listar-solicitacoes-acesso";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "reintegra-infancia-mcp",
  title: "Ágora — DPE-RS",
  version: "0.1.0",
  instructions:
    "Ferramentas institucionais do Ágora (DPE-RS). O cliente atua como o usuário autenticado, respeitando papéis e RLS. Use `meu_estado_institucional` para descobrir papéis e vínculos e `listar_solicitacoes_acesso` para acompanhar pedidos de acesso.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [meuEstadoInstitucional, listarSolicitacoes],
});
