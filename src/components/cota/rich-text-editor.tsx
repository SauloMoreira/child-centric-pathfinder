import { useCallback, useEffect, useRef } from "react";
import { Bold, Highlighter, Italic, RectangleHorizontal, RemoveFormatting, Strikethrough, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RichTextValue = { html: string; text: string };

const ALLOWED_TAGS = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "DEL",
  "MARK",
  "BR",
  "DIV",
  "P",
  "SPAN",
]);

// Ajuste doc (AJUSTE 19) — "circular caixa" e "cor de destaque/grifo" são
// implementados como classes CSS fixas (nunca style inline, para não
// afrouxar a sanitização contra XSS). Só esses dois valores de `class`
// sobrevivem à sanitização; qualquer outro é removido como antes.
const ALLOWED_CLASSES = new Set(["cota-boxed", "cota-highlight"]);

/**
 * Sanitização por allowlist: mantém apenas negrito/itálico/sublinhado e
 * quebras de parágrafo, remove qualquer atributo (href, src, on*, style…) e
 * qualquer outra tag. Aplicado tanto ao colar quanto antes de renderizar
 * `dangerouslySetInnerHTML`, já que o texto é visto por toda a equipe do
 * Defensor (e não apenas por quem o escreveu).
 */
export function sanitizeCotaHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html || "";

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }
      const el = child as Element;
      if (!ALLOWED_TAGS.has(el.tagName)) {
        // Substitui a tag não permitida pelo seu conteúdo textual/filhos.
        const fragment = document.createDocumentFragment();
        while (el.firstChild) fragment.appendChild(el.firstChild);
        node.replaceChild(fragment, el);
        continue;
      }
      for (const attr of Array.from(el.attributes)) {
        if (attr.name === "class" && ALLOWED_CLASSES.has(attr.value)) continue;
        el.removeAttribute(attr.name);
      }
      walk(el);
    }
  };
  walk(template.content);

  return template.innerHTML;
}

interface RichTextEditorProps {
  html: string;
  onChange: (value: RichTextValue) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

/**
 * Editor de texto rico minimalista para Cotas: negrito, itálico e sublinhado.
 * Sem dependência externa — contentEditable + document.execCommand, que
 * segue amplamente suportado para esses três comandos básicos em todos os
 * navegadores modernos. Produz `html` (formatação) e `text` (cópia/busca).
 */
export function RichTextEditor({
  html,
  onChange,
  placeholder = "Escreva o texto da cota…",
  minHeight = "220px",
  className,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const skipNextSync = useRef(false);

  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    if (ref.current && ref.current.innerHTML !== (html || "")) {
      ref.current.innerHTML = html || "";
    }
  }, [html]);

  const emit = useCallback(() => {
    if (!ref.current) return;
    skipNextSync.current = true;
    onChange({ html: sanitizeCotaHtml(ref.current.innerHTML), text: ref.current.innerText.trim() });
  }, [onChange]);

  const exec = (command: "bold" | "italic" | "underline" | "strikeThrough") => {
    ref.current?.focus();
    document.execCommand(command);
    emit();
  };

  /**
   * Não há execCommand nativo e confiável para maiúsculas/minúsculas, então
   * transformamos manualmente os nós de texto dentro da seleção. Usar
   * `Range.cloneContents`/`insertNode` preserva a estrutura de tags
   * (negrito/itálico/sublinhado) do trecho selecionado — só o conteúdo
   * textual dos nós de texto é alterado.
   */
  const transformSelectionCase = (fn: (s: string) => string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;

    const fragment = range.cloneContents();
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      node.nodeValue = fn(node.nodeValue ?? "");
    }

    range.deleteContents();
    range.insertNode(fragment);
    sel.removeAllRanges();
    emit();
  };

  // Ajuste doc (AJUSTE 19) — envolve a seleção numa tag nova (usado para
  // "circular caixa" e "cor de destaque/grifo").
  const wrapSelection = (tagName: string, className: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    const wrapper = document.createElement(tagName);
    wrapper.className = className;
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    sel.removeAllRanges();
    emit();
  };

  // Ajuste doc (AJUSTE 19) — "limpar formatação": substitui a seleção
  // pelo próprio texto, sem nenhuma das tags de personalização.
  const clearFormatting = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    const text = range.toString();
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    sel.removeAllRanges();
    emit();
  };

  // Ajuste doc (AJUSTE 19) — "primeira letra em maiúsculo": só a primeira
  // letra da seleção, preservando o restante do texto e a formatação.
  const capitalizeFirstLetter = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    const fragment = range.cloneContents();
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (first?.nodeValue) {
      first.nodeValue = first.nodeValue.replace(/^(\s*)(\S)/, (_all, ws: string, ch: string) =>
        ws + ch.toLocaleUpperCase("pt-BR"),
      );
    }
    range.deleteContents();
    range.insertNode(fragment);
    sel.removeAllRanges();
    emit();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // Cola sempre como texto simples: descarta HTML externo (evita colar
    // markup/atributos arbitrários) — negrito/itálico/sublinhado seguem
    // disponíveis pela barra de ferramentas após colar.
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    emit();
  };

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      <div className="flex items-center gap-1 border-b border-input p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("bold")}
          aria-label="Negrito"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("italic")}
          aria-label="Itálico"
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("underline")}
          aria-label="Sublinhado"
        >
          <Underline className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("strikeThrough")}
          aria-label="Tachado"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[11px] font-semibold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => transformSelectionCase((s) => s.toLocaleUpperCase("pt-BR"))}
          aria-label="Maiúsculas"
          title="Colocar seleção em maiúsculas"
        >
          AA
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[11px] font-semibold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => transformSelectionCase((s) => s.toLocaleLowerCase("pt-BR"))}
          aria-label="Minúsculas"
          title="Colocar seleção em minúsculas"
        >
          aa
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[11px] font-semibold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={capitalizeFirstLetter}
          aria-label="Primeira letra em maiúsculo"
          title="Primeira letra em maiúsculo"
        >
          Aa
        </Button>
        <div className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrapSelection("span", "cota-boxed")}
          aria-label="Circular caixa"
          title="Colocar seleção numa caixa (contorno)"
        >
          <RectangleHorizontal className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrapSelection("mark", "cota-highlight")}
          aria-label="Cor de destaque/grifo"
          title="Destacar/grifar seleção"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearFormatting}
          aria-label="Limpar formatação"
          title="Limpar formatação da seleção"
        >
          <RemoveFormatting className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        className={cn(
          "cota-rich-text-content px-3 py-2 text-sm leading-relaxed outline-none",
          "empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
        )}
        style={{ minHeight }}
      />
    </div>
  );
}

/** Renderização somente-leitura do HTML de uma cota (camada de detalhe / impressão). */
export function RichTextViewer({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn("cota-rich-text-content text-xs leading-relaxed", className)}
      dangerouslySetInnerHTML={{ __html: sanitizeCotaHtml(html) }}
    />
  );
}
