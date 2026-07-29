// Impressão do formulário de Atendimento (Fase 3 — execução): tanto o
// formulário EM BRANCO (para preenchimento manual em papel) quanto o
// formulário PREENCHIDO + resumo (após "Concluir"). Abre uma janela nova
// e independente do navegador com seu próprio HTML/CSS, em vez de tentar
// imprimir o conteúdo de dentro da layer lateral (Sheet): o Sheet usa
// posicionamento fixo e overflow controlado pelo Radix, o que tornaria
// print CSS dentro dele frágil e imprevisível. Uma janela dedicada
// funciona de forma consistente com o botão "Salvar como PDF" do próprio
// diálogo de impressão do navegador.
import type { AtendimentoFormField } from "@/lib/reintegra-api";
import {
  campoVisivel,
  textoDaResposta,
  type AtendimentoFormValues,
} from "@/components/atendimento/form-field-types";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ESTILOS = `
  @page { margin: 20mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    line-height: 1.5;
    padding: 0;
    margin: 0;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 20px; }
  .descricao { font-size: 13px; color: #444; margin-bottom: 20px; white-space: pre-wrap; }
  .secao {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #333;
    border-bottom: 1px solid #ccc;
    padding-bottom: 4px;
    margin: 20px 0 12px;
  }
  .secao:first-of-type { margin-top: 8px; }
  .campo { margin-bottom: 14px; page-break-inside: avoid; }
  .rotulo { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .rotulo .obrig { color: #b91c1c; }
  .resposta { font-size: 13px; white-space: pre-wrap; }
  .resposta.vazia { color: #999; font-style: italic; }
  .linha-branco { border-bottom: 1px solid #999; height: 20px; }
  .caixa-branco { border: 1px solid #999; min-height: 60px; border-radius: 3px; }
  .opcoes { font-size: 13px; }
  .opcao { margin: 2px 0; }
  .marca { display: inline-block; width: 11px; }
  .resumo {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 2px solid #333;
  }
  .resumo h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px; }
  .resumo p { font-size: 13px; white-space: pre-wrap; }
  table.matriz, table.tabela-preenchivel { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 4px; }
  table.matriz th, table.matriz td, table.tabela-preenchivel th, table.tabela-preenchivel td {
    border: 1px solid #ccc; padding: 4px 6px; text-align: left;
  }
  table.matriz .marca-cel { text-align: center; }
  table.tabela-preenchivel .linha-branco-cel { height: 18px; }
`;

/**
 * Abre uma nova janela, escreve o HTML e dispara a impressão. Retorna
 * `false` se o navegador bloqueou o pop-up (para o chamador poder avisar
 * o usuário), `true` caso contrário.
 */
export function abrirImpressao(titulo: string, bodyHtml: string): boolean {
  const win = window.open("", "_blank", "width=800,height=1000");
  if (!win) return false;
  win.document.open();
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
      titulo,
    )}</title><style>${ESTILOS}</style></head><body>${bodyHtml}</body></html>`,
  );
  win.document.close();
  win.focus();
  // Pequeno atraso para o documento terminar de renderizar antes do diálogo de impressão.
  setTimeout(() => {
    win.print();
  }, 250);
  return true;
}

function formatarOpcoesBranco(campo: AtendimentoFormField): string {
  const opcoes = campo.options ?? [];
  const marca = campo.type === "checkbox" ? "☐" : "○";
  return `<div class="opcoes">${opcoes
    .map((o) => `<div class="opcao"><span class="marca">${marca}</span>${escapeHtml(o)}</div>`)
    .join("")}</div>`;
}

function campoHtmlBranco(campo: AtendimentoFormField): string {
  const rotulo = `<div class="rotulo">${escapeHtml(campo.label || "(sem rótulo)")}${
    campo.required ? ' <span class="obrig">*</span>' : ""
  }</div>`;
  if (campo.type === "radio" || campo.type === "checkbox" || campo.type === "dropdown") {
    return `<div class="campo">${rotulo}${formatarOpcoesBranco(campo)}</div>`;
  }
  if (campo.type === "text_long") {
    return `<div class="campo">${rotulo}<div class="caixa-branco"></div></div>`;
  }
  if (campo.type === "matrix") {
    const linhas = campo.matrixRows ?? [];
    const colunas = campo.options ?? [];
    const tabela = `<table class="matriz"><thead><tr><td></td>${colunas
      .map((c) => `<th>${escapeHtml(c)}</th>`)
      .join("")}</tr></thead><tbody>${linhas
      .map(
        (l) =>
          `<tr><td>${escapeHtml(l)}</td>${colunas.map(() => `<td class="marca-cel">○</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table>`;
    return `<div class="campo">${rotulo}${tabela}</div>`;
  }
  if (campo.type === "table_fillable") {
    const colunas = campo.tableColumns ?? [];
    const linhaVazia = `<tr>${colunas.map(() => `<td class="linha-branco-cel"></td>`).join("")}</tr>`;
    const tabela = `<table class="tabela-preenchivel"><thead><tr>${colunas
      .map((c) => `<th>${escapeHtml(c)}</th>`)
      .join("")}</tr></thead><tbody>${linhaVazia.repeat(4)}</tbody></table>`;
    return `<div class="campo">${rotulo}${tabela}</div>`;
  }
  if (campo.type === "repeat_group") {
    const sub = campo.repeatFields ?? [];
    return `<div class="campo">${rotulo}${sub
      .map((sf) => campoHtmlBranco(sf))
      .join("")}</div>`;
  }
  if (campo.type === "calculated") {
    return `<div class="campo">${rotulo}<p class="resposta vazia">(calculado automaticamente)</p></div>`;
  }
  return `<div class="campo">${rotulo}<div class="linha-branco"></div></div>`;
}

/** Formulário em branco — TODOS os campos aparecem (ignora condições de
 *  visibilidade, já que ainda não há nenhuma resposta dada). Pensado para
 *  impressão e preenchimento manual em papel. */
export function montarFormularioBrancoHtml(
  titulo: string,
  descricao: string | null,
  campos: AtendimentoFormField[],
): string {
  const partes = [
    `<h1>${escapeHtml(titulo)}</h1>`,
    `<div class="meta">Formulário em branco — Ágora / DPE-RS</div>`,
  ];
  if (descricao) partes.push(`<div class="descricao">${escapeHtml(descricao)}</div>`);
  for (const campo of campos) {
    if (campo.type === "section") {
      partes.push(`<div class="secao">${escapeHtml(campo.label || "(seção sem título)")}</div>`);
    } else if (campo.type === "orientation") {
      // Ajuste doc — orientações são notas para quem preenche na tela;
      // não fazem parte do arquivo gerado para download/impressão.
      continue;
    } else {
      partes.push(campoHtmlBranco(campo));
    }
  }
  return partes.join("\n");
}

function formatarResposta(
  campo: AtendimentoFormField,
  todosOsCampos: AtendimentoFormField[],
  values: AtendimentoFormValues,
): string {
  const texto = textoDaResposta(campo, values[campo.id], todosOsCampos, values);
  if (!texto.trim()) {
    return `<p class="resposta vazia">Não respondido</p>`;
  }
  return `<p class="resposta">${escapeHtml(texto)}</p>`;
}

/** Formulário preenchido — só os campos VISÍVEIS (considerando as
 *  condições já satisfeitas pelas respostas) aparecem, com a resposta
 *  dada. Inclui o resumo por IA quando já foi gerado. */
export function montarFormularioPreenchidoHtml(
  titulo: string,
  descricao: string | null,
  campos: AtendimentoFormField[],
  values: AtendimentoFormValues,
  resumoIA?: string | null,
): string {
  const visiveis = campos.filter((f) => campoVisivel(f, values));
  const partes = [
    `<h1>${escapeHtml(titulo)}</h1>`,
    `<div class="meta">Formulário preenchido — gerado em ${new Date().toLocaleString("pt-BR")}</div>`,
  ];
  if (descricao) partes.push(`<div class="descricao">${escapeHtml(descricao)}</div>`);
  for (const campo of visiveis) {
    if (campo.type === "section") {
      partes.push(`<div class="secao">${escapeHtml(campo.label || "(seção sem título)")}</div>`);
    } else if (campo.type === "orientation") {
      continue;
    } else {
      partes.push(
        `<div class="campo"><div class="rotulo">${escapeHtml(campo.label || "(sem rótulo)")}</div>${formatarResposta(
          campo,
          campos,
          values,
        )}</div>`,
      );
    }
  }
  if (resumoIA) {
    partes.push(
      `<div class="resumo"><h2>Resumo</h2><p>${escapeHtml(resumoIA)}</p></div>`,
    );
  }
  return partes.join("\n");
}
