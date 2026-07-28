import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Copia texto para a área de transferência preservando a formatação
 * (negrito, itálico, sublinhado) quando `html` é fornecido — usa a
 * Clipboard API com `text/html` + `text/plain` simultaneamente, para que
 * alvos de texto rico (Word, Google Docs, Gmail) recebam a formatação e
 * alvos de texto simples recebam o fallback em texto puro.
 */
export async function copyRichText(html: string | null | undefined, text: string): Promise<void> {
  if (html && html.trim() && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    } catch {
      // navegador recusou o item de clipboard rico — cai para texto simples
    }
  }
  await navigator.clipboard.writeText(text);
}
