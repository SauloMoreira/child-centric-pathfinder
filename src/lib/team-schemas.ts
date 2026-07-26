// Schemas Zod compartilhados para gestão de equipe
import { z } from "zod";

export const funcoesInternas = [
  { value: "assessor", label: "Assessor" },
  { value: "servidor", label: "Servidor" },
  { value: "estagiario", label: "Estagiário" },
  { value: "residente", label: "Residente" },
  { value: "colaborador", label: "Colaborador" },
  { value: "outro", label: "Outro" },
] as const;

export type FuncaoInterna = (typeof funcoesInternas)[number]["value"];

export const createTeamMemberSchema = z
  .object({
    nomeCompleto: z
      .string()
      .trim()
      .min(5, "Informe o nome completo.")
      .max(200, "O nome deve possuir no máximo 200 caracteres.")
      .transform((v) => v.replace(/\s+/g, " ")),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Informe um e-mail válido.")
      .max(320),
    matricula: z
      .string()
      .trim()
      .max(30, "A matrícula deve possuir no máximo 30 caracteres.")
      .optional()
      .or(z.literal("")),
    funcaoInterna: z.enum([
      "assessor",
      "servidor",
      "estagiario",
      "residente",
      "colaborador",
      "outro",
    ]),
    outraFuncao: z
      .string()
      .trim()
      .max(100, "Máximo de 100 caracteres.")
      .optional()
      .or(z.literal("")),
    telefone: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.funcaoInterna === "outro" && !data.outraFuncao) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outraFuncao"],
        message: "Informe a função do membro.",
      });
    }
  });

export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;
